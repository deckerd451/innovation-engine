-- ============================================================================
-- FIX COMMUNITY TABLE RLS POLICIES
-- ============================================================================
-- This ensures users can create their own profiles without issues
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- 1. Check current RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'community';

-- 2. Ensure RLS is enabled
ALTER TABLE community ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Community profiles are viewable by everyone" ON community;
DROP POLICY IF EXISTS "Users can insert their own community profile" ON community;
DROP POLICY IF EXISTS "Users can update their own community profile" ON community;
DROP POLICY IF EXISTS "Users can delete their own community profile" ON community;

-- 4. Create SELECT policy (everyone can view profiles)
CREATE POLICY "Community profiles are viewable by everyone"
  ON community FOR SELECT
  USING (true);

-- 5. Create INSERT policy (users can create their own profile)
CREATE POLICY "Users can insert their own community profile"
  ON community FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. Create UPDATE policy (users can update their own profile)
CREATE POLICY "Users can update their own community profile"
  ON community FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Create DELETE policy (users can delete their own profile)
CREATE POLICY "Users can delete their own community profile"
  ON community FOR DELETE
  USING (auth.uid() = user_id);

-- 8. Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'community'
ORDER BY policyname;

-- 9. Check if there's a unique constraint on user_id
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'community'::regclass
ORDER BY conname;

-- 10. Add unique constraint on user_id if it doesn't exist
-- This prevents duplicate profiles for the same user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'community'::regclass 
    AND conname = 'community_user_id_key'
  ) THEN
    ALTER TABLE community ADD CONSTRAINT community_user_id_key UNIQUE (user_id);
    RAISE NOTICE '✅ Added unique constraint on user_id';
  ELSE
    RAISE NOTICE '✅ Unique constraint on user_id already exists';
  END IF;
END $$;

-- 11. Show summary
DO $$
DECLARE
  rls_enabled BOOLEAN;
  policy_count INTEGER;
BEGIN
  -- Check RLS status
  SELECT rowsecurity INTO rls_enabled
  FROM pg_tables
  WHERE tablename = 'community';
  
  -- Count policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'community';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Community Table RLS Status';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Enabled: %', rls_enabled;
  RAISE NOTICE 'Number of Policies: %', policy_count;
  RAISE NOTICE '========================================';
END $$;
