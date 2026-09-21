-- ================================================================
-- NEARIFY → INNOVATION ENGINE: Event Presence / Roster
-- ================================================================
-- STATUS: NEW — this is the one genuinely new piece of cross-system
-- plumbing. Everything else in the Nearify bridge (identity map,
-- interaction_edges) already existed and is live; this table did not
-- exist anywhere before.
--
-- Purpose: the existing interaction_edges pipeline only records
-- PAIRWISE encounters after they happen (post-hoc "these two people
-- met"). It cannot answer "who is at this event that I have not
-- necessarily met yet" — that requires knowing the event ROSTER, not
-- just interaction history. This table is that roster.
--
-- Nearify pushes a row here when a linked user joins or leaves a
-- Nearify event (via EventJoinService's existing join/leave
-- lifecycle). Innovation Engine treats nearify_event_id as an opaque
-- external identifier (Nearify's own events.id) — it never validates
-- or owns event metadata itself, only stores what Nearify supplies
-- for display purposes.
--
-- Identity contract: same resolution priority as ingest_nearify_interaction
-- (community_id -> auth_user_id -> nearify_id via nearify_identity_map).
-- ================================================================


-- ================================================================
-- 1. EVENT PRESENCE TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS public.nearify_event_presence (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  nearify_event_id  TEXT NOT NULL,
  event_name        TEXT,
  event_starts_at   TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left')),
  -- Commitment lifecycle (joined/left) is separate from live presence.
  -- Existing and newly joined rows are never live until Nearify performs
  -- an explicit check-in through set_nearify_event_live_presence().
  is_live           BOOLEAN NOT NULL DEFAULT false,
  last_seen_at      TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT nep_community_event_unique UNIQUE (community_id, nearify_event_id)
);

-- Indexes for roster matching: "who else is at this event" (event lookup),
-- "my presence rows" (community lookup, also used by RLS), and a partial
-- index on currently-joined rows since that's the hot path for candidate
-- generation in the recommendation query.
CREATE INDEX IF NOT EXISTS idx_nep_community      ON public.nearify_event_presence(community_id);
CREATE INDEX IF NOT EXISTS idx_nep_event           ON public.nearify_event_presence(nearify_event_id);
CREATE INDEX IF NOT EXISTS idx_nep_event_joined    ON public.nearify_event_presence(nearify_event_id) WHERE status = 'joined';
CREATE INDEX IF NOT EXISTS idx_nep_event_live      ON public.nearify_event_presence(nearify_event_id) WHERE is_live = true;

ALTER TABLE public.nearify_event_presence ENABLE ROW LEVEL SECURITY;

-- No direct INSERT/UPDATE/DELETE policies are granted here, by design —
-- all writes go through ingest_nearify_event_presence() below (same
-- hardening pattern as interaction_edges: identity resolution and
-- upsert logic must not be reimplementable/bypassable client-side).

-- Policy 1: always see your own presence rows (including past/left
-- events), regardless of co-attendance.
CREATE POLICY "Users can view their own event presence"
  ON public.nearify_event_presence FOR SELECT
  TO authenticated
  USING (
    community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

-- Policy 2: see OTHER people's presence rows only for events where you
-- yourself are currently joined — co-attendee visibility only, never a
-- global roster leak. Implemented via a SECURITY DEFINER helper rather
-- than a self-referencing subquery on this same table, to avoid RLS
-- recursion.
CREATE OR REPLACE FUNCTION public._my_active_nearify_event_ids()
RETURNS TABLE(nearify_event_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT nep.nearify_event_id
  FROM public.nearify_event_presence nep
  JOIN public.community c ON c.id = nep.community_id
  WHERE c.user_id = auth.uid() AND nep.status = 'joined' AND nep.is_live = true;
$$;

REVOKE ALL ON FUNCTION public._my_active_nearify_event_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._my_active_nearify_event_ids() TO authenticated;

CREATE POLICY "Users can view co-attendees at events they're currently at"
  ON public.nearify_event_presence FOR SELECT
  TO authenticated
  USING (
    nearify_event_id IN (SELECT nearify_event_id FROM public._my_active_nearify_event_ids())
  );


-- ================================================================
-- 2. INGEST EVENT PRESENCE RPC
-- ================================================================
-- Called by the Nearify app's InnovationEngineBridgeService after a
-- successful join_event / leaveEvent in EventJoinService. Upserts on
-- (community_id, nearify_event_id) — idempotent: calling this
-- Repeated commitment writes refresh last_seen_at. They intentionally do
-- not alter is_live; only the authenticated live-presence RPC below may do
-- that.
-- Last-write-wins on status, matching the simple join/leave lifecycle
-- this is fed from (no heartbeat-frequency calls for MVP, so there is
-- no meaningful out-of-order risk to guard against here).

CREATE OR REPLACE FUNCTION public.ingest_nearify_event_presence(
  p_nearify_event_id    TEXT,
  p_event_name          TEXT DEFAULT NULL,
  p_event_starts_at     TIMESTAMPTZ DEFAULT NULL,
  p_status              TEXT DEFAULT 'joined',
  p_from_community_id   UUID DEFAULT NULL,
  p_from_auth_user_id   UUID DEFAULT NULL,
  p_from_nearify_id     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_row_id       UUID;
  v_created      BOOLEAN := false;
BEGIN
  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('joined', 'left') THEN
    RETURN jsonb_build_object('success', false, 'error', 'status must be joined or left');
  END IF;

  -- Resolve community ID: community_id -> auth_uid -> nearify_id
  -- (identical priority to ingest_nearify_interaction, for consistency)
  v_community_id := p_from_community_id;
  IF v_community_id IS NULL AND p_from_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_community_id FROM community WHERE user_id = p_from_auth_user_id LIMIT 1;
  END IF;
  IF v_community_id IS NULL AND p_from_nearify_id IS NOT NULL THEN
    SELECT community_id INTO v_community_id FROM nearify_identity_map WHERE nearify_user_id = p_from_nearify_id LIMIT 1;
  END IF;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not resolve community ID');
  END IF;

  INSERT INTO nearify_event_presence (
    community_id, nearify_event_id, event_name, event_starts_at, status, last_seen_at, updated_at
  ) VALUES (
    v_community_id, trim(p_nearify_event_id), p_event_name, p_event_starts_at, p_status, now(), now()
  )
  ON CONFLICT (community_id, nearify_event_id) DO UPDATE
    SET status          = EXCLUDED.status,
        event_name      = COALESCE(EXCLUDED.event_name, nearify_event_presence.event_name),
        event_starts_at = COALESCE(EXCLUDED.event_starts_at, nearify_event_presence.event_starts_at),
        last_seen_at    = now(),
        updated_at      = now()
  RETURNING id, (xmax = 0)
  INTO v_row_id, v_created;

  RETURN jsonb_build_object(
    'success',      true,
    'community_id', v_community_id,
    'presence_id',  v_row_id,
    'status',       p_status,
    'created',      v_created
  );
END;
$$;

-- ================================================================
-- 3. SERVER-CONTROLLED LIVE PRESENCE RPC
-- ================================================================
-- Only an authenticated caller can toggle their own live check-in state.
-- This never changes RSVP/commitment status and cannot make another
-- community member live.

CREATE OR REPLACE FUNCTION public.set_nearify_event_live_presence(
  p_nearify_event_id TEXT,
  p_event_name       TEXT DEFAULT NULL,
  p_event_starts_at  TIMESTAMPTZ DEFAULT NULL,
  p_is_live          BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_row_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found');
  END IF;

  SELECT status INTO v_status
  FROM nearify_event_presence
  WHERE community_id = v_community_id
    AND nearify_event_id = trim(p_nearify_event_id)
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event commitment not found');
  END IF;

  IF p_is_live AND v_status <> 'joined' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A left event cannot become live without rejoining');
  END IF;

  UPDATE nearify_event_presence
  SET is_live = COALESCE(p_is_live, false),
      event_name = COALESCE(p_event_name, event_name),
      event_starts_at = COALESCE(p_event_starts_at, event_starts_at),
      last_seen_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id
    AND nearify_event_id = trim(p_nearify_event_id)
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'success', true,
    'community_id', v_community_id,
    'presence_id', v_row_id,
    'is_live', COALESCE(p_is_live, false),
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_nearify_event_live_presence(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_nearify_event_live_presence(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.ingest_nearify_event_presence(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_event_presence(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, TEXT
) TO authenticated;


-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify event presence deployed:';
  RAISE NOTICE '   ✓ nearify_event_presence table (RLS: own rows + co-attendees only)';
  RAISE NOTICE '   ✓ ingest_nearify_event_presence() RPC';
  RAISE NOTICE '   ✓ set_nearify_event_live_presence() RPC';
END $$;
