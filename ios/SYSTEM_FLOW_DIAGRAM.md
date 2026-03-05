# BLE Passive Networking - Complete System Flow

## End-to-End User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                    BEFORE THE EVENT                             │
└─────────────────────────────────────────────────────────────────┘

Admin deploys physical iBeacons at venue
         │
         ▼
Admin registers beacons in Supabase database
         │
         ▼
Users download and install Innovation Engine app


┌─────────────────────────────────────────────────────────────────┐
│                    AT THE EVENT - START                         │
└─────────────────────────────────────────────────────────────────┘

User opens app and signs in
         │
         ▼
User navigates to "Event Mode" tab
         │
         ▼
User reads privacy disclosure
         │
         ▼
User taps "Start Event Mode"
         │
         ▼
App requests location permission
         │
         ▼
User grants permission
         │
         ▼
App fetches active beacons from Supabase
         │
         ▼
App caches beacons locally
         │
         ▼
App starts CoreLocation ranging for all beacons
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DURING THE EVENT                             │
└─────────────────────────────────────────────────────────────────┘

Every 1.5 seconds:
         │
         ▼
CoreLocation detects nearby iBeacons
         │
         ▼
App receives RSSI values for each beacon
         │
         ▼
App updates rolling window (last 10 RSSI samples)
         │
         ▼
App calculates energy score:
  • Median RSSI
  • Stability penalty
  • Final: [0, 10]
         │
         ▼
App checks debounce rules:
  • 5 seconds since last ping?
  • OR energy change >= 1.5?
         │
         ▼
If YES: Queue presence ping
         │
         ▼
Every 2 seconds:
         │
         ▼
App uploads queued pings to Supabase
         │
         ▼
Supabase inserts into presence_sessions table
  • user_id
  • context_type: 'beacon'
  • context_id: beacon.id
  • energy: 0-10
  • expires_at: now + 25 seconds
         │
         ▼
User sees "Closest Beacon" card update in real-time
         │
         ▼
User moves around venue, process repeats


┌─────────────────────────────────────────────────────────────────┐
│                    AFTER THE EVENT                              │
└─────────────────────────────────────────────────────────────────┘

User taps "Stop Event Mode"
         │
         ▼
App stops scanning immediately
         │
         ▼
User navigates to "View Suggested Connections"
         │
         ▼
User taps "Generate Suggestions"
         │
         ▼
App calls infer_ble_edges RPC function
         │
         ▼
Supabase analyzes presence_sessions:
  • Find overlapping users
  • Same beacon
  • Overlapping time windows
  • Minimum 120 seconds overlap
         │
         ▼
Supabase calculates confidence:
  • overlap_seconds / 600
  • Clamped to [0, 1]
         │
         ▼
Supabase inserts into interaction_edges:
  • from_user_id
  • to_user_id
  • beacon_id
  • overlap_seconds
  • confidence
  • status: 'suggested'
         │
         ▼
App fetches interaction_edges for current user
         │
         ▼
App resolves display names from community table
         │
         ▼
App displays suggestions list:
  • Other user name
  • Overlap minutes
  • Confidence %
         │
         ▼
User reviews suggestions
         │
         ├─────────────┬─────────────┬─────────────┐
         │             │             │             │
    User taps     User taps     User taps     User taps
    "Accept"      "Ignore"      "Block"       (nothing)
         │             │             │             │
         ▼             ▼             ▼             ▼
    Call RPC      Update edge   Update edge   Suggestion
    promote_      status to     status to     remains
    edge_to_      'ignored'     'blocked'     'suggested'
    connection
         │
         ▼
    Insert into connections table:
      • from_user_id
      • to_user_id
      • type: 'ble_proximity'
      • status: 'accepted'
         │
         ▼
    Update edge status to 'accepted'
         │
         ▼
    Remove from suggestions list
         │
         ▼
    Connection appears in Network tab
         │
         ▼
    User can now see connection in 2D constellation
```

## Detailed Component Interactions

### Beacon Detection Flow

```
┌──────────────┐
│ Physical     │
│ iBeacon      │
│              │
│ Broadcasting │
│ UUID, Major, │
│ Minor        │
└──────┬───────┘
       │ BLE Advertisement
       │
       ▼
┌──────────────┐
│ iOS Device   │
│ CoreLocation │
│              │
│ Ranging      │
│ Beacons      │
└──────┬───────┘
       │ didRange callback
       │ RSSI values
       ▼
