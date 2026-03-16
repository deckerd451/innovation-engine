# RSSI Refresh Separation Fix

## Problem Summary

After implementing duplicate start protection, logs showed:
- Duplicate start protection was working correctly
- `isPresenceLoopRunning = true` and heartbeat task was active
- **BUT** `handleStableBeacon()` was still being called repeatedly for the same stable beacon
- Each repeated call was cancelling the grace task unnecessarily
- Same-beacon stable RSSI refreshes were flowing through full presence lifecycle handling
- This excessive state churn likely contributed to EXC_BAD_ACCESS crashes

## Root Cause

The app was treating **same-beacon RSSI updates** as **lifecycle events** instead of lightweight signal updates.

When a beacon is stable and the presence loop is already running:
- BLE scanner continues to emit RSSI updates
- Each update triggers `activeBeacon` publisher
- `handleBeaconChange()` calls `handleStableBeacon()` every time
- `handleStableBeacon()` was cancelling grace task on every call
- This created unnecessary state churn even though the duplicate start protection prevented actual restarts

The grace task cancellation was happening **before** the duplicate check, causing repeated cancellation of a task that didn't need to be cancelled.

## Solution Implemented

### 1. Separate Signal Updates from Lifecycle Transitions

Moved the duplicate check **before** grace task cancellation in `handleStableBeacon()`:

```swift
// Check if we're already starting or running for this beacon
// This is a same-beacon RSSI refresh, not a lifecycle transition
if currentBeaconId == beacon.id && (isStartingPresenceLoop || isPresenceLoopRunning) {
    print("[Presence] 🔄 SAME-BEACON RSSI REFRESH IGNORED")
    print("[Presence]   This is a signal update, not a lifecycle transition")
    print("[Presence]   NOT cancelling grace task (no transition)")
    print("[Presence]   NOT restarting presence loop")
    return
}

// This is a real lifecycle transition - cancel grace task
print("[Presence] 🔀 LIFECYCLE TRANSITION DETECTED")
cancelGraceTask()
```

Now:
- Same-beacon RSSI refreshes are detected early and ignored completely
- Grace task is only cancelled on real lifecycle transitions
- No unnecessary state churn while presence loop is running

### 2. Identify Real Lifecycle Transitions

Added explicit logging to distinguish transition types:

```swift
if currentBeaconId == nil {
    print("[Presence]   Transition: nil → \(beacon.name) (new beacon detected)")
} else if currentBeaconId != beacon.id {
    print("[Presence]   Transition: beacon changed (different beacon)")
} else {
    print("[Presence]   Transition: recovering from beacon lost state")
}
```

Real transitions that trigger grace task cancellation:
1. **nil → beacon**: First beacon detected
2. **beacon A → beacon B**: Different beacon detected
3. **recovering from lost**: Beacon returns after being lost

### 3. Hardened Grace Task Cancellation

Created dedicated `cancelGraceTask()` method with safe cleanup:

```swift
/// Safely cancels the grace task with proper cleanup
private func cancelGraceTask() {
    guard let task = graceTask else {
        print("[Presence]   No grace task to cancel")
        return
    }
    
    if task.isCancelled {
        print("[Presence]   Grace task already cancelled")
    } else {
        print("[Presence]   Cancelling grace task...")
        task.cancel()
        print("[Presence]   ✅ Grace task cancelled")
    }
    
    graceTask = nil
}
```

Safety features:
- Checks if task exists before cancelling
- Checks if already cancelled to avoid double-cancellation
- Always sets `graceTask = nil` for cleanup
- Explicit logging for debugging

### 4. Improved Grace Task Implementation

Enhanced `handleBeaconLost()` with better structure and logging:

```swift
graceTask = Task { [weak self] in
    guard let self else {
        print("[Presence] ⚠️ Grace task: self is nil")
        return
    }
    
    print("[Presence] ⏳ Grace task: sleeping for \(Int(self.gracePeriod))s...")
    try? await Task.sleep(nanoseconds: UInt64(self.gracePeriod * 1_000_000_000))
    
    guard !Task.isCancelled else {
        print("[Presence] ⚠️ Grace task: cancelled during sleep")
        return
    }
    
    print("[Presence] ⏰ Grace task: sleep completed, checking beacon state...")
    
    await MainActor.run {
        if self.confidence.activeBeacon == nil {
            print("[Presence] ❌ Grace task: beacon still lost, stopping presence")
            self.stopPresenceWrites()
        } else {
            print("[Presence] ✅ Grace task: beacon recovered, keeping presence active")
        }
    }
}
```

Safety improvements:
- Uses `[weak self]` to prevent retain cycles
- Checks `self` before accessing properties
- Checks cancellation after sleep
- All state mutations on MainActor
- Explicit logging at each step

