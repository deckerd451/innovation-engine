-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ================================================================
-- SIMPLE FIX FOR DAVE - NO USERNAME COLUMN
-- ================================================================
-- Run these queries one at a time in Supabase SQL Editor
-- ================================================================

-- STEP 1: Find Dave's profiles
SELECT 
  id,
  user_id,
  email,
  name,
  created_at,
  CASE 
    WHEN user_id IS NULL THEN '🔴 MIGRATED (not linked)'
    ELSE '🟢 OAUTH LINKED'
  END as status
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
   OR LOWER(name) LIKE '%dave%ingram%'
ORDER BY created_at;

-- ================================================================
-- AFTER RUNNING STEP 1:
-- You should see 2 rows. Copy these values:
-- - ORIGINAL_PROFILE_ID = ID from older row (status = MIGRATED)
-- - DUPLICATE_PROFILE_ID = ID from newer row (status = OAUTH LINKED)
-- - OAUTH_USER_ID = user_id from newer row
-- ================================================================

-- STEP 2: Check which profile has connections
-- Replace 'ORIGINAL_PROFILE_ID' with actual ID from Step 1
/*
SELECT 
  COUNT(*) as connection_count,
  'Connections for ORIGINAL profile' as description
FROM connections 
WHERE from_user_id = 'ORIGINAL_PROFILE_ID'
   OR to_user_id = 'ORIGINAL_PROFILE_ID';
*/

-- Replace 'DUPLICATE_PROFILE_ID' with actual ID from Step 1
/*
SELECT 
  COUNT(*) as connection_count,
  'Connections for DUPLICATE profile' as description
FROM connections 
WHERE from_user_id = 'DUPLICATE_PROFILE_ID'
   OR to_user_id = 'DUPLICATE_PROFILE_ID';
*/

-- ================================================================
-- STEP 3: APPLY THE FIX
-- Replace ALL THREE placeholders with actual values from Step 1
-- ================================================================

-- Link Dave's original profile to his OAuth account
/*
UPDATE community 
SET 
  user_id = 'OAUTH_USER_ID',
  updated_at = NOW()
WHERE id = 'ORIGINAL_PROFILE_ID'
  AND user_id IS NULL;
*/

-- Hide the duplicate profile
/*
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = 'DUPLICATE_PROFILE_ID';
*/

-- ================================================================
-- STEP 4: VERIFY THE FIX
-- Replace 'OAUTH_USER_ID' with actual value
-- ================================================================

-- Should return 1 row (Dave's original profile, now linked)
/*
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  'This should be Dave ORIGINAL profile' as note
FROM community 
WHERE user_id = 'OAUTH_USER_ID'
  AND (is_hidden IS NULL OR is_hidden = false);
*/

-- Should return 1 row (the duplicate, now hidden)
/*
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  'This should be the DUPLICATE profile' as note
FROM community 
WHERE id = 'DUPLICATE_PROFILE_ID'
  AND is_hidden = true;
*/

-- ================================================================
-- DONE! Have Dave:
-- 1. Sign out
-- 2. Clear browser cache (Cmd+Shift+Delete)
-- 3. Sign in again with OAuth
-- 4. He should now see his own network!
-- ================================================================
