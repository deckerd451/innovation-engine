-- ============================================================================
-- DAILY ENGAGEMENT SYSTEM DATABASE SETUP
-- ============================================================================
-- Adds gamification, XP, levels, streaks, and quest tracking

-- ============================================================================
-- 1. ADD ENGAGEMENT COLUMNS TO COMMUNITY TABLE
-- ============================================================================

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

-- ============================================================================
-- 2. CREATE ACTIVITY LOG TABLE (for tracking all user actions)
-- ============================================================================

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

-- Policy: Users can view their own activity
CREATE POLICY "Users can view own activity" ON public.activity_log
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: System can insert activity
CREATE POLICY "System can log activity" ON public.activity_log
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 3. CREATE ACHIEVEMENTS/BADGES TABLE
-- ============================================================================

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

-- ============================================================================
-- 4. CREATE USER ACHIEVEMENTS TABLE (tracks earned badges)
-- ============================================================================

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

-- Policy: Users can view their own achievements
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can earn achievements
CREATE POLICY "Users can earn achievements" ON public.user_achievements
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 5. CREATE LEADERBOARD VIEWS
-- ============================================================================

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

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.award_xp TO authenticated;

-- ============================================================================
-- 7. TRIGGERS FOR AUTO XP AWARDS
-- ============================================================================

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

-- Create trigger for endorsements
DROP TRIGGER IF EXISTS trigger_award_xp_endorsement ON public.endorsements;
CREATE TRIGGER trigger_award_xp_endorsement
  AFTER INSERT ON public.endorsements
  FOR EACH ROW
  EXECUTE FUNCTION public.award_xp_for_endorsement();

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.activity_log TO authenticated;
GRANT INSERT ON public.activity_log TO authenticated;

GRANT SELECT ON public.achievements TO authenticated;
GRANT SELECT ON public.user_achievements TO authenticated;
GRANT INSERT ON public.user_achievements TO authenticated;

GRANT SELECT ON public.xp_leaderboard TO authenticated;
GRANT SELECT ON public.streak_leaderboard TO authenticated;
GRANT SELECT ON public.connection_leaderboard TO authenticated;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Daily Engagement System Setup Complete!';
  RAISE NOTICE 'Added: XP, levels, streaks to community table';
  RAISE NOTICE 'Created: activity_log, achievements, user_achievements tables';
  RAISE NOTICE 'Created: Leaderboard views (XP, streaks, connections)';
  RAISE NOTICE 'Created: award_xp() function and auto-XP triggers';
END $$;
