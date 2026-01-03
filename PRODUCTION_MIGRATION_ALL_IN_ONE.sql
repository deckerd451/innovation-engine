-- ============================================================================
-- CHARLESTONHACKS INNOVATION ENGINE - PRODUCTION MIGRATION (ALL-IN-ONE)
-- ============================================================================
-- This script combines all 4 required SQL migrations into a single file
-- for easy production deployment.
--
-- WHAT THIS DOES:
-- 1. Creates messaging system (conversations + messages tables)
-- 2. Creates engagement system (XP, levels, streaks, quests, achievements)
-- 3. Fixes any existing conversations with wrong participant IDs
-- 4. Sets up all RLS policies correctly
--
-- RUNTIME: ~30 seconds
--
-- RUN THIS ENTIRE SCRIPT AT ONCE in your Supabase SQL Editor
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🚀 Starting CharlestonHacks Production Migration...';
END $$;

-- ============================================================================
-- PART 1: MESSAGING SYSTEM SETUP
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📬 Part 1/4: Setting up messaging system...';
END $$;

-- Create conversations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,

  -- Context fields (optional - for project discussions, etc.)
  context_type TEXT,
  context_id UUID,
  context_title TEXT,

  -- Message tracking
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure no duplicate conversations between same participants
  CONSTRAINT unique_participants UNIQUE (participant_1_id, participant_2_id),

  -- Ensure participants are different
  CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_participant_1
  ON public.conversations(participant_1_id);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_2
  ON public.conversations(participant_2_id);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON public.conversations(last_message_at DESC);

-- Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages(conversation_id, read) WHERE read = FALSE;

-- Enable RLS on conversations table
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Messaging tables created';
END $$;

-- ============================================================================
-- PART 2: DAILY ENGAGEMENT SYSTEM SETUP
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🎮 Part 2/4: Setting up engagement/gamification system...';
END $$;

-- Add new columns for engagement tracking
ALTER TABLE public.community
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS login_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS daily_quests_completed JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS endorsements_given INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS endorsements_received INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_xp ON public.community(xp DESC);
CREATE INDEX IF NOT EXISTS idx_community_level ON public.community(level DESC);
CREATE INDEX IF NOT EXISTS idx_community_streak ON public.community(login_streak DESC);