### 5. Updated stopPresenceWrites()

Now uses the safe `cancelGraceTask()` method:

```swift
private func stopPresenceWrites() {
    if let task = heartbeatTask, !task.isCancelled {
        print("[Presence]   Cancelling heartbeat task...")
        task.cancel()
    }
    heartbeatTask = nil
    
    cancelGraceTask()  // Use safe cancellation method
    
    // ... reset all state ...
}
```

## Explicit Logging Added

### Same-Beacon RSSI Refresh (Ignored)
```
[Presence] 🔄 SAME-BEACON RSSI REFRESH IGNORED
[Presence]   Already starting/running for beacon: MOONSIDE-S1
[Presence]   This is a signal update, not a lifecycle transition
[Presence]   NOT cancelling grace task (no transition)
[Presence]   NOT restarting presence loop
```

### Real Lifecycle Transition
```
[Presence] 🔀 LIFECYCLE TRANSITION DETECTED
[Presence]   Transition: nil → MOONSIDE-S1 (new beacon detected)
[Presence]   Cancelling grace task...
[Presence]   ✅ Grace task cancelled
```

### Grace Task Lifecycle
```
[Presence] 🔴 BEACON LOST - starting grace period
[Presence]   Grace period: 10s
[Presence] ⏳ Grace task: sleeping for 10s...
[Presence] ⏰ Grace task: sleep completed, checking beacon state...
[Presence] ❌ Grace task: beacon still lost, stopping presence
```

### Safe Cancellation
```
[Presence]   Cancelling grace task...
[Presence]   ✅ Grace task cancelled
```
or
```
[Presence]   No grace task to cancel
```
or
```
[Presence]   Grace task already cancelled
```

## Expected Behavior

After this fix:

1. ✅ Same-beacon RSSI refreshes are ignored completely
2. ✅ No grace task cancellation during normal operation
3. ✅ Grace task only cancelled on real lifecycle transitions
4. ✅ No unnecessary state churn while presence loop is running
5. ✅ Safe grace task cancellation with proper cleanup
6. ✅ All state mutations happen on MainActor
7. ✅ No retain cycles with weak self capture
8. ✅ Clear distinction between signal updates and lifecycle events
9. ✅ Reduced risk of EXC_BAD_ACCESS from excessive task churn

## Lifecycle Flow

### Normal Operation (Same Beacon)
```
1. Beacon stable, presence loop running
2. BLE scanner emits RSSI update
3. handleStableBeacon() called
4. Same beacon detected → IGNORED
5. No grace task cancellation
6. No state changes
7. Presence loop continues normally
```

### Beacon Lost and Recovered
```
1. Beacon stable, presence loop running
2. Beacon signal lost
3. handleBeaconLost() called
4. Grace task started (10s countdown)
5. Beacon signal returns within grace period
6. handleStableBeacon() called
7. Grace task cancelled (real transition)
8. Presence loop continues
```

### Beacon Lost Permanently
```
1. Beacon stable, presence loop running
2. Beacon signal lost
3. handleBeaconLost() called
4. Grace task started (10s countdown)
5. Grace period expires
6. stopPresenceWrites() called
7. All state cleared
```

### Beacon Switch
```
1. Beacon A stable, presence loop running
2. Beacon B becomes stable
3. handleStableBeacon(B) called
4. Different beacon detected (real transition)
5. Grace task cancelled
6. Presence loop restarted for beacon B
```

## Files Modified

- `ios/Beacon/Beacon/Services/EventPresenceService.swift`
  - Moved duplicate check before grace task cancellation in `handleStableBeacon()`
  - Added lifecycle transition detection and logging
  - Created dedicated `cancelGraceTask()` method
  - Enhanced `handleBeaconLost()` with better structure and logging
  - Updated `stopPresenceWrites()` to use safe cancellation
  - Added comprehensive diagnostic logging

## Testing Recommendations

1. Monitor logs for "SAME-BEACON RSSI REFRESH IGNORED" messages during normal operation
2. Verify grace task is NOT cancelled repeatedly while presence loop is running
3. Confirm "LIFECYCLE TRANSITION DETECTED" only appears on real transitions
4. Test beacon lost and recovery scenarios
5. Test switching between different beacons
6. Verify no EXC_BAD_ACCESS crashes occur
7. Check that presence loop continues smoothly without state churn

## Performance Impact

Before:
- Grace task cancelled on every RSSI update (potentially dozens per second)
- Excessive state churn and task creation/cancellation
- Increased risk of race conditions and crashes

After:
- Grace task only cancelled on real transitions (rare events)
- Minimal state churn during normal operation
- Reduced task overhead and crash risk
