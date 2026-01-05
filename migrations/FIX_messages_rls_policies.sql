-- ================================================================
-- Fix Messages RLS Policies
-- Allows users to send and view messages in their conversations
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '🔒 Fixing messages RLS policies...';
END $$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

-- Enable RLS if not already enabled
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages in conversations they're part of
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      INNER JOIN public.community cm ON (c.participant_1_id = cm.id OR c.participant_2_id = cm.id)
      WHERE c.id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Policy: Users can send messages (sender_id must be their auth.uid())
CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      INNER JOIN public.community cm ON (c.participant_1_id = cm.id OR c.participant_2_id = cm.id)
      WHERE c.id = conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Policy: Users can mark their messages as read
CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      INNER JOIN public.community cm ON (c.participant_1_id = cm.id OR c.participant_2_id = cm.id)
      WHERE c.id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Also ensure conversations policies exist
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

CREATE POLICY "Users can view conversations they are part of"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community
      WHERE public.community.user_id = auth.uid()
        AND (public.community.id = participant_1_id OR public.community.id = participant_2_id)
    )
  );

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community
      WHERE public.community.user_id = auth.uid()
        AND (public.community.id = participant_1_id OR public.community.id = participant_2_id)
    )
  );

CREATE POLICY "Users can update their conversations"
  ON public.conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.community
      WHERE public.community.user_id = auth.uid()
        AND (public.community.id = participant_1_id OR public.community.id = participant_2_id)
    )
  );

DO $$
BEGIN
  RAISE NOTICE '✅ Messages RLS policies fixed!';
END $$;
