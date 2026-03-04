-- Fix image URLs across ALL tables that point to wrong Supabase instance
-- Problem: URLs contain 'hvmotpzhliufzomewzfl.supabase.co' which doesn't resolve (ERR_NAME_NOT_RESOLVED)
-- Current correct instance: mqbsjlgnsirqsmfnreqd.supabase.co

-- STEP 1: Preview what will be updated in COMMUNITY table
SELECT 
  'community' as table_name,
  id,
  display_name,
  image_url as old_url,
  REPLACE(
    image_url,
    'hvmotpzhliufzomewzfl.supabase.co',
    'mqbsjlgnsirqsmfnreqd.supabase.co'
  ) as new_url
FROM community
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
LIMIT 10;

-- STEP 2: If preview looks good, run the actual updates
-- Uncomment the sections below to execute:

/*
BEGIN;

-- Update COMMUNITY table
UPDATE community
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update CONNECTION_LEADERBOARD table
UPDATE connection_leaderboard
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update STREAK_LEADERBOARD table
UPDATE streak_leaderboard
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update XP_LEADERBOARD table
UPDATE xp_leaderboard
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- Update PROFILES table (if any)
UPDATE profiles
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

COMMIT;
*/

-- STEP 3: Verify the updates
SELECT 
  'community' as table_name,
  COUNT(*) as remaining_old_urls
FROM community
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
UNION ALL
SELECT 
  'connection_leaderboard' as table_name,
  COUNT(*) as remaining_old_urls
FROM connection_leaderboard
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
UNION ALL
SELECT 
  'streak_leaderboard' as table_name,
  COUNT(*) as remaining_old_urls
FROM streak_leaderboard
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
UNION ALL
SELECT 
  'xp_leaderboard' as table_name,
  COUNT(*) as remaining_old_urls
FROM xp_leaderboard
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
UNION ALL
SELECT 
  'profiles' as table_name,
  COUNT(*) as remaining_old_urls
FROM profiles
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

-- ALTERNATIVE: Set to NULL if images don't exist (uses default avatars)
-- Uncomment to use this approach instead:
/*
BEGIN;

UPDATE community SET image_url = NULL WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
UPDATE connection_leaderboard SET image_url = NULL WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
UPDATE streak_leaderboard SET image_url = NULL WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
UPDATE xp_leaderboard SET image_url = NULL WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
UPDATE profiles SET image_url = NULL WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

COMMIT;
*/
