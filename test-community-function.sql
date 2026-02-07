-- Check if the function exists
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM 
    information_schema.routines
WHERE 
    routine_schema = 'public'
    AND routine_name = 'get_community_id_from_auth';

-- Test the function (run this while logged in as your user)
SELECT get_community_id_from_auth() as my_community_id;

-- Also check what your auth.uid() returns
SELECT auth.uid() as my_auth_uid;

-- Check if you have a community record
SELECT id, user_id, name, email 
FROM community 
WHERE user_id = auth.uid();
