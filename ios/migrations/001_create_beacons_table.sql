-- Create beacons table for BLE passive networking
-- This table stores the registry of iBeacons deployed at events

CREATE TABLE IF NOT EXISTS public.beacons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    group_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for active beacon lookups
CREATE INDEX IF NOT EXISTS idx_beacons_active ON public.beacons(is_active) WHERE is_active = true;

-- Create index for group lookups
CREATE INDEX IF NOT EXISTS idx_beacons_group ON public.beacons(group_id) WHERE group_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.beacons ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active beacons
CREATE POLICY "Anyone can read active beacons"
    ON public.beacons
    FOR SELECT
    USING (is_active = true);

-- Policy: Only admins can insert/update beacons (adjust as needed)
-- CREATE POLICY "Admins can manage beacons"
--     ON public.beacons
--     FOR ALL
--     USING (auth.jwt() ->> 'role' = 'admin');

COMMENT ON TABLE public.beacons IS 'Registry of iBeacons for passive networking';
COMMENT ON COLUMN public.beacons.beacon_key IS 'Format: uuid:<UUID>|major:<MAJOR>|minor:<MINOR>';
COMMENT ON COLUMN public.beacons.kind IS 'Type of beacon: event, venue, zone, etc.';
COMMENT ON COLUMN public.beacons.group_id IS 'Optional grouping (e.g., event ID)';
