-- ================================================================
-- NEARIFY: Event Peers RPC
-- ================================================================
-- Returns the current user's Nearify interaction peers, grouped by
-- event. Used by the "People you met" profile panel.
--
-- Each event group includes:
--   - event_id, event_name, event_date (from meta)
--   - peers: community profile + signal_type + edge status + confidence
--
-- Identity contract: all IDs are community.id values.
-- ================================================================

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
    FROM my_edges e
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


-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify event peers RPC deployed:';
  RAISE NOTICE '   ✓ get_nearify_event_peers() — interaction peers grouped by event';
END $$;
