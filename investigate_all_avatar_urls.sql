-- Investigation: Find ALL image URLs causing ERR_NAME_NOT_RESOLVED across all tables
-- The error shows URLs like: hvmotpzhliufzomewzfl.supabase.co/storage/v1/object/public/hacksbucket/...

-- 1. Check COMMUNITY table (most likely source)
SELECT 
  'community' as table_name,
  id,
  display_name as name,
  image_url,
  avatar_storage_path,
  CASE 
    WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 'OLD_INSTANCE'
    WHEN image_url LIKE '%supabase.co%' THEN 'SUPABASE_URL'
    WHEN image_url LIKE 'http%' THEN 'EXTERNAL_URL'
    ELSE 'RELATIVE_OR_OTHER'
  END as url_type
FROM community
WHERE image_url IS NOT NULL
ORDER BY url_type, id
LIMIT 50;

-- 2. Count community profiles by URL type
SELECT 
  'community' as table_name,
  CASE 
    WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 'OLD_INSTANCE'
    WHEN image_url LIKE '%supabase.co%' THEN 'SUPABASE_URL'
    WHEN image_url LIKE 'http%' THEN 'EXTERNAL_URL'
    WHEN image_url IS NULL THEN 'NULL'
    ELSE 'RELATIVE_OR_OTHER'
  END as url_type,
  COUNT(*) as count
FROM community
GROUP BY url_type
ORDER BY count DESC;

-- 3. Find the specific problematic URL from the error (1748609033178.jpg)
SELECT 
  'community' as table_name,
  id,
  display_name,
  image_url
FROM community
WHERE image_url LIKE '%1748609033178.jpg%'
LIMIT 5;

-- 4. Check PROFILES table (just in case)
SELECT 
  'profiles' as table_name,
  COUNT(*) as total_profiles,
  COUNT(image_url) as profiles_with_images,
  SUM(CASE WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 1 ELSE 0 END) as old_instance_count
FROM profiles;

-- 5. Check leaderboard tables
SELECT 
  'connection_leaderboard' as table_name,
  COUNT(*) as total,
  SUM(CASE WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 1 ELSE 0 END) as old_instance_count
FROM connection_leaderboard
UNION ALL
SELECT 
  'streak_leaderboard' as table_name,
  COUNT(*) as total,
  SUM(CASE WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 1 ELSE 0 END) as old_instance_count
FROM streak_leaderboard
UNION ALL
SELECT 
  'xp_leaderboard' as table_name,
  COUNT(*) as total,
  SUM(CASE WHEN image_url LIKE '%hvmotpzhliufzomewzfl%' THEN 1 ELSE 0 END) as old_instance_count
FROM xp_leaderboard;
