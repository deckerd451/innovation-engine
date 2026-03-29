-- Check the actual schema of the community table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'community' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
