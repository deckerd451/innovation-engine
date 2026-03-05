# BLE Passive Networking - Quick Reference

## Database Schema

### beacons
```sql
id              uuid PRIMARY KEY
beacon_key      text UNIQUE NOT NULL  -- "uuid:<UUID>|major:<N>|minor:<N>"
label           text NOT NULL
kind            text NOT NULL
group_id        uuid
is_active       boolean DEFAULT true
meta            jsonb
created_at      timestamptz
```

### interaction_edges
```sql
id                uuid PRIMARY KEY
from_user_id      uuid NOT NULL
to_user_id        uuid NOT NULL
created_at        timestamptz
status            text  -- 'suggested', 'accepted', 'ignored', 'blocked'
type              text
beacon_id         uuid REFERENCES beacons(id)
overlap_seconds   int
confidence        numeric(3,2)
meta              jsonb
```

### presence_sessions (existing)
```sql
id              uuid PRIMARY KEY
user_id         uuid NOT NULL
context_type    text  -- 'beacon'
context_id      uuid  -- beacon.id
energy          numeric
expires_at      timestamptz
created_at      timestamptz
updated_at      timestamptz
is_active       boolean
last_seen       timestamptz
```

## RPC Functions

### upsert_presence_ping
```sql
SELECT upsert_presence_ping(
    'beacon',                    -- p_context_type
    '<beacon-id>'::uuid,         -- p_context_id
    7.5,                         -- p_energy (0-10)
    25                           -- p_ttl_seconds
);
```

### infer_ble_edges
```sql
SELECT infer_ble_edges(
    '<event-group-id>'::uuid,    -- p_group_id (nullable)
    120,                         -- p_min_overlap_seconds
    240                          -- p_lookback_minutes
);
-- Returns: count of new edges created
```

### promote_edge_to_connection
```sql
SELECT promote_edge_to_connection(
    '<edge-id>'::uuid            -- p_edge_id
);
```

## Swift Services

### BeaconRegistryService
```swift
// Singleton
let registry = BeaconRegistryService.shared

// Refresh beacons from database
try await registry.refreshBeacons()

// Get beacon by key
let beacon = registry.getBeacon(forKey: beaconKey)

// Check if refresh needed (6 hours)
if registry.needsRefresh() {
    try await registry.refreshIfNeeded()
}
```

### BLEService
```swift
// Singleton
let ble = BLEService.shared

// Start Event Mode
await ble.startEventMode()

// Stop Event Mode
ble.stopEventMode()

// Observe state
@Published var isScanning: Bool
@Published var closestBeacon: DetectedBeacon?
@Published var errorMessage: String?
```

### SuggestedConnectionsService
```swift
// Singleton
let service = SuggestedConnectionsService.shared

// Generate suggestions
let count = try await service.generateSuggestions(
    groupId: eventGroupId,
    minOverlapSeconds: 120,
    lookbackMinutes: 240
)

// Fetch suggestions
let suggestions = try await service.fetchSuggestions(for: userId)

// Actions
try await service.acceptSuggestion(edgeId: id)
try await service.ignoreSuggestion(edgeId: id)
try await service.blockSuggestion(edgeId: id)
```

## Energy Calculation

```swift
// Input: Array of RSSI values (last 10 samples)
let rssiSamples: [Double] = [-65, -68, -70, -67, -69, ...]

// 1. Calculate median
let sorted = rssiSamples.sorted()
let median = sorted[count / 2]

// 2. Base energy: (medianRSSI + 90) / 4
var energy = (median + 90) / 4
energy = max(0, min(10, energy))

// 3. Stability penalty
let mean = rssiSamples.reduce(0, +) / Double(count)
let variance = rssiSamples.map { pow($0 - mean, 2) }.reduce(0, +) / Double(count)
let stddev = sqrt(variance)
let penalty = min(stddev, 10) / 2
energy -= penalty

// 4. Final energy [0, 10]
energy = max(0, min(10, energy))
```

## Beacon Key Format

```
uuid:<UUID>|major:<MAJOR>|minor:<MINOR>

Example:
uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1
```

## Debouncing Rules

```swift
// Send ping if:
// 1. More than 5 seconds since last ping for this beacon
// OR
// 2. Energy change >= 1.5

let timeSinceLast = now.timeIntervalSince(lastPing.date)
let energyDelta = abs(energy - lastPing.energy)

if timeSinceLast >= 5 || energyDelta >= 1.5 {
    queuePing(beaconId, energy)
}
```

