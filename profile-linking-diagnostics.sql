-- ================================================================
-- Profile Linking Diagnostics & Cleanup SQL
-- ================================================================
-- Run these queries in Supabase SQL Editor to diagnose and fix
-- profile linking issues.
--
-- IMPORTANT: Review results before running any UPDATE/DELETE queries!
-- ================================================================

-- ================================================================
-- SECTION 1: DIAGNOSTICS
-- ================================================================

-- 1.1: Count orphaned profiles (user_id = NULL)
-- These will be linked when users sign in via OAuth
SELECT 
  COUNT(*) as orphaned_count,
  'Profiles with user_id = NULL (will be linked on OAuth sign-in)' as description
FROM community 
WHERE user_id IS NULL;

-- 1.2: List orphaned profiles with details
SELECT 
  id,
  email,
  name,
  username,
  onboarding_completed,
  profile_completed,
  created_at,
  updated_at
FROM community 
WHERE user_id IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- 1.3: Find duplicate emails
SELECT 
  email,
  COUNT(*) as profile_count,
  ARRAY_AGG(id) as profile_ids,
  ARRAY_AGG(user_id) as user_ids,
  ARRAY_AGG(is_hidden) as hidden_status
FROM community
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 1.4: Count hidden profiles (duplicates marked for cleanup)
SELECT 
  COUNT(*) as hidden_count,
  'Duplicate profiles marked as hidden' as description
FROM community 
WHERE is_hidden = true;

-- 1.5: List hidden profiles
SELECT 
  id,
  email,
  user_id,
  name,
  created_at,
  updated_at
FROM community 
WHERE is_hidden = true
ORDER BY updated_at DESC
LIMIT 20;

-- 1.6: Check for email collisions (same email, different user_ids)
SELECT 
  email,
  COUNT(DISTINCT user_id) as unique_user_ids,
  ARRAY_AGG(DISTINCT user_id) as user_ids,
  ARRAY_AGG(id) as profile_ids
FROM community
WHERE user_id IS NOT NULL
GROUP BY email
HAVING COUNT(DISTINCT user_id) > 1;

-- 1.7: Profiles needing onboarding
SELECT 
  COUNT(*) as needs_onboarding_count,
  'Profiles that need onboarding completion' as description
FROM community 
WHERE user_id IS NOT NULL
  AND (
    onboarding_completed = false 
    OR profile_completed = false
    OR name IS NULL
    OR username IS NULL
  );

-- 1.8: List profiles needing onboarding
SELECT 
  id,
  email,
  user_id,
  name,
  username,
  onboarding_completed,
  profile_completed,
  created_at
FROM community 
WHERE user_id IS NOT NULL
  AND (
    onboarding_completed = false 
    OR profile_completed = false
    OR name IS NULL
    OR username IS NULL
  )
ORDER BY created_at DESC
LIMIT 20;

-- 1.9: Check for profiles with NULL created_at (data quality issue)
SELECT 
  COUNT(*) as null_created_at_count,
  'Profiles with NULL created_at (should be fixed)' as description
FROM community 
WHERE created_at IS NULL;

-- 1.10: Overall profile statistics
SELECT 
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as linked_profiles,
  COUNT(CASE WHEN user_id IS NULL THEN 1 END) as orphaned_profiles,
  COUNT(CASE WHEN is_hidden = true THEN 1 END) as hidden_profiles,
  COUNT(CASE WHEN onboarding_completed = true THEN 1 END) as onboarding_complete,
  COUNT(CASE WHEN profile_completed = true THEN 1 END) as profile_complete
FROM community;

-- ================================================================
-- SECTION 2: VERIFICATION QUERIES
-- ================================================================

-- 2.1: Verify UNIQUE constraint on user_id
-- This should return constraint info
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'community'::regclass
  AND contype = 'u'
  AND conname LIKE '%user_id%';

-- 2.2: Check if is_hidden column exists
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'community'
  AND column_name = 'is_hidden';

-- 2.3: Check indexes on community table
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'community'
ORDER BY indexname;

-- ================================================================
-- SECTION 3: CLEANUP QUERIES (USE WITH CAUTION!)
-- ================================================================

-- 3.1: Add is_hidden column if it doesn't exist
-- Run this if is_hidden column is missing
-- ALTER TABLE community ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- 3.2: Fix NULL created_at values
-- Sets created_at to updated_at or current timestamp
-- UNCOMMENT TO RUN:
-- UPDATE community 
-- SET created_at = COALESCE(updated_at, NOW())
-- WHERE created_at IS NULL;

-- 3.3: Fix NULL updated_at values
-- Sets updated_at to created_at or current timestamp
-- UNCOMMENT TO RUN:
-- UPDATE community 
-- SET updated_at = COALESCE(created_at, NOW())
-- WHERE updated_at IS NULL;

