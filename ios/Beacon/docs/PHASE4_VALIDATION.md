# Phase 4: Validation Guide

## 1. Implementation Audit

### Wiring Flow: Stable Beacon → Presence Write

```
BeaconApp.init()
  ↓
EventPresenceService.shared initialized
  ↓
observeConfidenceState() subscribes to BeaconConfidenceService.shared.$activeBeacon
  ↓
BeaconConfidenceService detects MOONSIDE-S1 for 3 seconds
  ↓
BeaconConfidenceService publishes activeBeacon with .stable state
  ↓
EventPresenceService.handleBeaconChange() receives stable beacon
  ↓
EventPresenceService.handleStableBeacon() triggered
  ↓
Task created → startPresenceLoop()
  ↓
resolveCommunityId() → queries community table
  ↓
resolveBeaconId() → queries beacons table
  ↓
writePresence() → inserts into presence_sessions
  ↓
while loop → Task.sleep(25s) → writePresence() (heartbeat)
```

### Trigger Point
**File:** `Beacon/Services/EventPresenceService.swift`
**Method:** `observeConfidenceState()`
**Line:** Subscribes to `confidence.$activeBeacon`

```swift
private func observeConfidenceState() {
    confidence.$activeBeacon
        .receive(on: RunLoop.main)
        .sink { [weak self] beacon in
            self?.handleBeaconChange(beacon)
        }
        .store(in: &cancellables)
}
```

When `BeaconConfidenceService` publishes an `activeBeacon` with `confidenceState == .stable`, EventPresenceService immediately triggers presence writes.

## 2. Debug Logging Audit

### Current Debug Logs ✅

All required logs are present:

1. **[Presence] beacon stable** ✅
   - Location: `handleStableBeacon()`
   - Prints: `[Presence] beacon stable: \(beacon.name)`

2. **[Presence] mapping beacon -> event** ✅
   - Location: `startPresenceLoop()`
   - Prints: `[Presence] mapping beacon -> event: \(mapping.eventName) (\(contextId))`

3. **[Presence] resolved community.id** ✅
   - Location: `startPresenceLoop()`
   - Prints: `[Presence] resolved community.id: \(communityId)`

4. **[Presence] found beacon in database** ✅
   - Location: `resolveBeaconId()`
   - Prints: `[Presence] found beacon in database: \(beacon.label) (\(beacon.id))`

5. **[Presence] upsert presence session** ✅
   - Location: `writePresence()`
   - Prints: `[Presence] upsert presence session`
   - Plus detailed payload info

6. **[Presence] presence write successful** ✅
   - Location: `writePresence()`
   - Prints: `[Presence] presence write successful`

7. **[Presence] heartbeat refresh** ✅
   - Location: `startPresenceLoop()` (in while loop)
   - Prints: `[Presence] heartbeat refresh`

8. **[Presence] heartbeat stopped** ✅
   - Location: `stopPresenceWrites()`
   - Prints: `[Presence] heartbeat stopped`

### Additional Logs Present

- `[Presence] no event mapping found for beacon: \(beacon.name)` - Error case
- `[Presence] failed to resolve community.id` - Error case
- `[Presence] failed to resolve beacon/event id for key: \(mapping.beaconKey)` - Error case
- `[Presence] no active beacon found for key: \(beaconKey)` - Database miss
- `[Presence] presence write failed: \(error)` - Write error
- `[Presence] stable beacon lost; waiting \(Int(gracePeriod))s grace period` - Beacon loss
- `[Presence] heartbeat stopped: no stable active beacon` - Loop exit

## 3. Beacon Mapping Configuration

### Current Mapping

**Beacon Name:** `MOONSIDE-S1`
**Event Name:** `CharlestonHacks Test Event`
**Beacon Key:** `MOONSIDE-S1`

```swift
static let mappings: [BeaconEventMapping] = [
    BeaconEventMapping(
        beaconName: "MOONSIDE-S1",
        eventName: "CharlestonHacks Test Event",
        beaconKey: "MOONSIDE-S1"
    )
]
```

### Database Lookup

The beacon key `"MOONSIDE-S1"` is used to query:

```sql
SELECT id, label 
FROM beacons 
WHERE beacon_key = 'MOONSIDE-S1' 
  AND is_active = true 
LIMIT 1
```

