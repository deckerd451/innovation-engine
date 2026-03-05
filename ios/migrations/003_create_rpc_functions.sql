-- RPC Functions for BLE Passive Networking

-- ============================================================================
-- upsert_presence_ping
-- ============================================================================
-- Insert-only presence ping (no unique constraints)
-- Called by mobile app to record beacon proximity
-- CRITICAL: This RPC handles auth.uid() → community.id mapping
-- Client must NEVER insert directly into presence_sessions

CREATE OR REPLACE FUNCTION public.upsert_presence_ping(
    p_context_type TEXT,
    p_context_id UUID,
    p_energy NUMERIC,
    p_ttl_seconds INT DEFAULT 25
) RETURNS VOID AS $$
DECLARE
    v_community_id UUID;
BEGIN
    -- Map auth.uid() to community.id
    -- Prefer: community.auth_user_id = auth.uid()
    SELECT id INTO v_community_id
    FROM public.community
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Fallback: community.email = auth.email()
    IF v_community_id IS NULL THEN
        SELECT id INTO v_community_id
        FROM public.community
        WHERE email = auth.email()
        LIMIT 1;
    END IF;
    
    -- Fail if no mapping found
    IF v_community_id IS NULL THEN
        RAISE EXCEPTION 'Could not resolve community.id for auth.uid() = %', auth.uid();
    END IF;
    
    -- Clamp energy to [0, 1] per database constraint
    p_energy := GREATEST(0, LEAST(1, p_energy));
    
    -- Insert presence ping
    INSERT INTO public.presence_sessions (
        id,
        user_id,
        context_type,
        context_id,
        energy,
        expires_at,
        created_at,
        updated_at,
        is_active,
        last_seen
    ) VALUES (
        gen_random_uuid(),
        v_community_id,  -- community.id, NOT auth.uid()
        p_context_type,
        p_context_id,
        p_energy,
        now() + (p_ttl_seconds || ' seconds')::interval,
        now(),
        now(),
        true,
        now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.upsert_presence_ping IS 'Insert presence ping for beacon proximity (insert-only, no updates). Maps auth.uid() to community.id.';

-- ============================================================================
-- infer_ble_edges
-- ============================================================================
-- Analyze presence_sessions to infer overlapping users
-- Creates interaction_edges with status='suggested'
-- CRITICAL: Stores community.id values (not auth.uid)

CREATE OR REPLACE FUNCTION public.infer_ble_edges(
    p_group_id UUID DEFAULT NULL,
    p_min_overlap_seconds INT DEFAULT 120,
    p_lookback_minutes INT DEFAULT 240
) RETURNS INT AS $$
DECLARE
    v_count INT;
    v_cutoff TIMESTAMPTZ;
BEGIN
    v_cutoff := now() - (p_lookback_minutes || ' minutes')::interval;
    
    -- Find overlapping presence sessions
    WITH overlaps AS (
        SELECT 
            LEAST(p1.user_id, p2.user_id) as from_user_id,
            GREATEST(p1.user_id, p2.user_id) as to_user_id,
            p1.context_id as beacon_id,
            COUNT(*) as ping_count,
            -- Calculate total overlap time
            SUM(
                EXTRACT(EPOCH FROM (
                    LEAST(p1.expires_at, p2.expires_at) - 
                    GREATEST(p1.created_at, p2.created_at)
                ))
            )::INT as overlap_seconds
        FROM public.presence_sessions p1
        JOIN public.presence_sessions p2 
            ON p1.context_id = p2.context_id 
            AND p1.context_type = 'beacon'
            AND p2.context_type = 'beacon'
            AND p1.user_id != p2.user_id
            AND p1.created_at < p2.expires_at
            AND p2.created_at < p1.expires_at
        WHERE 
            p1.created_at >= v_cutoff
            AND p2.created_at >= v_cutoff
            -- Optional: filter by beacon group
            AND (p_group_id IS NULL OR EXISTS (
                SELECT 1 FROM public.beacons b 
                WHERE b.id = p1.context_id 
                AND b.group_id = p_group_id
            ))
        GROUP BY 
            LEAST(p1.user_id, p2.user_id),
            GREATEST(p1.user_id, p2.user_id),
            p1.context_id
        HAVING SUM(
            EXTRACT(EPOCH FROM (
                LEAST(p1.expires_at, p2.expires_at) - 
                GREATEST(p1.created_at, p2.created_at)
            ))
        ) >= p_min_overlap_seconds
    )
    INSERT INTO public.interaction_edges (
        id,
        from_user_id,
        to_user_id,
        beacon_id,
        overlap_seconds,
        confidence,
        status,
        type,
        created_at,
        meta
    )
    SELECT 
        gen_random_uuid(),
        from_user_id,  -- community.id
        to_user_id,    -- community.id
        beacon_id,
        overlap_seconds,
        -- Confidence: 0-1 scale based on overlap (10 min = 1.0)
        LEAST(overlap_seconds / 600.0, 1.0)::NUMERIC(3,2) as confidence,
        'suggested',
        'ble_proximity',
        now(),
        jsonb_build_object(
            'ping_count', ping_count,
            'inferred_at', now()
        )
    FROM overlaps
    -- Avoid duplicates: don't re-suggest existing edges
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.infer_ble_edges IS 'Analyze presence overlaps and create suggested connection edges. Stores community.id values.';

-- ============================================================================
-- promote_edge_to_connection
-- ============================================================================
-- Promote an interaction_edge to a real connection
-- Called when user accepts a suggestion
-- CRITICAL: Works with community.id values (not auth.uid)

CREATE OR REPLACE FUNCTION public.promote_edge_to_connection(
    p_edge_id UUID
) RETURNS VOID AS $$
DECLARE
    v_edge public.interaction_edges;
    v_community_id UUID;
BEGIN
    -- Map auth.uid() to community.id
    SELECT id INTO v_community_id
    FROM public.community
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
    
    IF v_community_id IS NULL THEN
        SELECT id INTO v_community_id
        FROM public.community
        WHERE email = auth.email()
        LIMIT 1;
    END IF;
    
    IF v_community_id IS NULL THEN
        RAISE EXCEPTION 'Could not resolve community.id for auth.uid() = %', auth.uid();
    END IF;
    
    -- Fetch the edge (verify user is involved)
    SELECT * INTO v_edge 
    FROM public.interaction_edges 
    WHERE id = p_edge_id
    AND (from_user_id = v_community_id OR to_user_id = v_community_id);
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Edge not found or access denied';
    END IF;
    
    -- Insert into connections table
    INSERT INTO public.connections (
        id,
        from_user_id,
        to_user_id,
        status,
        type,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_edge.from_user_id,  -- community.id
        v_edge.to_user_id,    -- community.id
        'accepted',
        'ble_proximity',
        now()
    )
    ON CONFLICT DO NOTHING;
    
    -- Update edge status
    UPDATE public.interaction_edges 
    SET status = 'accepted',
        meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
            'promoted_at', now(),
            'promoted_by', v_community_id
        )
    WHERE id = p_edge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.promote_edge_to_connection IS 'Accept a suggested edge and create a real connection. Maps auth.uid() to community.id.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.upsert_presence_ping TO authenticated;
GRANT EXECUTE ON FUNCTION public.infer_ble_edges TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_edge_to_connection TO authenticated;
