-- People you met: members hidden from discovery are shown only to their
-- accepted connections.
--
-- get_nearify_event_peers() (SECURITY DEFINER; the only way members read
-- Nearify encounters -- direct interaction_edges reads match nobody, see
-- docs/SECURITY_MEMBERSHIP_PROXIMITY_AUTHZ.md) returned every encounter,
-- including ones with members an admin had hidden from discovery
-- (community.is_hidden). Anyone who had met them saw their name, short bio,
-- photo URL, profile id, edge id and shared events, and could open their
-- profile or send a connection request from there.
--
-- Now an encounter with a hidden member is returned only when the two are
-- already an accepted connection. Nothing is deleted: the encounter records
-- stay as they are, and reappear if the member is un-hidden or the two
-- connect. Everything else in the function is unchanged (the as-deployed
-- definition in supabase/sql/nearify_event_peers.sql, plus visible_edges).
--
-- Before applying: confirm production's definition still matches
-- supabase/sql/nearify_event_peers.sql (the rollback restores that text).
--
-- Rollback: supabase/sql/rollback/20261028_nearify_peers_hidden_members_rollback.sql
-- Idempotent: safe to re-run. No table, column, policy or grant changes.

BEGIN;

-- Uses existing columns only; stop rather than guess if they are missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'community' AND column_name = 'is_hidden') THEN
    RAISE EXCEPTION 'community.is_hidden is missing; not applying';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_nearify_event_peers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_result       JSONB;
BEGIN
  -- Resolve current user's community ID
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found');
  END IF;

  -- Build event → peers structure
  WITH my_edges AS (
    SELECT
      ie.id          AS edge_id,
      CASE
        WHEN ie.from_user_id = v_community_id THEN ie.to_user_id
        ELSE ie.from_user_id
      END            AS peer_id,
      ie.status,
      ie.confidence,
      ie.created_at  AS interacted_at,
      ie.meta->>'event_id'    AS event_id,
      ie.meta->>'event_name'  AS event_name,
      ie.meta->>'signal_type' AS signal_type,
      (ie.meta->>'occurred_at') AS occurred_at
    FROM interaction_edges ie
    WHERE (ie.from_user_id = v_community_id OR ie.to_user_id = v_community_id)
      AND ie.status NOT IN ('ignored', 'blocked')
  ),
  -- A member hidden from discovery appears only to their accepted
  -- connections: nobody else gets their name, bio, photo, profile id, edge
  -- id or the events they were at. The encounters themselves are kept.
  visible_edges AS (
    SELECT e.*
    FROM my_edges e
    WHERE NOT EXISTS (
            SELECT 1 FROM community h
            WHERE h.id = e.peer_id AND h.is_hidden IS TRUE)
       OR EXISTS (
            SELECT 1 FROM connections k
            WHERE k.status = 'accepted'
              AND ((k.from_user_id = v_community_id AND k.to_user_id = e.peer_id)
                OR (k.to_user_id = v_community_id AND k.from_user_id = e.peer_id)))
  ),
  -- One row per (event_group, peer) — keep best edge (QR > BLE, then highest confidence)
  best_edges AS (
    SELECT DISTINCT ON (COALESCE(event_id, 'unknown'), peer_id)
      edge_id, peer_id, status, confidence, interacted_at,
      event_id, event_name, signal_type, occurred_at
    FROM visible_edges
    ORDER BY
      COALESCE(event_id, 'unknown'),
      peer_id,
      CASE WHEN signal_type = 'qr_confirmed' THEN 0 ELSE 1 END,
      confidence DESC NULLS LAST
  ),
  peer_profiles AS (
    SELECT
      e.edge_id,
      e.peer_id,
      e.status,
      e.confidence,
      e.interacted_at,
      e.event_id,
      COALESCE(e.event_name, 'Nearify Event') AS event_name,
      COALESCE(e.signal_type, 'proximity')    AS signal_type,
      COALESCE(e.occurred_at::text, e.interacted_at::text) AS occurred_at,
      c.name        AS peer_name,
      c.image_url   AS peer_avatar,
      c.bio         AS peer_headline
    FROM best_edges e
    LEFT JOIN community c ON c.id = e.peer_id
  ),
  grouped AS (
    SELECT
      COALESCE(event_id, 'unknown') AS ev_id,
      event_name,
      MIN(occurred_at) AS earliest_interaction,
      jsonb_agg(
        jsonb_build_object(
          'edge_id',      edge_id,
          'community_id', peer_id,
          'name',         COALESCE(peer_name, 'Unknown'),
          'avatar_url',   peer_avatar,
          'headline',     peer_headline,
          'signal_type',  signal_type,
          'status',       status,
          'confidence',   confidence,
          'occurred_at',  occurred_at
        )
        ORDER BY occurred_at DESC
      ) AS peers
    FROM peer_profiles
    GROUP BY ev_id, event_name
  )
  SELECT jsonb_build_object(
    'success', true,
    'community_id', v_community_id,
    'events', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'event_id',   ev_id,
          'event_name', event_name,
          'occurred_at', earliest_interaction,
          'peers',      peers
        )
        ORDER BY earliest_interaction DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM grouped;

  RETURN COALESCE(v_result, jsonb_build_object('success', true, 'events', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearify_event_peers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearify_event_peers() TO authenticated;

COMMIT;
