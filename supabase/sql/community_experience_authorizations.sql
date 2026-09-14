-- ================================================================
-- COMMUNITY IDENTITY: Network Experience Authorizations
-- ================================================================
-- Generic, experience-agnostic authorization layer sitting ALONGSIDE
-- (not replacing) nearify_identity_map. The two tables answer two
-- different questions that must never be conflated:
--
--   nearify_identity_map                answers "WHO is this person
--                                        in Nearify's own auth system?"
--                                        (identity bridge)
--
--   community_experience_authorizations answers "MAY that identity's
--                                        community context be used by
--                                        that experience right now?"
--                                        (consent / authorization)
--
-- Row-existence-in-the-identity-map was, until this migration, the
-- only signal any RPC had for "may I use this." That conflated two
-- independent lifecycles: a person can remain identifiable/bridged
-- while their authorization to actually use that identity is
-- temporarily withdrawn, pending, or revoked. This table makes that
-- state explicit, auditable, and independently revocable.
--
-- Deliberately generic (`experience` TEXT, not a Nearify-specific
-- table/column): the product direction is "one community identity
-- across network experiences, with experience-specific permissions."
-- Adding a second experience later requires zero schema change here —
-- just new rows keyed by a different `experience` value.
--
-- v1 is intentionally a single status enum, not a JSON scope map or
-- multiple user-facing toggles — one clear yes/no per experience,
-- matching the single "Continue" action a user actually takes.
-- ================================================================


-- ================================================================
-- 1. TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS public.community_experience_authorizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  experience    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'authorized'
                  CHECK (status IN ('authorized', 'needs_reconfirmation', 'revoked')),
  authorized_at TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT cea_community_experience_unique UNIQUE (community_id, experience)
);

CREATE INDEX IF NOT EXISTS idx_cea_community           ON public.community_experience_authorizations(community_id);
CREATE INDEX IF NOT EXISTS idx_cea_experience_status    ON public.community_experience_authorizations(experience, status);

ALTER TABLE public.community_experience_authorizations ENABLE ROW LEVEL SECURITY;

-- Read-only from the client's perspective: a user may see their own
-- authorization rows, but every mutation goes through a narrowly
-- scoped SECURITY DEFINER RPC below (link_nearify_account,
-- unlink_nearify_account, reconfirm_nearify_authorization) rather than
-- a direct-write RLS policy. This intentionally does NOT mirror
-- nearify_identity_map's original INSERT/UPDATE/DELETE policies — see
-- the hardening section added to nearify_identity_bridge.sql in this
-- same pass, which tightens that older table to the same standard.
CREATE POLICY "Users can view their own experience authorizations"
  ON public.community_experience_authorizations FOR SELECT
  TO authenticated
  USING (
    community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

-- This project has a schema-level default privilege that grants broad
-- table access to anon/authenticated on new tables (observed directly
-- on nearify_identity_map: anon and authenticated both hold INSERT/
-- UPDATE/DELETE there today, despite no code ever having granted it
-- explicitly). Revoke everything and grant back only what's intended.
REVOKE ALL ON public.community_experience_authorizations FROM PUBLIC;
REVOKE ALL ON public.community_experience_authorizations FROM anon;
REVOKE ALL ON public.community_experience_authorizations FROM authenticated;
GRANT SELECT ON public.community_experience_authorizations TO authenticated;


-- ================================================================
-- 2. GET AUTHORIZATION STATUS RPC
-- ================================================================
-- Minimal status surface for UI: authorized | needs_reconfirmation |
-- revoked | none. "none" covers both "no community profile" and "no
-- authorization row for this experience" — a client never needs to
-- distinguish those two to decide what to render.

CREATE OR REPLACE FUNCTION public.get_nearify_authorization_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_status       TEXT;
BEGIN
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT status INTO v_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify'
  LIMIT 1;

  RETURN jsonb_build_object('status', COALESCE(v_status, 'none'));
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearify_authorization_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nearify_authorization_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nearify_authorization_status() TO authenticated;


-- ================================================================
-- 3. RECONFIRM AUTHORIZATION RPC
-- ================================================================
-- The one-tap "Continue" action for the transitional reconfirmation
-- notice. Operates exclusively on the caller's own community identity
-- (resolved from auth.uid(), same as every other RPC in this bridge —
-- never accepts a caller-supplied community_id). Only ever transitions
-- needs_reconfirmation -> authorized; it cannot create a fresh
-- authorization out of nothing, and it never touches
-- nearify_identity_map, so it cannot create or imply an identity
-- mapping by itself.

CREATE OR REPLACE FUNCTION public.reconfirm_nearify_authorization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_current      TEXT;
BEGIN
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT status INTO v_current
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify'
  LIMIT 1;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No Nearify authorization found for current user');
  ELSIF v_current = 'authorized' THEN
    -- Idempotent: a repeated/racing tap of Continue is a no-op success,
    -- not an error.
    RETURN jsonb_build_object('success', true, 'status', 'authorized');
  ELSIF v_current = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nearify authorization was revoked; reconnect from the Nearify app to re-authorize');
  END IF;

  -- v_current = 'needs_reconfirmation'
  UPDATE community_experience_authorizations
  SET status = 'authorized',
      authorized_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id AND experience = 'nearify';

  RETURN jsonb_build_object('success', true, 'status', 'authorized');
END;
$$;

REVOKE ALL ON FUNCTION public.reconfirm_nearify_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconfirm_nearify_authorization() FROM anon;
GRANT EXECUTE ON FUNCTION public.reconfirm_nearify_authorization() TO authenticated;


-- ================================================================
-- 4. EXISTING-LINK MIGRATION (idempotent backfill)
-- ================================================================
-- Every CURRENT, genuine nearify_identity_map row reflects a real
-- prior link action — but the copy that action was made under only
-- disclosed "you'll get personalized recommendations," never "your
-- profile may also be used to explain you to another Nearify
-- participant." So existing links are backfilled to
-- needs_reconfirmation, not authorized: previously-disclosed
-- personalization-for-me continues uninterrupted (enforced in the
-- RPC layer below), while candidate-side enrichment (explaining this
-- person to someone else) stays off until they explicitly hit
-- Continue under the new copy. This creates ZERO new identity
-- mappings — it only annotates identity mappings that already exist.
--
-- ON CONFLICT DO NOTHING makes this safe to leave in the file and
-- re-run: it will never downgrade an already-authorized or
-- already-revoked row back to needs_reconfirmation on a later replay.
INSERT INTO community_experience_authorizations (community_id, experience, status)
SELECT community_id, 'nearify', 'needs_reconfirmation'
FROM nearify_identity_map
ON CONFLICT (community_id, experience) DO NOTHING;


-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Community experience authorizations deployed:';
  RAISE NOTICE '   ✓ community_experience_authorizations table (RLS: own rows, read-only)';
  RAISE NOTICE '   ✓ get_nearify_authorization_status() RPC';
  RAISE NOTICE '   ✓ reconfirm_nearify_authorization() RPC';
  RAISE NOTICE '   ✓ existing nearify_identity_map rows backfilled to needs_reconfirmation';
END $$;