┌──────────────┐
│ BLEService   │
│              │
│ • Parse UUID │
│ • Build key  │
│ • Lookup     │
└──────┬───────┘
       │ beacon_key
       │
       ▼
┌──────────────┐
│ BeaconReg.   │
│ Service      │
│              │
│ Cache lookup │
└──────┬───────┘
       │ Beacon object
       │
       ▼
┌──────────────┐
│ BLEService   │
│              │
│ • Update     │
│   RSSI hist. │
│ • Calculate  │
│   energy     │
│ • Queue ping │
└──────┬───────┘
       │ Queued ping
       │
       ▼
┌──────────────┐
│ Retry Timer  │
│ (2 seconds)  │
│              │
│ Upload batch │
└──────┬───────┘
       │ RPC call
       │
       ▼
┌──────────────┐
│ Supabase     │
│              │
│ upsert_      │
│ presence_    │
│ ping()       │
└──────┬───────┘
       │ INSERT
       │
       ▼
┌──────────────┐
│ presence_    │
│ sessions     │
│ table        │
└──────────────┘
```

### Inference Flow

```
┌──────────────┐
│ User taps    │
│ "Generate    │
│ Suggestions" │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Suggested    │
│ Connections  │
│ Service      │
└──────┬───────┘
       │ RPC call
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Supabase: infer_ble_edges()                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 1. Query presence_sessions                           │
│    WHERE created_at > now() - 4 hours                │
│    AND context_type = 'beacon'                       │
│                                                      │
│ 2. Self-join on context_id (same beacon)             │
│    WHERE p1.user_id != p2.user_id                    │
│    AND time windows overlap                          │
│                                                      │
│ 3. Calculate overlap_seconds                         │
│    SUM(LEAST(p1.expires_at, p2.expires_at) -         │
│        GREATEST(p1.created_at, p2.created_at))       │
│                                                      │
│ 4. Filter: overlap_seconds >= 120                    │
│                                                      │
│ 5. Calculate confidence                              │
│    LEAST(overlap_seconds / 600, 1.0)                 │
│                                                      │
│ 6. INSERT INTO interaction_edges                     │
│    (from_user_id, to_user_id, beacon_id,             │
│     overlap_seconds, confidence, status='suggested') │
│                                                      │
│ 7. RETURN count of new edges                         │
│                                                      │
└──────────────┬───────────────────────────────────────┘
               │ Count
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ SuggestedConnectionsService                          │
│                                                      │
│ Query interaction_edges WHERE:                       │
│   • from_user_id = current_user OR                   │
│     to_user_id = current_user                        │
│   • status = 'suggested'                             │
│   • ORDER BY confidence DESC                         │
│                                                      │
└──────────────┬───────────────────────────────────────┘
               │ Array of edges
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ For each edge:                                       │
│   • Determine other_user_id                          │
│   • Query community table for display name           │
│   • Fallback to shortened UUID if not found          │
│   • Build SuggestedConnection model                  │
│                                                      │
└──────────────┬───────────────────────────────────────┘
               │ Array of SuggestedConnection
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ SuggestedConnectionsView                             │
│                                                      │
│ Display list with:                                   │
│   • User avatar/name                                 │
│   • Overlap minutes                                  │
│   • Confidence %                                     │
│   • Accept/Ignore/Block buttons                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Accept Flow

