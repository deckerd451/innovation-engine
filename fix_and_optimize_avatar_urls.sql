-- Fix avatar URLs AND add image optimization parameters
-- This updates the domain AND adds Supabase image transformation for optimal performance
-- Recommended avatar size: 200x200 pixels (good for profile cards and lists)

BEGIN;

-- Preview what will be updated (run this first)
SELECT 
  'community' as table_name,
  id,
  name,
  image_url as old_url,
  REPLACE(
    image_url,
    'hvmotpzhliufzomewzfl.supabase.co',
    'mqbsjlgnsirqsmfnreqd.supabase.co'
  ) || '?width=200&height=200&quality=80' as new_url_with_optimization
FROM community
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
LIMIT 5;

-- If preview looks good, uncomment and run the updates below:
/*

-- Update COMMUNITY table with domain fix + optimization
UPDATE community
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
) || '?width=200&height=200&quality=80'
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update CONNECTION_LEADERBOARD table
UPDATE connection_leaderboard
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
) || '?width=200&height=200&quality=80'
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update STREAK_LEADERBOARD table
UPDATE streak_leaderboard
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
) || '?width=200&height=200&quality=80'
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update XP_LEADERBOARD table
UPDATE xp_leaderboard
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
) || '?width=200&height=200&quality=80'
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

*/

COMMIT;

-- Verify the updates
SELECT 
  'community' as table_name,
  COUNT(*) as total_updated,
  COUNT(CASE WHEN image_url LIKE '%width=200%' THEN 1 END) as optimized_count
FROM community
WHERE image_url LIKE '%mqbsjlgnsirqsmfnreqd.supabase.co%';

-- Image transformation parameters explained:
-- ?width=200        - Resize to 200px wide
-- &height=200       - Resize to 200px tall (creates square avatars)
-- &quality=80       - 80% quality (good balance of size vs quality)
--
-- Other useful parameters you can add:
-- &resize=cover     - Crop to fill dimensions (default)
-- &resize=contain   - Fit within dimensions (may have letterboxing)
-- &format=webp      - Convert to WebP for better compression (if browser supports)
