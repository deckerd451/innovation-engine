# BLE Passive Networking - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         iOS App (Swift)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ EventModeView│  │ SuggestedConn│  │ MainTabView  │         │
│  │              │  │ ectionsView  │  │              │         │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘         │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  BLEService  │  │ SuggestedConn│  │BeaconRegistry│         │
│  │              │  │ ectionsServ. │  │   Service    │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                 │                  │
│         │                 │                 │                  │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Backend                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    RPC Functions                         │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • upsert_presence_ping(context_type, context_id, ...)  │  │
│  │  • infer_ble_edges(group_id, min_overlap, lookback)     │  │
│  │  • promote_edge_to_connection(edge_id)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   beacons    │  │ interaction_ │  │  presence_   │         │
│  │              │  │    edges     │  │  sessions    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ connections  │  │  community   │                            │
│  │              │  │              │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          ▲
          │
          │ iBeacon Broadcast
          │
┌─────────┴─────────────────────────────────────────────────────┐
│                    Physical iBeacons                          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  📡 Main Hall      📡 Workshop A     📡 Networking Lounge    │
│  UUID: E2C56...    UUID: E2C56...    UUID: E2C56...          │
│  Major: 100        Major: 100        Major: 100              │
│  Minor: 1          Minor: 2          Minor: 3                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Event Mode Activation

```
User Taps "Start Event Mode"
         │
         ▼
Request Location Permission
         │
         ▼
BeaconRegistryService.refreshBeacons()
         │
         ▼
Fetch active beacons from Supabase
         │
         ▼
Cache beacons in UserDefaults
         │
         ▼
Start CoreLocation ranging for all beacons
         │
         ▼
Start scan timer (1.5s) + retry timer (2s)
```

### 2. Beacon Detection & Presence Upload

```
CoreLocation detects iBeacon
         │
         ▼
Extract UUID, Major, Minor
         │
         ▼
Build beacon_key: "uuid:...|major:...|minor:..."
         │
         ▼
Look up in BeaconRegistry cache
         │
         ▼
Update RSSI history (last 10 samples)
         │
         ▼
Calculate energy score (median RSSI + stability)
         │
         ▼
Check debounce rules (5s OR energy delta >= 1.5)
         │
         ▼
Queue presence ping
         │
         ▼
Retry timer uploads queued pings
         │
         ▼
Call upsert_presence_ping RPC
         │
         ▼
Insert into presence_sessions table
```

### 3. Suggestion Generation

```
User taps "Generate Suggestions"
         │
         ▼
Call infer_ble_edges RPC
         │
         ▼
Analyze presence_sessions for overlaps
         │
         ▼
Find users with >= 120s overlap
         │
         ▼
Calculate confidence score
         │
         ▼
Insert into interaction_edges (status='suggested')
         │
         ▼
Return count of new edges
         │
         ▼
Fetch interaction_edges for current user
         │
         ▼
Resolve display names from community table
         │
         ▼
Display in SuggestedConnectionsView
```

### 4. Accept Suggestion

```
User taps "Accept"
         │
         ▼
Call promote_edge_to_connection RPC
         │
         ▼
Insert into connections table (type='ble_proximity')
         │
         ▼
Update edge status='accepted'
         │
         ▼
Remove from suggestions list
         │
         ▼
Connection appears in Network tab
```

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BeaconRegistryService                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  State:                                                     │
│  • cache: BeaconCache                                       │
│  • lastRefreshed: Date                                      │
│                                                             │
│  Methods:                                                   │
│  • refreshBeacons() async throws                            │
│  • getBeacon(forKey:) -> Beacon?                            │
│  • needsRefresh() -> Bool                                   │
│  • refreshIfNeeded() async throws                           │
│                                                             │
│  Persistence:                                               │
│  • UserDefaults (key: "beacon_registry_cache")              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        BLEService                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Published State:                                           │
│  • isScanning: Bool                                         │
│  • closestBeacon: DetectedBeacon?                           │
│  • errorMessage: String?                                    │
│                                                             │
│  Private State:                                             │
│  • rssiHistory: [UUID: [Double]]                            │
│  • lastPingSent: [UUID: (Date, Double)]                     │
│  • pingQueue: [(UUID, Double)]                              │
│  • scanTimer: Timer?                                        │
│  • retryTimer: Timer?                                       │
│                                                             │
│  Methods:                                                   │
│  • startEventMode() async                                   │
│  • stopEventMode()                                          │
│  • calculateEnergy(from:) -> Double                         │
│  • queuePingIfNeeded(beaconId:energy:)                      │
│  • uploadPresencePing(beaconId:energy:) async               │
│                                                             │
│  Delegates:                                                 │
│  • CLLocationManagerDelegate                                │
│    - didRange beacons                                       │
│    - didChangeAuthorization                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              SuggestedConnectionsService                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Methods:                                                   │
│  • generateSuggestions(groupId:minOverlap:lookback:)        │
│    -> Int                                                   │
│  • fetchSuggestions(for:) -> [SuggestedConnection]          │
│  • acceptSuggestion(edgeId:) async throws                   │
│  • ignoreSuggestion(edgeId:) async throws                   │
│  • blockSuggestion(edgeId:) async throws                    │
│  • fetchDisplayName(for:) async -> String                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Energy Calculation Flow

