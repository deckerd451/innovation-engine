-- ============================================================================
-- DIAGNOSTIC: Check Community Table Schema
-- ============================================================================
-- Run this FIRST to see what columns exist in your community table
-- ============================================================================

-- Check all columns in the community table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'community'
ORDER BY ordinal_position;

-- Check foreign keys on community table
SELECT
  con.conname AS constraint_name,
  att.attname AS column_name,
  frel.relname AS references_table
FROM pg_constraint con
JOIN pg_class rel ON con.conrelid = rel.oid
JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
LEFT JOIN pg_class frel ON con.confrelid = frel.oid
WHERE rel.relname = 'community'
  AND con.contype = 'f'
ORDER BY con.conname;
