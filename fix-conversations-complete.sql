-- ============================================================================
-- COMPLETE FIX FOR CONVERSATIONS
-- ============================================================================
-- This script:
-- 1. Drops foreign key constraints
-- 2. Fixes all participant IDs (auth.users(id) → community.id)
-- 3. Adds foreign key constraints back
--
-- Run this ENTIRE script at once in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Drop the foreign key constraints so we can update the data
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_participant_1_id_fkey;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_participant_2_id_fkey;

-- Step 2: Show what needs fixing
SELECT
  c.id,
  c.participant_1_id,
  c.participant_2_id,
  CASE
    WHEN p1.id IS NULL THEN 'participant_1_id needs fix'
    ELSE 'participant_1_id OK'
  END as p1_status,
  CASE
    WHEN p2.id IS NULL THEN 'participant_2_id needs fix'
    ELSE 'participant_2_id OK'
  END as p2_status
FROM conversations c
LEFT JOIN community p1 ON c.participant_1_id = p1.id
LEFT JOIN community p2 ON c.participant_2_id = p2.id;

-- Step 3: Fix participant_1_id (convert auth user ID to community ID)
UPDATE conversations
SET participant_1_id = (
  SELECT comm.id
  FROM community comm
  WHERE comm.user_id = conversations.participant_1_id
  LIMIT 1
)
WHERE participant_1_id NOT IN (SELECT id FROM community)
  AND participant_1_id IN (SELECT user_id FROM community);

-- Step 4: Fix participant_2_id (convert auth user ID to community ID)
UPDATE conversations
SET participant_2_id = (
  SELECT comm.id
  FROM community comm
  WHERE comm.user_id = conversations.participant_2_id
  LIMIT 1
)
WHERE participant_2_id NOT IN (SELECT id FROM community)
  AND participant_2_id IN (SELECT user_id FROM community);

-- Step 5: Delete any conversations that still have invalid participant IDs
-- (These are orphaned conversations where the users don't exist in community table)
DELETE FROM conversations c
WHERE c.participant_1_id NOT IN (SELECT id FROM community)
   OR c.participant_2_id NOT IN (SELECT id FROM community);

-- Step 6: Verify all conversations now have valid community IDs
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

-- Step 7: Now add the foreign key constraints back (pointing to community)
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

-- Step 8: Verify constraints are correct
SELECT
  con.conname AS constraint_name,
  rel.relname AS table_name,
  att.attname AS column_name,
  frel.relname AS references_table
FROM pg_constraint con
JOIN pg_class rel ON con.conrelid = rel.oid
JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
LEFT JOIN pg_class frel ON con.confrelid = frel.oid
WHERE rel.relname = 'conversations'
  AND con.contype = 'f'
ORDER BY con.conname;

-- ============================================================================
-- DONE!
-- ============================================================================
-- All conversations now have correct community IDs as participants
-- Foreign keys now point to community table
--
-- Next steps:
-- 1. Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R)
-- 2. Try sending a message!
-- ============================================================================
