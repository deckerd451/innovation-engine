-- ================================================================
-- UPGRADE DAILY SUGGESTIONS TO V2 - Safe Migration
-- ================================================================
-- Handles both scenarios:
-- 1. Table doesn't exist → Create new V2 table
-- 2. Table exists (V1) → Add missing V2 columns
-- ================================================================

-- Check if table exists and add missing columns if needed
DO $$ 
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'daily_suggestions'
  ) THEN
    -- Table exists, add missing columns if they don't exist
    
    -- Add 'source' column if missing
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'daily_suggestions' 
      AND column_name = 'source'
    ) THEN
      ALTER TABLE daily_suggestions 
      ADD COLUMN source TEXT NOT NULL DEFAULT 'heuristic';
      
      RAISE NOTICE 'Added source column to daily_suggestions';
    END IF;
    
    -- Ensure 'why' column is JSONB (might be TEXT in V1)
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'daily_suggestions' 
      AND column_name = 'why'
      AND data_type != 'jsonb'
    ) THEN
      -- Convert TEXT to JSONB if needed
      ALTER TABLE daily_suggestions 
      ALTER COLUMN why TYPE JSONB USING why::jsonb;
      
      RAISE NOTICE 'Converted why column to JSONB';
    END IF;
    
    -- Ensure 'data' column exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'daily_suggestions' 
      AND column_name = 'data'
    ) THEN
      ALTER TABLE daily_suggestions 
      ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
      
      RAISE NOTICE 'Added data column to daily_suggestions';
    END IF;
    
    RAISE NOTICE 'Successfully upgraded daily_suggestions table to V2';
    
  ELSE
    -- Table doesn't exist, create new V2 table
    CREATE TABLE daily_suggestions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      suggestion_type TEXT NOT NULL,
      target_id UUID,
      score INTEGER NOT NULL DEFAULT 0,
      why JSONB NOT NULL DEFAULT '[]'::jsonb,
      source TEXT NOT NULL DEFAULT 'heuristic',
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      
      UNIQUE(user_id, date, suggestion_type, target_id)
    );
    
    -- Create indexes
    CREATE INDEX idx_daily_suggestions_user_date 
      ON daily_suggestions(user_id, date);
    
    CREATE INDEX idx_daily_suggestions_date 
      ON daily_suggestions(date);
    
    CREATE INDEX idx_daily_suggestions_source 
      ON daily_suggestions(source);
    
    -- Enable RLS
    ALTER TABLE daily_suggestions ENABLE ROW LEVEL SECURITY;
    
    -- RLS Policies
    CREATE POLICY "Users can view own suggestions"
      ON daily_suggestions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM community
          WHERE community.user_id = auth.uid()
          AND community.id = daily_suggestions.user_id
        )
      );
    
    CREATE POLICY "Users can insert own suggestions"
      ON daily_suggestions FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM community
          WHERE community.user_id = auth.uid()
          AND community.id = daily_suggestions.user_id
        )
      );
    
    CREATE POLICY "Users can update own suggestions"
      ON daily_suggestions FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM community
          WHERE community.user_id = auth.uid()
          AND community.id = daily_suggestions.user_id
        )
      );
    
    CREATE POLICY "Users can delete own suggestions"
      ON daily_suggestions FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM community
          WHERE community.user_id = auth.uid()
          AND community.id = daily_suggestions.user_id
        )
      );
    
    RAISE NOTICE 'Created new daily_suggestions V2 table';
  END IF;
END $$;

-- Create or replace cleanup function
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION clean_old_daily_suggestions() TO authenticated;

-- Add helpful comments
COMMENT ON TABLE daily_suggestions IS 'V2: Stores daily personalized suggestions with explicit reasoning and coordination detection';
COMMENT ON COLUMN daily_suggestions.suggestion_type IS 'Type: person, project_join, project_recruit, theme, org, coordination';
COMMENT ON COLUMN daily_suggestions.source IS 'Source: coordination (intelligence layer), heuristic (scoring), fallback (minimum guarantee)';
COMMENT ON COLUMN daily_suggestions.why IS 'Array of 1-3 concrete reasons explaining the suggestion';
COMMENT ON COLUMN daily_suggestions.data IS 'Additional data for UI rendering (title, description, action, etc.)';

-- Verification
SELECT 
  'daily_suggestions V2 migration complete' AS status,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'daily_suggestions';

-- Show table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'daily_suggestions'
ORDER BY ordinal_position;
