-- ================================================================
-- Fix Dave Ingram Profile Linking Issue
-- ================================================================
-- This script diagnoses and fixes the issue where Dave sees Doug's
-- network and has a duplicate profile.
--
-- Run these queries in Supabase SQL Editor
-- ================================================================

-- STEP 1: Find Dave's profiles
-- Look for all profiles with Dave's email
SELECT 
  id,
  user_id,
  email,
  name,
  onboarding_completed,
  profile_completed,
  is_hidden,
  created_at,
  updated_at,
  CASE 
    WHEN user_id IS NULL THEN 'MIGRATED (not linked)'
    ELSE 'OAUTH LINKED'
  END as profile_type
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
   OR LOWER(name) LIKE '%dave%ingram%'
ORDER BY created_at;

-- STEP 2: Find Doug's profile (to check if there's confusion)
SELECT 
  id,
  user_id,
  email,
  name,
  created_at
FROM community 
WHERE LOWER(name) LIKE '%doug%hamilton%'
   OR LOWER(email) LIKE '%doug%hamilton%'
ORDER BY created_at;

-- STEP 3: Check for duplicate profiles with same email
-- This will show if Dave has multiple profiles
SELECT 
  email,
  COUNT(*) as profile_count,
  ARRAY_AGG(id ORDER BY created_at) as profile_ids,
  ARRAY_AGG(user_id) as user_ids,
  ARRAY_AGG(name) as names,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM community
WHERE LOWER(email) LIKE '%dave%ingram%'
GROUP BY email;

-- STEP 4: Check connections for Dave's profiles
-- This will show which profile has the actual network data
SELECT 
  c.id as connection_id,
  c.from_user_id,
  c.to_user_id,
  c.status,
  from_user.name as from_name,
  to_user.name as to_name,
  c.created_at
FROM connections c
LEFT JOIN community from_user ON c.from_user_id = from_user.id
LEFT JOIN community to_user ON c.to_user_id = to_user.id
WHERE c.from_user_id IN (
    SELECT id FROM community WHERE LOWER(email) LIKE '%dave%ingram%'
  )
  OR c.to_user_id IN (
    SELECT id FROM community WHERE LOWER(email) LIKE '%dave%ingram%'
  )
ORDER BY c.created_at DESC
LIMIT 20;

-- ================================================================
-- MANUAL FIX INSTRUCTIONS
-- ================================================================
-- After running the diagnostic queries above:
--
-- 1. Identify Dave's ORIGINAL profile (oldest created_at, has connections)
--    Let's call this PROFILE_A_ID
--
-- 2. Identify Dave's DUPLICATE profile (newest, user_id set, no connections)
--    Let's call this PROFILE_B_ID
--
-- 3. Get Dave's OAuth user_id from the duplicate profile
--    Let's call this AUTH_USER_ID
--
-- 4. Run the fix below (UNCOMMENT and replace IDs):
-- ================================================================

-- FIX STEP 1: Link Dave's original profile to his OAuth account
-- UNCOMMENT AND REPLACE <PROFILE_A_ID> and <AUTH_USER_ID>:
/*
UPDATE community 
SET 
  user_id = '<AUTH_USER_ID>',
  updated_at = NOW()
WHERE id = '<PROFILE_A_ID>'
  AND user_id IS NULL;
*/

-- FIX STEP 2: Hide the duplicate profile
-- UNCOMMENT AND REPLACE <PROFILE_B_ID>:
/*
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = '<PROFILE_B_ID>';
*/

-- FIX STEP 3: Verify the fix
-- UNCOMMENT AND REPLACE <AUTH_USER_ID>:
/*
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  onboarding_completed,
  profile_completed
FROM community 
WHERE user_id = '<AUTH_USER_ID>'
  AND is_hidden = false;
*/

-- ================================================================
-- ALTERNATIVE: If Dave's original profile is missing
-- ================================================================
-- If Dave's original profile doesn't exist or has no data,
-- you may need to manually update the new profile with his info:
/*
UPDATE community 
SET 
  name = 'Dave Ingram',
  -- Add other fields as needed
  updated_at = NOW()
WHERE id = '<PROFILE_B_ID>';
*/

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Check that Dave now has only ONE visible profile
SELECT 
  COUNT(*) as visible_profiles,
  'Should be 1' as expected
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
  AND (is_hidden IS NULL OR is_hidden = false);

-- Check that Dave's profile is properly linked
SELECT 
  id,
  user_id,
  email,
  name,
  onboarding_completed,
  profile_completed,
  is_hidden
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
  AND (is_hidden IS NULL OR is_hidden = false);

-- ================================================================
-- NOTES
-- ================================================================
-- After running the fix:
-- 1. Dave should sign out and sign in again
-- 2. The auth system will now find his original profile by user_id
-- 3. He should see his own network, not Doug's
-- 4. His profile should be editable
-- 5. The duplicate profile is hidden but not deleted (for safety)
--
-- If issues persist, check:
-- - Browser cache (clear it)
-- - localStorage (clear auth tokens)
-- - Check browser console for [PROFILE-LINK] logs
-- ================================================================
