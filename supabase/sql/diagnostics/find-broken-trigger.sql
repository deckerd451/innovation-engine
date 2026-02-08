-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- Find all triggers on connections table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM 
    information_schema.triggers
WHERE 
    event_object_table = 'connections'
    AND event_object_schema = 'public';
