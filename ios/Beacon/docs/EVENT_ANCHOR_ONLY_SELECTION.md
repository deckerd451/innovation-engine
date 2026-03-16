# Event Anchor Only Selection

## Problem Summary

BeaconConfidenceService was allowing peer devices (names starting with "BEACON-") and other known beacons to become the `activeBeacon` when no event anchor was present. This caused:

1. **Wrong beacon type driving presence**: Peer devices would trigger event presence logic
2. **Incorrect event mode activation**: Non-event beacons would activate event mode
3. **Confusion in logs**: Hard to distinguish between event anchors and peer devices
4. **Unintended behavior**: Peer-to-peer beacons should be visible but not drive event lifecycle

## Root Cause

The beacon selection logic used a fallback chain:

```swift
guard let strongest = eventAnchors.first ?? otherKnownBeacons.first ?? peerDevices.first else {
    handleNoQualifyingBeacon()
    return
}
```

This meant:
- If no event anchors were present, other beacons would be selected
- Peer devices could become `activeBeacon`
- Event presence would be triggered by non-event beacons

## Solution Implemented

### Event Anchor Only Selection

Changed the selection logic to only consider event anchors:

```swift
// Only event anchors can become activeBeacon
// Peer devices and other beacons are visible in logs only
guard let strongest = eventAnchors.first else {
    if !peerDevices.isEmpty {
        print("[CONFIDENCE-EVAL] ℹ️ Peer devices present but no event anchor - not eligible for activeBeacon")
    }
    if !otherKnownBeacons.isEmpty {
        print("[CONFIDENCE-EVAL] ℹ️ Other beacons present but no event anchor - not eligible for activeBeacon")
    }
    handleNoQualifyingBeacon()
    return
}
```

Now:
- Only event anchors (currently "MOONSIDE-S1") can become `activeBeacon`
- Peer devices are detected and logged but not selected
- Other known beacons are detected and logged but not selected
- If no event anchor is present, confidence returns to searching state

## Beacon Categories

### Event Anchors (Eligible for activeBeacon)
- Beacons that match `isEventAnchor()` check
- Currently: "MOONSIDE-S1"
- These drive event presence and event mode
- Can become candidate → stable → activeBeacon

### Peer Devices (Not Eligible)
- Names starting with "BEACON-"
- Other attendees' devices
- Visible in logs for debugging
- Never become activeBeacon
- Used for proximity/network visualization only

### Other Known Beacons (Not Eligible)
- Beacons that don't match event anchor or peer device patterns
- Visible in logs for debugging
- Never become activeBeacon
- Reserved for future use

## Behavior Changes

### Before Fix

```
Scenario: Event anchor lost, peer device present

[CONFIDENCE-EVAL] Found 1 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 0
[CONFIDENCE-EVAL]   Peer devices: 1
[CONFIDENCE-EVAL] Selected beacon: BEACON-ABC123 (peer device)
[CONFIDENCE] 🔍 NEW CANDIDATE DETECTED
  Name: BEACON-ABC123
  
→ Peer device becomes activeBeacon
→ Event presence triggered incorrectly
```

### After Fix

```
Scenario: Event anchor lost, peer device present

[CONFIDENCE-EVAL] Found 1 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 0
[CONFIDENCE-EVAL]   Peer devices: 1
[CONFIDENCE-EVAL] ℹ️ Peer devices present but no event anchor - not eligible for activeBeacon
[CONFIDENCE] No qualifying beacon, returning to searching

→ Peer device logged but not selected
→ Confidence returns to searching
→ Event presence stops correctly
```

## Logging Examples

### Event Anchor Present (Normal Operation)
```
[CONFIDENCE-EVAL] Trigger: timer
[CONFIDENCE-EVAL] Found 3 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 1
[CONFIDENCE-EVAL]   Peer devices: 2
[CONFIDENCE-EVAL]   Other known beacons: 0
[CONFIDENCE-EVAL] Selected beacon: MOONSIDE-S1 (ID: 8b7c40b1-...)
[CONFIDENCE] ✅ STABLE BEACON ACHIEVED
```

