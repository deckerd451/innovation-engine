# Find Attendee Mode Implementation

## Overview

Added a lightweight Find Attendee Mode that lets users tap an attendee in NetworkView and get live proximity guidance to help locate that person at an event. This feature acts as a simple people-radar using BLE signal strength.

## Files Modified/Created

### Modified
- `ios/Beacon/Beacon/Views/NetworkView.swift`

### Created
- `ios/Beacon/Beacon/Views/FindAttendeeView.swift`

## Implementation Details

### 1. Tappable Attendee Nodes (NetworkView)

Added tap gesture to attendee nodes in the visualization:

```swift
@State private var selectedAttendee: EventAttendee?
```

Each attendee node now has:
```swift
.onTapGesture {
    selectedAttendee = attendee
}
```

Sheet presentation:
```swift
.sheet(item: $selectedAttendee) { attendee in
    FindAttendeeView(attendee: attendee)
}
```

### 2. FindAttendeeView Structure

New SwiftUI view that accepts an `EventAttendee` and provides live proximity guidance.

**Key Components:**

- **Header**: Shows "Find Attendee" and attendee name
- **Radar Visualization**: Animated concentric circles with pulse effect
- **Signal Details**: Proximity label, RSSI value, trend guidance
- **Hint Text**: User guidance to walk slowly

### 3. Peer Device Resolution

Reuses the same heuristic matching logic from NetworkView:

```swift
private func peerDevice(for attendee: EventAttendee) -> DiscoveredBLEDevice?
```

**Matching Strategy:**
1. Known name matching (e.g., "Doug" → BEACON-iPad/iPhone)
2. Single peer device scenario (1 attendee + 1 peer = match)
3. Partial name similarity matching
4. Returns nil if no reliable match

**Important:** Only matches BEACON-* peer devices, never event anchors (MOONSIDE-S1)

### 4. Proximity Label Computation

Maps RSSI to human-readable proximity:

```swift
private func proximityLabel(for rssi: Int) -> String
```

**RSSI Buckets:**
- >= -45 dBm → "Very Close" (green)
- -55 to -46 dBm → "Near" (blue)
- -65 to -56 dBm → "Nearby" (yellow)
- -75 to -66 dBm → "Far" (orange)
- < -75 dBm → "Very Far" (red)

### 5. Warmer/Colder Trend Computation

Tracks rolling window of last 5 RSSI values:

```swift
@State private var recentRSSI: [Int] = []
```

Updates every 1 second via timer:
```swift
private let updateTimer = Timer.publish(every: 1.0, on: .main, in: .common).autoconnect()
```

**Trend Logic:**
```swift
private func trendLabel() -> String
```

- Compare newest RSSI to oldest in window
- Delta >= +4 → "Getting warmer" (green)
- Delta <= -4 → "Getting colder" (red)
- Otherwise → "Hold steady" (gray)

**Key Insight:** Less negative RSSI = stronger signal = closer

Examples:
- -72 → -61 = +11 delta = getting warmer
- -48 → -58 = -10 delta = getting colder

### 6. Radar Visualization

Three concentric circles with animated pulse:

- **Outer ring**: Static white outline (240pt)
- **Middle ring**: Pulsing with signal color (180pt)
- **Inner ring**: Signal color with opacity (120pt)
- **Center circle**: Solid signal color with attendee initial (80pt)

Pulse animation:
```swift
@State private var pulseScale: CGFloat = 1.0

.scaleEffect(pulseScale)
.animation(
    Animation.easeInOut(duration: 1.5)
        .repeatForever(autoreverses: true),
    value: pulseScale
)
```

Color changes based on signal strength (green → blue → yellow → orange → red).

### 7. Fallback State

When no peer device is found:
- Shows antenna slash icon
- "Signal Unavailable" message
- "Move around and try again" hint
- Gray color scheme

## User Flow

1. User opens Network screen (event active, attendees visible)
2. User taps an attendee node in the graph
3. FindAttendeeView opens as a sheet
4. View shows:
   - Attendee name
   - Live animated radar
   - Current proximity label
   - RSSI value
   - Warmer/colder trend
   - Last seen timestamp
5. As user walks:
   - RSSI updates every second
   - Proximity label changes
   - Trend guidance updates
   - Colors shift based on signal
   - Pulse animation reflects strength
6. User taps "Done" to close

## Product Rules Followed

- Event beacon (MOONSIDE-S1) = context only, never used for Find Mode
- Peer devices (BEACON-*) = person proximity signals
- Lightweight v1 implementation
- No database changes
- No backend changes
- No changes to attendee fetching
- No complex directional navigation (future enhancement)

## Temporary Assumptions

**Attendee-to-Device Matching:**
- Uses heuristic name matching for demo
- Assumes "Doug" maps to BEACON-iPad/iPhone
- Single peer + single attendee = automatic match
- Falls back to partial name similarity
- Production version would need explicit device registration or QR pairing

## Future Enhancements

Potential improvements for v2:
- Directional guidance (compass-based)
- Distance estimation in meters/feet
- Multiple attendee tracking
- Explicit device pairing flow
- Historical signal strength graph
- Haptic feedback for proximity changes
- Sound cues for warmer/colder
- AR overlay mode

## Testing Notes

To test Find Mode:
1. Enable Event Mode
2. Ensure MOONSIDE-S1 beacon detected (establishes event context)
3. Ensure BEACON-* peer device detected (represents attendee)
4. Verify attendee appears in Network view
5. Tap attendee node
6. Observe live RSSI updates
7. Move closer/farther to test trend guidance
8. Verify signal colors change appropriately

Expected behavior:
- Moving closer: RSSI increases (less negative), "Getting warmer"
- Moving farther: RSSI decreases (more negative), "Getting colder"
- Standing still: "Hold steady"
