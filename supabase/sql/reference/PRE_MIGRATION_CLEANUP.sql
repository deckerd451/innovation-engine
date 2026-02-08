-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- PRE-MIGRATION CLEANUP SCRIPT
-- ================================================================
-- Run this BEFORE enabling OAuth for all migrated users
-- This will identify and fix issues that could cause problems
-- like Dave's duplicate profile issue.
-- ================================================================

-- ================================================================
-- SECTION 1: IDENTIFY ISSUES
-- ================================================================

-- 1.1: Find duplicate emails (will cause issues)
SELECT 
  email,
  COUNT(*) as profile_count,
  ARRAY_AGG(id ORDER BY created_at) as profile_ids,
  ARRAY_AGG(name ORDER BY created_at) as names,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates,
  '⚠️ DUPLICATE EMAIL - Will cause linking issues' as issue
FROM community
WHERE user_id IS NULL  -- Only migrated profiles
  AND email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 1.2: Find profiles with missing emails (will fail to link)
SELECT 
  id,
  name,
  email,
  created_at,
  '❌ MISSING EMAIL - Cannot link automatically' as issue
FROM community
WHERE user_id IS NULL
  AND (email IS NULL OR email = '' OR TRIM(email) = '')
ORDER BY created_at;

-- 1.3: Find profiles with invalid emails (will fail to link)
SELECT 
  id,
  name,
  email,
  created_at,
  '❌ INVALID EMAIL - Cannot link automatically' as issue
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email NOT LIKE '%@%.%'
ORDER BY created_at;

-- 1.4: Find profiles with whitespace in emails (will cause mismatch)
SELECT 
  id,
  name,
  email,
  LENGTH(email) as email_length,
  LENGTH(TRIM(email)) as trimmed_length,
  '⚠️ EMAIL HAS WHITESPACE - May cause mismatch' as issue
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND (email != TRIM(email) OR email LIKE '% %')
ORDER BY created_at;

-- 1.5: Find profiles with uppercase emails (may cause mismatch)
SELECT 
  id,
  name,
  email,
  LOWER(email) as normalized_email,
  '⚠️ EMAIL HAS UPPERCASE - May cause mismatch' as issue
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email != LOWER(email)
ORDER BY created_at;

-- 1.6: Summary of issues
SELECT 
  'Total migrated profiles' as metric,
  COUNT(*) as count
FROM community
WHERE user_id IS NULL

UNION ALL

SELECT 
  'Profiles with duplicate emails' as metric,
  COUNT(DISTINCT email) as count
FROM (
  SELECT email
  FROM community
  WHERE user_id IS NULL AND email IS NOT NULL
  GROUP BY email
  HAVING COUNT(*) > 1
) sub

UNION ALL

SELECT 
  'Profiles with missing emails' as metric,
  COUNT(*) as count
FROM community
WHERE user_id IS NULL
  AND (email IS NULL OR email = '' OR TRIM(email) = '')

UNION ALL

SELECT 
  'Profiles with invalid emails' as metric,
  COUNT(*) as count
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email NOT LIKE '%@%.%'

UNION ALL

SELECT 
  'Profiles ready for migration' as metric,
  COUNT(*) as count
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email LIKE '%@%.%'
  AND email = TRIM(LOWER(email));

-- ================================================================
-- SECTION 2: AUTOMATIC FIXES
-- ================================================================

-- 2.1: Normalize emails (trim whitespace and lowercase)
-- UNCOMMENT TO RUN:
/*
UPDATE community
SET 
  email = TRIM(LOWER(email)),
  updated_at = NOW()
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email != TRIM(LOWER(email));
*/

-- Verify normalization:
-- SELECT COUNT(*) as normalized_count FROM community WHERE user_id IS NULL AND email = TRIM(LOWER(email));

-- 2.2: Add is_hidden column if missing
-- UNCOMMENT TO RUN:
/*
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
*/

-- 2.3: Create index on email for faster lookups
-- UNCOMMENT TO RUN:
/*
CREATE INDEX IF NOT EXISTS idx_community_email_lower 
ON community(LOWER(email))
WHERE user_id IS NULL;
*/

-- ================================================================
-- SECTION 3: MANUAL FIXES REQUIRED
-- ================================================================

-- 3.1: Merge duplicate profiles
-- For each duplicate email, you need to:
-- 1. Identify the canonical profile (oldest, most complete, has connections)
-- 2. Merge data from other profiles into canonical
-- 3. Hide or delete non-canonical profiles

-- Example workflow for duplicate email:
/*
-- Step 1: Find all profiles for an email
SELECT 
  id,
  name,
  created_at,
  (SELECT COUNT(*) FROM connections WHERE from_user_id = community.id OR to_user_id = community.id) as connection_count,
  (SELECT COUNT(*) FROM projects WHERE creator_id = community.id) as project_count
FROM community
WHERE LOWER(email) = 'duplicate@example.com'
ORDER BY created_at;

-- Step 2: Choose canonical profile (usually oldest with most connections)
-- Let's say canonical_id = 'profile-1'

-- Step 3: Hide non-canonical profiles
UPDATE community
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE LOWER(email) = 'duplicate@example.com'
  AND id != 'profile-1';

-- Step 4: Verify only one visible profile remains
SELECT * FROM community 
WHERE LOWER(email) = 'duplicate@example.com'
  AND (is_hidden IS NULL OR is_hidden = false);
*/

-- 3.2: Fix missing emails
-- You need to manually add emails for these profiles
-- Check your old system records or contact users

-- Example:
/*
UPDATE community
SET 
  email = 'user@example.com',
  updated_at = NOW()
WHERE id = 'profile-with-missing-email';
*/

-- 3.3: Fix invalid emails
-- Correct the email format

