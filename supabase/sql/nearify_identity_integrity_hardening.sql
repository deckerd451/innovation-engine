-- ================================================================
-- NEARIFY ↔ INNOVATION ENGINE: Identity/Session Integrity Hardening
-- ================================================================
-- Source-of-truth definition for the deployed identity/session hardening
-- RPCs. Repository metadata does not encode its deployment timestamp/order.
-- Server-side trust boundary for a cross-identity mutation bug found
-- during live testing (2026-09-18): the Nearify client's Innovation
-- Engine (Buildspace) OAuth session lives in an isolated client that
-- persists independently of which Nearify account is signed in on the
-- device. The Nearify-side fix clears that local session whenever the
-- Nearify identity changes (never destructively — see
-- InnovationEngineBridgeService.clearLocalSessionOnly()) and reconciles
-- the server's own answer against the currently authenticated Nearify
-- profile before ever treating a session as "linked" for display or
-- Disconnect. This migration is the independent server-side layer: even
-- if that client-side guard is ever bypassed or buggy, these RPCs must
-- not silently mutate a mapping that doesn't belong to the caller.
--
-- Invariant enforced here:
--   unlink_nearify_account now REQUIRES the caller to name which
--   Nearify profile it believes is currently linked, and performs NO
--   delete/revoke if that doesn't match what's actually on file.
--
--   link_nearify_account refuses to silently reassign an already-linked
--   community to a DIFFERENT Nearify identity. A genuine ownership
--   change (e.g. a Buildspace community profile handed to a different
--   person) needs an explicit, separate remap flow later — never an
--   upsert side effect of this RPC. Fresh links and idempotent re-links
--   to the SAME Nearify id (including re-linking after a prior
--   revocation, per this RPC's original contract) are unaffected.
--
-- No table, RLS policy, or grant changes beyond what's stated below —
-- SECURITY DEFINER / search_path=public preserved unchanged on both
-- functions, exactly matching nearify_identity_bridge.sql.
-- ================================================================


-- ================================================================
-- 1. UNLINK ACCOUNT RPC — now requires the expected Nearify identity
-- ================================================================

CREATE OR REPLACE FUNCTION public.unlink_nearify_account(
  p_expected_nearify_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_current_id   TEXT;
  v_deleted      INT := 0;
BEGIN
  IF p_expected_nearify_user_id IS NULL OR trim(p_expected_nearify_user_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_expected_nearify_user_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found');
  END IF;

  SELECT nearify_user_id INTO v_current_id
  FROM nearify_identity_map
  WHERE community_id = v_community_id
  LIMIT 1;

  IF v_current_id IS NULL THEN
    -- Nothing to unlink — idempotent no-op, matching the previous
    -- contract's ('unlinked': false) case, not an error.
    RETURN jsonb_build_object('success', true, 'unlinked', false);
  END IF;

  IF v_current_id <> trim(p_expected_nearify_user_id) THEN
    -- The caller's belief about who is linked doesn't match reality —
    -- refuse outright. No delete, no revoke, no partial effect.
    RETURN jsonb_build_object('success', false, 'error', 'expected_mismatch');
  END IF;

  DELETE FROM nearify_identity_map WHERE community_id = v_community_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE community_experience_authorizations
  SET status     = 'revoked',
      revoked_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id
    AND experience   = 'nearify'
    AND status      != 'revoked';

  RETURN jsonb_build_object('success', true, 'unlinked', v_deleted > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_nearify_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_nearify_account(TEXT) TO authenticated;

-- Remove the old zero-argument overload entirely — nothing should be
-- able to reach the unsafe, unvalidated unlink path anymore.
DROP FUNCTION IF EXISTS public.unlink_nearify_account();


-- ================================================================
-- 2. LINK ACCOUNT RPC — refuse a silent cross-identity remap
-- ================================================================

CREATE OR REPLACE FUNCTION public.link_nearify_account(
  p_nearify_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_existing_id  TEXT;
BEGIN
  IF p_nearify_user_id IS NULL OR trim(p_nearify_user_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_user_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT nearify_user_id INTO v_existing_id
  FROM nearify_identity_map
  WHERE community_id = v_community_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_id <> trim(p_nearify_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_linked_to_different_identity');
  END IF;

  INSERT INTO nearify_identity_map (community_id, nearify_user_id, linked_at, updated_at)
  VALUES (v_community_id, trim(p_nearify_user_id), now(), now())
  ON CONFLICT (community_id) DO UPDATE
    SET nearify_user_id = trim(p_nearify_user_id),
        updated_at      = now();

  INSERT INTO community_experience_authorizations (community_id, experience, status, authorized_at, updated_at)
  VALUES (v_community_id, 'nearify', 'authorized', now(), now())
  ON CONFLICT (community_id, experience) DO UPDATE
    SET status        = 'authorized',
        authorized_at = now(),
        revoked_at    = NULL,
        updated_at    = now();

  RETURN jsonb_build_object(
    'success',          true,
    'community_id',     v_community_id,
    'nearify_user_id',  trim(p_nearify_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_nearify_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_nearify_account(TEXT) TO authenticated;


-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify identity/session integrity hardening deployed:';
  RAISE NOTICE '   ✓ unlink_nearify_account(p_expected_nearify_user_id) — mismatch rejected, no mutation';
  RAISE NOTICE '   ✓ unlink_nearify_account() zero-arg overload removed';
  RAISE NOTICE '   ✓ link_nearify_account() refuses silent cross-identity remap';
END $$;
