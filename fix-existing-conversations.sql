-- ============================================================================
-- FIX EXISTING CONVERSATIONS
-- ============================================================================
-- This script fixes conversations that were created with auth.users(id)
-- in participant fields instead of community.id
--
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Check which conversations need fixing
-- (This will show conversations where participant IDs don't match any community.id)
SELECT
  c.id,
  c.participant_1_id,
  c.participant_2_id,
  CASE
    WHEN p1.id IS NULL THEN 'participant_1_id is NOT a community ID (needs fix)'
    ELSE 'participant_1_id is OK'
  END as p1_status,
  CASE
    WHEN p2.id IS NULL THEN 'participant_2_id is NOT a community ID (needs fix)'
    ELSE 'participant_2_id is OK'
  END as p2_status
FROM conversations c
LEFT JOIN community p1 ON c.participant_1_id = p1.id
LEFT JOIN community p2 ON c.participant_2_id = p2.id
WHERE p1.id IS NULL OR p2.id IS NULL;

-- Step 2: Fix conversations by updating participant IDs from auth.users(id) to community.id
-- This updates participant_1_id
UPDATE conversations c
SET participant_1_id = (
  SELECT comm.id
  FROM community comm
  WHERE comm.user_id = c.participant_1_id
  LIMIT 1
)
WHERE c.participant_1_id NOT IN (SELECT id FROM community)
  AND c.participant_1_id IN (SELECT user_id FROM community);

-- This updates participant_2_id
UPDATE conversations c
SET participant_2_id = (
  SELECT comm.id
  FROM community comm
  WHERE comm.user_id = c.participant_2_id
  LIMIT 1
)
WHERE c.participant_2_id NOT IN (SELECT id FROM community)
  AND c.participant_2_id IN (SELECT user_id FROM community);

-- Step 3: Verify the fix
SELECT
  c.id,
  c.participant_1_id,
  c.participant_2_id,
  p1.name as participant_1_name,
  p2.name as participant_2_name,
  'Fixed!' as status
FROM conversations c
JOIN community p1 ON c.participant_1_id = p1.id
JOIN community p2 ON c.participant_2_id = p2.id
ORDER BY c.created_at DESC;

-- ============================================================================
-- DONE!
-- ============================================================================
-- After running this script:
-- 1. Hard refresh your browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
-- 2. Try sending a message again
-- ============================================================================
