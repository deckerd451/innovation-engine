-- ============================================================================
-- FIX PRESENCE SESSIONS RLS POLICIES
-- ============================================================================
-- The presence_sessions.user_id references community.id (not auth.users.id)
-- So the RLS policies need to check if the user owns the community profile
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own presence sessions" ON presence_sessions;
DROP POLICY IF EXISTS "Users can insert their own presence sessions" ON presence_sessions;
DROP POLICY IF EXISTS "Users can update their own presence sessions" ON presence_sessions;
DROP POLICY IF EXISTS "Users can delete their own presence sessions" ON presence_sessions;

-- SELECT: Users can view their own presence sessions
CREATE POLICY "Users can view their own presence sessions"
  ON presence_sessions FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- INSERT: Users can insert presence sessions for their own community profile
CREATE POLICY "Users can insert their own presence sessions"
  ON presence_sessions FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can update their own presence sessions
CREATE POLICY "Users can update their own presence sessions"
  ON presence_sessions FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- DELETE: Users can delete their own presence sessions
CREATE POLICY "Users can delete their own presence sessions"
  ON presence_sessions FOR DELETE
  USING (
    user_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- Verify policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'presence_sessions'
ORDER BY policyname;

-- Test the policy (should return your community profile ID)
SELECT id, email, name 
FROM community 
WHERE user_id = auth.uid();
