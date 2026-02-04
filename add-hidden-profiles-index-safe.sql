-- ================================================================
-- Hidden Profiles Index & Verification (SAFE VERSION)
-- ================================================================
-- This version only uses columns that definitely exist
-- Run check-community-schema.sql first to see your actual columns
-- ================================================================

-- ================================================================
-- SECTION 1: ADD INDEX (Performance Optimization)
-- ================================================================

-- Add partial index on is_hidden column
-- This only indexes rows where is_hidden = true, keeping the index small
CREATE INDEX IF NOT EXISTS idx_community_is_hidden 
ON community(is_hidden) 
WHERE is_hidden = true;

-- Verify index was created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'community'
  AND indexname = 'idx_community_is_hidden';

-- ================================================================
-- SECTION 2: VERIFY FILTER LOGIC
-- ================================================================

-- Test 1: Count visible profiles (what queries should return)
SELECT 
  COUNT(*) as visible_profiles,
  'Profiles that should appear in search results' as description
FROM community
WHERE is_hidden IS NULL OR is_hidden = false;

-- Test 2: Count hidden profiles (what queries should filter out)
SELECT 
  COUNT(*) as hidden_profiles,
  'Profiles that should NOT appear in search results' as description
FROM community
WHERE is_hidden = true;

-- Test 3: Breakdown by is_hidden status
SELECT 
  CASE 
    WHEN is_hidden IS NULL THEN 'NULL (legacy profiles)'
    WHEN is_hidden = true THEN 'TRUE (hidden duplicates)'
    WHEN is_hidden = false THEN 'FALSE (visible profiles)'
  END as is_hidden_status,
  COUNT(*) as count
FROM community
GROUP BY is_hidden
ORDER BY is_hidden NULLS FIRST;

-- ================================================================
-- SECTION 3: VERIFY NO DUPLICATES IN VISIBLE PROFILES
-- ================================================================

-- Test 4: Check for duplicate emails in visible profiles
SELECT 
  email,
  COUNT(*) as profile_count,
  ARRAY_AGG(id) as profile_ids
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
  AND email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Test 5: Check for duplicate user_ids in visible profiles
SELECT 
  user_id,
  COUNT(*) as profile_count,
  ARRAY_AGG(id) as profile_ids
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(*) > 1;

-- ================================================================
-- SECTION 4: BASIC PROFILE QUERIES
-- ================================================================

-- Test 6: List hidden profiles (basic info only)
SELECT 
  id,
  email,
  user_id,
  is_hidden,
  created_at,
  updated_at
FROM community
WHERE is_hidden = true
ORDER BY updated_at DESC
LIMIT 20;

-- Test 7: List orphaned profiles (user_id = NULL)
SELECT 
  id,
  email,
  user_id,
  created_at,
  updated_at
FROM community 
WHERE user_id IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- ================================================================
-- SECTION 5: MONITORING QUERIES
-- ================================================================

-- Monitor 1: Overall profile statistics
SELECT 
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as linked_profiles,
  COUNT(CASE WHEN user_id IS NULL THEN 1 END) as orphaned_profiles,
  COUNT(CASE WHEN is_hidden = true THEN 1 END) as hidden_profiles
FROM community;

-- Monitor 2: Ratio of visible to hidden profiles
SELECT 
  COUNT(CASE WHEN is_hidden IS NULL OR is_hidden = false THEN 1 END) as visible,
  COUNT(CASE WHEN is_hidden = true THEN 1 END) as hidden,
  ROUND(
    100.0 * COUNT(CASE WHEN is_hidden = true THEN 1 END) / 
    NULLIF(COUNT(*), 0), 
    2
  ) as hidden_percentage
FROM community;

-- Monitor 3: Recent profile updates (last 24 hours)
SELECT 
  id,
  email,
  user_id,
  is_hidden,
  updated_at
FROM community
WHERE updated_at >= NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC;

-- ================================================================
-- SECTION 6: CLEANUP (USE WITH CAUTION!)
-- ================================================================

-- Cleanup 1: Delete hidden profiles older than 30 days
-- UNCOMMENT TO RUN (after reviewing results):
-- DELETE FROM community
-- WHERE is_hidden = true
--   AND updated_at < NOW() - INTERVAL '30 days';

-- Cleanup 2: Set is_hidden = false for NULL values (normalize data)
-- UNCOMMENT TO RUN:
-- UPDATE community
-- SET is_hidden = false
-- WHERE is_hidden IS NULL;

-- ================================================================
-- SUMMARY
-- ================================================================

-- Run these queries in order to verify:
-- 1. Index is created (Section 1)
-- 2. Filter logic works correctly (Section 2)
-- 3. No duplicates in visible profiles (Section 3)
-- 4. Hidden profiles are properly marked (Section 4)
-- 5. Monitoring is in place (Section 5)

-- Expected Results:
-- ✅ Index created successfully
-- ✅ Visible profiles > 0
-- ✅ Hidden profiles >= 0 (may be 0 if no duplicates yet)
-- ✅ No duplicate emails in visible profiles
-- ✅ No duplicate user_ids in visible profiles