```
┌──────────────┐
│ User taps    │
│ "Accept"     │
└──────┬───────┘
       │ edge_id
       │
       ▼
┌──────────────┐
│ Suggested    │
│ Connections  │
│ Service      │
└──────┬───────┘
       │ RPC call
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Supabase: promote_edge_to_connection()               │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 1. SELECT * FROM interaction_edges                   │
│    WHERE id = edge_id                                │
│    AND (from_user_id = auth.uid() OR                 │
│         to_user_id = auth.uid())                     │
│                                                      │
│ 2. INSERT INTO connections                           │
│    (from_user_id, to_user_id,                        │
│     type='ble_proximity', status='accepted')         │
│                                                      │
│ 3. UPDATE interaction_edges                          │
│    SET status = 'accepted'                           │
│    WHERE id = edge_id                                │
│                                                      │
└──────────────┬───────────────────────────────────────┘
               │ Success
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ SuggestedConnectionsView                             │
│                                                      │
│ • Remove from suggestions list                       │
│ • Show success message                               │
│                                                      │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ User navigates to Network tab                        │
│                                                      │
│ • New connection appears in 2D constellation         │
│ • Type: 'ble_proximity'                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## State Transitions

### Event Mode States

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STOPPED                                                    │
│  • isScanning = false                                       │
│  • closestBeacon = nil                                      │
│  • No timers running                                        │
│                                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ startEventMode()
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  REQUESTING_PERMISSION                                      │
│  • Show permission dialog                                   │
│  • Wait for user response                                   │
│                                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Permission granted
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  LOADING_BEACONS                                            │
│  • Fetch from Supabase                                      │
│  • Update cache                                             │
│                                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Beacons loaded
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  SCANNING                                                   │
│  • isScanning = true                                        │
│  • CoreLocation ranging active                              │
│  • Scan timer running (1.5s)                                │
│  • Retry timer running (2s)                                 │
│  • closestBeacon updates in real-time                       │
│                                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ stopEventMode()
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  STOPPED                                                    │
│  • isScanning = false                                       │
│  • Stop all ranging                                         │
│  • Cancel timers                                            │
│  • Clear state                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Suggestion States

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  SUGGESTED                                                  │
│  • status = 'suggested'                                     │
│  • Visible in suggestions list                              │
│  • User can Accept/Ignore/Block                             │
│                                                             │
└──────┬──────────────────┬──────────────────┬───────────────┘
       │                  │                  │
       │ Accept           │ Ignore           │ Block
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│              │   │              │   │              │
│  ACCEPTED    │   │  IGNORED     │   │  BLOCKED     │
│              │   │              │   │              │
│  • Promoted  │   │  • Hidden    │   │  • Hidden    │
│    to conn.  │   │  • Can undo  │   │  • Permanent │
│              │   │              │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

## Data Lifecycle

### Presence Session Lifecycle

```
Created (INSERT)
    │
    │ TTL: 25 seconds
    │
    ▼
Active (is_active = true)
    │
    │ expires_at reached
    │
    ▼
Expired (is_active = false)
    │
    │ Cleanup job (optional)
    │
    ▼
Archived or Deleted
```

### Interaction Edge Lifecycle

```
Inferred (status = 'suggested')
    │
    ├─────────────┬─────────────┬─────────────┐
    │             │             │             │
    ▼             ▼             ▼             ▼
Accepted      Ignored       Blocked      (Remains)
    │
    │ Promoted
    │
    ▼
Connection Created
```

## Performance Characteristics

### Timing

```
Event Mode Start:
├─ Permission request: ~1-2 seconds
├─ Beacon fetch: ~500ms
├─ Cache save: ~50ms
└─ Start ranging: ~100ms
Total: ~2-3 seconds

Beacon Detection:
├─ CoreLocation callback: ~100ms
├─ RSSI processing: ~10ms
├─ Energy calculation: ~5ms
└─ Queue ping: ~1ms
Total: ~116ms per scan

Presence Upload:
├─ Batch queue: ~1ms
├─ Network request: ~200-500ms
└─ Database insert: ~50ms
Total: ~250-550ms per batch

Inference:
├─ RPC call: ~200ms
├─ Query overlaps: ~500-2000ms (depends on data)
├─ Insert edges: ~100ms
└─ Return count: ~50ms
Total: ~1-3 seconds

Fetch Suggestions:
├─ Query edges: ~200ms
├─ Resolve names: ~100ms per user
└─ Build models: ~10ms
Total: ~500ms-2s (depends on count)
```

### Resource Usage

```
Memory:
├─ Beacon cache: ~10-50 KB
├─ RSSI history: ~1 KB per beacon
├─ Ping queue: ~100 bytes per ping
└─ Total: ~50-100 KB

Network:
├─ Beacon fetch: ~5 KB (one-time)
├─ Presence ping: ~100 bytes
├─ Ping rate: ~36/min (3 beacons)
└─ Total: ~3.6 KB/min

Battery:
├─ CoreLocation ranging: ~5-10% per hour
├─ Network uploads: ~1-2% per hour
└─ Total: ~6-12% per hour
```

## Summary

This complete system flow shows:
- **User journey** from event start to connection
- **Component interactions** at each step
- **State transitions** for Event Mode and suggestions
- **Data lifecycle** for presence and edges
- **Performance characteristics** for all operations

The system is designed for:
- ✅ Privacy (opt-in, clear disclosure)
- ✅ Efficiency (debouncing, caching)
- ✅ Reliability (retry logic, offline queue)
- ✅ Scalability (handles multiple beacons and users)
- ✅ User control (Accept/Ignore/Block)
