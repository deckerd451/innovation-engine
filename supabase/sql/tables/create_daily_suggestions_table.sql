-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ================================================================
-- DAILY SUGGESTIONS TABLE
-- ================================================================
-- Optional table for storing daily suggestions in Supabase
-- If this table doesn't exist, the system will fallback to localStorage
-- 
-- To use this table:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. The system will automatically detect and use it
-- 
-- If you don't want to use Supabase storage:
-- - Don't run this migration
-- - The system will use localStorage automatically
-- ================================================================

-- Create table
CREATE TABLE IF NOT EXISTS daily_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('person', 'project', 'theme', 'org')),
  target_id UUID NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  why JSONB NOT NULL DEFAULT '[]'::jsonb,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one suggestion per user/date/type/target
  CONSTRAINT daily_suggestions_unique UNIQUE (user_id, date, suggestion_type, target_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_suggestions_user_date 
  ON daily_suggestions(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_suggestions_user_created 
  ON daily_suggestions(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE daily_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read/write their own suggestions
CREATE POLICY "Users can manage their own suggestions"
  ON daily_suggestions
  FOR ALL
  USING (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_suggestions TO authenticated;

-- Add helpful comment
COMMENT ON TABLE daily_suggestions IS 'Stores daily personalized suggestions for users. Falls back to localStorage if table does not exist.';

-- ================================================================
-- CLEANUP FUNCTION (Optional)
-- ================================================================
-- Automatically clean suggestions older than 30 days
-- Run this manually or set up a cron job

CREATE OR REPLACE FUNCTION cleanup_old_suggestions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM daily_suggestions
  WHERE date < CURRENT_DATE - INTERVAL '30 days';
END;
$$;

-- To manually clean old suggestions, run:
-- SELECT cleanup_old_suggestions();

-- ================================================================
-- VERIFICATION
-- ================================================================
-- After running this migration, verify with:
-- SELECT * FROM daily_suggestions LIMIT 1;
-- 
-- If you see the table structure, you're good to go!
-- The Daily Suggestions Engine will automatically use this table.
-- ================================================================