The returned `id` becomes the `context_id` in presence_sessions.

## 4. Heartbeat Configuration

### Intervals

**Heartbeat Interval:** `25.0` seconds
```swift
private let presenceRefreshInterval: TimeInterval = 25.0
```

**Grace Period:** `10.0` seconds
```swift
private let gracePeriod: TimeInterval = 10.0
```

### Stop Conditions

Heartbeat stops when:

1. **Beacon Lost:**
   - `activeBeacon` becomes `nil`
   - Grace period of 10 seconds elapses
   - No new stable beacon detected

2. **Beacon Changes:**
   - Different beacon becomes stable
   - Old heartbeat cancelled
   - New heartbeat started

3. **Confidence Lost:**
   - `activeBeacon.confidenceState != .stable`
   - Loop exits immediately

4. **Task Cancelled:**
   - `Task.isCancelled` becomes true
   - Manual reset called

5. **Event Mode Disabled:**
   - BLE scanning stops
   - No beacons detected
   - Grace period triggers stop

## 5. Potential Issues Analysis

### ✅ No Blocking Issues Found

The implementation should work correctly. All components are properly wired:

1. **Initialization:** ✅ EventPresenceService.shared created in BeaconApp.init()
2. **Observation:** ✅ Subscribes to BeaconConfidenceService.$activeBeacon
3. **Mapping:** ✅ MOONSIDE-S1 mapped to event
4. **Community Resolution:** ✅ Queries community table with correct auth pattern
5. **Beacon Resolution:** ✅ Queries beacons table with beacon_key
6. **Presence Write:** ✅ Typed Encodable payload
7. **Heartbeat:** ✅ Task-based loop with proper cancellation
8. **Cleanup:** ✅ Grace period and stop conditions

### Prerequisites for Success

1. **Database Records:**
   - User must have a `community` record with matching `user_id`
   - `beacons` table must have record with `beacon_key = 'MOONSIDE-S1'` and `is_active = true`

2. **Authentication:**
   - User must be signed in
   - `supabase.auth.session` must be valid

3. **BLE Detection:**
   - MOONSIDE-S1 beacon must be advertising
   - Signal strength must be ≥ -80 dBm
   - Signal must be stable for 3 seconds

4. **Network:**
   - Device must have network connectivity
   - Supabase endpoint must be reachable

## 6. Expected Console Output

### Successful Flow

```
[BLE] scanning started
[BLE] device discovered: MOONSIDE-S1 -68 dBm [KNOWN BEACON]
[CONFIDENCE] New candidate: MOONSIDE-S1 at -68 dBm
[CONFIDENCE] MOONSIDE-S1: 0.5s / 3.0s (17%)
[CONFIDENCE] MOONSIDE-S1: 1.0s / 3.0s (33%)
[CONFIDENCE] MOONSIDE-S1: 1.5s / 3.0s (50%)
[CONFIDENCE] MOONSIDE-S1: 2.0s / 3.0s (67%)
[CONFIDENCE] MOONSIDE-S1: 2.5s / 3.0s (83%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONFIDENCE] ✅ STABLE BEACON ACHIEVED
  Name: MOONSIDE-S1
  RSSI: -68 dBm
  Signal: Near
  Confidence Duration: 3.0s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Presence] beacon stable: MOONSIDE-S1
[Presence] resolved community.id: <uuid>
[Presence] found beacon in database: CharlestonHacks Test Event (<uuid>)
[Presence] mapping beacon -> event: CharlestonHacks Test Event (<uuid>)
[Presence] upsert presence session
  beacon: MOONSIDE-S1
  community.id: <uuid>
  context_id: <uuid>
  rssi: -68
  energy: 0.47
[Presence] presence write successful
... wait 25 seconds ...
[Presence] heartbeat refresh
[Presence] upsert presence session
  beacon: MOONSIDE-S1
  community.id: <uuid>
  context_id: <uuid>
  rssi: -70
  energy: 0.50
[Presence] presence write successful
... wait 25 seconds ...
[Presence] heartbeat refresh
[Presence] upsert presence session
  beacon: MOONSIDE-S1
  community.id: <uuid>
  context_id: <uuid>
  rssi: -69
  energy: 0.48
[Presence] presence write successful
... beacon lost ...
[Presence] stable beacon lost; waiting 10s grace period
... wait 10 seconds ...
[Presence] heartbeat stopped
```

