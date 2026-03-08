# Phase 4: Quick Validation Checklist

## Pre-Test Database Setup

```sql
-- 1. Verify beacon exists
SELECT id, beacon_key, label, is_active 
FROM beacons 
WHERE beacon_key = 'MOONSIDE-S1';

-- 2. If missing, create it
INSERT INTO beacons (beacon_key, label, kind, is_active)
VALUES ('MOONSIDE-S1', 'CharlestonHacks Test Event', 'event', true);

-- 3. Verify your community profile exists
SELECT id, user_id 
FROM community 
WHERE user_id = '<your-auth-user-id>';
```

## Quick Test Steps

1. **Launch & Sign In**
   - Open app → Sign in → Navigate to Event Mode

2. **Enable Event Mode**
   - Toggle ON → Wait 3 seconds near MOONSIDE-S1

3. **Watch Console for Success Pattern**
   ```
   [CONFIDENCE] ✅ STABLE BEACON ACHIEVED
   [Presence] beacon stable: MOONSIDE-S1
   [Presence] resolved community.id: <uuid>
   [Presence] found beacon in database: CharlestonHacks Test Event (<uuid>)
   [Presence] mapping beacon -> event: CharlestonHacks Test Event (<uuid>)
   [Presence] upsert presence session
   [Presence] presence write successful
   ```

4. **Verify Database**
   ```sql
   SELECT user_id, context_type, context_id, energy, created_at
   FROM presence_sessions
   WHERE context_type = 'beacon'
     AND created_at > NOW() - INTERVAL '1 minute'
   ORDER BY created_at DESC;
   ```

5. **Wait 25 Seconds**
   - Console should show: `[Presence] heartbeat refresh`
   - Database should have new row

6. **Test Beacon Loss**
   - Move away or turn off beacon
   - Console should show: `[Presence] stable beacon lost; waiting 10s grace period`
   - After 10s: `[Presence] heartbeat stopped`

## Expected Database Row

```
user_id:      <your-community-id>
context_type: "beacon"
context_id:   <beacon-id-from-beacons-table>
energy:       0.0 to 1.0 (normalized RSSI)
created_at:   <recent-timestamp>
```

## Success Indicators

✅ UI shows "CharlestonHacks Test Event" in Event Beacon card
✅ Console shows all presence logs without errors
✅ Database has presence_sessions row with correct data
✅ Heartbeat writes every 25 seconds
✅ Heartbeat stops cleanly on beacon loss

## Common Issues

❌ **"failed to resolve community.id"**
→ User has no community profile record

❌ **"no active beacon found for key: MOONSIDE-S1"**
→ Beacon record missing or is_active = false

❌ **"presence write failed"**
→ Network issue or RLS policy blocking insert

❌ **No stable beacon achieved**
→ Signal too weak (< -80 dBm) or beacon not advertising

## Debug Log Reference

All logs use `[Presence]` prefix:
- `beacon stable` - Stable state triggered
- `resolved community.id` - User lookup succeeded
- `found beacon in database` - Beacon lookup succeeded
- `mapping beacon -> event` - Mapping complete
- `upsert presence session` - Writing to database
- `presence write successful` - Write succeeded
- `heartbeat refresh` - 25-second heartbeat tick
- `heartbeat stopped` - Cleanup complete