### No Event Anchor, Peer Devices Present
```
[CONFIDENCE-EVAL] Trigger: timer
[CONFIDENCE-EVAL] Found 2 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 0
[CONFIDENCE-EVAL]   Peer devices: 2
[CONFIDENCE-EVAL]   Other known beacons: 0
[CONFIDENCE-EVAL] ℹ️ Peer devices present but no event anchor - not eligible for activeBeacon
[CONFIDENCE] No qualifying beacon, returning to searching
```

### No Event Anchor, Other Beacons Present
```
[CONFIDENCE-EVAL] Trigger: timer
[CONFIDENCE-EVAL] Found 1 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 0
[CONFIDENCE-EVAL]   Peer devices: 0
[CONFIDENCE-EVAL]   Other known beacons: 1
[CONFIDENCE-EVAL] ℹ️ Other beacons present but no event anchor - not eligible for activeBeacon
[CONFIDENCE] No qualifying beacon, returning to searching
```

### No Beacons at All
```
[CONFIDENCE-EVAL] Trigger: timer
[CONFIDENCE-EVAL] Found 0 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 0
[CONFIDENCE-EVAL]   Peer devices: 0
[CONFIDENCE-EVAL]   Other known beacons: 0
[CONFIDENCE] Already in clean searching state, skipping republish
```

## Impact on Event Presence

This change ensures EventPresenceService only activates for real event anchors:

### Before Fix
```
Event anchor lost → Peer device detected → activeBeacon published → 
EventPresenceService starts presence loop → Wrong beacon drives presence
```

### After Fix
```
Event anchor lost → Peer device detected → No activeBeacon published → 
EventPresenceService stops presence loop → Correct behavior
```

## Impact on Network Visualization

Peer devices are still:
- Detected by BLEScannerService
- Available in `discoveredDevices`
- Visible in NetworkView for proximity visualization
- Used for Find Mode

They just don't drive the event presence lifecycle.

## Future Extensibility

To add more event anchors, update `isEventAnchor()`:

```swift
private func isEventAnchor(_ name: String) -> Bool {
    name == "MOONSIDE-S1" || 
    name == "MOONSIDE-S2" || 
    name == "VENUE-ANCHOR-01"
}
```

Or use a configuration-based approach:

```swift
private let eventAnchorNames: Set<String> = [
    "MOONSIDE-S1",
    "MOONSIDE-S2",
    "VENUE-ANCHOR-01"
]

private func isEventAnchor(_ name: String) -> Bool {
    eventAnchorNames.contains(name)
}
```

## Files Modified

- `ios/Beacon/Beacon/Services/BeaconConfidenceService.swift`
  - Changed selection logic to only consider `eventAnchors.first`
  - Removed fallback to `otherKnownBeacons` and `peerDevices`
  - Added informative logging when non-event beacons are present
  - Peer devices and other beacons still computed for logging visibility

## Testing Recommendations

1. Verify event anchor becomes activeBeacon normally
2. Test with only peer devices present - should return to searching
3. Test with only other beacons present - should return to searching
4. Confirm peer devices still visible in NetworkView
5. Verify event presence only activates for event anchors
6. Check logs show peer devices detected but not selected
7. Test event anchor loss and recovery

## Expected Behavior

### Event Mode Activation
- Only event anchors can activate event mode
- Peer devices never activate event mode
- Clear separation between event and peer beacons

### Peer Device Visibility
- Peer devices still detected and logged
- Still available for proximity visualization
- Still used for Find Mode
- Just don't drive event lifecycle

### Clean State Transitions
- Event anchor present → Event mode active
- Event anchor lost → Return to searching (even if peers present)
- Event anchor returns → Event mode reactivates

## Compatibility

This change is backward compatible:
- External API unchanged
- Peer devices still available for visualization
- Only changes which beacons can become activeBeacon
- No breaking changes to observers
- Clearer separation of concerns