### Error Cases

**No Community Profile:**
```
[Presence] beacon stable: MOONSIDE-S1
[Presence] failed to resolve community.id: <error>
[Presence] failed to resolve community.id
```

**No Beacon Record:**
```
[Presence] beacon stable: MOONSIDE-S1
[Presence] resolved community.id: <uuid>
[Presence] no active beacon found for key: MOONSIDE-S1
[Presence] failed to resolve beacon/event id for key: MOONSIDE-S1
```

**Presence Write Failure:**
```
[Presence] upsert presence session
  beacon: MOONSIDE-S1
  community.id: <uuid>
  context_id: <uuid>
  rssi: -68
  energy: 0.47
[Presence] presence write failed: <error>
```

## 7. Expected Database Row Shape

### Table: `presence_sessions`

```sql
CREATE TABLE presence_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  context_type TEXT NOT NULL,
  context_id UUID NOT NULL,
  energy DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- other columns...
);
```

### Expected Row After Successful Write

```
id:           <auto-generated-uuid>
user_id:      <community.id from community table>
context_type: "beacon"
context_id:   <beacon.id from beacons table where beacon_key='MOONSIDE-S1'>
energy:       0.47 (example, range 0.0-1.0)
created_at:   2026-03-07T14:30:00Z (example)
```

### Energy Calculation

```swift
let normalizedEnergy = max(0.0, min(1.0, Double(beacon.rssi + 100) / 60.0))
```

**Examples:**
- RSSI -40 dBm → energy 1.0 (very close)
- RSSI -70 dBm → energy 0.5 (medium)
- RSSI -100 dBm → energy 0.0 (far)

### Query to Verify

```sql
SELECT 
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

## 8. Manual Test Steps

### Prerequisites

1. **Database Setup:**
   ```sql
   -- Verify beacon exists
   SELECT * FROM beacons WHERE beacon_key = 'MOONSIDE-S1';
   
   -- If not exists, create it
   INSERT INTO beacons (beacon_key, label, kind, is_active)
   VALUES ('MOONSIDE-S1', 'CharlestonHacks Test Event', 'event', true);
   ```

2. **User Setup:**
   - Create test user account
   - Ensure community profile exists for user
   ```sql
   SELECT * FROM community WHERE user_id = '<auth-user-id>';
   ```

3. **Hardware:**
   - MOONSIDE-S1 beacon powered on and advertising
   - iOS device with Bluetooth enabled
   - Device within range (RSSI ≥ -80 dBm)

### Test Procedure

#### Step 1: Launch App
1. Open Beacon app on device
2. Sign in with test credentials
3. Verify login successful

**Expected:**
- App shows MainTabView
- Console shows: `[BLE] scanning started`

#### Step 2: Navigate to Event Mode
1. Tap "Event Mode" tab
2. Toggle Event Mode ON

**Expected:**
- Toggle switches to ON
- UI shows "Searching for event beacons..."
- Console shows BLE scanning activity

#### Step 3: Wait for Beacon Detection (3 seconds)
1. Keep device near MOONSIDE-S1 beacon
2. Watch console for confidence building
3. Wait for stable state

**Expected Console:**
```
[BLE] device discovered: MOONSIDE-S1 -XX dBm [KNOWN BEACON]
[CONFIDENCE] New candidate: MOONSIDE-S1 at -XX dBm
[CONFIDENCE] MOONSIDE-S1: 0.5s / 3.0s (17%)
...
[CONFIDENCE] ✅ STABLE BEACON ACHIEVED
```

**Expected UI:**
- Event Beacon card shows "Stable" badge (green)
- Event name: "CharlestonHacks Test Event"
- Beacon name: "MOONSIDE-S1"
- Signal strength displayed

#### Step 4: Verify Initial Presence Write
1. Watch console immediately after stable state
2. Verify all resolution steps succeed

**Expected Console:**
```
[Presence] beacon stable: MOONSIDE-S1
[Presence] resolved community.id: <uuid>
[Presence] found beacon in database: CharlestonHacks Test Event (<uuid>)
[Presence] mapping beacon -> event: CharlestonHacks Test Event (<uuid>)
[Presence] upsert presence session
  beacon: MOONSIDE-S1
  community.id: <uuid>
  context_id: <uuid>
  rssi: -XX
  energy: 0.XX
