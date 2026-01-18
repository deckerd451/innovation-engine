DO $$
BEGIN
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