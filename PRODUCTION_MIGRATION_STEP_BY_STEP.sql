-- ============================================================================
-- CHARLESTONHACKS PRODUCTION MIGRATION - STEP BY STEP (WITH ERROR DETECTION)
-- ============================================================================
-- This version runs in steps and shows exactly where any error occurs
-- Run each section ONE AT A TIME and see which one fails
-- ============================================================================

-- ============================================================================
-- STEP 1: TEST - Verify user_id column exists
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔍 Testing: Checking if user_id column exists...';

  -- This should return at least one row
  PERFORM column_name
  FROM information_schema.columns
  WHERE table_name = 'community'
    AND column_name = 'user_id';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_id column does not exist in community table!';
  END IF;

  RAISE NOTICE '✅ user_id column exists';
END $$;

-- ============================================================================
-- STEP 2: Create messaging tables (conversations + messages)
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📬 Creating messaging tables...';
END $$;

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  context_type TEXT,
  context_id UUID,
  context_title TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_participants UNIQUE (participant_1_id, participant_2_id),
  CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_1 ON public.conversations(participant_1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_2 ON public.conversations(participant_2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(conversation_id, read) WHERE read = FALSE;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Messaging tables created';
END $$;

-- ============================================================================
-- STEP 3: Add missing engagement columns (if needed)
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🎮 Adding engagement columns (if missing)...';
END $$;

-- These might already exist - that's OK with IF NOT EXISTS
ALTER TABLE public.community
ADD COLUMN IF NOT EXISTS endorsements_given INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS endorsements_received INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_community_xp ON public.community(xp DESC);
CREATE INDEX IF NOT EXISTS idx_community_level ON public.community(level DESC);
CREATE INDEX IF NOT EXISTS idx_community_streak ON public.community(login_streak DESC);

DO $$
BEGIN
  RAISE NOTICE '✅ Engagement columns checked';
END $$;

-- ============================================================================
-- STEP 4: Create activity_log table
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Creating activity_log table...';
END $$;

CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.community(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  xp_awarded INTEGER DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_community ON public.activity_log(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON public.activity_log(action_type);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ activity_log table created';
END $$;

-- ============================================================================
-- STEP 5: Create achievements tables
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🏆 Creating achievements tables...';
END $$;

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  requirement_type TEXT,
  requirement_value INTEGER,
  xp_reward INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.achievements (code, name, description, icon, category, requirement_type, requirement_value, xp_reward)
VALUES
  ('first_connection', 'First Connection', 'Send your first connection request', '🤝', 'social', 'count', 1, 25),
  ('social_butterfly', 'Social Butterfly', 'Connect with 10 people', '🦋', 'social', 'count', 10, 100),
  ('network_hub', 'Network Hub', 'Connect with 50 people', '🌐', 'social', 'count', 50, 500),
  ('influencer', 'Influencer', 'Connect with 100 people', '⭐', 'social', 'count', 100, 1000),
  ('idea_spark', 'Idea Spark', 'Create your first project', '💡', 'project', 'count', 1, 50),
  ('team_builder', 'Team Builder', 'Recruit 5 team members', '👥', 'project', 'count', 5, 200),
  ('multi_tasker', 'Multi-Tasker', 'Active in 3+ projects', '🎯', 'project', 'count', 3, 150),
  ('early_bird', 'Early Bird', 'Login before 9am for 7 days', '🌅', 'engagement', 'streak', 7, 100),
  ('dedicated', 'Dedicated', '30-day login streak', '🔥', 'engagement', 'streak', 30, 500),
  ('unstoppable', 'Unstoppable', '100-day login streak', '💎', 'engagement', 'streak', 100, 2000),
  ('endorsement_guru', 'Endorsement Guru', 'Give 50 endorsements', '⭐', 'social', 'count', 50, 300)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.community(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_community ON public.user_achievements(community_id, earned_at DESC);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Achievements tables created';
END $$;

-- ============================================================================
-- STEP 6: Create leaderboard views
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🏅 Creating leaderboard views...';
END $$;

CREATE OR REPLACE VIEW public.xp_leaderboard AS
SELECT
  c.id,
  c.name,
  c.image_url,
  c.xp,
  c.level,
  ROW_NUMBER() OVER (ORDER BY c.xp DESC) as rank
FROM public.community c
WHERE c.xp > 0
ORDER BY c.xp DESC
LIMIT 100;

CREATE OR REPLACE VIEW public.streak_leaderboard AS
SELECT
  c.id,
  c.name,
  c.image_url,
  c.login_streak,
  ROW_NUMBER() OVER (ORDER BY c.login_streak DESC) as rank
FROM public.community c
WHERE c.login_streak > 0
ORDER BY c.login_streak DESC
LIMIT 100;

CREATE OR REPLACE VIEW public.connection_leaderboard AS
SELECT
  c.id,
  c.name,
  c.image_url,
  c.connection_count,
  ROW_NUMBER() OVER (ORDER BY c.connection_count DESC) as rank
FROM public.community c
WHERE c.connection_count > 0
ORDER BY c.connection_count DESC
LIMIT 100;

DO $$
BEGIN
  RAISE NOTICE '✅ Leaderboard views created';
END $$;

-- ============================================================================
-- STEP 7: Fix existing conversations (if any)
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Fixing existing conversations...';
END $$;

-- Drop constraints
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_participant_1_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_participant_2_id_fkey;

-- Fix participant_1_id
UPDATE public.conversations
SET participant_1_id = (
  SELECT c.id
  FROM public.community c
  WHERE c.user_id = conversations.participant_1_id
  LIMIT 1
)
WHERE participant_1_id NOT IN (SELECT id FROM public.community)
  AND participant_1_id IN (SELECT user_id FROM public.community WHERE user_id IS NOT NULL);

-- Fix participant_2_id
UPDATE public.conversations
SET participant_2_id = (
  SELECT c.id
  FROM public.community c
  WHERE c.user_id = conversations.participant_2_id
  LIMIT 1
)
WHERE participant_2_id NOT IN (SELECT id FROM public.community)
  AND participant_2_id IN (SELECT user_id FROM public.community WHERE user_id IS NOT NULL);

-- Delete orphaned conversations
DELETE FROM public.conversations c
WHERE c.participant_1_id NOT IN (SELECT id FROM public.community)
   OR c.participant_2_id NOT IN (SELECT id FROM public.community);

-- Re-add constraints
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_participant_1_id_fkey
  FOREIGN KEY (participant_1_id)
  REFERENCES public.community(id)
  ON DELETE CASCADE;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_participant_2_id_fkey
  FOREIGN KEY (participant_2_id)
  REFERENCES public.community(id)
  ON DELETE CASCADE;

DO $$
BEGIN
  RAISE NOTICE '✅ Conversations fixed';
END $$;

-- ============================================================================
-- STEP 8: Create RLS policies
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
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
    participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
      OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their conversations"
  ON public.conversations FOR UPDATE
  USING (
    participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

-- Activity log policies
CREATE POLICY "Users can view own activity" ON public.activity_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can log activity" ON public.activity_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Achievements policies
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can earn achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies created';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRATION COMPLETE!';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Next: Run the helper functions script separately';
END $$;
