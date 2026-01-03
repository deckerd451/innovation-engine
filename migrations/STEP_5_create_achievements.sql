DO $$
BEGIN
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
