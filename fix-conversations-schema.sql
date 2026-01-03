-- ============================================================================
-- FIX CONVERSATIONS TABLE SCHEMA
-- ============================================================================
-- This script fixes the foreign key constraints on the conversations table
-- to point to community(id) instead of auth.users(id)
--
-- Run this in your Supabase SQL Editor FIRST, then run fix-existing-conversations.sql
-- ============================================================================

-- Step 1: Drop the old incorrect foreign key constraints
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_participant_1_id_fkey;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_participant_2_id_fkey;

-- Step 2: Add the correct foreign key constraints pointing to community(id)
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

-- Step 3: Verify the constraints are correct
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  rel.relname AS table_name,
  att.attname AS column_name,
  frel.relname AS foreign_table_name
FROM pg_constraint con
JOIN pg_class rel ON con.conrelid = rel.oid
JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
LEFT JOIN pg_class frel ON con.confrelid = frel.oid
WHERE rel.relname = 'conversations'
  AND con.contype = 'f'
ORDER BY con.conname;

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- Now the constraints point to community(id) as they should.
-- Next step: Run fix-existing-conversations.sql to update the participant IDs
-- ============================================================================
