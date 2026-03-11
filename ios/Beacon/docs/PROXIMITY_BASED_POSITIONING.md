# Proximity-Based Attendee Positioning

## Implementation Summary

Added proximity-based positioning to NetworkView so attendee nodes dynamically respond to physical proximity based on BLE signal strength from peer devices.

## Changes Made

### File Modified
- `ios/Beacon/Beacon/Views/NetworkView.swift`

### New Helper Methods

1. **`proximityScore(for:) -> Double`**
   - Maps RSSI to proximity score (0.0-1.0)
   - RSSI >= -45 → 1.0 (very close)
   - RSSI -55 to -46 → 0.8 (near)
   - RSSI -65 to -56 → 0.6 (nearby)
   - RSSI -75 to -66 → 0.4 (far)
   - RSSI < -75 → 0.25 (very far)
   - Returns 0.5 if no peer device matched

2. **`peerDevice(for:) -> DiscoveredBLEDevice?`**
   - Matches attendees to peer BLE devices (BEACON-* devices)
   - Uses heuristic name matching:
     - Known names (e.g., "Doug" → BEACON-iPad/iPhone)
     - Single peer device scenario
     - Partial name similarity matching
   - Returns nil if no reliable match

3. **`radiusForAttendee(_:in:) -> CGFloat`**
   - Dynamic radius based on proximity
   - Range: 18% (very close) to 36% (far) of available size
   - Higher proximity score = smaller radius (closer to center)

4. **`nodeSize(for:) -> CGFloat`**
   - Dynamic node size based on proximity
   - Range: 38pt (far) to 52pt (very close)
   - Closer attendees have larger nodes

5. **`lineOpacity(for:) -> Double`**
   - Dynamic connection line opacity
   - Range: 0.15 (far) to 0.60 (very close)
   - Closer attendees have more visible lines

6. **`proximityLabel(for:) -> String`**
   - Debug label showing proximity category
   - Values: "Very Close", "Near", "Nearby", "Far", "Very Far", "Unknown"

### Updated Visualization

- Each attendee now uses individual radius (not fixed)
- Node size varies by proximity
- Line opacity varies by proximity
- Added temporary proximity label under attendee names
- Added smooth animation (0.35s ease-in-out) for proximity changes

## Product Rules Followed

- Event beacon (MOONSIDE-S1) = context only, not a node
- Peer devices (BEACON-*) = proximity signals for attendees
- Event anchor does not become a node in the graph
- Kept implementation lightweight and practical
- No database or backend changes
- No changes to attendee fetching logic

## Behavior

When an attendee's peer device signal is stronger:
- Node appears closer to "You" (smaller radius)
- Node is slightly larger
- Connection line is more visible
- Proximity label shows "Very Close" or "Near"

When signal weakens:
- Node moves farther away (larger radius)
- Node gets slightly smaller
- Connection line becomes fainter
- Proximity label shows "Far" or "Very Far"

If no peer device matched:
- Attendee renders at default medium radius (0.5 score)
- Proximity label shows "Unknown"

## Temporary Elements

The proximity label under attendee names is marked as temporary debug output and can be removed once proximity behavior is validated.
