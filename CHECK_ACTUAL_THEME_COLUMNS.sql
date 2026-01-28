-- Check what columns actually exist in theme_circles table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'theme_circles'
ORDER BY ordinal_position;

-- Also check if the table exists at all
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'theme_circles';

-- Sample one row to see actual structure
SELECT * FROM theme_circles LIMIT 1;