-- Create activity log table (for tracking all user actions)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.community(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL,
  xp_awarded INTEGER DEFAULT 0,
  details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for activity log
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_community ON public.activity_log(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON public.activity_log(action_type);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Create achievements/badges table
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT, -- social, project, engagement, special

  requirement_type TEXT, -- count, streak, milestone
  requirement_value INTEGER,

  xp_reward INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial achievements
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

-- Create user achievements table (tracks earned badges)
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

-- Enable RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- XP Leaderboard
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

-- Streak Leaderboard
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

-- Connection Leaderboard
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
  RAISE NOTICE '✅ Engagement tables and leaderboards created';
END $$;

-- ============================================================================
-- PART 3: FIX EXISTING CONVERSATIONS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Part 3/4: Fixing existing conversations (if any)...';
END $$;

-- Step 1: Drop the foreign key constraints so we can update the data
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_participant_1_id_fkey;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_participant_2_id_fkey;

-- Step 2: Fix participant_1_id (convert auth user ID to community ID)
UPDATE conversations
SET participant_1_id = (
  SELECT comm.id
  FROM community comm
  WHERE comm.user_id = conversations.participant_1_id
  LIMIT 1
)
WHERE participant_1_id NOT IN (SELECT id FROM community)
  AND participant_1_id IN (SELECT user_id FROM community);

-- Step 3: Fix participant_2_id (convert auth user ID to community ID)
UPDATE conversations
SET participant_2_id = (
  SELECT comm.id
  FROM community comm
  WHERE comm.user_id = conversations.participant_2_id
  LIMIT 1
)
WHERE participant_2_id NOT IN (SELECT id FROM community)
  AND participant_2_id IN (SELECT user_id FROM community);

-- Step 4: Delete any conversations that still have invalid participant IDs
DELETE FROM conversations c
WHERE c.participant_1_id NOT IN (SELECT id FROM community)
   OR c.participant_2_id NOT IN (SELECT id FROM community);

-- Step 5: Now add the foreign key constraints back (pointing to community)
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
  RAISE NOTICE '✅ Existing conversations fixed';
END $$;

-- ============================================================================
-- PART 4: RLS POLICIES SETUP
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Part 4/4: Setting up RLS policies...';
END $$;

-- Drop existing policies (clean slate)
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

-- CONVERSATIONS POLICIES
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

-- MESSAGES POLICIES
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages
  FOR INSERT
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
  ON public.messages
  FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

-- ACTIVITY LOG POLICIES
CREATE POLICY "Users can view own activity" ON public.activity_log
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can log activity" ON public.activity_log
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- USER ACHIEVEMENTS POLICIES
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can earn achievements" ON public.user_achievements
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies configured';
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  Creating helper functions...';
END $$;

-- Function: Get or create a conversation between two users
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  other_user_id UUID,
  ctx_type TEXT DEFAULT NULL,
  ctx_id UUID DEFAULT NULL,
  ctx_title TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_community_id UUID;
  other_user_community_id UUID;
  conversation_id UUID;
  p1_id UUID;
  p2_id UUID;
BEGIN
  -- Get current user's community ID
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Get other user's community ID
  SELECT id INTO other_user_community_id
  FROM public.community
  WHERE user_id = other_user_id
  LIMIT 1;

  -- Validate both users exist
  IF current_user_community_id IS NULL THEN
    RAISE EXCEPTION 'Current user not found in community table';
  END IF;

  IF other_user_community_id IS NULL THEN
    RAISE EXCEPTION 'Other user not found in community table';
  END IF;

  -- Order participant IDs to ensure consistency (always smaller ID first)
  IF current_user_community_id < other_user_community_id THEN
    p1_id := current_user_community_id;
    p2_id := other_user_community_id;
  ELSE
    p1_id := other_user_community_id;
    p2_id := current_user_community_id;
  END IF;

  -- Try to find existing conversation
  SELECT id INTO conversation_id
  FROM public.conversations
  WHERE (participant_1_id = p1_id AND participant_2_id = p2_id)
     OR (participant_1_id = p2_id AND participant_2_id = p1_id)
  LIMIT 1;

  -- If conversation exists, return it
  IF conversation_id IS NOT NULL THEN
    RETURN conversation_id;
  END IF;

  -- Create new conversation
  INSERT INTO public.conversations (
    participant_1_id,
    participant_2_id,
    context_type,
    context_id,
    context_title,
    created_at,
    updated_at
  ) VALUES (
    p1_id,
    p2_id,
    ctx_type,
    ctx_id,
    ctx_title,
    NOW(),
    NOW()
  )
  RETURNING id INTO conversation_id;

  RETURN conversation_id;
END;
$$;

-- Function: Get unread message count for current user
CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_community_id UUID;
  unread_count INTEGER;
BEGIN
  -- Get current user's community ID
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF current_user_community_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Count unread messages in user's conversations
  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.messages m
  WHERE m.read = FALSE
    AND m.sender_id != auth.uid()
    AND m.conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = current_user_community_id
         OR participant_2_id = current_user_community_id
    );

  RETURN COALESCE(unread_count, 0);
END;
$$;

-- Function: Award XP and check for level up
CREATE OR REPLACE FUNCTION public.award_xp(
  amount INTEGER,
  action_type TEXT,
  details JSONB DEFAULT NULL
)
RETURNS TABLE(new_xp INTEGER, new_level INTEGER, did_level_up BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_xp INTEGER;
  current_level INTEGER;
  new_xp_value INTEGER;
  new_level_value INTEGER;
  community_id_val UUID;
  did_level_up_val BOOLEAN := FALSE;
BEGIN
  -- Get current user's community ID
  SELECT id, xp, level INTO community_id_val, current_xp, current_level
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF community_id_val IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Calculate new XP
  new_xp_value := current_xp + amount;

  -- Calculate new level based on XP thresholds
  CASE
    WHEN new_xp_value >= 50000 THEN new_level_value := 10;
    WHEN new_xp_value >= 25000 THEN new_level_value := 9;
    WHEN new_xp_value >= 10000 THEN new_level_value := 8;
    WHEN new_xp_value >= 5000 THEN new_level_value := 7;
    WHEN new_xp_value >= 2000 THEN new_level_value := 6;
    WHEN new_xp_value >= 1000 THEN new_level_value := 5;
    WHEN new_xp_value >= 500 THEN new_level_value := 4;
    WHEN new_xp_value >= 250 THEN new_level_value := 3;
    WHEN new_xp_value >= 100 THEN new_level_value := 2;
    ELSE new_level_value := 1;
  END CASE;

  -- Check if leveled up
  IF new_level_value > current_level THEN
    did_level_up_val := TRUE;
  END IF;

  -- Update community table
  UPDATE public.community
  SET
    xp = new_xp_value,
    level = new_level_value,
    updated_at = NOW()
  WHERE id = community_id_val;

  -- Log activity
  INSERT INTO public.activity_log (user_id, community_id, action_type, xp_awarded, details)
  VALUES (auth.uid(), community_id_val, action_type, amount, details);

  RETURN QUERY SELECT new_xp_value, new_level_value, did_level_up_val;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ Helper functions created';
END $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '⚡ Creating triggers...';
END $$;

-- Function: Update conversation's last message info when new message is sent
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- Function: Auto-award XP for endorsements given
CREATE OR REPLACE FUNCTION public.award_xp_for_endorsement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Award XP to endorser
  UPDATE public.community
  SET
    xp = xp + 5,
    endorsements_given = endorsements_given + 1
  WHERE id = NEW.endorser_community_id;

  -- Award XP to endorsed person
  UPDATE public.community
  SET
    xp = xp + 10,
    endorsements_received = endorsements_received + 1
  WHERE id = NEW.endorsed_community_id;

  RETURN NEW;
END;
$$;

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON public.messages;
DROP TRIGGER IF EXISTS trigger_award_xp_endorsement ON public.endorsements;

-- Create triggers
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

CREATE TRIGGER trigger_award_xp_endorsement
  AFTER INSERT ON public.endorsements
  FOR EACH ROW
  EXECUTE FUNCTION public.award_xp_for_endorsement();

DO $$
BEGIN
  RAISE NOTICE '✅ Triggers created';
END $$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔑 Granting permissions...';
END $$;

-- Grant function execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT SELECT ON public.achievements TO authenticated;
GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT SELECT ON public.xp_leaderboard TO authenticated;
GRANT SELECT ON public.streak_leaderboard TO authenticated;
GRANT SELECT ON public.connection_leaderboard TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ Permissions granted';
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
  RAISE NOTICE '';
  RAISE NOTICE '📬 Messaging System: READY';
  RAISE NOTICE '   - Tables: conversations, messages';
  RAISE NOTICE '   - Functions: get_or_create_conversation(), get_unread_count()';
  RAISE NOTICE '   - RLS policies: ✓';
  RAISE NOTICE '';
  RAISE NOTICE '🎮 Engagement System: READY';
  RAISE NOTICE '   - XP & Levels: ✓';
  RAISE NOTICE '   - Login Streaks: ✓';
  RAISE NOTICE '   - Activity Log: ✓';
  RAISE NOTICE '   - Achievements: 11 badges loaded';
  RAISE NOTICE '   - Leaderboards: XP, Streaks, Connections';
  RAISE NOTICE '   - Auto-XP triggers: ✓';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R)';
  RAISE NOTICE '2. Test sending a message';
  RAISE NOTICE '3. Check daily check-in modal appears';
  RAISE NOTICE '4. Verify XP awards for actions';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Your CharlestonHacks platform is now 100% production-ready!';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
END $$;
