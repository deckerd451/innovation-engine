-- ============================================================================
-- DEFINITIVE MESSAGING RLS FIX
-- ============================================================================
-- Run this in Supabase SQL Editor to fix messaging 403 errors.
--
-- Problem: messages INSERT returns 403 "new row violates row-level security"
-- Root cause: Unknown which RLS policies are active; possible conflicts.
-- Solution: Drop ALL known policy names, recreate clean minimal policies.
--
-- Schema reminder:
--   conversations.participant_1_id / participant_2_id → community.id
--   messages.sender_id → auth.users.id  (i.e. auth.uid())
-- ============================================================================

-- ========== DROP EVERYTHING ==========
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "view_own_messages" ON public.messages;
DROP POLICY IF EXISTS "send_messages" ON public.messages;
DROP POLICY IF EXISTS "update_own_messages" ON public.messages;

DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;
DROP POLICY IF EXISTS "view_own_conversations" ON public.conversations;
DROP POLICY IF EXISTS "create_conversations" ON public.conversations;
DROP POLICY IF EXISTS "update_own_conversations" ON public.conversations;

-- ========== ENABLE RLS ==========
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ========== HELPER: get community ID for current auth user ==========
-- (conversations store community IDs as participants, not auth UIDs)

-- ========== CONVERSATIONS POLICIES ==========

-- SELECT: can see conversations where I'm a participant
CREATE POLICY "conv_select" ON public.conversations FOR SELECT USING (
  participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  OR
  participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
);

-- INSERT: can create conversations where I'm a participant
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT WITH CHECK (
  participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  OR
  participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
);

-- UPDATE: can update conversations where I'm a participant
CREATE POLICY "conv_update" ON public.conversations FOR UPDATE USING (
  participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  OR
  participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
);

-- ========== MESSAGES POLICIES ==========

-- SELECT: can read messages in my conversations
CREATE POLICY "msg_select" ON public.messages FOR SELECT USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
       OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  )
);

-- INSERT: sender_id must be auth.uid() AND conversation must be mine
CREATE POLICY "msg_insert" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (
    SELECT id FROM public.conversations
    WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
       OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  )
);

-- UPDATE: can update messages in my conversations
CREATE POLICY "msg_update" ON public.messages FOR UPDATE USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
       OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  )
);
