# Phase 4 — Stable Beacon to Event Mapping with Presence Writes

## ✅ COMPLETE

### What Was Built

A presence tracking system that maps stable beacons to events and writes/refreshes user presence in Supabase.

### Files Created

1. **Services/EventPresenceService.swift** (NEW)
   - Beacon to event mapping
   - Community ID resolution
   - Presence write/refresh logic
   - Heartbeat timer management

### Files Modified

1. **Views/EventModeView.swift**
   - Added presence service observation
   - Shows mapped event name in Event Beacon card
   - Beacon name as subtitle/debug detail

2. **BeaconApp.swift**
   - Initialize presence service on app launch

### Flow Diagram

```
Stable Beacon Detected
        ↓
Map to Event (MOONSIDE-S1 → CharlestonHacks Test Event)
        ↓
Resolve Community ID
        ↓
Write Initial Presence
        ↓
Start Heartbeat Timer (every 25s)
        ↓
Refresh Presence While Stable
        ↓
Beacon Lost → Grace Period (10s) → Stop Heartbeat
```

### Beacon to Event Mapping

**Current Mapping:**
```swift
MOONSIDE-S1 → CharlestonHacks Test Event
```

**Structure:**
```swift
struct BeaconEventMapping {
    let beaconName: String
    let eventName: String
    let beaconId: UUID?  // For future database lookup
}
```

**Easy to extend:**
```swift
static let mappings: [BeaconEventMapping] = [
    BeaconEventMapping(
        beaconName: "MOONSIDE-S1",
        eventName: "CharlestonHacks Test Event",
        beaconId: nil
    ),
    BeaconEventMapping(
        beaconName: "BEACON-2",
        eventName: "Another Event",
        beaconId: nil
    )
]
```

### Presence Write Triggers

**Initial Write:**
- Stable beacon first confirmed
- Community ID resolved
- Immediate presence write

**Heartbeat Refresh:**
- Every 25 seconds while beacon stable
- Automatic RSSI/energy updates
- Continues until beacon lost

**Stop Conditions:**
- Beacon lost for 10 seconds (grace period)
- Event Mode turned off
- User logs out

### Presence Data Structure

```swift
{
    "user_id": "community-uuid",
    "context_type": "beacon",
    "context_id": "beacon-uuid",  // Placeholder for now
    "energy": 0.75,  // Normalized RSSI (0-1)
    "created_at": "2026-03-07T14:30:00Z"
}
```

**Energy Calculation:**
```swift
// RSSI ranges from -100 (far) to -40 (very close)
normalizedEnergy = (RSSI + 100) / 60.0
// Clamped to [0.0, 1.0]
```

**Examples:**
- RSSI -40 dBm → Energy 1.0 (very close)
- RSSI -70 dBm → Energy 0.5 (medium)
- RSSI -100 dBm → Energy 0.0 (far)

### Configuration

```swift
presenceRefreshInterval: 25.0 seconds  // Heartbeat frequency
gracePeriod: 10.0 seconds              // Wait before stopping
```

**Adjustable for different needs:**
- More frequent: 15 seconds
- Less frequent: 30 seconds
- Longer grace: 15-20 seconds

### Debug Output

**Stable beacon recognized:**
```
[PRESENCE] Stable beacon recognized: MOONSIDE-S1
[PRESENCE] Beacon mapped to event: CharlestonHacks Test Event
```

**Community ID resolution:**
```
[PRESENCE] Resolving community ID for auth user: <uuid>
[PRESENCE] ✅ Community ID resolved: <community-uuid>
[PRESENCE] Starting presence heartbeat (every 25s)
```

**Presence write:**
```
[PRESENCE] 💾 Writing presence:
  User: <community-uuid>
  Event: CharlestonHacks Test Event
  Beacon: MOONSIDE-S1
  RSSI: -68 dBm
  Energy: 0.53
[PRESENCE] ✅ Presence write successful
```

**Heartbeat refresh:**
```
[PRESENCE] 💾 Writing presence:
  User: <community-uuid>
  Event: CharlestonHacks Test Event
  Beacon: MOONSIDE-S1
  RSSI: -70 dBm
  Energy: 0.50
[PRESENCE] ✅ Presence write successful
```

**Beacon lost:**
```
[PRESENCE] Stable beacon lost, stopping presence writes after grace period
[PRESENCE] 🛑 Heartbeat stopped
```

### UI Updates

**Event Beacon Card - Before:**
```
┌─────────────────────────────────┐
│ 📍 Event Beacon         [Stable]│
│                                 │
│ MOONSIDE-S1                     │
│ 📡 -68 dBm • Near  Stable for 5s│
└─────────────────────────────────┘
```

**Event Beacon Card - After:**
```
┌─────────────────────────────────┐
│ 📍 Event Beacon         [Stable]│
│                                 │
│ CharlestonHacks Test Event      │
│ MOONSIDE-S1                     │
│ 📡 -68 dBm • Near  Stable for 5s│
└─────────────────────────────────┘
```

**Event name shown prominently, beacon name as subtitle**

### Features Implemented

#### 1. Beacon to Event Mapping ✅
- Static mapping table
- Easy to extend
- Fallback for unmapped beacons

#### 2. Community ID Resolution ✅
- Queries community table
- Uses auth user ID
- Cached for session

