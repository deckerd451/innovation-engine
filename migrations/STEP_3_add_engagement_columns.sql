DO $$
BEGIN
  RAISE NOTICE '🎮 Adding engagement columns (if missing)...';
END $$;

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
