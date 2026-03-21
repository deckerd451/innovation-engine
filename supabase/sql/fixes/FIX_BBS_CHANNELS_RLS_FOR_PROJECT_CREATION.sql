-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- FIX: bbs_channels RLS blocking project creation
--
-- The trigger auto_create_project_channel calls create_project_channel()
-- on every INSERT into projects. It runs as the authenticated (calling)
-- user, who is blocked by RLS on bbs_channels (no INSERT policy).
--
-- Fix A (preferred): ALTER the trigger function to SECURITY DEFINER
--   so it runs with the function owner's privileges, bypassing RLS.
-- Fix B (belt-and-suspenders): add an INSERT policy on bbs_channels
--   for authenticated users.
-- ================================================================

DO $$ BEGIN RAISE NOTICE '🔧 Applying create_project_channel SECURITY DEFINER fix...'; END $$;

-- ----------------------------------------------------------------
-- FIX A: Change create_project_channel to SECURITY DEFINER
-- This is safe — it only changes who the function runs as;
-- the existing function body is left completely untouched.
-- ----------------------------------------------------------------
ALTER FUNCTION public.create_project_channel() SECURITY DEFINER;

-- Lock down search_path to prevent privilege escalation
ALTER FUNCTION public.create_project_channel() SET search_path = public;

DO $$ BEGIN RAISE NOTICE '✅ create_project_channel is now SECURITY DEFINER'; END $$;

-- ----------------------------------------------------------------
-- FIX B: Belt-and-suspenders INSERT policy on bbs_channels
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS public.bbs_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can create bbs channels" ON public.bbs_channels;
CREATE POLICY "Authenticated users can create bbs channels"
  ON public.bbs_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add SELECT policy only if none exists yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bbs_channels' AND cmd = 'SELECT'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can view bbs channels"
        ON public.bbs_channels
        FOR SELECT
        TO authenticated
        USING (true);
    $policy$;
    RAISE NOTICE '✅ Added SELECT policy for bbs_channels';
  ELSE
    RAISE NOTICE 'ℹ️  SELECT policy already exists on bbs_channels – skipped';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------
SELECT
  p.proname AS function_name,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_project_channel';

DO $$ BEGIN RAISE NOTICE '✅ Done. Project creation should now succeed.'; END $$;
