-- ================================================================
-- DAILY SUGGESTIONS TABLE V2 - Intelligence Layer Storage
-- ================================================================
-- Stores daily suggestions with explicit reasoning
-- Supports coordination moments and standard suggestions
-- ================================================================

-- Create daily_suggestions table
CREATE TABLE IF NOT EXISTS daily_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  suggestion_type TEXT NOT NULL, -- 'person', 'project_join', 'project_recruit', 'theme', 'org', 'coordination'
  target_id UUID, -- ID of the suggested item (can be null for coordination moments)
  score INTEGER NOT NULL DEFAULT 0,
  why JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of reason strings
  source TEXT NOT NULL DEFAULT 'heuristic', -- 'coordination', 'heuristic', 'fallback'
  data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Additional data for rendering
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure uniqueness per user per day per suggestion
  UNIQUE(user_id, date, suggestion_type, target_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_suggestions_user_date 
  ON daily_suggestions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_suggestions_date 
  ON daily_suggestions(date);

CREATE INDEX IF NOT EXISTS idx_daily_suggestions_source 
  ON daily_suggestions(source);

-- Enable Row Level Security
ALTER TABLE daily_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own suggestions
CREATE POLICY "Users can view own suggestions"
  ON daily_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = daily_suggestions.user_id
    )
  );

-- RLS Policy: Users can insert their own suggestions
CREATE POLICY "Users can insert own suggestions"
  ON daily_suggestions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = daily_suggestions.user_id
    )
  );

-- RLS Policy: Users can update their own suggestions
CREATE POLICY "Users can update own suggestions"
  ON daily_suggestions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = daily_suggestions.user_id
    )
  );

-- RLS Policy: Users can delete their own suggestions
CREATE POLICY "Users can delete own suggestions"
  ON daily_suggestions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = daily_suggestions.user_id
    )
  );

-- Function to clean old suggestions (older than 30 days)
CREATE OR REPLACE FUNCTION clean_old_daily_suggestions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM daily_suggestions
  WHERE date < CURRENT_DATE - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Schedule automatic cleanup (requires pg_cron extension)
-- Uncomment if you have pg_cron enabled:
-- SELECT cron.schedule(
--   'clean-old-suggestions',
--   '0 2 * * *', -- Run at 2 AM daily
--   'SELECT clean_old_daily_suggestions()'
-- );

-- Grant execute permission on cleanup function
GRANT EXECUTE ON FUNCTION clean_old_daily_suggestions() TO authenticated;

-- Add helpful comments
COMMENT ON TABLE daily_suggestions IS 'Stores daily personalized suggestions with explicit reasoning';
COMMENT ON COLUMN daily_suggestions.suggestion_type IS 'Type: person, project_join, project_recruit, theme, org, coordination';
COMMENT ON COLUMN daily_suggestions.source IS 'Source: coordination (intelligence layer), heuristic (scoring), fallback (minimum guarantee)';
COMMENT ON COLUMN daily_suggestions.why IS 'Array of 1-3 concrete reasons explaining the suggestion';
COMMENT ON COLUMN daily_suggestions.data IS 'Additional data for UI rendering (title, description, action, etc.)';

-- Verification query
SELECT 
  'daily_suggestions table created successfully' AS status,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename = 'daily_suggestions';
