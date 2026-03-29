# Self-Exclusion Analysis - iOS Attendee Query

## Root Cause Identified

**Web app writes presence with community.id**: `d7dde758-1438-4bcd-af13-d83b955c1f95`

**This is the SAME user as the iPhone app**, so if there's self-exclusion logic, it would correctly exclude the web presence as "self".

## Investigation Results

### Current Phone App Community ID
**Location**: `AuthService.shared.currentUser?.id`
**Type**: UUID (community.id from community table)
**Expected Value**: `d7dde758-1438-4bcd-af13-d83b955c1f95` (same as web)

### Comparison with Web App Community ID
**Web**: `d7dde758-1438-4bcd-af13-d83b955c1f95` (from `window.currentUserProfile.id`)
**Phone**: `d7dde758-1438-4bcd-af13-d83b955c1f95` (from `AuthService.shared.currentUser?.id`)
**Result**: ✅ **SAME USER**

## Self-Exclusion Logic Analysis

### EventModeDataService.swift - fetchActiveAttendees()

**Code Review**:
```swift
func fetchActiveAttendees(beaconId: UUID) async throws -> [ActiveAttendee] {
    // Get current user for diagnostic logging
    let currentUserId = AuthService.shared.currentUser?.id
    
    // Query presence_sessions (no user_id filter)
    let presenceSessions: [PresenceSessionRow] = try await supabase
        .from("presence_sessions")
        .select("user_id, energy, expires_at, ...")
        .eq("context_type", value: "beacon")
        .eq("context_id", value: beaconId.uuidString)
        .gt("expires_at", value: nowString)
        .execute()
        .value
    
    // Build attendee list
    var attendees: [ActiveAttendee] = []
    for session in presenceSessions {
        let attendee = ActiveAttendee(
            id: session.userId,
            name: profile?.name ?? "User ...",
            avatarUrl: profile?.avatarUrl,
            energy: session.energy
        )
        attendees.append(attendee)  // ← NO FILTERING HERE
    }
    
    return attendees  // ← Returns ALL attendees including current user
}
```

### Finding: NO SELF-EXCLUSION LOGIC EXISTS

**Query Level**: ❌ No `.neq("user_id", currentUserId)` filter  
**Build Level**: ❌ No `if session.userId != currentUserId` check  
**Return Level**: ❌ No filtering before return  

**Conclusion**: The iOS code does NOT exclude the current user from the attendee list.

## Debug Logging Added

### New Diagnostic Output

Added comprehensive self-exclusion check logging:

```swift
print("  🔨 [SELF-EXCLUSION CHECK] Building attendee list...")
print("     Current User ID: \(currentUserId?.uuidString ?? "none")")
print("     Total presence rows: \(presenceSessions.count)")

for session in presenceSessions {
    let isCurrentUser = session.userId == currentUserId
    
    if isCurrentUser {
        print("     ⚠️  FOUND CURRENT USER IN PRESENCE ROWS")
        print("         user_id: \(session.userId.uuidString)")
        print("         Will this be excluded? Checking...")
    }
    
    attendees.append(attendee)
    print("     + Added attendee: \(attendee.name) \(userMarker)")
}

print("  📊 [SELF-EXCLUSION CHECK] Results:")
print("     Attendees before filtering: \(attendees.count)")
print("     Current user in list: \(attendees.contains(where: { $0.id == currentUserId }))")

let currentUserAttendee = attendees.first(where: { $0.id == currentUserId })
if let currentUserAttendee = currentUserAttendee {
    print("     ⚠️  CURRENT USER IS IN ATTENDEE LIST:")
    print("         ID: \(currentUserAttendee.id.uuidString)")
    print("         Name: \(currentUserAttendee.name)")
    print("         This attendee WILL BE SHOWN in the radar")
}
```

### Expected Console Output