## Common Queries

### Check active beacons
```sql
SELECT beacon_key, label, is_active 
FROM public.beacons 
WHERE is_active = true;
```

### Recent presence pings
```sql
SELECT 
    u.name,
    b.label,
    ps.energy,
    ps.created_at
FROM presence_sessions ps
JOIN community u ON u.id = ps.user_id
JOIN beacons b ON b.id = ps.context_id
WHERE ps.context_type = 'beacon'
ORDER BY ps.created_at DESC
LIMIT 20;
```

### Suggested connections
```sql
SELECT 
    u1.name as user1,
    u2.name as user2,
    ie.overlap_seconds / 60 as overlap_minutes,
    ie.confidence,
    ie.status
FROM interaction_edges ie
JOIN community u1 ON u1.id = ie.from_user_id
JOIN community u2 ON u2.id = ie.to_user_id
WHERE ie.status = 'suggested'
ORDER BY ie.confidence DESC;
```

### Promoted connections
```sql
SELECT 
    u1.name as from_user,
    u2.name as to_user,
    c.created_at
FROM connections c
JOIN community u1 ON u1.id = c.from_user_id
JOIN community u2 ON u2.id = c.to_user_id
WHERE c.type = 'ble_proximity'
ORDER BY c.created_at DESC;
```

## Permissions (Info.plist)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location access is required to scan for nearby event beacons and enable passive networking.</string>

<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth access is required to detect nearby event beacons for passive networking.</string>
```

## Testing Commands

### Insert test beacon
```sql
INSERT INTO public.beacons (beacon_key, label, kind, group_id, is_active)
VALUES (
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1',
    'Test Beacon',
    'event',
    gen_random_uuid(),
    true
);
```

### Simulate presence ping
```sql
SELECT upsert_presence_ping('beacon', '<beacon-id>'::uuid, 7.5, 25);
```

### Generate test suggestions
```sql
SELECT infer_ble_edges(NULL, 60, 240);  -- Lower threshold for testing
```

### Check inference results
```sql
SELECT COUNT(*) FROM interaction_edges WHERE status = 'suggested';
```

## Performance Metrics

- **Scan Interval**: 1.5 seconds
- **RSSI History**: Last 10 samples per beacon
- **Ping Debounce**: 5 seconds OR energy delta >= 1.5
- **Ping TTL**: 25 seconds
- **Upload Retry**: Every 2 seconds
- **Cache Refresh**: Every 6 hours
- **Network Usage**: ~3.6 KB/minute (3 beacons)

## Error Codes

### Location Permission Denied
```swift
errorMessage = "Location permission required for BLE scanning"
// Solution: Request permission in Settings
```

### Beacon Not Found
```swift
// Beacon detected but not in registry
// Solution: Register beacon in database and refresh cache
```

### RPC Failed
```swift
// Network error or RLS policy issue
// Solution: Check connectivity and Supabase credentials
```

## File Locations

```
ios/
├── InnovationEngine/
│   ├── Models/
│   │   ├── Beacon.swift
│   │   ├── InteractionEdge.swift
│   │   └── PresenceSession.swift
│   ├── Services/
│   │   ├── BeaconRegistryService.swift
│   │   ├── BLEService.swift
│   │   └── SuggestedConnectionsService.swift
│   └── Views/
│       ├── EventModeView.swift
│       └── SuggestedConnectionsView.swift
├── migrations/
│   ├── 001_create_beacons_table.sql
│   ├── 002_create_interaction_edges_table.sql
│   ├── 003_create_rpc_functions.sql
│   └── 004_example_beacon_data.sql
├── BLE_PASSIVE_NETWORKING_GUIDE.md
├── SETUP_CHECKLIST.md
├── BEACON_CONFIGURATION_GUIDE.md
└── QUICK_REFERENCE.md (this file)
```

## Support Resources

1. **BLE_PASSIVE_NETWORKING_GUIDE.md** - Complete implementation details
2. **SETUP_CHECKLIST.md** - Step-by-step setup
3. **BEACON_CONFIGURATION_GUIDE.md** - Beacon hardware setup
4. **Console Logs** - Check Xcode console for errors
5. **Supabase Dashboard** - SQL Editor for testing queries
