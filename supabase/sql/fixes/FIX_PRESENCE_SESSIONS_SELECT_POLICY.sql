-- ============================================================================
-- FIX: Allow users to view other users' presence sessions
-- ============================================================================
-- Problem: The current SELECT policy only allows users to see their own
-- presence sessions, preventing the attendee list from working.
--
-- Solution: Replace the restrictive policy with one that allows users to
-- view all presence sessions (needed for event attendee discovery).
--
-- Security: This is safe because:
-- 1. Presence sessions contain only: user_id, context_id, energy, timestamps
-- 2. No sensitive personal data is exposed
-- 3. Users still can only INSERT/UPDATE/DELETE their own sessions
-- 4. This enables the core feature: seeing who else is at an event
-- ============================================================================

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view their own presence sessions" ON presence_sessions;

-- Create new policy that allows viewing all presence sessions
CREATE POLICY "Users can view all presence sessions"
  ON presence_sessions FOR SELECT
  USING (true);

-- Verify other policies remain restrictive (users can only modify their own)
-- These should already exist from the original schema:
-- - "Users can insert their own presence sessions" (INSERT with auth.uid() = user_id)
-- - "Users can update their own presence sessions" (UPDATE with auth.uid() = user_id)
-- - "Users can delete their own presence sessions" (DELETE with auth.uid() = user_id)

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Show all policies on presence_sessions table
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
WHERE tablename = 'presence_sessions'
ORDER BY policyname;

-- Test query: Show recent presence sessions (should work for all users now)
SELECT 
  user_id,
  context_type,
  context_id,
  energy,
  created_at,
  expires_at
FROM presence_sessions
WHERE expires_at > NOW()
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- Expected result
-- ============================================================================
-- After running this fix:
-- 1. Users can SELECT all presence_sessions rows (not just their own)
-- 2. Users can still only INSERT/UPDATE/DELETE their own rows
-- 3. iOS app can now fetch attendee lists successfully
-- 4. Network view will show attendee count > 0 when multiple users are present
-- ============================================================================
