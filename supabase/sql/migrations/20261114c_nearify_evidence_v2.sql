-- Additive only: legacy ingestion, grants and existing edges are unchanged.
BEGIN;

-- Versioned trusted ingestion: encounter evidence is never connection consent.
CREATE OR REPLACE FUNCTION public.ingest_nearify_evidence_v2(
  p_event_id UUID,
  p_from_nearify_id TEXT,
  p_to_nearify_id TEXT,
  p_signal_type TEXT DEFAULT 'qr_confirmed',
  p_confidence NUMERIC DEFAULT 100,
  p_occurred_at TIMESTAMPTZ DEFAULT now(),
  p_event_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from UUID;
  v_to UUID;
  v_edge UUID;
  v_created BOOLEAN := false;
BEGIN
  IF p_event_id IS NULL OR p_occurred_at IS NULL
     OR p_from_nearify_id IS NULL OR trim(p_from_nearify_id) = ''
     OR p_to_nearify_id IS NULL OR trim(p_to_nearify_id) = ''
     OR p_signal_type IS NULL OR p_signal_type NOT IN ('qr_confirmed', 'proximity', 'ble_proximity')
     OR p_confidence IS NULL OR NOT (p_confidence BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'Invalid encounter evidence' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.interaction_edges'::regclass
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Review interaction_edges triggers before evidence ingestion' USING ERRCODE = '55000';
  END IF;

  -- Only explicitly linked, authorized identities can contribute context.
  -- Resolve each input independently; never accept a caller-supplied graph ID.
  SELECT nim.community_id INTO v_from
  FROM public.nearify_identity_map nim
  JOIN public.community_experience_authorizations a USING (community_id)
  WHERE nim.nearify_user_id = trim(p_from_nearify_id)
    AND a.experience = 'nearify' AND a.status = 'authorized';
  SELECT nim.community_id INTO v_to
  FROM public.nearify_identity_map nim
  JOIN public.community_experience_authorizations a USING (community_id)
  WHERE nim.nearify_user_id = trim(p_to_nearify_id)
    AND a.experience = 'nearify' AND a.status = 'authorized';
  IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN
    RAISE EXCEPTION 'Evidence requires two distinct authorized linked members' USING ERRCODE = '22023';
  END IF;

  -- Use the established pair/event/signal index. Never refresh old evidence,
  -- change its lifecycle, or revive ignored/blocked rows on a retry.
  -- created_at is supported by the live table; updated_at is not assumed.
  INSERT INTO public.interaction_edges (
    from_user_id, to_user_id, type, status, confidence, meta, created_at
  ) VALUES (
    LEAST(v_from, v_to), GREATEST(v_from, v_to), p_signal_type,
    'suggested', p_confidence,
    jsonb_build_object(
      'event_id', p_event_id::text, 'event_name', p_event_name,
      'signal_type', p_signal_type, 'occurred_at', p_occurred_at,
      'ingested_at', now(), 'source', 'nearify-evidence-v2',
      'evidence_version', 2
    ), p_occurred_at
  )
  ON CONFLICT (
    LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id),
    COALESCE((meta->>'event_id')::text, ''),
    COALESCE((meta->>'signal_type')::text, '')
  ) DO NOTHING
  RETURNING id INTO v_edge;

  v_created := FOUND;
  IF NOT v_created THEN
    SELECT id INTO v_edge FROM public.interaction_edges
    WHERE LEAST(from_user_id, to_user_id) = LEAST(v_from, v_to)
      AND GREATEST(from_user_id, to_user_id) = GREATEST(v_from, v_to)
      AND COALESCE(meta->>'event_id', '') = p_event_id::text
      AND COALESCE(meta->>'signal_type', '') = p_signal_type;
    IF v_edge IS NULL THEN
      -- A concurrent deletion/isolation snapshot must never look successful.
      RAISE EXCEPTION 'Retry encounter evidence ingestion' USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'evidence_version', 2, 'edge_id', v_edge,
    'edge_created', v_created, 'connection_created', false,
    'connection_promoted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_nearify_evidence_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_evidence_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT) TO service_role;

COMMIT;
