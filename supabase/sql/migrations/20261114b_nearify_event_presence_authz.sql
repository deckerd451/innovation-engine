-- Resolve event-participation writes from the caller session, never supplied identity.
-- Signature and join/leave/live semantics remain unchanged.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_community_id UUID;
  v_row_id       UUID;
  v_created      BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to update event participation' USING ERRCODE = '42501';
  END IF;

  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('joined', 'left') THEN
    RETURN jsonb_build_object('success', false, 'error', 'status must be joined or left');
  END IF;

  -- Identity parameters remain for native-client compatibility, but are
  -- assertions only. Resolve the actor exclusively from the signed-in session.
  SELECT id INTO v_community_id
  FROM public.community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  IF (p_from_community_id IS NOT NULL AND p_from_community_id <> v_community_id)
     OR (p_from_auth_user_id IS NOT NULL AND p_from_auth_user_id <> auth.uid())
     OR (p_from_nearify_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.nearify_identity_map nim
       WHERE nim.community_id = v_community_id
         AND lower(nim.nearify_user_id) = lower(trim(p_from_nearify_id))
     )) THEN
    RAISE EXCEPTION 'Identity does not match signed-in member' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.ingest_nearify_event_presence(TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_event_presence(TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;

COMMIT;
