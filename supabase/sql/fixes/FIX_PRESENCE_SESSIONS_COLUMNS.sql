-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ================================================================
-- FIX PRESENCE SESSIONS TABLE - Add missing columns
-- ================================================================
-- This adds the is_active and last_seen columns needed for presence tracking
-- Run this in Supabase SQL Editor
-- ================================================================

-- Add last_seen column if it doesn't exist
ALTER TABLE presence_sessions 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Add is_active column if it doesn't exist
ALTER TABLE presence_sessions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_presence_sessions_last_seen 
ON presence_sessions(last_seen);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_user_last_seen 
ON presence_sessions(user_id, last_seen);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_is_active 
ON presence_sessions(is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_presence_sessions_user_active 
ON presence_sessions(user_id, is_active) 
WHERE is_active = true;

-- Update existing sessions
UPDATE presence_sessions 
SET last_seen = COALESCE(last_seen, updated_at, NOW())
WHERE last_seen IS NULL;

UPDATE presence_sessions 
SET is_active = COALESCE(is_active, true)
WHERE is_active IS NULL;

-- Make context fields nullable for simple presence tracking
ALTER TABLE presence_sessions 
ALTER COLUMN context_type DROP NOT NULL,
ALTER COLUMN context_id DROP NOT NULL,
ALTER COLUMN energy DROP NOT NULL;

-- Set default values
ALTER TABLE presence_sessions 
ALTER COLUMN context_type SET DEFAULT 'general',
ALTER COLUMN context_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
ALTER COLUMN energy SET DEFAULT 1.0;

-- Update the check constraint to allow NULL context_type
ALTER TABLE presence_sessions 
DROP CONSTRAINT IF EXISTS presence_sessions_context_type_check;

ALTER TABLE presence_sessions 
ADD CONSTRAINT presence_sessions_context_type_check 
CHECK (context_type IS NULL OR context_type IN ('theme', 'project', 'profile', 'general'));

-- Add comments
COMMENT ON COLUMN presence_sessions.last_seen IS 'Timestamp of last heartbeat/activity from this session';
COMMENT ON COLUMN presence_sessions.is_active IS 'Whether the user session is currently active (tab visible and heartbeat running)';

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'presence_sessions'
ORDER BY ordinal_position;
