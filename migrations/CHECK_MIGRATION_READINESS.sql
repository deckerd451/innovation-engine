-- ================================================================
-- CHECK MIGRATION READINESS
-- ================================================================
-- Run this script to verify your migrated data is ready for OAuth linking
-- ================================================================

-- 1. Overall Statistics
SELECT 
  '=== OVERALL STATISTICS ===' as section,
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN user_id IS NULL THEN 1 END) as unlinked_profiles,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as linked_profiles,
  COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as profiles_with_email,
  COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END) as profiles_missing_email
FROM community;

-- 2. Profiles Ready for Linking (GOOD)
SELECT 
  '=== READY FOR LINKING ===' as section,
  COUNT(*) as count,
  'Profiles with email and no user_id - will auto-link on OAuth login' as description
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email != '';

-- 3. Profiles Missing Email (NEEDS ATTENTION)
SELECT 
  '=== MISSING EMAIL - NEEDS MANUAL FIX ===' as section,
  id,
  name,
  created_at,
  'Add email manually or user will need to create new profile' as action_needed
FROM community
WHERE user_id IS NULL
  AND (email IS NULL OR email = '');

-- 4. Duplicate Emails (POTENTIAL ISSUE)
SELECT 
  '=== DUPLICATE EMAILS - REVIEW NEEDED ===' as section,
  email,
  COUNT(*) as profile_count,
  array_agg(id) as profile_ids,
  array_agg(name) as profile_names,
  'Only first profile will be linked - consider merging duplicates' as action_needed
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 5. Already Linked Profiles (GOOD)
SELECT 
  '=== ALREADY LINKED ===' as section,
  COUNT(*) as count,
  'Profiles already linked to OAuth accounts' as description
FROM community
WHERE user_id IS NOT NULL;

-- 6. Sample of Unlinked Profiles (for verification)
SELECT 
  '=== SAMPLE UNLINKED PROFILES ===' as section,
  id,
  name,
  email,
  created_at,
  'Sample of profiles waiting to be linked' as note
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- 7. Email Domain Distribution (useful for communication planning)
SELECT 
  '=== EMAIL DOMAINS ===' as section,
  SPLIT_PART(email, '@', 2) as domain,
  COUNT(*) as count
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
GROUP BY SPLIT_PART(email, '@', 2)
ORDER BY COUNT(*) DESC
LIMIT 10;

-- 8. Readiness Score
SELECT 
  '=== READINESS SCORE ===' as section,
  ROUND(
    (COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END)::NUMERIC / 
     NULLIF(COUNT(CASE WHEN user_id IS NULL THEN 1 END), 0)) * 100,
    2
  ) as readiness_percentage,
  'Percentage of unlinked profiles that have email addresses' as description
FROM community;

-- 9. Action Items Summary
SELECT 
  '=== ACTION ITEMS ===' as section,
  CASE 
    WHEN COUNT(CASE WHEN user_id IS NULL AND (email IS NULL OR email = '') THEN 1 END) > 0 
    THEN '⚠️ Fix ' || COUNT(CASE WHEN user_id IS NULL AND (email IS NULL OR email = '') THEN 1 END)::TEXT || ' profiles missing email'
    ELSE '✅ All profiles have email addresses'
  END as action_1,
  CASE 
    WHEN COUNT(CASE WHEN user_id IS NULL THEN 1 END) > 0 
    THEN '📧 Notify ' || COUNT(CASE WHEN user_id IS NULL THEN 1 END)::TEXT || ' users about OAuth migration'
    ELSE '✅ All profiles already linked'
  END as action_2,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM community 
      WHERE user_id IS NULL AND email IS NOT NULL 
      GROUP BY email HAVING COUNT(*) > 1
    )
    THEN '⚠️ Review and merge duplicate email profiles'
    ELSE '✅ No duplicate emails found'
  END as action_3
FROM community;
