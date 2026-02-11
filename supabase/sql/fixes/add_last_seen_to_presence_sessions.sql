-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- Add last_seen column to presence_sessions table
-- This column is used by the presence session manager for simple heartbeat tracking

-- Add last_seen column if it doesn't exist
ALTER TABLE presence_sessions 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Add index for faster queries on last_seen
CREATE INDEX IF NOT EXISTS idx_presence_sessions_last_seen 
ON presence_sessions(last_seen);

-- Add index for user + last_seen queries
CREATE INDEX IF NOT EXISTS idx_presence_sessions_user_last_seen 
ON presence_sessions(user_id, last_seen);

-- Update existing sessions to have last_seen = updated_at
UPDATE presence_sessions 
SET last_seen = updated_at 
WHERE last_seen IS NULL;

-- Add comment
COMMENT ON COLUMN presence_sessions.last_seen IS 'Timestamp of last heartbeat/activity from this session';

-- Make context_type and context_id nullable for simple presence tracking
-- (Some sessions may not have a specific context)
ALTER TABLE presence_sessions 
ALTER COLUMN context_type DROP NOT NULL,
ALTER COLUMN context_id DROP NOT NULL,
ALTER COLUMN energy DROP NOT NULL;

-- Set default values for nullable columns
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