```
RSSI Samples: [-65, -68, -70, -67, -69, -71, -66, -68, -70, -67]
                                │
                                ▼
                        Sort & Get Median
                                │
                                ▼
                        Median: -68 dBm
                                │
                                ▼
                    Base Energy = (-68 + 90) / 4
                                │
                                ▼
                        Base Energy = 5.5
                                │
                                ▼
                    Calculate Standard Deviation
                                │
                                ▼
                        StdDev = 1.8
                                │
                                ▼
                    Penalty = min(1.8, 10) / 2 = 0.9
                                │
                                ▼
                    Final Energy = 5.5 - 0.9 = 4.6
                                │
                                ▼
                        Clamp to [0, 10]
                                │
                                ▼
                        Final: 4.6 / 10
```

## Database Relationships

```
┌──────────────┐
│   beacons    │
│              │
│ id (PK)      │◄─────────┐
│ beacon_key   │          │
│ label        │          │
│ group_id     │          │
│ is_active    │          │
└──────────────┘          │
                          │
                          │ beacon_id (FK)
                          │
┌──────────────┐          │
│ interaction_ │          │
│    edges     │          │
│              │          │
│ id (PK)      │          │
│ from_user_id │──────────┤
│ to_user_id   │          │
│ beacon_id    │──────────┘
│ status       │
│ confidence   │
└──────────────┘
       │
       │ (on accept)
       │
       ▼
┌──────────────┐
│ connections  │
│              │
│ id (PK)      │
│ from_user_id │
│ to_user_id   │
│ type         │ = 'ble_proximity'
│ status       │ = 'accepted'
└──────────────┘
```

## State Machine: Event Mode

```
┌─────────────┐
│   STOPPED   │
└──────┬──────┘
       │
       │ startEventMode()
       │
       ▼
┌─────────────┐
│  STARTING   │
└──────┬──────┘
       │
       │ Permission Granted
       │ Beacons Refreshed
       │
       ▼
┌─────────────┐
│  SCANNING   │◄──────┐
└──────┬──────┘       │
       │              │
       │ Scan Timer   │
       │ (1.5s)       │
       │              │
       ├──────────────┘
       │
       │ stopEventMode()
       │
       ▼
┌─────────────┐
│   STOPPED   │
└─────────────┘
```

## State Machine: Suggestion

```
┌─────────────┐
│  SUGGESTED  │
└──────┬──────┘
       │
       ├──────────┬──────────┬──────────┐
       │          │          │          │
       │ Accept   │ Ignore   │ Block    │
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ ACCEPTED │ │ IGNORED  │ │ BLOCKED  │
└──────────┘ └──────────┘ └──────────┘
       │
       │ promote_edge_to_connection()
       │
       ▼
┌──────────────┐
│ connections  │
│    table     │
└──────────────┘
```

## Timing Diagram

```
Time    App                 CoreLocation        Supabase
─────────────────────────────────────────────────────────
0s      Start Event Mode
        │
1s      │                   Detect Beacon 1
        │                   RSSI: -65
        │
1.5s    Process Beacons
        Calculate Energy
        Queue Ping
        │
2s      │                                       Upload Ping
        │                                       (beacon_1, 6.5)
        │
2.5s    │                   Detect Beacon 1
        │                   RSSI: -67
        │
3s      Process Beacons
        (Skip - within 5s)
        │
4s      │                   Detect Beacon 2
        │                   RSSI: -70
        │
4.5s    Process Beacons
        Calculate Energy
        Queue Ping
        │
6s      │                                       Upload Ping
        │                                       (beacon_2, 5.0)
        │
7s      │                   Detect Beacon 1
        │                   RSSI: -62 (big change)
        │
7.5s    Process Beacons
        Energy delta >= 1.5
        Queue Ping
        │
8s      │                                       Upload Ping
        │                                       (beacon_1, 7.8)
```

## Component Dependencies

```
EventModeView
    │
    ├─► BLEService
    │       │
    │       ├─► BeaconRegistryService
    │       │       │
    │       │       └─► Supabase (beacons table)
    │       │
    │       ├─► CoreLocation (CLLocationManager)
    │       │
    │       └─► Supabase (upsert_presence_ping RPC)
    │
    └─► SuggestedConnectionsView
            │
            └─► SuggestedConnectionsService
                    │
                    ├─► Supabase (infer_ble_edges RPC)
                    ├─► Supabase (interaction_edges table)
                    ├─► Supabase (promote_edge_to_connection RPC)
                    └─► Supabase (community table)
```

## Summary

This architecture provides:
- **Separation of concerns**: Views, Services, Models
- **Reactive UI**: Published properties with SwiftUI
- **Efficient caching**: 6-hour beacon cache
- **Debounced uploads**: Avoid database spam
- **Privacy-first**: Opt-in, clear disclosure
- **Offline resilience**: In-memory queue with retry
- **Scalable**: Handles multiple beacons and users
