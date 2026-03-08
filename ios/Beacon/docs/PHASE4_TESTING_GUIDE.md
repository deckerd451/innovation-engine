# Phase 4 Testing Guide

## Prerequisites

Before testing, ensure the database has a beacon record:

```sql
-- Check if MOONSIDE-S1 beacon exists
SELECT id, beacon_key, label, is_active 
FROM beacons 
WHERE beacon_key = 'MOONSIDE-S1';

-- If not exists, create it:
INSERT INTO beacons (beacon_key, label, kind, is_active)
VALUES ('MOONSIDE-S1', 'CharlestonHacks Test Event', 'event', true);
```

## Testing Steps

### 1. Start the App
- Launch the Beacon app
- Sign in with valid credentials
- Navigate to Event Mode tab

### 2. Enable Event Mode
- Toggle Event Mode ON
- Watch console for BLE scanning logs:
  ```
  [BLE] scanning started
  [BLE] device discovered: MOONSIDE-S1 -XX dBm [KNOWN BEACON]
  ```

### 3. Wait for Stable Beacon (3 seconds)
- Watch console for confidence building:
  ```
  [CONFIDENCE] New candidate: MOONSIDE-S1 at -XX dBm
  [CONFIDENCE] MOONSIDE-S1: 0.5s / 3.0s (17%)
  [CONFIDENCE] MOONSIDE-S1: 1.0s / 3.0s (33%)
  [CONFIDENCE] MOONSIDE-S1: 1.5s / 3.0s (50%)
  [CONFIDENCE] MOONSIDE-S1: 2.0s / 3.0s (67%)
  [CONFIDENCE] MOONSIDE-S1: 2.5s / 3.0s (83%)
  [CONFIDENCE] ✅ STABLE BEACON ACHIEVED
  ```

### 4. Verify Presence Integration
- Watch console for presence flow:
  ```
  [PRESENCE] Stable beacon recognized: MOONSIDE-S1
  [PRESENCE] Beacon mapped to event: CharlestonHacks Test Event
  [PRESENCE] Resolving community ID for auth user: <uuid>
  [PRESENCE] ✅ Community ID resolved: <uuid>
  [PRESENCE] Mapping beacon -> event: MOONSIDE-S1
  [PRESENCE] ✅ Found beacon in database: CharlestonHacks Test Event (<uuid>)
  [PRESENCE] ✅ Beacon ID resolved: <uuid>
  [PRESENCE] Starting presence heartbeat (every 25s)
  ```

### 5. Verify Initial Presence Write
- Watch console for first write:
  ```
  [PRESENCE] 💾 Writing presence:
    User: <community-uuid>
    Event: CharlestonHacks Test Event
    Beacon: MOONSIDE-S1
    Context ID: <beacon-uuid>
    RSSI: -68 dBm
    Energy: 0.53
  [PRESENCE] ✅ Presence write successful
  ```

### 6. Verify Database Record
```sql
-- Check presence_sessions table
SELECT 
  user_id,
  context_type,
  context_id,
  energy,
  created_at
FROM presence_sessions
WHERE context_type = 'beacon'
ORDER BY created_at DESC
LIMIT 5;
```

Expected result:
- `user_id` = your community.id
- `context_type` = "beacon"
- `context_id` = beacon UUID from beacons table
- `energy` = value between 0 and 1
- `created_at` = recent timestamp

### 7. Verify Heartbeat (Wait 25 seconds)
- Watch console for heartbeat refresh:
  ```
  [PRESENCE] 💾 Writing presence:
    User: <community-uuid>
    Event: CharlestonHacks Test Event
    Beacon: MOONSIDE-S1
    Context ID: <beacon-uuid>
    RSSI: -70 dBm
    Energy: 0.50
  [PRESENCE] ✅ Presence write successful
  ```

### 8. Verify UI Display
Check Event Beacon card shows:
- Badge: "Stable" (green)
- Event name: "CharlestonHacks Test Event" (large text)
- Beacon name: "MOONSIDE-S1" (small gray text)
- Signal: "-XX dBm • Near"
- Duration: "Stable for Xs"

### 9. Test Beacon Loss
- Move away from beacon or turn off beacon
- Watch console:
  ```
  [CONFIDENCE] No qualifying beacon, returning to searching
  [PRESENCE] Stable beacon lost, stopping presence writes after grace period
  ```
- After 10 seconds:
  ```
  [PRESENCE] 🛑 Heartbeat stopped
  ```

### 10. Test Event Mode Disable
- Toggle Event Mode OFF
- Watch console:
  ```
  [PRESENCE] 🛑 Heartbeat stopped
  [BLE] scanning stopped
  ```

## Expected UI States

### Searching State
```
┌─────────────────────────────────┐
│ 🔍 Event Beacon      [Searching]│
│                                 │
│ ⏳ Searching for event beacons...│
└─────────────────────────────────┘
```

### Candidate State
```
┌─────────────────────────────────┐
│ 📍 Event Beacon      [Candidate]│
│                                 │
│ MOONSIDE-S1                     │
│ Building confidence...  -68 dBm │
└─────────────────────────────────┘
```

### Stable State
```
┌─────────────────────────────────┐
│ 📍 Event Beacon         [Stable]│
│                                 │
│ CharlestonHacks Test Event      │
│ MOONSIDE-S1                     │
│ 📡 -68 dBm • Near  Stable for 5s│
└─────────────────────────────────┘
```

## Troubleshooting

### No beacon detected
- Check Bluetooth is enabled
- Check beacon is powered on and advertising
- Check beacon name matches "MOONSIDE-S1"
- Check RSSI is above -80 dBm threshold

### Beacon detected but not stable
- Wait full 3 seconds
- Check signal is consistent (not fluctuating)
- Check RSSI stays above -80 dBm

### Stable but no presence writes
- Check user is signed in
- Check community profile exists for user
- Check beacon record exists in database
- Check Supabase connection
- Check console for error messages

### Presence writes fail
- Check Supabase credentials
- Check presence_sessions table exists
- Check RLS policies allow inserts
- Check network connectivity
- Review error in console logs

### Wrong context_id in database
- Verify beacon record exists with correct beacon_key
- Check resolveBeaconId() logs show correct UUID
- Verify is_active = true on beacon record

## Success Criteria

✅ MOONSIDE-S1 detected within 2 seconds
✅ Confidence builds over 3 seconds
✅ Beacon promoted to stable
✅ Event name displayed in UI
✅ Community ID resolved
✅ Beacon UUID resolved from database
✅ Initial presence write succeeds
✅ Heartbeat writes every 25 seconds
✅ Database shows correct presence records
✅ Heartbeat stops on beacon loss
✅ Heartbeat stops on Event Mode disable

## Performance Expectations

- BLE scan rate: ~1 Hz (every second)
- Confidence window: 3 seconds
- Initial presence write: < 1 second after stable
- Heartbeat interval: 25 seconds
- Grace period: 10 seconds
- Database query time: < 500ms
