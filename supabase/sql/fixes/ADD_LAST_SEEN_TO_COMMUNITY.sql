-- ============================================================================
-- ADD LAST_SEEN_AT TO COMMUNITY TABLE
-- ============================================================================
-- This migration adds the last_seen_at column to the community table for
-- low-frequency presence persistence.
--
-- Design:
-- - last_seen_at is updated ONLY on page hide/unload and every 30-60 minutes
-- - NOT updated on every heartbeat (reduces database writes by 90%+)
-- - Used as fallback when Realtime Presence is unavailable
-- - Indexed for fast queries
--
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add last_seen_at column if it doesn't exist
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for fast queries on last_seen_at
CREATE INDEX IF NOT EXISTS idx_community_last_seen_at 
ON community(last_seen_at);

-- Add index for active users queries (descending order for recent first)
-- Note: Cannot use NOW() in partial index (not immutable)
-- Instead, create a regular index that covers recent queries efficiently
CREATE INDEX IF NOT EXISTS idx_community_last_seen_at_desc 
ON community(last_seen_at DESC);

-- Update existing rows to have last_seen_at = updated_at or created_at
UPDATE community 
SET last_seen_at = COALESCE(updated_at, created_at, NOW())
WHERE last_seen_at IS NULL;

-- Add comment
COMMENT ON COLUMN community.last_seen_at IS 'Low-frequency presence persistence. Updated on page hide/unload and every 30-60 minutes (NOT on every heartbeat).';

-- Verify the changes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'community' 
    AND column_name = 'last_seen_at'
  ) THEN
    RAISE NOTICE '✅ last_seen_at column exists';
  ELSE
    RAISE WARNING '❌ last_seen_at column missing';
  END IF;
END $$;

-- Show current table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'community'
AND column_name = 'last_seen_at';
