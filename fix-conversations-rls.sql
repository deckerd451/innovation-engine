-- ============================================================================
-- FIX CONVERSATIONS RLS POLICIES
-- ============================================================================
-- This script sets up the correct RLS policies for the conversations table
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Enable RLS on conversations table
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies (clean slate)
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

-- Step 3: Create SELECT policy (view conversations where user is a participant)
CREATE POLICY "Users can view conversations they are part of"
  ON public.conversations
  FOR SELECT
  USING (
    participant_1_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
    OR
    participant_2_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Step 4: Create INSERT policy (create conversations where user is a participant)
CREATE POLICY "Users can create conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      participant_1_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
      OR
      participant_2_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

-- Step 5: Create UPDATE policy (update conversations where user is a participant)
CREATE POLICY "Users can update their conversations"
  ON public.conversations
  FOR UPDATE
  USING (
    participant_1_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
    OR
    participant_2_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Step 6: Verify policies are correct
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
WHERE tablename = 'conversations'
ORDER BY policyname;

-- ============================================================================
-- DONE!
-- ============================================================================
-- RLS policies are now correctly set up for conversations table
-- Try creating a conversation again after running this script
-- ============================================================================
