-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- SIMPLE RLS Policy Fix for Messages
-- This creates minimal policies to allow messaging to work
-- Run this if the complex policies aren't working
-- ================================================================

-- First, check what we're working with
DO $$
BEGIN
  RAISE NOTICE '🔍 Checking current RLS status...';
END $$;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

-- Enable RLS (if not already)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- SIMPLE POLICY 1: Allow viewing messages if you're a participant
CREATE POLICY "view_own_messages"
  ON public.messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
         OR participant_2_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- SIMPLE POLICY 2: Allow sending messages if sender_id matches auth.uid()
CREATE POLICY "send_messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
         OR participant_2_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- SIMPLE POLICY 3: Allow updating own messages
CREATE POLICY "update_own_messages"
  ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid());

-- Conversation policies
CREATE POLICY "view_own_conversations"
  ON public.conversations
  FOR SELECT
  USING (
    participant_1_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
    OR participant_2_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "create_conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      participant_1_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
      OR participant_2_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "update_own_conversations"
  ON public.conversations
  FOR UPDATE
  USING (
    participant_1_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
    OR participant_2_id = (SELECT id FROM public.community WHERE user_id = auth.uid() LIMIT 1)
  );

DO $$
BEGIN
  RAISE NOTICE '✅ Simple RLS policies created!';
  RAISE NOTICE '📝 Try sending a message now';
END $$;
