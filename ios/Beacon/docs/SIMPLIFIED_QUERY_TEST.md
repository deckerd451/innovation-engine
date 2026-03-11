# Simplified Query Test

## Purpose

Temporarily simplified EventAttendeesService to prove whether the app can read any attendee rows at all from the database, without any time filters.

## Changes Made

### 1. Added Published Debug String

**File:** `ios/Beacon/Beacon/Services/EventAttendeesService.swift`

Added near other published properties:
```swift
@Published var debugStatus: String = "idle"
```

This allows the UI to display the raw query results.

### 2. Simplified Attendee Query

**Removed:**
- `expires_at > now()` filter
- `created_at >= 5 minutes ago` filter
- All time-based filtering

**New Query:**
```swift
let sessions: [AttendeePresenceRow] = try await supabase
    .from("presence_sessions")
    .select("user_id, energy, created_at, expires_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: contextId.uuidString)
    .neq("user_id", value: userId.uuidString)
    .order("created_at", ascending: false)
    .limit(50)
    .execute()
    .value
```

**What it does:**
- Fetches ALL rows for the beacon context
- Excludes only the current user
- No time filtering at all
- Limited to 50 rows max

### 3. Set Debug Status After Query

**On Success:**
```swift
debugStatus = "raw sessions count = \(sessions.count), contextId = \(contextId.uuidString), userId = \(userId.uuidString)"
```

**On Error:**
```swift
debugStatus = "query failed: \(error.localizedDescription)"
```

### 4. Show Debug Status in NetworkView

**File:** `ios/Beacon/Beacon/Views/NetworkView.swift`

Added to temporary debug diagnostics:
```swift
Text("attendees.debugStatus = \(attendees.debugStatus)")
    .font(.caption)
    .foregroundColor(.yellow)
```

## What This Tests

### Scenario 1: Query Returns Rows
```
attendees.debugStatus = raw sessions count = 5, contextId = 8b7c40b1-0c94-497a-8f4e-a815f570cc25, userId = <user-id>
```

**Diagnosis:** App CAN read rows from database
**Next Step:** The time filter was the problem, restore it correctly

### Scenario 2: Query Returns 0 Rows
```
attendees.debugStatus = raw sessions count = 0, contextId = 8b7c40b1-0c94-497a-8f4e-a815f570cc25, userId = <user-id>
```

**Diagnosis:** No rows exist for this context_id, OR RLS policy still blocking
**Next Step:** 
- Verify context_id matches Supabase
- Check RLS policy was applied
- Check both users writing to same context_id

### Scenario 3: Query Fails
```
attendees.debugStatus = query failed: <error message>
```

**Diagnosis:** Network error, auth error, or database error
**Next Step:** Check error message for details

### Scenario 4: Wrong Context ID
```
attendees.debugStatus = raw sessions count = 0, contextId = <different-id>, userId = <user-id>
```

**Diagnosis:** App is querying wrong context_id
**Next Step:** Check presence.currentContextId is set correctly

## Expected Console Logs

### When Query Runs:
```
[Attendees] 🔍 Live presence values:
[Attendees]    presence.currentEvent: CharlestonHacks Test Event
[Attendees]    presence.currentContextId: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    presence.currentCommunityId: <user-id>
[Attendees]    Querying context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    Excluding user_id: <user-id>
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    exclude user_id: <user-id>
[Attendees]    NO TIME FILTER - fetching all rows
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: X
[Attendees]    debugStatus: raw sessions count = X, contextId = ..., userId = ...
```

### If Rows Found:
```
[Attendees]    Raw user_ids returned:
[Attendees]      [0] user_id: <other-user-id>
[Attendees]          created_at: 2026-03-10 15:20:00 +0000
[Attendees]          age: 120s ago
[Attendees]          expires_at: 2026-03-10 15:22:30 +0000
[Attendees]          expires_in: 30s
[Attendees]          energy: 0.75
```

### If Query Fails:
```
[Attendees] ❌ Query failed: <error>
[Attendees]    Error details: <details>
[Attendees]    debugStatus: query failed: <error>
```

## On-Screen Display

The Network view will show:
```
displayAttendees.count = 0
attendees.attendeeCount = 0
attendees.attendees.count = 0
showMockAttendees = false
attendees.debugStatus = raw sessions count = X, contextId = ..., userId = ...
```

The yellow `debugStatus` line is the key indicator.

## What We Learn

### If debugStatus shows count > 0:
✅ App can read from database
✅ RLS policy is working
✅ Context ID is correct
❌ Time filter or processing logic is the problem

### If debugStatus shows count = 0:
❌ No rows exist for this context
**Check:**
- Are both users writing to same context_id?
- Does context_id match hardcoded value?
- Was RLS policy applied?

### If debugStatus shows "query failed":
❌ Database access problem
**Check:**
- Network connectivity
- Supabase credentials
- Auth session valid
- Error message details

## Verification Steps

1. **Turn Event Mode ON** on both devices
2. **Both detect beacon** and write presence
3. **Open Network view** on one device
4. **Read debugStatus** line (yellow text)
5. **Compare to scenarios** above
6. **Check console logs** for details

## What Was NOT Changed

- BLE services
- Supabase schema
- RLS policies
- EventAttendeesService architecture
- Profile resolution
- UI layout (except debug line)

## Temporary Nature

This is a diagnostic change. Once we determine the issue:

**If rows are found:**
- Restore proper time filter (`expires_at > now()`)
- Keep the query working

**If no rows found:**
- Fix context_id or RLS issue
- Then restore time filter

## Next Steps Based on Results

### Count > 0:
1. Restore `expires_at > now()` filter
2. Verify filtered results still work
3. Remove debug diagnostics
4. Test on both devices

### Count = 0:
1. Check Supabase directly for rows
2. Verify context_id matches
3. Verify RLS policy applied
4. Check both users writing presence

### Query Failed:
1. Read error message
2. Check network/auth
3. Verify Supabase connection
4. Check console for details
