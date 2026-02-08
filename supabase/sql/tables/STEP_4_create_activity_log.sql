-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


DO $$
BEGIN
  RAISE NOTICE '📊 Checking activity_log table...';
END $$;

-- Table already exists with columns: auth_user_id, community_user_id
-- Just add indexes if missing
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_log(auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_community ON public.activity_log(community_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON public.activity_log(action_type);

-- Ensure RLS is enabled
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ activity_log indexes created';
END $$;
