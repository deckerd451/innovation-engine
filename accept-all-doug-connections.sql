-- Accept all of Doug Hamilton's pending connections
-- This will convert pending connections to accepted status

-- First, let's see what we're about to change
SELECT 
  c1.name as from_user,
  c2.name as to_user,
  conn.status,
  conn.created_at
FROM connections conn
JOIN community c1 ON conn.from_user_id = c1.id
JOIN community c2 ON conn.to_user_id = c2.id
WHERE c1.name = 'Doug Hamilton' 
  AND conn.status = 'pending'
ORDER BY conn.created_at DESC;

-- Now accept all of Doug's pending connections
UPDATE connections
SET status = 'accepted', updated_at = NOW()
WHERE from_user_id = (SELECT id FROM community WHERE name = 'Doug Hamilton' LIMIT 1)
  AND status = 'pending';

-- Also accept any pending connections TO Doug
UPDATE connections
SET status = 'accepted', updated_at = NOW()
WHERE to_user_id = (SELECT id FROM community WHERE name = 'Doug Hamilton' LIMIT 1)
  AND status = 'pending';

-- The trigger should automatically update connection_count, but let's force it just in case
UPDATE community
SET connection_count = (
  SELECT COUNT(*)
  FROM connections
  WHERE (connections.from_user_id = community.id OR connections.to_user_id = community.id)
  AND connections.status = 'accepted'
)
WHERE name = 'Doug Hamilton';

-- Verify Doug's connection count
SELECT 
  name,
  connection_count,
  (
    SELECT COUNT(*) 
    FROM connections conn
    WHERE (conn.from_user_id = community.id OR conn.to_user_id = community.id)
    AND conn.status = 'accepted'
  ) as actual_accepted_count
FROM community
WHERE name = 'Doug Hamilton';

-- Show all of Doug's accepted connections
SELECT 
  c1.name as from_user,
  c2.name as to_user,
  conn.status,
  conn.created_at
FROM connections conn
JOIN community c1 ON conn.from_user_id = c1.id
JOIN community c2 ON conn.to_user_id = c2.id
WHERE (c1.name = 'Doug Hamilton' OR c2.name = 'Doug Hamilton')
  AND conn.status = 'accepted'
ORDER BY conn.created_at DESC;
