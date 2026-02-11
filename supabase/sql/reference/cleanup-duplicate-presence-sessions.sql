-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- Cleanup Duplicate Presence Sessions
-- 
-- This script removes duplicate presence sessions for the same user,
-- keeping only the most recent session for each user.

-- Step 1: View duplicate sessions (for verification)
SELECT 
  user_id,
  COUNT(*) as session_count,
  ARRAY_AGG(id ORDER BY last_seen DESC) as session_ids,
  MAX(last_seen) as most_recent
FROM presence_sessions
WHERE is_active = true
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY session_count DESC;

-- Step 2: Delete duplicate sessions (keeps most recent for each user)
-- This uses a CTE to identify which sessions to keep
WITH sessions_to_keep AS (
  SELECT DISTINCT ON (user_id) 
    id
  FROM presence_sessions
  WHERE is_active = true
  ORDER BY user_id, last_seen DESC
)
DELETE FROM presence_sessions
WHERE is_active = true
  AND id NOT IN (SELECT id FROM sessions_to_keep);

-- Step 3: Verify cleanup (should show 0 or 1 session per user)
SELECT 
  user_id,
  COUNT(*) as session_count,
  MAX(last_seen) as most_recent
FROM presence_sessions
WHERE is_active = true
GROUP BY user_id
ORDER BY session_count DESC;

-- Step 4: Show remaining active sessions with user info
SELECT 
  c.name,
  c.email,
  ps.last_seen,
  NOW() - ps.last_seen as idle_time,
  CASE 
    WHEN ps.last_seen > NOW() - INTERVAL '10 minutes' THEN '🟢 ONLINE'
    ELSE '⚪ OFFLINE'
  END as status
FROM presence_sessions ps
JOIN community c ON ps.user_id = c.id
WHERE ps.is_active = true
ORDER BY ps.last_seen DESC;
