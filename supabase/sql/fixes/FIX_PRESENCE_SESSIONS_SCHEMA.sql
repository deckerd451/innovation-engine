-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ============================================================================
-- FIX PRESENCE SESSIONS SCHEMA
-- ============================================================================
-- This migration adds the missing last_seen column and makes the schema
-- compatible with both the unified network discovery system and simple
-- presence tracking.
--
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- 1. Add last_seen column if it doesn't exist
ALTER TABLE presence_sessions 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- 2. Add is_active column if it doesn't exist (from ADD_IS_ACTIVE_TO_PRESENCE_SESSIONS.sql)
ALTER TABLE presence_sessions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. Make context_type, context_id, and energy nullable for simple presence tracking
-- (Some sessions may not have a specific context)
ALTER TABLE presence_sessions 
ALTER COLUMN context_type DROP NOT NULL,
ALTER COLUMN context_id DROP NOT NULL,
ALTER COLUMN energy DROP NOT NULL;

-- 4. Set default values for nullable columns
ALTER TABLE presence_sessions 
ALTER COLUMN context_type SET DEFAULT 'general',
ALTER COLUMN context_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
ALTER COLUMN energy SET DEFAULT 1.0;

-- 5. Update the check constraint to allow NULL context_type
ALTER TABLE presence_sessions 
DROP CONSTRAINT IF EXISTS presence_sessions_context_type_check;

ALTER TABLE presence_sessions 
ADD CONSTRAINT presence_sessions_context_type_check 
CHECK (context_type IS NULL OR context_type IN ('theme', 'project', 'profile', 'general'));

-- 6. Add indexes for faster queries
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

-- 7. Update existing sessions to have last_seen = updated_at
UPDATE presence_sessions 
SET last_seen = COALESCE(updated_at, created_at, NOW())
WHERE last_seen IS NULL;

-- 8. Update existing sessions to be active
UPDATE presence_sessions 
SET is_active = true 
WHERE is_active IS NULL;

-- 9. Add comments
COMMENT ON COLUMN presence_sessions.last_seen IS 'Timestamp of last heartbeat/activity from this session';
COMMENT ON COLUMN presence_sessions.is_active IS 'Whether the user session is currently active (tab visible and heartbeat running)';

-- 10. Verify the changes
DO $$
BEGIN
  -- Check if last_seen column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'presence_sessions' 
    AND column_name = 'last_seen'
  ) THEN
    RAISE NOTICE '✅ last_seen column exists';
  ELSE
    RAISE WARNING '❌ last_seen column missing';
  END IF;

  -- Check if is_active column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'presence_sessions' 
    AND column_name = 'is_active'
  ) THEN
    RAISE NOTICE '✅ is_active column exists';
  ELSE
    RAISE WARNING '❌ is_active column missing';
  END IF;

  -- Show current table structure
  RAISE NOTICE '📋 Current presence_sessions columns:';
END $$;

-- Show all columns in presence_sessions table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'presence_sessions'
ORDER BY ordinal_position;
