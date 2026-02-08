-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- Quick check to see what columns exist in community table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'community'
ORDER BY ordinal_position;
