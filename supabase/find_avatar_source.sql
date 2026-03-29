-- Find where avatar/image URLs are actually stored
-- The error shows: hvmotpzhliufzomewzfl.supabase.co/storage/v1/object/public/hacksbucket/1748609033178.jpg

-- Check all tables that might have image/avatar columns
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name ILIKE '%image%' 
    OR column_name ILIKE '%avatar%' 
    OR column_name ILIKE '%photo%'
    OR column_name ILIKE '%picture%'
  )
ORDER BY table_name, column_name;

-- If you see a likely table above, check its contents
-- For example, if there's a 'people' table with 'avatar_url':
/*
SELECT id, name, avatar_url
FROM people
WHERE avatar_url LIKE '%hvmotpzhliufzomewzfl%'
LIMIT 10;
*/
