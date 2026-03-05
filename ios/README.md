# CharlestonHacks Innovation Engine - iOS App

Native iOS app for CharlestonHacks Innovation Engine with QR networking and BLE Passive Networking.

## Features

### Core Features
1. **My QR** - Display personal QR code for networking
2. **Scan** - Scan QR codes to create instant connections
3. **Event Mode** - BLE passive networking with iBeacon scanning
4. **Network** - View connections as 2D constellation

### BLE Passive Networking (NEW)
- Automatic proximity-based connection suggestions using iBeacon technology
- Opt-in Event Mode for privacy
- Energy-based signal strength calculation
- Debounced presence uploads to Supabase
- "People you were near" suggestions with Accept/Ignore/Block actions

## Structure

```
InnovationEngine/
├── App/
│   ├── InnovationEngineApp.swift          # Entry point + login
│   └── AppEnvironment.swift               # Supabase client singleton
├── Models/
│   ├── User.swift                         # User model
│   ├── Connection.swift                   # Connection model
│   ├── Beacon.swift                       # Beacon & cache models
│   ├── InteractionEdge.swift              # Suggested connection models
│   └── PresenceSession.swift              # Presence ping model
├── Services/
│   ├── AuthService.swift                  # Authentication
│   ├── ConnectionService.swift            # Connection management
│   ├── QRService.swift                    # QR code generation/parsing
│   ├── BeaconRegistryService.swift        # Beacon cache & registry
│   ├── BLEService.swift                   # iBeacon scanning & uploads
│   └── SuggestedConnectionsService.swift  # Inference & promotion
├── Views/
│   ├── MainTabView.swift                  # 4-tab container
│   ├── MyQRView.swift                     # Display personal QR
│   ├── ScanView.swift                     # Camera scanner
│   ├── EventModeView.swift                # BLE event mode UI
│   ├── SuggestedConnectionsView.swift     # Suggestions list
│   └── NetworkView.swift                  # 2D constellation
└── Supporting/
    └── Info.plist                         # Permissions (Camera, Location, Bluetooth)
```

## Quick Start

### 1. Database Setup

Run migrations in order:
```bash
psql -f migrations/001_create_beacons_table.sql
psql -f migrations/002_create_interaction_edges_table.sql
psql -f migrations/003_create_rpc_functions.sql
psql -f migrations/004_example_beacon_data.sql  # Optional test data
```

Or use Supabase Dashboard SQL Editor.

### 2. Configure App

Update `InnovationEngine/App/AppEnvironment.swift`:
```swift
let supabaseURL = URL(string: "https://YOUR-PROJECT.supabase.co")!
let supabaseKey = "YOUR-ANON-KEY"
```

### 3. Register Beacons

For each physical iBeacon:
```sql
INSERT INTO public.beacons (beacon_key, label, kind, group_id, is_active)
VALUES (
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1',
    'Main Hall',
    'event',
    '<event-group-uuid>',
    true
);
```

### 4. Build & Run

```bash
cd ios
swift build
# Or open in Xcode and run
```

## Dependencies

Add via Swift Package Manager:
- **Supabase Swift**: `https://github.com/supabase/supabase-swift` (v2.0.0+)

Native frameworks:
- AVFoundation (QR scanning)
- CoreImage (QR generation)
- CoreLocation (iBeacon ranging)
- SwiftUI

## Database Requirements

### Existing Tables
- `public.presence_sessions` - Presence pings
- `public.connections` - User connections
- `public.community` - User profiles (for display names)

### New Tables (Run Migrations)
- `public.beacons` - iBeacon registry
- `public.interaction_edges` - Suggested connections

### RPC Functions (Run Migrations)
- `upsert_presence_ping()` - Insert presence ping
- `infer_ble_edges()` - Generate suggestions from overlaps
- `promote_edge_to_connection()` - Accept suggestion

## BLE Passive Networking

### How It Works

1. User toggles Event Mode ON
2. App scans for registered iBeacons
3. Calculates energy scores from RSSI
4. Sends debounced presence pings to Supabase
5. User generates suggestions from overlapping presence
6. User accepts/ignores/blocks suggestions

### Energy Calculation

```swift
// Median RSSI from last 10 samples
energy = (medianRSSI + 90) / 4  // Clamped [0, 10]
energy -= min(stddev, 10) / 2   // Stability penalty
```

### Debouncing Rules

- Max 1 ping per beacon every 5 seconds
- OR if energy change >= 1.5

### Privacy

- Event Mode is opt-in
- Clear disclosure before scanning
- No raw RSSI/location shown
- User controls all suggestions
- Stop button immediately halts scanning

## Testing

### Local Test (1 Beacon)
1. Use physical iBeacon or simulator app
2. Register in database
3. Start Event Mode
4. Verify detection and pings

### Event Test (3-5 Devices)
1. Deploy multiple beacons
2. Multiple users start Event Mode
3. Users move between beacons (2-3 min each)
4. Generate suggestions after 5-10 minutes
5. Test Accept/Ignore/Block

See `SETUP_CHECKLIST.md` for detailed procedures.

## Documentation

- **BLE_PASSIVE_NETWORKING_GUIDE.md** - Complete implementation guide
- **SETUP_CHECKLIST.md** - Step-by-step setup
- **migrations/** - Database SQL scripts

## Troubleshooting

### No beacons detected
- Check location permission
- Verify beacons powered on
- Confirm beacon_key format exact

### Pings not uploading
- Check network connectivity
- Verify Supabase credentials
- Review RLS policies

### No suggestions
- Event Mode was ON during overlap?
- Minimum 2 minutes overlap?
- Within 4-hour lookback?

## Performance

- **Battery**: Foreground scanning only, 1.5s interval
- **Network**: ~36 pings/min with 3 beacons (~3.6 KB/min)

## Requirements

- iOS 16.0+
- Swift 5.9+
- Xcode 15.0+

## Architecture

See `/docs/IOS_V1_ARCHITECTURE.md` for base architecture.

BLE additions follow same patterns:
- Services handle business logic
- Views are presentation only
- Models are Codable structs
- Supabase for all backend

## License

[Your License Here]
