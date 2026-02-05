-- Fix Connection Count Issue
-- This script recalculates connection_count for all users

-- Step 1: Check current connection counts
SELECT 
  c.id,
  c.name,
  c.email,
  c.connection_count as current_count,
  (
    SELECT COUNT(*) 
    FROM connections conn
    WHERE (conn.from_user_id = c.id OR conn.to_user_id = c.id)
    AND conn.status = 'accepted'
  ) as actual_count
FROM community c
WHERE c.user_id IS NOT NULL
ORDER BY c.name;

-- Step 2: Update all connection counts
UPDATE community
SET connection_count = (
  SELECT COUNT(*)
  FROM connections
  WHERE (connections.from_user_id = community.id OR connections.to_user_id = community.id)
  AND connections.status = 'accepted'
);

-- Step 3: Verify the fix
SELECT 
  c.id,
  c.name,
  c.email,
  c.connection_count,
  (
    SELECT COUNT(*) 
    FROM connections conn
    WHERE (conn.from_user_id = c.id OR conn.to_user_id = c.id)
    AND conn.status = 'accepted'
  ) as verified_count
FROM community c
WHERE c.user_id IS NOT NULL
ORDER BY c.name;

-- Step 4: Check for any pending or rejected connections
SELECT 
  c1.name as from_user,
  c2.name as to_user,
  conn.status,
  conn.created_at
FROM connections conn
JOIN community c1 ON conn.from_user_id = c1.id
JOIN community c2 ON conn.to_user_id = c2.id
WHERE conn.status != 'accepted'
ORDER BY conn.created_at DESC;
