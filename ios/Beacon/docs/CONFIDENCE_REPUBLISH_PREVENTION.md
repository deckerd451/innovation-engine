# Beacon Confidence Republish Prevention

## Problem Summary

BeaconConfidenceService was repeatedly republishing the same values to `@Published` properties, causing unnecessary downstream updates:

1. **Repeated nil republishes**: When no beacons were found, `handleNoQualifyingBeacon()` would reassign all properties to nil/searching even if they were already in that state
2. **Repeated stable beacon republishes**: When a beacon was already stable, RSSI updates would republish `activeBeacon` with the same beacon (just different RSSI), triggering full lifecycle handling in EventPresenceService
3. **Inefficient reset**: Used `DispatchQueue.main.async` unnecessarily when already on MainActor

## Root Cause

The service was treating every evaluation cycle as a state change, even when the logical state hadn't changed:
- "No beacons" → "No beacons" was treated as a state change
- "Stable beacon A" → "Stable beacon A (different RSSI)" was treated as a state change

This caused Combine publishers to emit repeatedly, triggering downstream observers unnecessarily.

## Solution Implemented

### 1. Prevent Repeated Nil Republishes

Added early return in `handleNoQualifyingBeacon()`:

```swift
private func handleNoQualifyingBeacon() {
    // Prevent repeated nil republishes when already in clean searching state
    if confidenceState == .searching && 
       activeBeacon == nil && 
       candidateBeacon == nil && 
       currentCandidateId == nil {
        print("[CONFIDENCE] Already in clean searching state, skipping republish")
        return
    }
    
    print("[CONFIDENCE] No qualifying beacon, returning to searching")

    confidenceState = .searching
    candidateBeacon = nil
    activeBeacon = nil
    currentCandidateId = nil
    candidateStartTime = nil
}
```

Now:
- Only publishes state change when transitioning TO searching state
- Skips republish when already in clean searching state
- Reduces unnecessary Combine emissions

### 2. Prevent Repeated Same-Beacon Stable Republishes

Modified `updateCandidateConfidence()` to skip republishing for RSSI refreshes:

```swift
if duration >= confidenceWindow {
    // Beacon has met confidence window requirement
    if confidenceState != .stable {
        // Initial promotion to stable - publish activeBeacon
        promoteToStable(beacon: beacon, startTime: startTime)
        return
    }

    // Already stable - this is just an RSSI refresh
    // Don't republish activeBeacon, just log
    print("[CONFIDENCE] 🔄 Stable beacon RSSI refresh: \(beacon.name) at \(beacon.rssi) dBm")
    print("[CONFIDENCE]   Same stable beacon remains active, NOT republishing")
    return
}
```

Now:
- `promoteToStable()` is the ONLY place that publishes `activeBeacon` for initial stable transition
- RSSI refreshes for already-stable beacons are logged but don't republish
- Eliminates repeated `activeBeacon` emissions that trigger EventPresenceService

### 3. Simplified Reset Method

Removed unnecessary `DispatchQueue.main.async` since class is already `@MainActor`:

```swift
func reset() {
    print("[CONFIDENCE] Reset requested")
    confidenceState = .searching
    activeBeacon = nil
    candidateBeacon = nil
    currentCandidateId = nil
    candidateStartTime = nil
    print("[CONFIDENCE] ✅ Reset complete")
}
```

Now:
- Direct state mutation on MainActor
- No dispatch overhead
- Cleaner, more straightforward code

## State Transition Flow

### Before Fix

```
No beacons → No beacons → No beacons (repeated publishes)
Stable A (RSSI -60) → Stable A (RSSI -62) → Stable A (RSSI -61) (repeated publishes)
```

### After Fix

```
No beacons → (no publish) → (no publish) (single publish only)
Stable A (RSSI -60) → (no publish) → (no publish) (single publish only)
```

## Logging Changes

### Repeated Nil State (Skipped)
```
[CONFIDENCE] Already in clean searching state, skipping republish
```

### RSSI Refresh (Not Republished)
```
[CONFIDENCE] 🔄 Stable beacon RSSI refresh: MOONSIDE-S1 at -62 dBm
[CONFIDENCE]   Same stable beacon remains active, NOT republishing
```

### Initial Stable Transition (Published)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONFIDENCE] ✅ STABLE BEACON ACHIEVED
  Name: MOONSIDE-S1
  Beacon ID: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
  RSSI: -60 dBm
  Signal: Near
  Confidence Duration: 3.2s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONFIDENCE] 📝 PUBLISHING activeBeacon NOW (initial stable transition)
[CONFIDENCE] ✅ Published activeBeacon = MOONSIDE-S1
```

## Impact on EventPresenceService

Before this fix, EventPresenceService would receive repeated `activeBeacon` updates:
- Each RSSI refresh triggered `handleBeaconChange()`
- Each call went through `handleStableBeacon()`
- Grace task was being cancelled repeatedly (now also fixed in EventPresenceService)

After this fix:
- `activeBeacon` only publishes once when beacon becomes stable
- RSSI refreshes don't trigger EventPresenceService at all
- No unnecessary state churn in presence handling
- Significantly reduced risk of race conditions and crashes

## Performance Benefits

1. **Reduced Combine overhead**: Fewer publisher emissions means less work for Combine framework
2. **Reduced observer overhead**: Downstream observers (EventPresenceService, UI) only update when state actually changes
3. **Reduced logging**: Less noise in logs from repeated state assignments
4. **Reduced CPU usage**: No unnecessary state comparisons and updates
5. **Reduced crash risk**: Fewer state transitions means fewer opportunities for race conditions

## Files Modified

- `ios/Beacon/Beacon/Services/BeaconConfidenceService.swift`
  - Added early return in `handleNoQualifyingBeacon()` to prevent repeated nil republishes
  - Modified `updateCandidateConfidence()` to skip republishing for RSSI refreshes
  - Kept `promoteToStable()` as the only place that publishes `activeBeacon`
  - Simplified `reset()` to mutate state directly on MainActor

## Testing Recommendations

1. Monitor logs for "Already in clean searching state, skipping republish"
2. Verify "Stable beacon RSSI refresh" appears for RSSI updates
3. Confirm "PUBLISHING activeBeacon NOW" only appears once per stable transition
4. Check that EventPresenceService doesn't receive repeated same-beacon updates
5. Verify UI updates only when beacon state actually changes
6. Test beacon loss and recovery scenarios
7. Confirm no performance degradation or increased CPU usage

## Compatibility

This change is fully backward compatible:
- External API unchanged
- Published properties still emit all necessary state changes
- Only eliminates redundant emissions
- No breaking changes to observers
