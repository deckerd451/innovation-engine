-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- MIGRATION: Link OAuth Users to Existing Profiles
-- ================================================================
-- This migration helps link new OAuth users to their existing profiles
-- based on email address matching.
--
-- Strategy:
-- 1. When a user logs in with OAuth, check if a profile with that email exists
-- 2. If exists and user_id is NULL, link it to the OAuth user
-- 3. If exists and user_id is different, create a new profile (edge case)
-- 4. If not exists, the app will create a new profile
--
-- Run this AFTER migrating users to ensure email column is populated
-- ================================================================

-- Step 1: Ensure email column exists and is indexed
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_community_email ON community(email);

-- Step 2: Create a function to link OAuth user to existing profile
CREATE OR REPLACE FUNCTION link_oauth_to_existing_profile()
RETURNS TRIGGER AS $$
DECLARE
  existing_profile_id UUID;
  existing_user_id UUID;
BEGIN
  -- Only run on INSERT (new OAuth user)
  IF TG_OP = 'INSERT' THEN
    -- Check if a profile exists with this email but no user_id
    SELECT id, user_id INTO existing_profile_id, existing_user_id
    FROM community
    WHERE email = NEW.email
    AND user_id IS NULL
    LIMIT 1;

    -- If found, update the existing profile with the new user_id
    IF existing_profile_id IS NOT NULL THEN
      UPDATE community
      SET user_id = NEW.id,
          updated_at = NOW()
      WHERE id = existing_profile_id;
      
      RAISE NOTICE 'Linked OAuth user % to existing profile %', NEW.id, existing_profile_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create trigger on auth.users table (if you have access)
-- Note: This may require superuser access. If it fails, implement in application code instead.
-- DROP TRIGGER IF EXISTS link_oauth_profile_trigger ON auth.users;
-- CREATE TRIGGER link_oauth_profile_trigger
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION link_oauth_to_existing_profile();

-- Step 4: Backfill - Link existing OAuth users to profiles with matching emails
-- This handles users who already logged in before this migration
UPDATE community c
SET user_id = au.id,
    updated_at = NOW()
FROM auth.users au
WHERE c.email = au.email
  AND c.user_id IS NULL
  AND au.id IS NOT NULL;

-- Step 5: Report on unlinked profiles
SELECT 
  COUNT(*) as unlinked_profiles,
  'Profiles without user_id (need manual linking or will be linked on next login)' as description
FROM community
WHERE user_id IS NULL;

-- Step 6: Report on successfully linked profiles
SELECT 
  COUNT(*) as linked_profiles,
  'Profiles successfully linked to OAuth users' as description
FROM community c
INNER JOIN auth.users au ON c.user_id = au.id
WHERE c.email = au.email;

COMMENT ON FUNCTION link_oauth_to_existing_profile() IS 
'Automatically links OAuth users to existing community profiles based on email address';
