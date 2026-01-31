-- ================================================================
-- ROLLBACK DAILY SUGGESTIONS V2 (Optional)
-- ================================================================
-- Use this ONLY if you need to revert to V1
-- WARNING: This will remove the 'source' column
-- ================================================================

-- Option 1: Remove V2-specific columns (keep table and data)
DO $$ 
BEGIN
  -- Remove 'source' column if it exists
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'daily_suggestions' 
    AND column_name = 'source'
  ) THEN
    ALTER TABLE daily_suggestions DROP COLUMN source;
    RAISE NOTICE 'Removed source column';
  END IF;
  
  RAISE NOTICE 'Rollback to V1 complete';
END $$;

-- Option 2: Drop entire table (DESTRUCTIVE - loses all data)
-- Uncomment if you want to completely remove the table:
-- DROP TABLE IF EXISTS daily_suggestions CASCADE;
-- DROP FUNCTION IF EXISTS clean_old_daily_suggestions() CASCADE;

-- Verification
SELECT 
  'Rollback complete' AS status,
  COUNT(*) AS remaining_columns
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'daily_suggestions';
