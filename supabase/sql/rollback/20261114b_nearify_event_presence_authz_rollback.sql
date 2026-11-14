-- Emergency rollback restores the prior body but disables all client access.
-- Never restore the vulnerable anonymous/authenticated grants. Native presence
-- mirroring pauses until the fixed migration is reapplied; primary Nearify
-- event actions remain independent. service_role keeps its existing access.
BEGIN;

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

REVOKE ALL ON FUNCTION public.ingest_nearify_event_presence(TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_event_presence(TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, TEXT) TO service_role;

COMMIT;
