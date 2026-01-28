-- ============================================================================
-- DISCOVER ACTUAL COLUMNS IN SUMMARY VIEWS
-- Run this to see what columns actually exist
-- ============================================================================

-- Check active_themes_summary columns
SELECT 
  'active_themes_summary' as view_name,
  column_name, 
  data_type,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'active_themes_summary'
ORDER BY ordinal_position;

-- Check active_organizations_summary columns
SELECT 
  'active_organizations_summary' as view_name,
  column_name, 
  data_type,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'active_organizations_summary'
ORDER BY ordinal_position;

-- Sample data from active_themes_summary (to see actual structure)
SELECT * FROM active_themes_summary LIMIT 1;

-- Sample data from active_organizations_summary (to see actual structure)
SELECT * FROM active_organizations_summary LIMIT 1;

-- If the above queries work, run this to see all available data:
-- SELECT * FROM active_themes_summary WHERE is_active = true LIMIT 5;
-- SELECT * FROM active_organizations_summary WHERE is_active = true LIMIT 5;
