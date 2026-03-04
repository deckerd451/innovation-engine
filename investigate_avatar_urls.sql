-- Investigation: Find avatar URLs that are causing ERR_NAME_NOT_RESOLVED
-- The error shows URLs like: hvmotpzhliufzomewzfl.supabase.co/storage/v1/object/public/hacksbucket/...

-- First, let's see what columns exist in profiles table
-- Run this to see the schema:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles';

-- 1. Check what avatar URLs are currently in the profiles table
SELECT 
  id,
  full_name,
  avatar_url,
  CASE 
    WHEN avatar_url LIKE '%hvmotpzhliufzomewzfl%' THEN 'OLD_INSTANCE'
    WHEN avatar_url LIKE '%supabase.co%' THEN 'SUPABASE_URL'
    WHEN avatar_url LIKE 'http%' THEN 'EXTERNAL_URL'
    ELSE 'RELATIVE_OR_OTHER'
  END as url_type
FROM profiles
WHERE avatar_url IS NOT NULL
ORDER BY url_type, id
LIMIT 50;

-- 2. Count profiles by URL type
SELECT 
  CASE 
    WHEN avatar_url LIKE '%hvmotpzhliufzomewzfl%' THEN 'OLD_INSTANCE'
    WHEN avatar_url LIKE '%supabase.co%' THEN 'SUPABASE_URL'
    WHEN avatar_url LIKE 'http%' THEN 'EXTERNAL_URL'
    WHEN avatar_url IS NULL THEN 'NULL'
    ELSE 'RELATIVE_OR_OTHER'
  END as url_type,
  COUNT(*) as count
FROM profiles
GROUP BY url_type
ORDER BY count DESC;

-- 3. Find the specific problematic URL from the error
SELECT 
  id,
  full_name,
  avatar_url
FROM profiles
WHERE avatar_url LIKE '%1748609033178.jpg%'
LIMIT 5;

-- 4. Check if there's a pattern - are these all from a specific time period?
SELECT 
  DATE(created_at) as upload_date,
  COUNT(*) as count
FROM profiles
WHERE avatar_url LIKE '%hvmotpzhliufzomewzfl%'
GROUP BY DATE(created_at)
ORDER BY upload_date DESC
LIMIT 10;
