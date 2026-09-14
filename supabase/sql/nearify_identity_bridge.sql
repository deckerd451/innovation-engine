-- ================================================================
-- NEARIFY ↔ INNOVATION ENGINE: Identity Bridge
-- ================================================================
-- STATUS: the table and RLS policies below are ALREADY LIVE IN
-- PRODUCTION (project mqbsjlgnsirqsmfnreqd) and unchanged by this
-- revision — do not re-run section 1 in isolation. Sections 2 and 3
-- (link_nearify_account / unlink_nearify_account) and the new section
-- 6 (identity-map hardening) ARE pending changes from the community-
-- experience-authorizations pass and have NOT yet been deployed as of
-- this revision — see that pass's migration notes before applying.
--
-- DEPENDENCY: sections 2, 3, and 6 of this file reference
-- public.community_experience_authorizations, so
-- supabase/sql/community_experience_authorizations.sql MUST be applied
-- to production before this file's updated sections are applied.
--
-- Originally merged via PR #208 (2026-05-04) but was later lost from
-- `main`'s tracked history during an unrelated history reset; the
-- live database was never affected by that reset.
--
-- Maps Nearify user IDs to Innovation Engine community IDs.
--
-- Actual identity-link flow (as implemented — this supersedes an
-- earlier design recorded in this PR's original description, which
-- assumed a web redirect through a "nearify.org/connect" page that
-- was never built and does not exist):
--
--   The Nearify app itself performs a native OAuth handshake against
--   this Supabase project (same Google/GitHub providers Nearify
--   already offers), obtaining a real, user-scoped Innovation Engine
--   session entirely within the Nearify app — no redirect to any
--   Innovation Engine web page is involved. Nearify then calls
--   link_nearify_account(p_nearify_user_id) directly using that
--   session, passing its own profile id as the opaque identifier.
--   The mapping is stored here, and ingest_nearify_interaction() (and
--   the newer ingest_nearify_event_presence()) resolve through it.
-- ================================================================


-- ================================================================
-- 1. IDENTITY MAP TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS public.nearify_identity_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  nearify_user_id TEXT NOT NULL,
  linked_at       TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT nim_community_unique  UNIQUE (community_id),
  CONSTRAINT nim_nearify_id_unique UNIQUE (nearify_user_id)
);

CREATE INDEX IF NOT EXISTS idx_nim_community   ON public.nearify_identity_map(community_id);
CREATE INDEX IF NOT EXISTS idx_nim_nearify_id  ON public.nearify_identity_map(nearify_user_id);

