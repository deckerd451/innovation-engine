-- Create interaction_edges table for staging suggested connections
-- This table stores inferred proximity overlaps before promotion to connections

CREATE TABLE IF NOT EXISTS public.interaction_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'suggested',
    type TEXT NOT NULL,
    beacon_id UUID REFERENCES public.beacons(id),
    overlap_seconds INT,
    confidence NUMERIC(3,2),
    meta JSONB,
    
    -- Ensure from_user_id < to_user_id for consistency
    CONSTRAINT check_user_order CHECK (from_user_id < to_user_id),
    
    -- Status must be valid
    CONSTRAINT check_status CHECK (status IN ('suggested', 'accepted', 'ignored', 'blocked'))
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_edges_from_user ON public.interaction_edges(from_user_id);
CREATE INDEX IF NOT EXISTS idx_edges_to_user ON public.interaction_edges(to_user_id);
CREATE INDEX IF NOT EXISTS idx_edges_status ON public.interaction_edges(status);
CREATE INDEX IF NOT EXISTS idx_edges_beacon ON public.interaction_edges(beacon_id);

-- Composite index for user lookups with status filter
CREATE INDEX IF NOT EXISTS idx_edges_users_status 
    ON public.interaction_edges(from_user_id, to_user_id, status);

-- Enable RLS
ALTER TABLE public.interaction_edges ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own edges
CREATE POLICY "Users can read their own edges"
    ON public.interaction_edges
    FOR SELECT
    USING (
        auth.uid() = from_user_id 
        OR auth.uid() = to_user_id
    );

-- Policy: Users can update status of their own edges
CREATE POLICY "Users can update their own edges"
    ON public.interaction_edges
    FOR UPDATE
    USING (
        auth.uid() = from_user_id 
        OR auth.uid() = to_user_id
    )
    WITH CHECK (
        auth.uid() = from_user_id 
        OR auth.uid() = to_user_id
    );

COMMENT ON TABLE public.interaction_edges IS 'Staging table for inferred proximity-based connection suggestions';
COMMENT ON COLUMN public.interaction_edges.status IS 'suggested, accepted, ignored, or blocked';
COMMENT ON COLUMN public.interaction_edges.type IS 'Type of interaction: ble_proximity, qr_scan, etc.';
COMMENT ON COLUMN public.interaction_edges.overlap_seconds IS 'Total overlap time in seconds';
COMMENT ON COLUMN public.interaction_edges.confidence IS 'Confidence score 0.00-1.00';
