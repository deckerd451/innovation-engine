-- Fix image URLs that point to wrong Supabase instance
-- Problem: URLs contain 'hvmotpzhliufzomewzfl.supabase.co' which doesn't resolve (ERR_NAME_NOT_RESOLVED)
-- Current correct instance: mqbsjlgnsirqsmfnreqd.supabase.co
-- Solution: Update URLs to point to correct instance

-- RECOMMENDED APPROACH: Update to correct Supabase instance
-- This assumes the images were migrated to the new instance with the same filenames

BEGIN;

-- Show what will be updated (run this first to preview)
SELECT 
  id,
  name,
  image_url as old_url,
  REPLACE(
    image_url,
    'hvmotpzhliufzomewzfl.supabase.co',
    'mqbsjlgnsirqsmfnreqd.supabase.co'
  ) as new_url
FROM profiles
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%'
LIMIT 10;

-- If the preview looks good, uncomment and run this:
/*
UPDATE profiles
SET image_url = REPLACE(
  image_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
*/

-- Verify the update
SELECT 
  COUNT(*) as remaining_old_urls
FROM profiles
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

COMMIT;

-- ALTERNATIVE: If images don't exist in new instance, set to NULL (uses default avatars)
-- Uncomment to use this approach instead:
/*
BEGIN;

UPDATE profiles
SET image_url = NULL
WHERE image_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';

SELECT 
  COUNT(*) as profiles_reset_to_default
FROM profiles
WHERE image_url IS NULL;

COMMIT;
*/