-- Example:
/*
UPDATE community
SET 
  email = 'corrected@example.com',
  updated_at = NOW()
WHERE id = 'profile-with-invalid-email';
*/

-- ================================================================
-- SECTION 4: VERIFICATION
-- ================================================================

-- 4.1: Verify all issues are resolved
SELECT 
  'Remaining duplicate emails' as check_name,
  COUNT(DISTINCT email) as count,
  CASE WHEN COUNT(DISTINCT email) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM (
  SELECT email
  FROM community
  WHERE user_id IS NULL AND email IS NOT NULL
  GROUP BY email
  HAVING COUNT(*) > 1
) sub

UNION ALL

SELECT 
  'Remaining missing emails' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '⚠️ WARN' END as status
FROM community
WHERE user_id IS NULL
  AND (email IS NULL OR email = '' OR TRIM(email) = '')

UNION ALL

SELECT 
  'Remaining invalid emails' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email NOT LIKE '%@%.%'

UNION ALL

SELECT 
  'Profiles ready for migration' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email LIKE '%@%.%'
  AND email = TRIM(LOWER(email))
  AND NOT EXISTS (
    SELECT 1 FROM community c2 
    WHERE c2.email = community.email 
      AND c2.id != community.id 
      AND c2.user_id IS NULL
  );

-- 4.2: List profiles ready for migration
SELECT 
  id,
  email,
  name,
  created_at,
  '✅ READY FOR OAUTH MIGRATION' as status
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email LIKE '%@%.%'
  AND email = TRIM(LOWER(email))
  AND NOT EXISTS (
    SELECT 1 FROM community c2 
    WHERE c2.email = community.email 
      AND c2.id != community.id 
      AND c2.user_id IS NULL
  )
ORDER BY created_at
LIMIT 20;

-- 4.3: Count profiles by status
SELECT 
  CASE 
    WHEN user_id IS NOT NULL THEN '🟢 Already linked to OAuth'
    WHEN email IS NULL OR email = '' THEN '🔴 Missing email'
    WHEN email NOT LIKE '%@%.%' THEN '🔴 Invalid email'
    WHEN EXISTS (
      SELECT 1 FROM community c2 
      WHERE c2.email = community.email 
        AND c2.id != community.id 
        AND c2.user_id IS NULL
    ) THEN '🟡 Duplicate email'
    ELSE '🟢 Ready for migration'
  END as status,
  COUNT(*) as count
FROM community
GROUP BY status
ORDER BY 
  CASE status
    WHEN '🟢 Ready for migration' THEN 1
    WHEN '🟢 Already linked to OAuth' THEN 2
    WHEN '🟡 Duplicate email' THEN 3
    WHEN '🔴 Invalid email' THEN 4
    WHEN '🔴 Missing email' THEN 5
  END;

-- ================================================================
-- SECTION 5: BACKUP
-- ================================================================

-- 5.1: Create backup before making changes
-- UNCOMMENT TO RUN:
/*
CREATE TABLE community_backup_pre_oauth_migration AS 
SELECT * FROM community;
*/

-- 5.2: Verify backup
-- SELECT COUNT(*) as backup_count FROM community_backup_pre_oauth_migration;

-- ================================================================
-- SECTION 6: POST-MIGRATION MONITORING
-- ================================================================

-- 6.1: Track migration progress (run daily)
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as profiles_linked,
  ARRAY_AGG(email ORDER BY updated_at) as emails_linked
FROM community
WHERE user_id IS NOT NULL
  AND updated_at >= NOW() - INTERVAL '7 days'
  AND created_at < updated_at - INTERVAL '1 hour'  -- Profile existed before linking
GROUP BY DATE(updated_at)
ORDER BY date DESC;

-- 6.2: Find profiles that failed to link (created new instead)
-- These are potential duplicates like Dave's situation
SELECT 
  c1.email,
  c1.id as new_profile_id,
  c1.user_id as new_user_id,
  c1.created_at as new_created_at,
  c2.id as old_profile_id,
  c2.created_at as old_created_at,
  '⚠️ POTENTIAL DUPLICATE - Check manually' as issue
FROM community c1
JOIN community c2 ON LOWER(c1.email) = LOWER(c2.email)
WHERE c1.user_id IS NOT NULL  -- New OAuth profile
  AND c2.user_id IS NULL      -- Old migrated profile
  AND c1.id != c2.id
  AND c1.created_at > c2.created_at  -- New profile created after old one
  AND c1.created_at >= NOW() - INTERVAL '7 days'  -- Recent
ORDER BY c1.created_at DESC;

-- ================================================================
-- EXECUTION CHECKLIST
-- ================================================================

/*
Pre-Migration Checklist:

[ ] 1. Run Section 1 (Identify Issues)
[ ] 2. Review all issues found
[ ] 3. Create backup (Section 5.1)
[ ] 4. Run automatic fixes (Section 2)
[ ] 5. Manually fix duplicates (Section 3.1)
[ ] 6. Manually fix missing emails (Section 3.2)
[ ] 7. Manually fix invalid emails (Section 3.3)
[ ] 8. Run verification (Section 4)
[ ] 9. Ensure all checks pass
[ ] 10. Document any remaining issues

Post-Migration Monitoring:

[ ] 1. Run Section 6.1 daily for first week
[ ] 2. Run Section 6.2 daily for first week
[ ] 3. Fix any duplicate profiles found
[ ] 4. Monitor logs for [PROFILE-LINK] errors
[ ] 5. Have manual fix process ready

Success Criteria:

[ ] Zero duplicate emails
[ ] Zero invalid emails
[ ] <5% missing emails (acceptable if users are inactive)
[ ] >95% profiles ready for migration
[ ] Backup created and verified
[ ] Manual fix process documented
*/

-- ================================================================
-- END OF SCRIPT
-- ================================================================