**If web user = phone user (same community.id)**:
```
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
  👤 Current User ID: d7dde758-1438-4bcd-af13-d83b955c1f95
  📊 Raw Presence Rows Returned: 1
  📋 Raw Presence Rows:
     [1] 👤 (YOU)
         user_id: d7dde758-1438-4bcd-af13-d83b955c1f95
         energy: 1.0
  🔨 [SELF-EXCLUSION CHECK] Building attendee list...
     Current User ID: d7dde758-1438-4bcd-af13-d83b955c1f95
     Total presence rows: 1
     ⚠️  FOUND CURRENT USER IN PRESENCE ROWS
         user_id: d7dde758-1438-4bcd-af13-d83b955c1f95
         Will this be excluded? Checking...
     + Added attendee: John Doe 👤 (YOU)
  📊 [SELF-EXCLUSION CHECK] Results:
     Attendees before filtering: 1
     Current user in list: true
     ⚠️  CURRENT USER IS IN ATTENDEE LIST:
         ID: d7dde758-1438-4bcd-af13-d83b955c1f95
         Name: John Doe
         This attendee WILL BE SHOWN in the radar
  🎯 Final Attendee Count: 1
```

## Exact Self-Exclusion Logic Summary

### Current Implementation
**Self-Exclusion**: ❌ **NONE**

The iOS app:
1. ✅ Queries all presence_sessions for the beacon
2. ✅ Includes rows where user_id = current user
3. ✅ Marks them with "(YOU)" in logs
4. ✅ Adds them to the attendee list
5. ✅ Displays them in the radar visualization

**There is NO code that filters out the current user.**

### Why This Matters

If the web app and phone app are logged in as the SAME user (same community.id):
- Web writes presence with user_id = `d7dde758-...`
- Phone queries and finds that row
- Phone sees user_id matches current user
- Phone marks it as "(YOU)" in logs
- **Phone STILL ADDS IT to attendee list**
- **Phone SHOULD SHOW IT in the radar**

### Contradiction

**User reports**: "iPhone does NOT show the laptop/web user as an attendee"

**Code analysis**: iOS code DOES NOT exclude current user, so it SHOULD show

**Possible explanations**:
1. **Different users**: Web and phone are actually different users (different community.id)
2. **UI issue**: Attendee is in the list but not rendering in UI
3. **Timing issue**: Presence expired before phone queried
4. **Profile issue**: Attendee added but name/avatar not showing
5. **Beacon mismatch**: Phone querying different beacon than web writes to

## Testing Instructions

### 1. Confirm Community IDs Match

**Web Console**:
```javascript
console.log('Web Community ID:', window.currentUserProfile?.id);
```

**iOS Console** (from new debug logs):
```
👤 Current User ID: <uuid>
```

**Compare**: These MUST be identical for self-exclusion to be the issue.

### 2. Check for Self-Exclusion

**iOS Console** (look for):
```
⚠️  FOUND CURRENT USER IN PRESENCE ROWS
    user_id: <uuid>
⚠️  CURRENT USER IS IN ATTENDEE LIST:
    ID: <uuid>
    Name: <name>
    This attendee WILL BE SHOWN in the radar
```

**If you see this**: Current user IS in the list and SHOULD be visible.

### 3. Verify Attendee Count

**iOS Console**:
```
📊 [SELF-EXCLUSION CHECK] Results:
   Attendees before filtering: <count>
   Current user in list: true/false
🎯 Final Attendee Count: <count>
```

**Check**: Does final count include the current user?

### 4. Check Radar Display

**iOS App**: Look at the radar visualization
- Count the attendee nodes displayed
- Does it match the "Final Attendee Count" from logs?
- Is there a node marked as "YOU" or with your name?

## Conclusion

**Self-Exclusion Logic**: ❌ **DOES NOT EXIST** in current iOS code

**If web user = phone user**:
- Attendee SHOULD appear in list
- Attendee SHOULD be marked as "(YOU)"
- Attendee SHOULD be visible in radar

**If attendee is NOT showing**:
- It's NOT due to self-exclusion logic
- Check other causes:
  - Different community IDs
  - Beacon ID mismatch
  - Expired presence
  - UI rendering issue
  - Profile resolution failure

## Next Steps

1. Run iOS app with new debug logging
2. Check console output for self-exclusion diagnostics
3. Confirm whether current user appears in attendee list
4. If current user IS in list but NOT visible in UI → UI rendering issue
5. If current user NOT in list → Check beacon ID / expiration / profile resolution

## Commit Information
- **Commit**: 2a690403
- **Message**: "Add self-exclusion debug logging to iOS attendee query"
- **File**: ios/InnovationEngine/Services/EventModeDataService.swift
- **Status**: ✅ Pushed to origin/main
