# Phase 4: Test Commands Reference

## Database Setup Commands

### 1. Check if Beacon Exists
```sql
SELECT 
  id,
  beacon_key,
  label,
  kind,
  is_active,
  created_at
FROM beacons 
WHERE beacon_key = 'MOONSIDE-S1';
```

### 2. Create Beacon if Missing
```sql
INSERT INTO beacons (
  beacon_key,
  label,
  kind,
  is_active
) VALUES (
  'MOONSIDE-S1',
  'CharlestonHacks Test Event',
  'event',
  true
);
```

### 3. Check Community Profile
```sql
-- Replace <auth-user-id> with your actual auth user ID
SELECT 
  id,
  user_id,
  name,
  created_at
FROM community 
WHERE user_id = '<auth-user-id>';
```

### 4. Create Community Profile if Missing
```sql
-- Replace <auth-user-id> with your actual auth user ID
INSERT INTO community (
  user_id,
  name
) VALUES (
  '<auth-user-id>',
  'Test User'
);
```

## Validation Queries

### 1. Check Recent Presence Sessions
```sql
SELECT 
  id,
  user_id,
  context_type,
  context_id,
  energy,
  created_at
FROM presence_sessions
WHERE context_type = 'beacon'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

### 2. Check Presence Sessions for Specific User
```sql
-- Replace <community-id> with your community ID
SELECT 
  id,
  context_type,
  context_id,
  energy,
  created_at
FROM presence_sessions
WHERE user_id = '<community-id>'
  AND context_type = 'beacon'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

### 3. Check Presence Sessions for MOONSIDE-S1
```sql
-- First get the beacon ID
SELECT id FROM beacons WHERE beacon_key = 'MOONSIDE-S1';

-- Then query presence sessions (replace <beacon-id>)
SELECT 
  user_id,
  energy,
  created_at
FROM presence_sessions
WHERE context_type = 'beacon'
  AND context_id = '<beacon-id>'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

### 4. Count Heartbeats
```sql
-- Replace <community-id> and <beacon-id>
SELECT 
  COUNT(*) as heartbeat_count,
  MIN(created_at) as first_write,
  MAX(created_at) as last_write,
  MAX(created_at) - MIN(created_at) as duration
FROM presence_sessions
WHERE user_id = '<community-id>'
  AND context_type = 'beacon'
  AND context_id = '<beacon-id>'
  AND created_at > NOW() - INTERVAL '10 minutes';
```

### 5. Verify Heartbeat Intervals
```sql
-- Replace <community-id> and <beacon-id>
SELECT 
  created_at,
  LAG(created_at) OVER (ORDER BY created_at) as previous_write,
  EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) as seconds_since_last
FROM presence_sessions
WHERE user_id = '<community-id>'
  AND context_type = 'beacon'
  AND context_id = '<beacon-id>'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

## Cleanup Commands

### 1. Delete Test Presence Sessions
```sql
-- Delete all presence sessions from last hour
DELETE FROM presence_sessions
WHERE created_at > NOW() - INTERVAL '1 hour';
```

### 2. Delete Specific User's Presence Sessions
```sql
-- Replace <community-id>
DELETE FROM presence_sessions
WHERE user_id = '<community-id>'
  AND created_at > NOW() - INTERVAL '1 hour';
```

### 3. Delete Beacon-Specific Presence Sessions
```sql
-- Replace <beacon-id>
DELETE FROM presence_sessions
WHERE context_type = 'beacon'
  AND context_id = '<beacon-id>'
  AND created_at > NOW() - INTERVAL '1 hour';
```

## Troubleshooting Queries

### 1. Find Your Auth User ID
```sql
-- After signing in, check auth.users table
SELECT id, email FROM auth.users WHERE email = '<your-email>';
```

### 2. Find Your Community ID
```sql
-- Replace <auth-user-id>
SELECT id FROM community WHERE user_id = '<auth-user-id>';
```

### 3. Find Beacon ID
```sql
SELECT id FROM beacons WHERE beacon_key = 'MOONSIDE-S1';
```

### 4. Check All Active Beacons
```sql
SELECT 
  id,
  beacon_key,
  label,
  kind,
  is_active
FROM beacons
WHERE is_active = true
ORDER BY created_at DESC;
```

### 5. Check RLS Policies on presence_sessions
```sql
-- Check if you can insert
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'presence_sessions';
```

## Quick Test Script

Copy and paste this into your SQL client, replacing placeholders:

```sql
-- Step 1: Setup
DO $$
DECLARE
  v_auth_user_id UUID := '<your-auth-user-id>'; -- REPLACE THIS
  v_community_id UUID;
  v_beacon_id UUID;
BEGIN
  -- Check/create community profile
  SELECT id INTO v_community_id 
  FROM community 
  WHERE user_id = v_auth_user_id;
  
  IF v_community_id IS NULL THEN
    INSERT INTO community (user_id, name)
    VALUES (v_auth_user_id, 'Test User')
    RETURNING id INTO v_community_id;
    RAISE NOTICE 'Created community profile: %', v_community_id;
  ELSE
    RAISE NOTICE 'Community profile exists: %', v_community_id;
  END IF;
  
  -- Check/create beacon
  SELECT id INTO v_beacon_id
  FROM beacons
  WHERE beacon_key = 'MOONSIDE-S1';
  
  IF v_beacon_id IS NULL THEN
    INSERT INTO beacons (beacon_key, label, kind, is_active)
    VALUES ('MOONSIDE-S1', 'CharlestonHacks Test Event', 'event', true)
    RETURNING id INTO v_beacon_id;
    RAISE NOTICE 'Created beacon: %', v_beacon_id;
  ELSE
    RAISE NOTICE 'Beacon exists: %', v_beacon_id;
  END IF;
  
  -- Output IDs for reference
  RAISE NOTICE 'Community ID: %', v_community_id;
  RAISE NOTICE 'Beacon ID: %', v_beacon_id;
END $$;

-- Step 2: Monitor presence sessions
SELECT 
  user_id,
  context_id,
  energy,
  created_at
FROM presence_sessions
WHERE context_type = 'beacon'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

## Console Log Grep Patterns

If testing on device with console access:

```bash
# Filter for Presence logs only
log stream --predicate 'eventMessage CONTAINS "[Presence]"' --level debug

# Filter for all Phase 4 logs
log stream --predicate 'eventMessage CONTAINS "[Presence]" OR eventMessage CONTAINS "[CONFIDENCE]"' --level debug

# Filter for errors only
log stream --predicate 'eventMessage CONTAINS "[Presence]" AND eventMessage CONTAINS "failed"' --level error
```

## Expected Timeline

```
T+0s:   App launch, sign in
T+5s:   Navigate to Event Mode, toggle ON
T+8s:   Beacon detected, confidence building
T+11s:  Stable beacon achieved
T+12s:  Community ID resolved
T+13s:  Beacon ID resolved
T+14s:  Initial presence write
T+39s:  First heartbeat (25s after initial)
T+64s:  Second heartbeat (25s after first)
T+89s:  Third heartbeat (25s after second)
T+100s: Move away from beacon
T+110s: Grace period expires, heartbeat stopped
```

## Success Metrics

After 2 minutes of stable beacon:
- Expected presence writes: 4-5 (initial + 3-4 heartbeats)
- Expected interval: ~25 seconds between writes
- Expected energy range: 0.3 - 0.8 (depending on distance)
- Expected context_type: "beacon" (all rows)
- Expected context_id: same beacon UUID (all rows)
- Expected user_id: same community UUID (all rows)
