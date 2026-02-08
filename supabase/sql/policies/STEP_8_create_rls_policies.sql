-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔒 Creating RLS policies...';
END $$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view own activity" ON public.activity_log;
DROP POLICY IF EXISTS "System can log activity" ON public.activity_log;
DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can earn achievements" ON public.user_achievements;

-- Conversations policies
CREATE POLICY "Users can view conversations they are part of"
  ON public.conversations FOR SELECT
  USING (
    participant_1_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
    OR participant_2_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
  );

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      participant_1_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
      OR participant_2_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their conversations"
  ON public.conversations FOR UPDATE
  USING (
    participant_1_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
    OR participant_2_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
  );

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE public.community.user_id = auth.uid())
    )
  );

-- Activity log policies (uses auth_user_id instead of user_id)
CREATE POLICY "Users can view own activity" ON public.activity_log
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "System can log activity" ON public.activity_log
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- Achievements policies
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can earn achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies created';
END $$;
