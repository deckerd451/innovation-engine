-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- MINIMAL OAUTH LINKING SETUP (Required for Profile Linking)
-- ================================================================
-- This is the ONLY migration you need to run for OAuth linking to work
-- The application code (auth.js) handles the actual linking logic
-- ================================================================

-- Step 1: Ensure email column exists (should already exist, but just in case)
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 2: Create index on email for fast lookups (IMPORTANT for performance)
CREATE INDEX IF NOT EXISTS idx_community_email ON community(email);

-- Step 3: Create index on user_id for fast lookups (should already exist)
CREATE INDEX IF NOT EXISTS idx_community_user_id ON community(user_id);

-- Step 4: Normalize existing emails (lowercase, trim whitespace)
UPDATE community
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL
  AND email != LOWER(TRIM(email));

-- ================================================================
-- VERIFICATION QUERIES (run these to check if setup is correct)
-- ================================================================

-- Check 1: Verify email column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'community' 
  AND column_name = 'email';
-- Expected: Should return one row showing email column exists

-- Check 2: Verify indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'community'
  AND (indexname LIKE '%email%' OR indexname LIKE '%user_id%');
-- Expected: Should show idx_community_email and idx_community_user_id

-- Check 3: Count profiles ready for linking
SELECT 
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN user_id IS NULL AND email IS NOT NULL THEN 1 END) as ready_for_linking,
  COUNT(CASE WHEN user_id IS NULL AND email IS NULL THEN 1 END) as missing_email,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as already_linked
FROM community;
-- Expected: Shows breakdown of profile states

-- ================================================================
-- THAT'S IT! The application code handles the rest.
-- ================================================================
-- When a user logs in with OAuth:
-- 1. auth.js checks for profile by user_id
-- 2. If not found, checks for profile by email (where user_id IS NULL)
-- 3. If found, links the OAuth user_id to that profile
-- 4. User sees their existing profile data
-- ================================================================
