-- ================================================================
-- FIX COMMON MIGRATION ISSUES
-- ================================================================
-- Use these queries to fix common issues found during migration readiness check
-- ================================================================

-- ============================================================
-- ISSUE 1: Profiles Missing Email
-- ============================================================
-- Option A: If you have a mapping of user IDs to emails
-- UPDATE community 
-- SET email = 'user@example.com'
-- WHERE id = 'profile-id-here';

-- Option B: Bulk update from a temporary table (if you have CSV data)
-- CREATE TEMP TABLE email_mapping (profile_id UUID, email TEXT);
-- COPY email_mapping FROM '/path/to/emails.csv' CSV HEADER;
-- UPDATE community c
-- SET email = em.email
-- FROM email_mapping em
-- WHERE c.id = em.profile_id;

-- ============================================================
-- ISSUE 2: Duplicate Emails - Merge Strategy
-- ============================================================
-- Step 1: Identify the "primary" profile (usually oldest or most complete)
-- Run this to see duplicates:
/*
SELECT 
  email,
  id,
  name,
  created_at,
  bio,
  skills,
  projects_created,
  connection_count,
  CASE 
    WHEN bio IS NOT NULL AND bio != '' THEN 1 ELSE 0 
  END +
  CASE 
    WHEN skills IS NOT NULL AND skills != '' THEN 1 ELSE 0 
  END +
  COALESCE(projects_created, 0) +
  COALESCE(connection_count, 0) as completeness_score
FROM community
WHERE email = 'duplicate@example.com'
ORDER BY completeness_score DESC, created_at ASC;
*/

-- Step 2: Keep the best profile, delete others
-- (Replace with actual IDs after reviewing)
/*
-- Keep this one (most complete or oldest)
-- DELETE FROM community WHERE id = 'duplicate-profile-id-2';
-- DELETE FROM community WHERE id = 'duplicate-profile-id-3';
*/

-- ============================================================
-- ISSUE 3: Email Format Issues
-- ============================================================
-- Find emails with potential format issues
SELECT 
  id,
  name,
  email,
  CASE 
    WHEN email NOT LIKE '%@%' THEN 'Missing @ symbol'
    WHEN email NOT LIKE '%.%' THEN 'Missing domain extension'
    WHEN email LIKE '% %' THEN 'Contains spaces'
    WHEN LENGTH(email) < 5 THEN 'Too short'
    ELSE 'Other issue'
  END as issue
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND (
    email NOT LIKE '%@%.%' OR
    email LIKE '% %' OR
    LENGTH(email) < 5
  );

-- Fix common email issues
-- UPDATE community 
-- SET email = TRIM(LOWER(email))
-- WHERE user_id IS NULL;

-- ============================================================
-- ISSUE 4: Case Sensitivity Issues
-- ============================================================
-- Normalize emails to lowercase to prevent case-mismatch issues
UPDATE community
SET email = LOWER(TRIM(email))
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email != LOWER(TRIM(email));

-- ============================================================
-- ISSUE 5: Test Email Addresses
-- ============================================================
-- Find and handle test/placeholder emails
SELECT 
  id,
  name,
  email,
  'Test/placeholder email - consider removing or updating' as note
FROM community
WHERE user_id IS NULL
  AND (
    email LIKE '%test%' OR
    email LIKE '%example%' OR
    email LIKE '%placeholder%' OR
    email LIKE '%@test.%' OR
    email = 'user@domain.com'
  );

-- Option: Set test emails to NULL so they don't interfere
-- UPDATE community
-- SET email = NULL
-- WHERE user_id IS NULL
--   AND (
--     email LIKE '%test%' OR
--     email LIKE '%example%' OR
--     email LIKE '%placeholder%'
--   );

-- ============================================================
-- ISSUE 6: Verify Email Uniqueness After Cleanup
-- ============================================================
-- After fixing issues, verify each email appears only once
SELECT 
  email,
  COUNT(*) as count,
  array_agg(id) as profile_ids
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- ============================================================
-- ISSUE 7: Backfill Missing Data from Old System
-- ============================================================
-- If you have additional user data from the old system, backfill it
-- Example: Update names, bios, etc.
/*
CREATE TEMP TABLE old_user_data (
  email TEXT,
  name TEXT,
  bio TEXT,
  skills TEXT
);

-- Load your old data
-- COPY old_user_data FROM '/path/to/old_data.csv' CSV HEADER;

-- Backfill missing data
UPDATE community c
SET 
  name = COALESCE(c.name, oud.name),
  bio = COALESCE(c.bio, oud.bio),
  skills = COALESCE(c.skills, oud.skills)
FROM old_user_data oud
WHERE c.email = oud.email
  AND c.user_id IS NULL;
*/

-- ============================================================
-- VERIFICATION: Final Readiness Check
-- ============================================================
-- Run this after fixes to verify readiness
SELECT 
  'FINAL CHECK' as status,
  COUNT(*) as total_unlinked,
  COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as ready_to_link,
  COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END) as still_missing_email,
  ROUND(
    (COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END)::NUMERIC / 
     NULLIF(COUNT(*), 0)) * 100,
    2
  ) as readiness_percentage
FROM community
WHERE user_id IS NULL;

-- ============================================================
-- ROLLBACK: Undo Changes (if needed)
-- ============================================================
-- If you need to rollback changes, you can:
-- 1. Restore from backup
-- 2. Or manually undo specific changes:
/*
-- Unlink all OAuth accounts (use with caution!)
UPDATE community
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND updated_at > '2024-01-XX 00:00:00'; -- Replace with your migration date
*/

-- ============================================================
-- EXPORT: Create User Communication List
-- ============================================================
-- Export list of users to notify about OAuth migration
SELECT 
  name,
  email,
  created_at,
  'Ready for OAuth migration' as status
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email != ''
ORDER BY created_at DESC;

-- Save this to CSV for email campaign:
-- \copy (SELECT name, email FROM community WHERE user_id IS NULL AND email IS NOT NULL) TO '/tmp/users_to_notify.csv' CSV HEADER;