ALTER TABLE public.nearify_identity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own nearify link"
  ON public.nearify_identity_map FOR SELECT
  TO authenticated
  USING (
    community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own nearify link"
  ON public.nearify_identity_map FOR INSERT
  TO authenticated
  WITH CHECK (
    community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their own nearify link"
  ON public.nearify_identity_map FOR UPDATE
  TO authenticated
  USING (
    community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own nearify link"
  ON public.nearify_identity_map FOR DELETE
  TO authenticated
  USING (
    community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );


-- ================================================================
-- 2. LINK ACCOUNT RPC
-- ================================================================
-- Called by the Nearify app (native OAuth session against this
-- project) after completing its own OAuth handshake here. Stores
-- nearify_user_id -> community_id mapping for the currently
-- authenticated Supabase user.

-- Establishes both the identity bridge AND the Nearify authorization
-- atomically (single function invocation = single implicit
-- transaction — either both take effect or neither does). This RPC is
-- only ever called from a genuine, deliberate "Connect Buildspace"
-- action in the Nearify app (see nearify-ios MainTabView), performed
-- under copy that explicitly discloses both directions (personalizing
-- what this user sees, and using their profile to explain them to
-- another Nearify participant) — so a (re-)link always sets status
-- straight to 'authorized', including when re-linking after a prior
-- revocation. This is the ONLY path that should ever set status to
-- 'authorized' from a state other than 'needs_reconfirmation' — see
-- reconfirm_nearify_authorization() in community_experience_
-- authorizations.sql for the narrower transitional path.
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
-- 3. UNLINK ACCOUNT RPC
-- ================================================================

-- Revokes both the identity bridge and the Nearify authorization.
-- Revocation NEVER deletes the underlying community profile or auth
-- account (only the CASCADE-scoped identity_map row and an authorization
-- status flip) — the Buildspace account and Nearify account both
-- remain fully intact after this call.
CREATE OR REPLACE FUNCTION public.unlink_nearify_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_deleted      INT := 0;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found');
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

REVOKE ALL ON FUNCTION public.unlink_nearify_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_nearify_account() TO authenticated;


-- ================================================================
-- 4. GET LINK STATUS RPC
-- ================================================================
-- Returns the current user's linked Nearify ID (or null).

CREATE OR REPLACE FUNCTION public.get_nearify_link_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id  UUID;
  v_nearify_id    TEXT;
  v_linked_at     TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  SELECT nearify_user_id, linked_at
  INTO v_nearify_id, v_linked_at
  FROM nearify_identity_map
  WHERE community_id = v_community_id
  LIMIT 1;

  IF v_nearify_id IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  RETURN jsonb_build_object(
    'linked',           true,
    'nearify_user_id',  v_nearify_id,
    'linked_at',        v_linked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearify_link_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearify_link_status() TO authenticated;


-- ================================================================
-- 5. UPDATE ingest_nearify_interaction WITH NEARIFY ID RESOLUTION
-- ================================================================
-- Adds p_from_nearify_id / p_to_nearify_id parameters.
-- Resolution priority: community_id → auth_user_id → nearify_user_id

DROP FUNCTION IF EXISTS public.ingest_nearify_interaction(
  uuid, uuid, uuid, uuid, uuid, text, numeric, timestamptz, jsonb
);

CREATE OR REPLACE FUNCTION public.ingest_nearify_interaction(
  p_event_id            UUID,
  p_from_auth_user_id   UUID    DEFAULT NULL,
  p_to_auth_user_id     UUID    DEFAULT NULL,
  p_from_community_id   UUID    DEFAULT NULL,
  p_to_community_id     UUID    DEFAULT NULL,
  p_signal_type         TEXT    DEFAULT 'proximity',
  p_confidence          NUMERIC DEFAULT 50,
  p_occurred_at         TIMESTAMPTZ DEFAULT now(),
  p_meta                JSONB   DEFAULT '{}'::jsonb,
  p_from_nearify_id     TEXT    DEFAULT NULL,
  p_to_nearify_id       TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_cid  UUID;
  v_to_cid    UUID;
  v_edge_id   UUID;
  v_edge_status TEXT;
  v_conn_id   UUID;
  v_edge_created  BOOLEAN := false;
  v_edge_updated  BOOLEAN := false;
  v_conn_promoted BOOLEAN := false;
  v_conn_created  BOOLEAN := false;
  v_merged_meta JSONB;
  v_norm_from UUID;
  v_norm_to   UUID;
BEGIN
  -- ============================================================
  -- STEP 1: Resolve community IDs (community_id → auth_uid → nearify_id)
  -- ============================================================

  v_from_cid := p_from_community_id;
  IF v_from_cid IS NULL AND p_from_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_from_cid FROM community WHERE user_id = p_from_auth_user_id LIMIT 1;
  END IF;
  IF v_from_cid IS NULL AND p_from_nearify_id IS NOT NULL THEN
    SELECT community_id INTO v_from_cid FROM nearify_identity_map WHERE nearify_user_id = p_from_nearify_id LIMIT 1;
  END IF;

  v_to_cid := p_to_community_id;
  IF v_to_cid IS NULL AND p_to_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_to_cid FROM community WHERE user_id = p_to_auth_user_id LIMIT 1;
  END IF;
  IF v_to_cid IS NULL AND p_to_nearify_id IS NOT NULL THEN
    SELECT community_id INTO v_to_cid FROM nearify_identity_map WHERE nearify_user_id = p_to_nearify_id LIMIT 1;
  END IF;

  IF v_from_cid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not resolve from_user community ID');
  END IF;
  IF v_to_cid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not resolve to_user community ID');
  END IF;
  IF v_from_cid = v_to_cid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Self-edges are not allowed');
  END IF;

  -- ============================================================
  -- STEP 2: Build merged meta
  -- ============================================================
  v_merged_meta := COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object(
    'event_id',    p_event_id,
    'signal_type', p_signal_type,
    'confidence',  p_confidence,
    'occurred_at', p_occurred_at,
    'ingested_at', now()
  );

  IF p_signal_type = 'qr_confirmed' THEN
    v_edge_status := 'confirmed';
  ELSE
    v_edge_status := 'suggested';
  END IF;

  -- ============================================================
  -- STEP 3: Upsert interaction_edge
  -- ============================================================
  v_norm_from := LEAST(v_from_cid, v_to_cid);
  v_norm_to   := GREATEST(v_from_cid, v_to_cid);

  INSERT INTO interaction_edges (
    from_user_id, to_user_id, type, status, confidence, meta, created_at, updated_at
  ) VALUES (
    v_norm_from, v_norm_to,
    COALESCE(p_signal_type, 'proximity'),
    v_edge_status,
    COALESCE(p_confidence, 50),
    v_merged_meta,
    COALESCE(p_occurred_at, now()),
    now()
  )
  ON CONFLICT (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id),
    COALESCE((meta->>'event_id')::text, ''),
    COALESCE((meta->>'signal_type')::text, '')
  )
  DO UPDATE SET
    status     = CASE
                   WHEN EXCLUDED.status = 'confirmed' THEN 'confirmed'
                   ELSE interaction_edges.status
                 END,
    confidence = GREATEST(interaction_edges.confidence, EXCLUDED.confidence),
    meta       = interaction_edges.meta || EXCLUDED.meta,
    updated_at = now()
  RETURNING id, (xmax = 0) AS was_inserted
  INTO v_edge_id, v_edge_created;

  v_edge_updated := NOT v_edge_created;

  -- ============================================================
  -- STEP 4: Promote to connection if QR-confirmed
  -- ============================================================
  IF p_signal_type = 'qr_confirmed' THEN
    SELECT id INTO v_conn_id FROM connections
    WHERE (from_user_id = v_norm_from AND to_user_id = v_norm_to)
       OR (from_user_id = v_norm_to   AND to_user_id = v_norm_from)
    LIMIT 1;

    IF v_conn_id IS NULL THEN
      INSERT INTO connections (from_user_id, to_user_id, status, type, created_at, updated_at)
      VALUES (v_from_cid, v_to_cid, 'accepted', 'generic', now(), now())
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_conn_id;
      IF v_conn_id IS NOT NULL THEN
        v_conn_created  := true;
        v_conn_promoted := true;
      END IF;
    ELSE
      UPDATE connections SET status = 'accepted', updated_at = now()
      WHERE id = v_conn_id AND status != 'accepted';
      v_conn_promoted := true;
    END IF;

    IF v_conn_promoted THEN
      UPDATE interaction_edges SET status = 'promoted', updated_at = now() WHERE id = v_edge_id;
    END IF;
  END IF;

  -- ============================================================
  -- STEP 5: Return result
  -- ============================================================
  RETURN jsonb_build_object(
    'success',            true,
    'from_community_id',  v_from_cid,
    'to_community_id',    v_to_cid,
    'edge_id',            v_edge_id,
    'edge_created',       v_edge_created,
    'edge_updated',       v_edge_updated,
    'connection_promoted', COALESCE(v_conn_promoted, false),
    'connection_created',  COALESCE(v_conn_created,  false),
    'connection_id',       v_conn_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_nearify_interaction(
  uuid, uuid, uuid, uuid, uuid, text, numeric, timestamptz, jsonb, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_interaction(
  uuid, uuid, uuid, uuid, uuid, text, numeric, timestamptz, jsonb, text, text
) TO authenticated;


-- ================================================================
-- 6. IDENTITY-MAP HARDENING
-- ================================================================
-- This project carries a schema-level default privilege that grants
-- broad table access to anon/authenticated on new tables — confirmed
-- directly against production: anon and authenticated both currently
-- hold INSERT/UPDATE/DELETE on nearify_identity_map despite no code
-- ever granting it explicitly, and despite the RLS policies above
-- already existing as the intended (but bypassable-at-the-grant-level)
-- guard. No client anywhere (Nearify or Innovation Engine web) issues
-- a direct table write against nearify_identity_map — every mutation
-- goes through link_nearify_account()/unlink_nearify_account() — so
-- revoking direct write privileges cannot break the existing native
-- linking flow: those RPCs are SECURITY DEFINER and mutate the table
-- under the function owner's privileges regardless of what the
-- calling role itself is granted.
--
-- SELECT is left untouched — no finding suggested it was being misused,
-- and it's the RLS-scoped "view your own link" policy's intended path.
REVOKE INSERT, UPDATE, DELETE ON public.nearify_identity_map FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.nearify_identity_map FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.nearify_identity_map FROM authenticated;


-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify identity bridge deployed:';
  RAISE NOTICE '   ✓ nearify_identity_map table';
  RAISE NOTICE '   ✓ link_nearify_account() RPC — now also authorizes community_experience_authorizations';
  RAISE NOTICE '   ✓ unlink_nearify_account() RPC — now also revokes community_experience_authorizations';
  RAISE NOTICE '   ✓ get_nearify_link_status() RPC';
  RAISE NOTICE '   ✓ ingest_nearify_interaction() updated with nearify_id resolution';
  RAISE NOTICE '   ✓ nearify_identity_map direct INSERT/UPDATE/DELETE revoked from anon/authenticated';
END $$;
