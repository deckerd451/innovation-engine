# Phase 5: Build Error Fix

## Error

```
Cannot assign to property: 'currentCommunityId' is a get-only property
Cannot assign to property: 'currentContextId' is a get-only property
```

**Location:** `Beacon/Services/EventPresenceService.swift`

## Root Cause

The properties `currentCommunityId` and `currentContextId` were exposed as read-only computed properties:

```swift
// Expose for EventAttendeesService
var currentContextId: UUID? { _currentContextId }
var currentCommunityId: UUID? { _currentCommunityId }
```

But the code in `startPresenceLoop()` was trying to assign to them directly:

```swift
currentCommunityId = communityId  // ❌ Error: read-only
currentContextId = contextId      // ❌ Error: read-only
```

## Fix Applied

Changed the assignments to use the private backing properties instead:

### Lines Changed

**File:** `Beacon/Services/EventPresenceService.swift`

**Line 149:** Changed from `currentCommunityId = communityId` to `_currentCommunityId = communityId`

**Line 156:** Changed from `currentContextId = contextId` to `_currentContextId = contextId`

### Before (Lines 148-158)

```swift
        }
        currentCommunityId = communityId
        print("[Presence] resolved community.id: \(communityId)")
        
        guard let contextId = await resolveBeaconId(beaconKey: mapping.beaconKey) else {
            print("[Presence] failed to resolve beacon/event id for key: \(mapping.beaconKey)")
            return
        }
        currentContextId = contextId
        print("[Presence] mapping beacon -> event: \(mapping.eventName) (\(contextId))")
```

### After (Lines 148-158)

```swift
        }
        _currentCommunityId = communityId
        print("[Presence] resolved community.id: \(communityId)")
        
        guard let contextId = await resolveBeaconId(beaconKey: mapping.beaconKey) else {
            print("[Presence] failed to resolve beacon/event id for key: \(mapping.beaconKey)")
            return
        }
        _currentContextId = contextId
        print("[Presence] mapping beacon -> event: \(mapping.eventName) (\(contextId))")
```

## Updated Property Declarations

The property declarations remain unchanged (correct as-is):

```swift
// Public read-only computed properties (for EventAttendeesService)
var currentContextId: UUID? { _currentContextId }
var currentCommunityId: UUID? { _currentCommunityId }

// Private backing storage (writable internally)
private var _currentCommunityId: UUID?
private var _currentContextId: UUID?
```

**Design:**
- Public interface is read-only (computed properties)
- Internal implementation uses private backing properties
- EventAttendeesService can read via public properties
- EventPresenceService can write via private properties

## Verification

### Build Status

✅ `Beacon/Services/EventPresenceService.swift` - No diagnostics
✅ `Beacon/Services/EventAttendeesService.swift` - No diagnostics
✅ `Beacon/BeaconApp.swift` - No diagnostics
✅ `Beacon/Views/EventModeView.swift` - No diagnostics

### Project Build

✅ **Project now builds successfully**

## Summary

- **Exact lines changed:** Lines 149 and 156 in `Beacon/Services/EventPresenceService.swift`
- **Updated assignments:** Changed to use `_currentCommunityId` and `_currentContextId` (private backing properties)
- **Property declarations:** Unchanged (already correct with computed properties for public access and private vars for storage)
- **Build status:** ✅ Successful

The fix maintains the intended design:
- EventAttendeesService can read the current context via public computed properties
- EventPresenceService can update the context via private backing properties
- No other logic changes required
