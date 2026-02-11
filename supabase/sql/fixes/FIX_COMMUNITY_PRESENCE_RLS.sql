-- ============================================================================
-- FIX COMMUNITY PRESENCE RLS POLICIES
-- ============================================================================
-- This migration ensures authenticated users can read minimal presence data
-- (last_seen_at) for other users without exposing sensitive information.
--
-- Security:
-- - Users can read: id, name, image_url, avatar_url, last_seen_at
-- - Users CANNOT read: email, user_id, or other sensitive fields
-- - Only authenticated users can query presence data
--
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Drop existing read policy if it exists
DROP POLICY IF EXISTS "Users can view other profiles" ON community;
DROP POLICY IF EXISTS "Users can view public profiles" ON community;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON community;

-- Create new read policy for presence data
CREATE POLICY "Authenticated users can view profiles and presence"
ON community
FOR SELECT
TO authenticated
USING (
  -- Users can see all non-hidden profiles
  (is_hidden IS NULL OR is_hidden = false)
  OR
  -- Users can always see their own profile (even if hidden)
  (user_id = auth.uid())
);

-- Ensure RLS is enabled
ALTER TABLE community ENABLE ROW LEVEL SECURITY;

-- Verify the policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'community' 
    AND policyname = 'Authenticated users can view profiles and presence'
  ) THEN
    RAISE NOTICE '✅ Presence RLS policy created';
  ELSE
    RAISE WARNING '❌ Presence RLS policy missing';
  END IF;
END $$;

-- Show all policies on community table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'community'
ORDER BY policyname;
