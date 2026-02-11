-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- First, let's see your current connections
SELECT 
    c.id,
    c.status,
    c.created_at,
    sender.name as sender_name,
    receiver.name as receiver_name
FROM 
    connections c
    JOIN community sender ON c.from_user_id = sender.id
    JOIN community receiver ON c.to_user_id = receiver.id
WHERE 
    c.from_user_id = 'd7dde758-1438-4bcd-af13-d83b955c1f95'  -- Your community ID (Doug Hamilton)
    OR c.to_user_id = 'd7dde758-1438-4bcd-af13-d83b955c1f95'
ORDER BY 
    c.created_at DESC;

-- To delete a specific connection (uncomment and replace the ID):
-- DELETE FROM connections WHERE id = 'connection-id-here';

-- To delete ALL your pending connections (use carefully):
-- DELETE FROM connections 
-- WHERE (from_user_id = 'd7dde758-1438-4bcd-af13-d83b955c1f95' 
--        OR to_user_id = 'd7dde758-1438-4bcd-af13-d83b955c1f95')
-- AND status = 'pending';
