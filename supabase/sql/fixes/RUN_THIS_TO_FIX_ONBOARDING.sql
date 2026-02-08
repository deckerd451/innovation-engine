-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ================================================================
-- FIX ONBOARDING NEXT BUTTON - Complete Solution
-- ================================================================
-- Run this entire file in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/hvmotpzhliufzomewzfl/sql/new
-- ================================================================

-- ================================================================
-- STEP 1: Ensure onboarding columns exist
-- ================================================================

ALTER TABLE community
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- ================================================================
-- STEP 2: Create/Update update_onboarding_step function
-- ================================================================

CREATE OR REPLACE FUNCTION update_onboarding_step(auth_user_id UUID, step_number INTEGER)
RETURNS JSON AS $$
DECLARE
  user_community_id UUID;
BEGIN
  -- Get community ID
  SELECT id INTO user_community_id
  FROM community
  WHERE user_id = auth_user_id
  LIMIT 1;

  IF user_community_id IS NULL THEN
    RETURN json_build_object('error', 'Profile not found', 'success', false);
  END IF;

  -- Update step
  UPDATE community
  SET
    onboarding_step = step_number,
    onboarding_started_at = COALESCE(onboarding_started_at, NOW())
  WHERE id = user_community_id;

  RETURN json_build_object('success', true, 'step', step_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 3: Create/Update complete_onboarding function
-- ================================================================

CREATE OR REPLACE FUNCTION complete_onboarding(auth_user_id UUID)
RETURNS JSON AS $$
DECLARE
  user_community_id UUID;
BEGIN
  -- Get community ID
  SELECT id INTO user_community_id
  FROM community
  WHERE user_id = auth_user_id
  LIMIT 1;

  IF user_community_id IS NULL THEN
    RETURN json_build_object('error', 'Profile not found', 'success', false);
  END IF;

  -- Mark onboarding as complete
  UPDATE community
  SET
    onboarding_completed = true,
    onboarding_completed_at = NOW(),
    onboarding_step = 100
  WHERE id = user_community_id;

  RETURN json_build_object('success', true, 'message', 'Onboarding completed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 4: Grant execute permissions
-- ================================================================

GRANT EXECUTE ON FUNCTION update_onboarding_step(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_onboarding(UUID) TO authenticated;

-- ================================================================
-- STEP 5: Verify columns exist
-- ================================================================

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'community'
AND column_name IN (
  'onboarding_completed',
  'onboarding_step',
  'onboarding_started_at',
  'onboarding_completed_at'
)
ORDER BY column_name;

-- ================================================================
-- SUCCESS!
-- ================================================================
-- If you see 4 rows above, the fix is complete.
-- The "Next" button should now work properly.
-- ================================================================
