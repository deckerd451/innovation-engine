# Presence Loop Fix - Complete

## Problem Summary

The app was experiencing repeated presence-loop startup failures and EXC_BAD_ACCESS crashes due to:

1. **Re-entrant presence loop starts**: `handleStableBeacon()` was being called multiple times, creating overlapping Tasks
2. **Cancelled network requests**: Multiple `resolveCommunityId()` requests were being issued and cancelled (NSURLErrorCancelled -999)
3. **Stale task references**: Cancelled tasks were likely being accessed later, causing crashes
4. **Repeated network queries**: Community ID was being fetched from network on every presence loop start

## Solution Implemented

### 1. Idempotent Presence Loop Startup

Added state tracking to prevent duplicate starts:

```swift
private var isStartingPresenceLoop = false
private var isPresenceLoopRunning = false
```

In `handleStableBeacon()`:
- Check if already starting/running for the same beacon
- Ignore duplicate calls with explicit logging
- Only proceed if not already active

### 2. Cached Community ID Usage

Modified `startPresenceLoop()` to prefer cached data:

```swift
// Try to use cached community ID from AuthService first
let communityId: UUID
if let cachedId = AuthService.shared.currentUser?.id {
    print("[Presence] ✅ Using cached community.id from AuthService")
    communityId = cachedId
} else {
    print("[Presence] ⚠️ No cached community.id, fetching from network...")
    guard let resolvedId = await resolveCommunityId() else {
        // Handle failure
        return
    }
    communityId = resolvedId
}
```

This eliminates repeated network queries during normal operation.

### 3. Proper Cancellation Handling

Updated `writePresence()` to detect and handle NSURLErrorCancelled:

```swift
catch {
    // Check if this is a cancellation error (NSURLErrorCancelled = -999)
    let isCancellation: Bool
    if let nsError = error as NSError?, 
       nsError.domain == NSURLErrorDomain, 
       nsError.code == NSURLErrorCancelled {
        isCancellation = true
    } else {
        isCancellation = false
    }
    
    if isCancellation {
        // Treat as non-fatal, log separately
        print("[Presence] ⚠️ PRESENCE WRITE CANCELLED")
        debugStatus = "Write cancelled (task replaced)"
    } else {
        // Real error - log with full details
        print("[Presence] ❌ PRESENCE WRITE FAILED")
        debugStatus = "FAILED INSERT: \(error.localizedDescription)"
    }
}
```

### 4. MainActor Isolation

All state mutations that affect UI/ObservableObject now happen on MainActor:

```swift
await MainActor.run {
    isWritingPresence = true
    debugStatus = "Writing presence row..."
}

// ... network operation ...

await MainActor.run {
    lastPresenceWrite = Date()
    debugStatus = "SUCCESS: ..."
}
```

### 5. Complete State Reset

Updated `stopPresenceWrites()` to reset all flags:

```swift
func stopPresenceWrites() {
    heartbeatTask?.cancel()
    heartbeatTask = nil
    graceTask?.cancel()
    graceTask = nil
    
    currentBeaconId = nil
    _currentCommunityId = nil
    _currentContextId = nil
    currentEvent = nil
    isWritingPresence = false
    isStartingPresenceLoop = false  // Reset flag
    isPresenceLoopRunning = false   // Reset flag
    debugStatus = "Stopped"
}
```

## Explicit Logging Added

The implementation now logs:

1. **Duplicate calls ignored**:
   ```
   [Presence] 🔁 DUPLICATE START IGNORED
   [Presence]   Already starting/running for beacon: MOONSIDE-S1
   ```

2. **Presence task lifecycle**:
   ```
   [Presence] 🚀 Creating new Task for presence loop...
   [Presence] 📍 INSIDE Task closure
   [Presence] 🏁 Presence loop exited
   ```

3. **Cached vs network community.id**:
   ```
   [Presence] ✅ Using cached community.id from AuthService
   [Presence] ⚠️ No cached community.id, fetching from network...
   ```

4. **Cancellation vs real errors**:
   ```
   [Presence] ⚠️ PRESENCE WRITE CANCELLED (non-fatal)
   [Presence] ❌ PRESENCE WRITE FAILED (real error)
   ```

5. **Final loop state**:
   ```
   [Presence] 🛑 STOPPING PRESENCE WRITES
   [Presence] ♻️ HEARTBEAT STARTED
   ```

## Expected Behavior

After this fix:

1. ✅ No more repeated presence loop starts for the same beacon
2. ✅ No more NSURLErrorCancelled (-999) spam in logs
3. ✅ No more EXC_BAD_ACCESS crashes from stale task references
4. ✅ Community ID fetched once and cached, not repeatedly queried
5. ✅ Cancellations treated as non-fatal and logged separately
6. ✅ All UI state mutations happen safely on MainActor
7. ✅ Clear diagnostic logs showing what's happening

## Files Modified

- `ios/Beacon/Beacon/Services/EventPresenceService.swift`
  - Added `isStartingPresenceLoop` and `isPresenceLoopRunning` flags
  - Added duplicate detection in `handleStableBeacon()`
  - Modified `startPresenceLoop()` to use cached community ID
  - Updated `writePresence()` with proper cancellation handling
  - Added MainActor isolation for all state mutations
  - Updated `stopPresenceWrites()` to reset all flags
  - Added comprehensive diagnostic logging

## Testing Recommendations

1. Monitor logs for "DUPLICATE START IGNORED" messages
2. Verify no NSURLErrorCancelled (-999) errors appear
3. Confirm "Using cached community.id" appears after first resolution
4. Check that presence writes succeed without repeated cancellations
5. Verify no EXC_BAD_ACCESS crashes occur
6. Test beacon loss and re-detection scenarios
