# Event Anchor vs Peer Device Separation

## Overview

The Beacon iOS app now clearly separates two distinct BLE device roles:

### 1️⃣ Event Anchor Beacons
Physical beacons that define event spaces and trigger event presence.

**Examples:**
- `MOONSIDE-S1`

**Behavior:**
- Triggers event presence when detected as stable
- Activates the Event Mode UI
- Creates presence_sessions rows in the database
- Shows event name in the UI

### 2️⃣ Peer Devices
Nearby participants running the Beacon app.

**Examples:**
- `BEACON-iPhone`
- `BEACON-iPad`
- Any device with `BEACON-` prefix

**Behavior:**
- Detected and displayed in "Nearby Signals"
- Never triggers event presence
- Never activates Event Mode UI
- Represents nearby attendees for future peer-to-peer features

## Implementation

### EventPresenceService.swift

Added early guard in `handleStableBeacon()`:

```swift
// Ignore peer devices - they are not event anchors
if beacon.name.hasPrefix("BEACON-") {
    print("[Presence] ℹ️ Stable peer device detected: \(beacon.name)")
    print("[Presence] ℹ️ This is not an event anchor beacon, ignoring for event presence")
    return
}
```

This ensures only event anchor beacons can:
- Look up event mappings
- Start presence loops
- Write presence_sessions rows

### EventModeView.swift

Added helper functions to filter event anchors:

```swift
private func isEventAnchor(_ name: String) -> Bool {
    return name == "MOONSIDE-S1"
}

private var activeEventAnchor: ConfidentBeacon? {
    guard let beacon = confidence.activeBeacon else { return nil }
    return isEventAnchor(beacon.name) ? beacon : nil
}

private var candidateEventAnchor: ConfidentBeacon? {
    guard let beacon = confidence.candidateBeacon else { return nil }
    return isEventAnchor(beacon.name) ? beacon : nil
}
```

Updated `currentBeaconCard` to use:
- `activeEventAnchor` instead of `confidence.activeBeacon`
- `candidateEventAnchor` instead of `confidence.candidateBeacon`

## Expected Behavior

### When MOONSIDE-S1 is detected:
```
[CONFIDENCE] ✅ Published activeBeacon = MOONSIDE-S1
[Presence] 📡 activeBeacon changed: MOONSIDE-S1 (state: Stable)
[Presence] 🚪 ENTERED handleStableBeacon()
[Presence] ✅ Event mapping found!
[Presence] 🎬 ENTERED startPresenceLoop()
[Presence] ✅ INSERT SUCCESSFUL - presence_sessions row written
```

**UI shows:**
- Event Beacon card: "CharlestonHacks Test Event"
- Network View activates
- Attendee count appears

### When BEACON-iPhone is detected:
```
[CONFIDENCE] ✅ Published activeBeacon = BEACON-iPhone
[Presence] 📡 activeBeacon changed: BEACON-iPhone (state: Stable)
[Presence] 🚪 ENTERED handleStableBeacon()
[Presence] ℹ️ Stable peer device detected: BEACON-iPhone
[Presence] ℹ️ This is not an event anchor beacon, ignoring for event presence
```

**UI shows:**
- Event Beacon card: "Searching for event beacons..."
- BEACON-iPhone appears in "Nearby Signals" section
- Network View shows "No Active Event"

## Architecture

```
BLE Detection Layer
├── BLEScannerService (detects all BLE devices)
├── BLEAdvertiserService (broadcasts this device)
└── BeaconConfidenceService (promotes signals to stable)
    │
    ├─→ Event Anchor Beacons (MOONSIDE-S1)
    │   └─→ EventPresenceService
    │       └─→ Writes presence_sessions
    │           └─→ EventAttendeesService
    │               └─→ NetworkView
    │
    └─→ Peer Devices (BEACON-*)
        └─→ Displayed in Nearby Signals
            └─→ Future: peer-to-peer interactions
```

## Benefits

1. **Clear separation of concerns**: Event anchors define spaces, peers represent people
2. **Prevents false event activation**: Peer devices never trigger event presence
3. **Scalable architecture**: Easy to add more event anchor types
4. **Future-ready**: Peer devices can enable direct device-to-device features
5. **Better UX**: Users see accurate event status and nearby participants

## Future Enhancements

- Add more event anchor beacon types (e.g., `MOONSIDE-S2`, `MOONSIDE-S3`)
- Implement peer-to-peer interaction edges based on proximity
- Add peer device filtering and search in Nearby Signals
- Enable direct messaging between peer devices
- Show peer device profiles in Network View when no event is active
