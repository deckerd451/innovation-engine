-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- Add is_active column to presence_sessions table
-- This column tracks whether a user's session is currently active (tab visible)

ALTER TABLE presence_sessions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add index for faster queries on active sessions
CREATE INDEX IF NOT EXISTS idx_presence_sessions_is_active 
ON presence_sessions(is_active) 
WHERE is_active = true;

-- Add index for active sessions by user
CREATE INDEX IF NOT EXISTS idx_presence_sessions_user_active 
ON presence_sessions(user_id, is_active) 
WHERE is_active = true;

-- Update existing sessions to be active
UPDATE presence_sessions 
SET is_active = true 
WHERE is_active IS NULL;

-- Add comment
COMMENT ON COLUMN presence_sessions.is_active IS 'Whether the user session is currently active (tab visible and heartbeat running)';
