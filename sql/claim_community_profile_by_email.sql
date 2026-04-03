-- ================================================================
-- IDENTITY CLAIM SYSTEM — Supabase Function
-- ================================================================
-- Function: public.claim_community_profile_by_email()
--
-- Behavior:
--   1. Uses auth.uid() to get the authenticated user
--   2. Gets auth.users.email
--   3. Finds exactly one community row where:
--      - lower(trim(email)) matches
--      - user_id IS NULL
--   4. If exactly one match → update community.user_id = auth.uid() → return community.id
--   5. If 0 matches → return null
--   6. If >1 matches → throw error
--   7. If auth user already linked to a community row → throw error
-- ================================================================

-- Drop existing function if it exists (safe re-deploy)
DROP FUNCTION IF EXISTS public.claim_community_profile_by_email();

CREATE OR REPLACE FUNCTION public.claim_community_profile_by_email()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid;
  v_auth_email text;
  v_match_count int;
  v_community_id uuid;
  v_already_linked int;
BEGIN
  -- 1. Get authenticated user
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Get auth user email
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = v_auth_uid;

  IF v_auth_email IS NULL OR v_auth_email = '' THEN
    RETURN NULL;
  END IF;

  -- Normalize email
  v_auth_email := lower(trim(v_auth_email));

  -- 3. Check if auth user is already linked to a community row
  SELECT count(*) INTO v_already_linked
  FROM community
  WHERE user_id = v_auth_uid;

  IF v_already_linked > 0 THEN
    RAISE EXCEPTION 'Auth user already linked to a community profile';
  END IF;

  -- 4. Count orphaned matches by email
  SELECT count(*) INTO v_match_count
  FROM community
  WHERE lower(trim(email)) = v_auth_email
    AND user_id IS NULL;

  -- 5. Handle match cases
  IF v_match_count = 0 THEN
    RETURN NULL;
  END IF;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'Multiple orphaned community profiles found for email: %', v_auth_email;
  END IF;

  -- Exactly one match — claim it
  UPDATE community
  SET user_id = v_auth_uid,
      updated_at = now()
  WHERE lower(trim(email)) = v_auth_email
    AND user_id IS NULL
  RETURNING id INTO v_community_id;

  RETURN v_community_id;
END;
$$;

-- ================================================================
-- PERMISSIONS
-- ================================================================
REVOKE ALL ON FUNCTION public.claim_community_profile_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_community_profile_by_email() TO authenticated;

-- ================================================================
-- DATA FIX: Fix null created_at values (shows as 12/31/1969)
-- ================================================================
-- Set default for future rows
ALTER TABLE community ALTER COLUMN created_at SET DEFAULT now();

-- Fix existing null values
UPDATE community
SET created_at = COALESCE(updated_at, now())
WHERE created_at IS NULL;

-- ================================================================
-- ADMIN STATS VIEW (optional convenience)
-- ================================================================
-- Quick query for admin dashboard:
-- SELECT
--   count(*) as total,
--   count(user_id) as claimed,
--   count(*) - count(user_id) as unclaimed
-- FROM community;