#### 3. Presence Writes ✅
- Initial write on stable beacon
- Heartbeat refresh every 25s
- Energy calculation from RSSI
- Proper error handling

#### 4. Heartbeat Management ✅
- Timer-based refresh
- Automatic start/stop
- Grace period on beacon loss
- One active heartbeat at a time

#### 5. UI Integration ✅
- Shows mapped event name
- Beacon name as subtitle
- Real-time presence status
- Last write timestamp

### Safety Features

**One Active Beacon:**
- Only one stable beacon tracked at a time
- New beacon replaces old beacon
- Clean state transitions

**One Heartbeat Loop:**
- Timer invalidated before creating new
- No duplicate writes
- Clean shutdown

**Grace Period:**
- 10 second wait before stopping
- Prevents rapid start/stop
- Handles temporary signal loss

**Error Handling:**
- Failed writes logged
- Doesn't crash app
- Continues on next heartbeat

### What Was NOT Modified

✅ QR flow - Untouched
✅ Suggested connections - Untouched
✅ Connection logic - Untouched
✅ BLEService - Untouched
✅ Nearby Signals - Untouched
✅ Interaction edges - Not created yet

**No connection inference in this phase!**

### Database Requirements

**Tables Used:**
- `community` - User profile lookup
- `presence_sessions` - Presence writes

**Columns Written:**
- `user_id` - Community UUID
- `context_type` - "beacon"
- `context_id` - Beacon UUID (placeholder)
- `energy` - Normalized RSSI (0-1)
- `created_at` - Timestamp

**RLS Policies:**
- Must allow authenticated users to insert presence
- Must allow users to read their own presence

### Testing Scenarios

#### Scenario 1: Clean Presence Write
1. Start app, sign in
2. MOONSIDE-S1 becomes stable
3. Console shows: "Stable beacon recognized"
4. Console shows: "Community ID resolved"
5. Console shows: "Presence write successful"
6. UI shows: "CharlestonHacks Test Event"
7. Heartbeat continues every 25s

#### Scenario 2: Beacon Lost
1. Stable beacon active, presence writing
2. Move away from beacon
3. Beacon becomes unstable
4. Console shows: "Stable beacon lost"
5. Wait 10 seconds (grace period)
6. Console shows: "Heartbeat stopped"
7. No more presence writes

#### Scenario 3: Event Mode Toggle
1. Presence writing active
2. Turn off Event Mode
3. Beacon confidence resets
4. Presence heartbeat stops
5. Clean shutdown

#### Scenario 4: Beacon Switch
1. MOONSIDE-S1 stable, presence writing
2. Move to different beacon
3. New beacon becomes stable
4. Old heartbeat stops
5. New heartbeat starts
6. Event name updates in UI

### Performance

**Network:**
- 1 write every 25 seconds
- ~2.4 writes per minute
- Minimal bandwidth

**CPU:**
- Timer-based, not polling
- Lightweight presence writes
- No background processing

**Battery:**
- Piggybacks on BLE scanning
- No additional scanning
- Timer overhead minimal

### Future Enhancements

**Phase 5 - Database Beacon Lookup:**
```swift
// Replace static mapping with database query
let beacon = try await supabase
    .from("beacons")
    .select("id, label, event_id")
    .eq("beacon_key", value: beaconKey)
    .single()
    .execute()
    .value
```

**Phase 6 - Connection Inference:**
```swift
// After presence writes stable
// Call RPC to infer connections
let edges = try await supabase
    .rpc("infer_ble_edges", params: [
        "event_group_id": eventId,
        "min_overlap_seconds": 120,
        "lookback_minutes": 240
    ])
    .execute()
    .value
```

### Error Scenarios

**No Community Profile:**
```
[PRESENCE] ⚠️ No community profile found for user
```
**Action:** User needs profile in community table

**No Event Mapping:**
```
[PRESENCE] ⚠️ No event mapping found for beacon: UNKNOWN-BEACON
```
**Action:** Add mapping or ignore unknown beacons

**Presence Write Failed:**
```
[PRESENCE] ❌ Presence write failed: <error>
```
**Action:** Logged, will retry on next heartbeat

### Files Summary

| File | Status | Purpose |
|------|--------|---------|
| `Services/EventPresenceService.swift` | NEW | Presence tracking & writes |
| `Views/EventModeView.swift` | MODIFIED | Show event name |
| `BeaconApp.swift` | MODIFIED | Initialize service |

**Total:** 1 new file, 2 modified files

### Architecture

```
BeaconConfidenceService (stable beacon)
        ↓
EventPresenceService (map & write)
        ↓
Supabase (presence_sessions table)
        ↓
EventModeView (display event name)
```

**Clean separation:**
- Confidence: Beacon qualification
- Presence: Event mapping & writes
- UI: Display

### Success Criteria

✅ **Stable beacon maps to event**
- MOONSIDE-S1 → CharlestonHacks Test Event

✅ **Presence written successfully**
- Initial write on stable
- Heartbeat every 25s
- Proper energy calculation

✅ **Event name displayed**
- Shows in Event Beacon card
- Beacon name as subtitle

✅ **Heartbeat stops cleanly**
- Grace period on beacon loss
- Clean timer invalidation
- No duplicate writes

---

## Status: ✅ PRESENCE TRACKING COMPLETE

Stable beacons now trigger presence writes with proper event mapping and heartbeat refresh.