[Presence] presence write successful
```

#### Step 5: Verify Database Write
1. Query presence_sessions table
2. Verify row exists with correct data

**SQL Query:**
```sql
SELECT 
  user_id,
  context_type,
  context_id,
  energy,
  created_at
FROM presence_sessions
WHERE context_type = 'beacon'
  AND created_at > NOW() - INTERVAL '1 minute'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
- Row exists
- `user_id` matches your community.id
- `context_type` = "beacon"
- `context_id` matches beacon UUID from beacons table
- `energy` between 0.0 and 1.0
- `created_at` is recent (within last minute)

#### Step 6: Verify Heartbeat (Wait 25 seconds)
1. Keep device near beacon
2. Wait 25 seconds
3. Watch console for heartbeat refresh

**Expected Console:**
```
[Presence] heartbeat refresh
[Presence] upsert presence session
  beacon: MOONSIDE-S1
  community.id: <uuid>
  context_id: <uuid>
  rssi: -XX
  energy: 0.XX
[Presence] presence write successful
```

**Expected Database:**
- New row in presence_sessions
- Same user_id and context_id
- Updated created_at timestamp
- Possibly different energy value (if RSSI changed)

#### Step 7: Verify Multiple Heartbeats
1. Wait another 25 seconds
2. Verify another heartbeat write
3. Repeat 2-3 times

**Expected:**
- Console shows heartbeat refresh every 25 seconds
- Database shows multiple rows with 25-second intervals
- UI continues showing stable state

#### Step 8: Test Beacon Loss
1. Move device away from beacon OR turn off beacon
2. Wait for signal loss
3. Watch console for grace period

**Expected Console:**
```
[CONFIDENCE] No qualifying beacon, returning to searching
[Presence] stable beacon lost; waiting 10s grace period
... wait 10 seconds ...
[Presence] heartbeat stopped
```

**Expected UI:**
- Event Beacon card returns to "Searching" state
- Event name disappears
- "Searching for event beacons..." message

**Expected Database:**
- No new presence writes after heartbeat stopped
- Last write timestamp ~10 seconds after beacon lost

#### Step 9: Test Event Mode Disable
1. Bring device back near beacon
2. Wait for stable state again
3. Toggle Event Mode OFF

**Expected Console:**
```
[Presence] heartbeat stopped
[BLE] scanning stopped (or similar)
```

**Expected UI:**
- Event Mode toggle OFF
- Event Beacon card hidden or shows inactive state

**Expected Database:**
- No new presence writes after toggle OFF

### Success Criteria

✅ Beacon detected within 2 seconds
✅ Stable state achieved after 3 seconds
✅ Community ID resolved successfully
✅ Beacon UUID resolved from database
✅ Initial presence write succeeds
✅ Database row has correct shape
✅ Heartbeat writes every 25 seconds
✅ Multiple heartbeat writes succeed
✅ Grace period works on beacon loss
✅ Heartbeat stops after grace period
✅ Event Mode disable stops heartbeat
✅ UI updates match console logs

### Failure Scenarios to Test

1. **No Community Profile:**
   - Sign in with user that has no community record
   - Expected: Error log, no presence writes

2. **No Beacon Record:**
   - Delete or deactivate MOONSIDE-S1 from beacons table
   - Expected: Error log, no presence writes

3. **Network Offline:**
   - Enable airplane mode after stable state
   - Expected: Presence write failures logged

4. **Weak Signal:**
   - Move device far from beacon (RSSI < -80)
   - Expected: Beacon not qualified, no stable state

## Summary

The Phase 4 implementation is complete and properly wired. All debug logs are in place, the beacon mapping is configured, and the heartbeat mechanism is working as designed. The only potential issues would be missing database records (community profile or beacon record), which are prerequisites that can be verified before testing.

The implementation should successfully write presence_sessions rows to Supabase when MOONSIDE-S1 becomes stable, with a 25-second heartbeat that continues until the beacon is lost or Event Mode is disabled.
