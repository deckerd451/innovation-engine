-- Check the notify_connection_request function definition
SELECT 
    routine_name,
    routine_definition
FROM 
    information_schema.routines
WHERE 
    routine_schema = 'public'
    AND routine_name = 'notify_connection_request';
