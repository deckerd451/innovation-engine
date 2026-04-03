-- ================================================================
-- NEARIFY → INNOVATION ENGINE: Connection Ingestion Pipeline
-- ================================================================
-- v1: Minimal, safe ingestion of event interactions
--
-- Flow:
--   Nearify captures interaction → sends payload →
--   IE validates identities → upserts interaction_edge →
--   If QR-confirmed → promotes to durable connection
--
-- Identity contract:
--   interaction_edges.from_user_id = community.id
--   interaction_edges.to_user_id   = community.id
--   connections.from_user_id       = community.id
--   connections.to_user_id         = community.id
-- ================================================================


-- ================================================================
-- 1. CREATE interaction_edges TABLE (if not exists)
-- ================================================================
-- Staging layer for all event interactions.
-- BLE proximity stays here as 'suggested'.
-- QR-confirmed gets promoted to connections.

CREATE TABLE IF NOT EXISTS public.interaction_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  type          TEXT DEFAULT 'proximity',
  status        TEXT DEFAULT 'suggested'
                  CHECK (status IN ('suggested', 'confirmed', 'promoted', 'ignored', 'blocked')),
  beacon_id     UUID,
  overlap_seconds INTEGER,
  confidence    NUMERIC(5,2) DEFAULT 0
                  CHECK (confidence >= 0 AND confidence <= 100),
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  -- Prevent self-edges
  CONSTRAINT ie_no_self_edge CHECK (from_user_id != to_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ie_from_user   ON public.interaction_edges(from_user_id);
CREATE INDEX IF NOT EXISTS idx_ie_to_user     ON public.interaction_edges(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ie_status      ON public.interaction_edges(status);
CREATE INDEX IF NOT EXISTS idx_ie_beacon      ON public.interaction_edges(beacon_id);
CREATE INDEX IF NOT EXISTS idx_ie_meta_event  ON public.interaction_edges USING gin(meta);

-- Unique constraint: one edge per pair + event + signal_type
-- Uses deterministic ordering (smaller UUID first) to prevent reversed duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_ie_dedup
  ON public.interaction_edges (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id),
    COALESCE((meta->>'event_id')::text, ''),
    COALESCE((meta->>'signal_type')::text, '')
  );

-- RLS
ALTER TABLE public.interaction_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their edges" ON public.interaction_edges;
CREATE POLICY "Users can view their edges"
  ON public.interaction_edges FOR SELECT
  TO authenticated
  USING (
    from_user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR
    to_user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

-- Service role can do everything (for RPC SECURITY DEFINER functions)
-- Authenticated users can only read their own edges
GRANT SELECT ON public.interaction_edges TO authenticated;


-- ================================================================
-- 2. INGESTION FUNCTION
-- ================================================================

DROP FUNCTION IF EXISTS public.ingest_nearify_interaction(
  uuid, uuid, uuid, uuid, uuid, text, numeric, timestamptz, jsonb
);

CREATE OR REPLACE FUNCTION public.ingest_nearify_interaction(
  p_event_id            UUID,
  p_from_auth_user_id   UUID DEFAULT NULL,
  p_to_auth_user_id     UUID DEFAULT NULL,
  p_from_community_id   UUID DEFAULT NULL,
  p_to_community_id     UUID DEFAULT NULL,
  p_signal_type         TEXT DEFAULT 'proximity',
  p_confidence          NUMERIC DEFAULT 50,
  p_occurred_at         TIMESTAMPTZ DEFAULT now(),
  p_meta                JSONB DEFAULT '{}'::jsonb
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
  v_edge_created BOOLEAN := false;
  v_edge_updated BOOLEAN := false;
  v_conn_promoted BOOLEAN := false;
  v_conn_created BOOLEAN := false;
  v_merged_meta JSONB;
  v_norm_from UUID;
  v_norm_to   UUID;
BEGIN
  -- ============================================================
  -- STEP 1: Resolve community IDs
  -- ============================================================

  -- Resolve from_user
  v_from_cid := p_from_community_id;
  IF v_from_cid IS NULL AND p_from_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_from_cid
    FROM community
    WHERE user_id = p_from_auth_user_id
    LIMIT 1;
  END IF;

  -- Resolve to_user
  v_to_cid := p_to_community_id;
  IF v_to_cid IS NULL AND p_to_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_to_cid
    FROM community
    WHERE user_id = p_to_auth_user_id
    LIMIT 1;
  END IF;

  -- Validate both resolved
  IF v_from_cid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Could not resolve from_user community ID'
    );
  END IF;

  IF v_to_cid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Could not resolve to_user community ID'
    );
  END IF;

  -- Validate both exist in community table
  IF NOT EXISTS (SELECT 1 FROM community WHERE id = v_from_cid) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'from_community_id does not exist'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM community WHERE id = v_to_cid) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'to_community_id does not exist'
    );
  END IF;

  -- Prevent self-edges
  IF v_from_cid = v_to_cid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Self-edges are not allowed'
    );
  END IF;

  -- ============================================================
  -- STEP 2: Build merged meta
  -- ============================================================
  v_merged_meta := COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object(
    'event_id', p_event_id,
    'signal_type', p_signal_type,
    'confidence', p_confidence,
    'occurred_at', p_occurred_at,
    'ingested_at', now()
  );

  -- Determine edge status based on signal type
  IF p_signal_type = 'qr_confirmed' THEN
    v_edge_status := 'confirmed';
  ELSE
    v_edge_status := 'suggested';
  END IF;

  -- ============================================================
  -- STEP 3: Upsert interaction_edge
  -- ============================================================
  -- Normalize direction for dedup index (smaller UUID first)
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
                   -- Only upgrade status, never downgrade
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
    -- Check if connection already exists (either direction)
    SELECT id INTO v_conn_id
    FROM connections
    WHERE (from_user_id = v_norm_from AND to_user_id = v_norm_to)
       OR (from_user_id = v_norm_to AND to_user_id = v_norm_from)
    LIMIT 1;

    IF v_conn_id IS NULL THEN
      -- Create new accepted connection
      INSERT INTO connections (from_user_id, to_user_id, status, type, created_at, updated_at)
      VALUES (v_from_cid, v_to_cid, 'accepted', 'generic', now(), now())
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_conn_id;

      IF v_conn_id IS NOT NULL THEN
        v_conn_created := true;
        v_conn_promoted := true;
      END IF;
    ELSE
      -- Connection exists — ensure it's accepted if currently pending
      UPDATE connections
      SET status = 'accepted',
          updated_at = now()
      WHERE id = v_conn_id
        AND status != 'accepted';

      v_conn_promoted := true;
    END IF;

    -- Mark edge as promoted
    IF v_conn_promoted THEN
      UPDATE interaction_edges
      SET status = 'promoted', updated_at = now()
      WHERE id = v_edge_id;
    END IF;
  END IF;

  -- ============================================================
  -- STEP 5: Return result
  -- ============================================================
  RETURN jsonb_build_object(
    'success', true,
    'from_community_id', v_from_cid,
    'to_community_id', v_to_cid,
    'edge_id', v_edge_id,
    'edge_created', v_edge_created,
    'edge_updated', v_edge_updated,
    'connection_promoted', COALESCE(v_conn_promoted, false),
    'connection_created', COALESCE(v_conn_created, false),
    'connection_id', v_conn_id
  );
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.ingest_nearify_interaction(
  uuid, uuid, uuid, uuid, uuid, text, numeric, timestamptz, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_interaction(
  uuid, uuid, uuid, uuid, uuid, text, numeric, timestamptz, jsonb
) TO authenticated;


-- ================================================================
-- 3. PROMOTE EDGE TO CONNECTION (standalone helper)
-- ================================================================
-- Reusable by Event Mode Gravity UI and other callers.

DROP FUNCTION IF EXISTS public.promote_edge_to_connection(UUID);

CREATE OR REPLACE FUNCTION public.promote_edge_to_connection(
  p_edge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge RECORD;
  v_conn_id UUID;
  v_created BOOLEAN := false;
BEGIN
  -- Load edge
  SELECT * INTO v_edge
  FROM interaction_edges
  WHERE id = p_edge_id;

  IF v_edge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Edge not found');
  END IF;

  IF v_edge.status = 'promoted' THEN
    RETURN jsonb_build_object('success', true, 'already_promoted', true);
  END IF;

  -- Check existing connection (either direction)
  SELECT id INTO v_conn_id
  FROM connections
  WHERE (from_user_id = v_edge.from_user_id AND to_user_id = v_edge.to_user_id)
     OR (from_user_id = v_edge.to_user_id AND to_user_id = v_edge.from_user_id)
  LIMIT 1;

  IF v_conn_id IS NULL THEN
    INSERT INTO connections (from_user_id, to_user_id, status, type, created_at, updated_at)
    VALUES (v_edge.from_user_id, v_edge.to_user_id, 'accepted', 'generic', now(), now())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conn_id;
    v_created := (v_conn_id IS NOT NULL);
  ELSE
    -- Ensure accepted
    UPDATE connections SET status = 'accepted', updated_at = now()
    WHERE id = v_conn_id AND status != 'accepted';
  END IF;

  -- Mark edge promoted
  UPDATE interaction_edges
  SET status = 'promoted', updated_at = now()
  WHERE id = p_edge_id;

  RETURN jsonb_build_object(
    'success', true,
    'connection_id', v_conn_id,
    'connection_created', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_edge_to_connection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_edge_to_connection(UUID) TO authenticated;


-- ================================================================
-- 4. COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify ingestion pipeline deployed:';
  RAISE NOTICE '   ✓ interaction_edges table (with dedup index)';
  RAISE NOTICE '   ✓ ingest_nearify_interaction() RPC';
  RAISE NOTICE '   ✓ promote_edge_to_connection() RPC';
END $$;
