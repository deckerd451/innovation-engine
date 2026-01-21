-- ================================================================
-- CLEANUP DUPLICATE RLS POLICIES
-- Remove old policies and keep only the correct ones
-- ================================================================

-- Remove the old policies (these have generic names)
DROP POLICY IF EXISTS "Messages: insert if in conversation and sender is self" ON public.messages;
DROP POLICY IF EXISTS "Messages: select if in conversation" ON public.messages;
DROP POLICY IF EXISTS "Messages: update if in conversation" ON public.messages;

-- Keep the new policies with descriptive names:
-- - users_can_view_conversation_messages (SELECT)
-- - users_can_send_messages (INSERT) 
-- - users_can_update_own_messages (UPDATE)
-- - users_can_mark_messages_read (UPDATE)

-- Verify final policies
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'messages'
ORDER BY policyname;