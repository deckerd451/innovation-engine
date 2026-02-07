-- Check the notify_connection_accepted function definition
SELECT 
    routine_name,
    routine_definition
FROM 
    information_schema.routines
WHERE 
    routine_schema = 'public'
    AND routine_name IN ('notify_connection_accepted', 'update_connection_count');
