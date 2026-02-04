-- ================================================================
-- Hidden Profiles Index & Verification
-- ================================================================
-- Run this in Supabase SQL Editor to optimize hidden profile queries
-- and verify the filter is working correctly.
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
-- This should return 0 rows if profile linking worked correctly
SELECT 
  email,
  COUNT(*) as profile_count,
  ARRAY_AGG(id) as profile_ids,
  ARRAY_AGG(user_id) as user_ids
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
  AND email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Test 5: Check for duplicate user_ids in visible profiles
-- This should return 0 rows (UNIQUE constraint should prevent this)
SELECT 
  user_id,
  COUNT(*) as profile_count,
  ARRAY_AGG(id) as profile_ids,
  ARRAY_AGG(email) as emails
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(*) > 1;

-- ================================================================
-- SECTION 4: SAMPLE QUERIES (Simulate Application Queries)
-- ================================================================

-- Test 6: Simulate search by name (should only return visible profiles)
-- Replace 'John' with an actual name in your database
-- SELECT id, name, email, is_hidden
-- FROM community
-- WHERE name ILIKE '%John%'
--   AND (is_hidden IS NULL OR is_hidden = false)
-- LIMIT 10;

-- Test 7: Simulate get all community (should only return visible profiles)
SELECT 
  COUNT(*) as total_returned,
  'Profiles returned by getCommunity() query' as description
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
LIMIT 1000;

-- Test 8: Simulate suggestions query (exclude current user + hidden profiles)
-- Replace '<current_user_id>' with an actual profile ID
-- SELECT id, name, email, is_hidden
-- FROM community
-- WHERE id != '<current_user_id>'
--   AND (is_hidden IS NULL OR is_hidden = false)
-- LIMIT 10;

-- ================================================================
-- SECTION 5: VERIFY HIDDEN PROFILES ARE PROPERLY MARKED
-- ================================================================

-- Test 9: List hidden profiles with details
SELECT 
  id,
  email,
  user_id,
  name,
  is_hidden,
  profile_completed,
  onboarding_completed,
  created_at,
  updated_at
FROM community
WHERE is_hidden = true
ORDER BY updated_at DESC
LIMIT 20;

-- Test 10: Check if hidden profiles have user_id set
-- Hidden profiles should generally have user_id = NULL (non-canonical duplicates)
SELECT 
  CASE 
    WHEN user_id IS NULL THEN 'NULL (expected for duplicates)'
    WHEN user_id IS NOT NULL THEN 'NOT NULL (unexpected - may need review)'
  END as user_id_status,
  COUNT(*) as count
FROM community
WHERE is_hidden = true
GROUP BY (user_id IS NULL);

-- ================================================================
-- SECTION 6: PERFORMANCE ANALYSIS
-- ================================================================

-- Test 11: Explain query plan for filtered search
-- This shows how PostgreSQL uses the index
EXPLAIN ANALYZE
SELECT id, name, email
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
LIMIT 100;

-- Test 12: Compare query performance with and without filter
-- Without filter (slower, returns hidden profiles)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM community;

-- With filter (should be similar speed, returns only visible)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM community
WHERE (is_hidden IS NULL OR is_hidden = false);

-- ================================================================
-- SECTION 7: DATA QUALITY CHECKS
-- ================================================================

-- Test 13: Check for profiles with is_hidden = NULL (legacy profiles)
SELECT 
  COUNT(*) as null_is_hidden_count,
  'Legacy profiles without is_hidden set' as description
FROM community
WHERE is_hidden IS NULL;

-- Test 14: Verify all hidden profiles have a reason (duplicate email)
-- This checks if hidden profiles are actually duplicates
SELECT 
  h.id as hidden_profile_id,
  h.email,
  h.user_id as hidden_user_id,
  v.id as visible_profile_id,
  v.user_id as visible_user_id,
  'Duplicate email pair' as reason
FROM community h
JOIN community v ON LOWER(h.email) = LOWER(v.email)
WHERE h.is_hidden = true
  AND (v.is_hidden IS NULL OR v.is_hidden = false)
  AND h.id != v.id
ORDER BY h.email;

-- ================================================================
-- SECTION 8: CLEANUP RECOMMENDATIONS
-- ================================================================

-- Test 15: Find hidden profiles older than 30 days (safe to delete)
SELECT 
  COUNT(*) as old_hidden_profiles,
  'Hidden profiles older than 30 days (safe to delete)' as description
FROM community
WHERE is_hidden = true
  AND updated_at < NOW() - INTERVAL '30 days';

-- Test 16: List old hidden profiles for review before deletion
SELECT 
  id,
  email,
  user_id,
  name,
  updated_at,
  NOW() - updated_at as age
FROM community
WHERE is_hidden = true
  AND updated_at < NOW() - INTERVAL '30 days'
ORDER BY updated_at ASC
LIMIT 20;

-- ================================================================
-- SECTION 9: OPTIONAL CLEANUP (USE WITH CAUTION!)
-- ================================================================

-- Cleanup 1: Delete hidden profiles older than 30 days
-- UNCOMMENT TO RUN (after reviewing Test 16 results):
-- DELETE FROM community
-- WHERE is_hidden = true
--   AND updated_at < NOW() - INTERVAL '30 days';

-- Cleanup 2: Set is_hidden = false for NULL values (normalize data)
-- This makes all legacy profiles explicitly visible
-- UNCOMMENT TO RUN:
-- UPDATE community
-- SET is_hidden = false
-- WHERE is_hidden IS NULL;

-- ================================================================
-- SECTION 10: MONITORING QUERIES
-- ================================================================

-- Monitor 1: Daily hidden profile creation
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as hidden_profiles_created
FROM community
WHERE is_hidden = true
  AND updated_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(updated_at)
ORDER BY date DESC;

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

-- ================================================================
-- SUMMARY
-- ================================================================

-- Run all tests in order to verify:
-- 1. Index is created (Section 1)
-- 2. Filter logic works correctly (Section 2)
-- 3. No duplicates in visible profiles (Section 3)
-- 4. Application queries return correct results (Section 4)
-- 5. Hidden profiles are properly marked (Section 5)
-- 6. Query performance is acceptable (Section 6)
-- 7. Data quality is good (Section 7)
-- 8. Cleanup is possible if needed (Section 8)
-- 9. Monitoring is in place (Section 10)

-- Expected Results:
-- ✅ Index created successfully
-- ✅ Visible profiles > 0
-- ✅ Hidden profiles >= 0 (may be 0 if no duplicates yet)
-- ✅ No duplicate emails in visible profiles
-- ✅ No duplicate user_ids in visible profiles
-- ✅ Query performance is acceptable
-- ✅ All hidden profiles have duplicate email pairs

-- If any test fails, review the results and investigate before deploying.
