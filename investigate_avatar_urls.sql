-- Investigation: Find image URLs that are causing ERR_NAME_NOT_RESOLVED
-- The error shows URLs like: hvmotpzhliufzomewzfl.supabase.co/storage/v1/object/public/hacksbucket/...

-- 1. Check what image URLs are currently in the profiles table
SELECT 
  id,
  name,
  image_url,
  CASE 
    WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 'OLD_INSTANCE'
    WHEN image_url LIKE '%supabase.co%' THEN 'SUPABASE_URL'
    WHEN image_url LIKE 'http%' THEN 'EXTERNAL_URL'
    ELSE 'RELATIVE_OR_OTHER'
  END as url_type
FROM profiles
WHERE image_url IS NOT NULL
ORDER BY url_type, id
LIMIT 50;

-- 2. Count profiles by URL type
SELECT 
  CASE 
    WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 'OLD_INSTANCE'
    WHEN image_url LIKE '%supabase.co%' THEN 'SUPABASE_URL'
    WHEN image_url LIKE 'http%' THEN 'EXTERNAL_URL'
    WHEN image_url IS NULL THEN 'NULL'
    ELSE 'RELATIVE_OR_OTHER'
  END as url_type,
  COUNT(*) as count
FROM profiles
GROUP BY url_type
ORDER BY count DESC;

-- 3. Find the specific problematic URL from the error
SELECT 
  id,
  name,
  image_url
FROM profiles
WHERE image_url LIKE '%1748609033178.jpg%'
LIMIT 5;

-- 4. Check if there's a pattern - are these all from a specific time period?
SELECT 
  DATE(updated_at) as upload_date,
  COUNT(*) as count
FROM profiles
WHERE image_url LIKE '%hvmotpzhliufzomewzfl%'
GROUP BY DATE(updated_at)
ORDER BY upload_date DESC
LIMIT 10;
