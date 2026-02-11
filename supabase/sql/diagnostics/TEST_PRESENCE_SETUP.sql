-- ============================================================================
-- TEST PRESENCE SETUP
-- ============================================================================
-- This script verifies that the presence system is correctly configured.
-- Run this in Supabase SQL Editor after running the migrations.
-- ============================================================================

-- 1. Check last_seen_at column exists
SELECT 
  '1. Column Check' as test,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'community' 
      AND column_name = 'last_seen_at'
    ) THEN '✅ last_seen_at column exists'
    ELSE '❌ last_seen_at column missing'
  END as result;

-- 2. Check indexes exist
SELECT 
  '2. Index Check' as test,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'community' 
AND indexname LIKE '%last_seen%';

-- 3. Check RLS policies
SELECT 
  '3. RLS Policy Check' as test,
  policyname,
  cmd,
  CASE 
    WHEN policyname = 'Authenticated users can view profiles and presence' THEN '✅ Presence policy exists'
    ELSE policyname
  END as status
FROM pg_policies 
WHERE tablename = 'community'
AND cmd = 'SELECT';

-- 4. Test query performance (should use index)
EXPLAIN ANALYZE
SELECT id, name, last_seen_at 
FROM community 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes'
ORDER BY last_seen_at DESC 
LIMIT 100;

-- 5. Check sample data
SELECT 
  '5. Sample Data' as test,
  COUNT(*) as total_users,
  COUNT(last_seen_at) as users_with_last_seen,
  COUNT(CASE WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN 1 END) as recently_active
FROM community;

-- 6. Show recent activity
SELECT 
  '6. Recent Activity' as test,
  id,
  name,
  last_seen_at,
  NOW() - last_seen_at as idle_time,
  CASE 
    WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN '🟢 ONLINE'
    WHEN last_seen_at > NOW() - INTERVAL '1 hour' THEN '🟡 RECENT'
    ELSE '⚪ OFFLINE'
  END as status
FROM community 
WHERE last_seen_at IS NOT NULL
ORDER BY last_seen_at DESC 
LIMIT 10;

-- 7. Verify RLS is enabled
SELECT 
  '7. RLS Status' as test,
  CASE 
    WHEN relrowsecurity THEN '✅ RLS is enabled'
    ELSE '❌ RLS is disabled'
  END as result
FROM pg_class 
WHERE relname = 'community';

-- 8. Test update permission (should work for own profile)
-- Note: This is a read-only test, uncomment to actually test
-- UPDATE community 
-- SET last_seen_at = NOW() 
-- WHERE user_id = auth.uid();

SELECT 
  '8. Update Test' as test,
  'Run the commented UPDATE query to test' as result;

-- ============================================================================
-- EXPECTED RESULTS
-- ============================================================================
-- 1. ✅ last_seen_at column exists
-- 2. Two indexes: idx_community_last_seen_at, idx_community_last_seen_at_desc
-- 3. ✅ Presence policy exists
-- 4. Query should use index scan (not seq scan)
-- 5. All users should have last_seen_at populated
-- 6. Shows recent activity with status indicators
-- 7. ✅ RLS is enabled
-- 8. Manual test for update permission
-- ============================================================================