-- 3.4: Manually link a specific orphaned profile
-- Replace <profile_id> and <auth_user_id> with actual values
-- UNCOMMENT AND MODIFY TO RUN:
-- UPDATE community 
-- SET 
--   user_id = '<auth_user_id>',
--   updated_at = NOW()
-- WHERE id = '<profile_id>'
--   AND user_id IS NULL;

-- 3.5: Manually hide duplicate profiles
-- Replace <profile_id> with the non-canonical profile ID
-- UNCOMMENT AND MODIFY TO RUN:
-- UPDATE community 
-- SET 
--   is_hidden = true,
--   updated_at = NOW()
-- WHERE id = '<profile_id>';

-- 3.6: Unhide a profile (if hidden by mistake)
-- Replace <profile_id> with the profile ID to unhide
-- UNCOMMENT AND MODIFY TO RUN:
-- UPDATE community 
-- SET 
--   is_hidden = false,
--   updated_at = NOW()
-- WHERE id = '<profile_id>';

-- 3.7: Delete hidden profiles older than 30 days
-- DANGEROUS! Only run after verifying hidden profiles are truly duplicates
-- UNCOMMENT TO RUN:
-- DELETE FROM community 
-- WHERE is_hidden = true
--   AND updated_at < NOW() - INTERVAL '30 days';

-- ================================================================
-- SECTION 4: BACKUP & RESTORE
-- ================================================================

-- 4.1: Create backup table before major changes
-- UNCOMMENT TO RUN:
-- CREATE TABLE community_backup_20260204 AS 
-- SELECT * FROM community;

-- 4.2: Verify backup was created
-- SELECT COUNT(*) as backup_count 
-- FROM community_backup_20260204;

-- 4.3: Restore from backup (DANGEROUS!)
-- Only use if something went wrong
-- UNCOMMENT TO RUN:
-- BEGIN;
-- DELETE FROM community;
-- INSERT INTO community SELECT * FROM community_backup_20260204;
-- COMMIT;

-- ================================================================
-- SECTION 5: MONITORING QUERIES
-- ================================================================

-- 5.1: Track profile linking over time
-- Run this daily to see progress
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as profiles_updated,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as newly_linked
FROM community
WHERE updated_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(updated_at)
ORDER BY date DESC;

-- 5.2: Recent profile updates (last 24 hours)
SELECT 
  id,
  email,
  user_id,
  name,
  onboarding_completed,
  profile_completed,
  is_hidden,
  updated_at
FROM community
WHERE updated_at >= NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC;

-- 5.3: Find profiles that were recently linked
-- (user_id set in last 7 days)
SELECT 
  id,
  email,
  user_id,
  name,
  created_at,
  updated_at,
  updated_at - created_at as time_until_linked
FROM community
WHERE user_id IS NOT NULL
  AND updated_at >= NOW() - INTERVAL '7 days'
  AND created_at < updated_at - INTERVAL '1 hour'
ORDER BY updated_at DESC;

-- ================================================================
-- SECTION 6: SPECIFIC USER LOOKUP
-- ================================================================

-- 6.1: Find profile by email
-- Replace 'user@example.com' with actual email
-- SELECT * FROM community 
-- WHERE LOWER(email) = LOWER('user@example.com')
-- ORDER BY created_at;

-- 6.2: Find profile by user_id (auth UID)
-- Replace '<auth_user_id>' with actual auth user ID
-- SELECT * FROM community 
-- WHERE user_id = '<auth_user_id>';

-- 6.3: Find profile by display name
-- Replace 'Display Name' with actual name
-- SELECT * FROM community 
-- WHERE name ILIKE '%Display Name%'
-- ORDER BY created_at DESC;

-- ================================================================
-- SECTION 7: PERFORMANCE OPTIMIZATION
-- ================================================================

-- 7.1: Create index on email (case-insensitive)
-- Improves performance of email lookups
-- UNCOMMENT TO RUN:
-- CREATE INDEX IF NOT EXISTS idx_community_email_lower 
-- ON community(LOWER(email));

-- 7.2: Create index on user_id
-- Should already exist due to UNIQUE constraint, but verify
-- UNCOMMENT TO RUN:
-- CREATE INDEX IF NOT EXISTS idx_community_user_id 
-- ON community(user_id);

-- 7.3: Create index on is_hidden
-- Improves performance of queries filtering hidden profiles
-- UNCOMMENT TO RUN:
-- CREATE INDEX IF NOT EXISTS idx_community_is_hidden 
-- ON community(is_hidden) 
-- WHERE is_hidden = true;

-- 7.4: Analyze table statistics
-- Helps query planner optimize queries
-- UNCOMMENT TO RUN:
-- ANALYZE community;

-- ================================================================
-- END OF DIAGNOSTICS
-- ================================================================

-- Summary: Run Section 1 (Diagnostics) first to understand current state
-- Then use Section 2 (Verification) to check schema
-- Use Section 3 (Cleanup) carefully after reviewing results
-- Use Section 5 (Monitoring) to track progress over time
