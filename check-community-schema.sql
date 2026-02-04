-- Check actual community table schema
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'community'
  AND table_schema = 'public'
ORDER BY ordinal_position;
