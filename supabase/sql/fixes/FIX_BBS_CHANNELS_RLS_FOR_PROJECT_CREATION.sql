-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- FIX: bbs_channels RLS blocking project creation trigger
--
-- When a project is created, a database trigger fires and attempts
-- to insert a row into bbs_channels. The trigger runs under the
-- calling user's permissions, which are blocked by RLS on bbs_channels.
--
-- This script:
--   1. Diagnoses what trigger(s) exist on the projects table
--   2. Fixes the RLS policy on bbs_channels so authenticated users
--      can insert rows (the trigger fires as the authenticated user)
--   3. Makes the trigger function SECURITY DEFINER if found, so it
--      runs with elevated privileges instead of the caller's session
-- ================================================================

DO $$ BEGIN RAISE NOTICE '🔍 Diagnosing project creation trigger...'; END $$;

-- Show all triggers on the projects table
SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table  = 'projects';

-- ----------------------------------------------------------------
-- STEP 1: Ensure bbs_channels has RLS enabled
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS public.bbs_channels ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- STEP 2: Add INSERT policy so authenticated users (and triggers
--         running as authenticated users) can create channels
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create bbs channels" ON public.bbs_channels;

CREATE POLICY "Authenticated users can create bbs channels"
  ON public.bbs_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ----------------------------------------------------------------
-- STEP 3: Ensure authenticated users can read their channels
--         (add only if no SELECT policy exists)
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bbs_channels'
      AND cmd = 'SELECT'
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
-- STEP 4: If the trigger function is known, recreate it as
--         SECURITY DEFINER so it bypasses RLS entirely.
--         Replace <trigger_function_name> with the actual name
--         found in the SELECT output above.
-- ----------------------------------------------------------------
-- Example (uncomment and fill in after running the diagnostic SELECT above):
--
-- CREATE OR REPLACE FUNCTION public.<trigger_function_name>()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $func$
-- BEGIN
--   -- (paste existing trigger body here)
--   RETURN NEW;
-- END;
-- $func$;

DO $$ BEGIN RAISE NOTICE '✅ bbs_channels RLS fix applied. Project creation should now succeed.'; END $$;
