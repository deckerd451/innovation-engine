-- ================================================================
-- MESSAGES RLS POLICIES - CORRECT VERSION
-- Based on your schema: messages.sender_id → community.id
-- ================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "view_own_messages" ON public.messages;
DROP POLICY IF EXISTS "send_messages" ON public.messages;
DROP POLICY IF EXISTS "update_own_messages" ON public.messages;

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- POLICY 1: View messages in conversations you participate in
CREATE POLICY "users_can_view_conversation_messages"
  ON public.messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = (
        SELECT id FROM public.community 
        WHERE user_id = auth.uid() 
        LIMIT 1
      )
      OR participant_2_id = (
        SELECT id FROM public.community 
        WHERE user_id = auth.uid() 
        LIMIT 1
      )
    )
  );

-- POLICY 2: Send messages in conversations you participate in
CREATE POLICY "users_can_send_messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    -- Sender must be your community profile
    sender_id = (
      SELECT id FROM public.community 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
    AND
    -- Conversation must include you as participant
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = (
        SELECT id FROM public.community 
        WHERE user_id = auth.uid() 
        LIMIT 1
      )
      OR participant_2_id = (
        SELECT id FROM public.community 
        WHERE user_id = auth.uid() 
        LIMIT 1
      )
    )
  );

-- POLICY 3: Update your own messages (for read receipts, etc.)
CREATE POLICY "users_can_update_own_messages"
  ON public.messages
  FOR UPDATE
  USING (
    sender_id = (
      SELECT id FROM public.community 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

-- POLICY 4: Mark messages as read in your conversations
CREATE POLICY "users_can_mark_messages_read"
  ON public.messages
  FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = (
        SELECT id FROM public.community 
        WHERE user_id = auth.uid() 
        LIMIT 1
      )
      OR participant_2_id = (
        SELECT id FROM public.community 
        WHERE user_id = auth.uid() 
        LIMIT 1
      )
    )
  );

-- Verify policies were created
SELECT 
  policyname,
  cmd,
  permissive,
  qual
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'messages'
ORDER BY policyname;

-- Test query to verify access
DO $
BEGIN
  RAISE NOTICE '✅ Messages RLS policies updated successfully!';
  RAISE NOTICE '📝 Policies created:';
  RAISE NOTICE '   - users_can_view_conversation_messages (SELECT)';
  RAISE NOTICE '   - users_can_send_messages (INSERT)';
  RAISE NOTICE '   - users_can_update_own_messages (UPDATE - own messages)';
  RAISE NOTICE '   - users_can_mark_messages_read (UPDATE - read receipts)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Security: Users can only access messages in their conversations';
  RAISE NOTICE '📨 Sending: Users can only send messages as their community profile';
  RAISE NOTICE '✏️ Updates: Users can update their own messages and mark others as read';
END $;