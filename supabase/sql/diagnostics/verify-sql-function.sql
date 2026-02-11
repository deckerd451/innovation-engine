-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- VERIFY SQL FUNCTION EXISTS
-- ================================================================
-- Run this in Supabase SQL Editor to check if the function exists
-- ================================================================

-- Check if function exists
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_name = 'get_start_sequence_data'
AND routine_schema = 'public';

-- If the above returns a row, the function exists
-- If it returns nothing, you need to create it

-- To see the function definition:
SELECT pg_get_functiondef('get_start_sequence_data(uuid)'::regprocedure);
