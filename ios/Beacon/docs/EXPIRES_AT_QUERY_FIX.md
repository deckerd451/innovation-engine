# Expires At Query Fix

## Problem

EventAttendeesService was returning 0 attendees even though:
- ✅ Event is active
- ✅ Presence is being written
- ✅ Database has 2 active users in presence_sessions
- ✅ RLS policy allows reading all rows

### Root Cause

The attendee query was using the wrong filter:
```swift
.gte("created_at", value: fiveMinutesAgoISO)  // Last 5 minutes
```

**Why this failed:**
- Active presence is defined by `expires_at > now()`, not `created_at`
- A presence row created 6 minutes ago but with `expires_at` in the future is still active
- The query was excluding active sessions that were created more than 5 minutes ago

## Solution

### Change 1: Added Explicit Context Logging

**Added before query execution:**
```swift
print("[Attendees] 🔍 Live presence values:")
print("[Attendees]    presence.currentEvent: \(presence.currentEvent ?? "nil")")
print("[Attendees]    presence.currentContextId: \(presence.currentContextId?.uuidString ?? "nil")")
print("[Attendees]    presence.currentCommunityId: \(presence.currentCommunityId?.uuidString ?? "nil")")
print("[Attendees]    Querying context_id: \(contextId.uuidString)")
print("[Attendees]    Excluding user_id: \(userId.uuidString)")
```

**Purpose:** Verify the app is querying the same `context_id` visible in Supabase.

### Change 2: Replaced created_at Filter with expires_at

**Before:**
```swift
let now = Date()
let fiveMinutesAgo = now.addingTimeInterval(-300)
let fiveMinutesAgoISO = ISO8601DateFormatter().string(from: fiveMinutesAgo)

let sessions: [AttendeePresenceRow] = try await supabase
    .from("presence_sessions")
    .select("user_id, energy, created_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: contextId.uuidString)
    .neq("user_id", value: userId.uuidString)
    .gte("created_at", value: fiveMinutesAgoISO)  // ❌ Wrong filter
    .order("created_at", ascending: false)
    .execute()
    .value
```

**After:**
```swift
let now = Date()
let nowISO = ISO8601DateFormatter().string(from: now)

let sessions: [AttendeePresenceRow] = try await supabase
    .from("presence_sessions")
    .select("user_id, energy, created_at, expires_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: contextId.uuidString)
    .neq("user_id", value: userId.uuidString)
    .gt("expires_at", value: nowISO)  // ✅ Correct filter
    .order("created_at", ascending: false)
    .execute()
    .value
```

**Key Changes:**
- Changed from `.gte("created_at", value: fiveMinutesAgoISO)` to `.gt("expires_at", value: nowISO)`
- Added `expires_at` to SELECT clause
- Removed 5-minute window calculation
- Now uses current time for comparison

### Change 3: Updated AttendeePresenceRow Model

**Before:**
```swift
private struct AttendeePresenceRow: Codable {
    let userId: UUID
    let energy: Double
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case createdAt = "created_at"
    }
}
```

**After:**
```swift
private struct AttendeePresenceRow: Codable {
    let userId: UUID
    let energy: Double
    let createdAt: Date
    let expiresAt: Date  // ✅ Added
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case createdAt = "created_at"
        case expiresAt = "expires_at"  // ✅ Added
    }
}
```

### Change 4: Improved Row Logging

**Added to row logging:**
```swift
let timeUntilExpiry = session.expiresAt.timeIntervalSince(now)
print("[Attendees]          expires_at: \(session.expiresAt)")
print("[Attendees]          expires_in: \(Int(timeUntilExpiry))s")
```

**Purpose:** Confirm returned rows are truly active (not expired).

## How It Works Now

### Query Logic

**Old Logic (Broken):**
```
Filter: created_at >= (now - 5 minutes)
Problem: Excludes active sessions created > 5 minutes ago
Example: Session created 6 minutes ago with expires_at in 20 seconds → EXCLUDED ❌
```

**New Logic (Fixed):**
```
Filter: expires_at > now
Correct: Includes all sessions that haven't expired yet
Example: Session created 6 minutes ago with expires_at in 20 seconds → INCLUDED ✅
```

### Presence Session Lifecycle

```
1. Session created
   created_at = 10:00:00
   expires_at = 10:00:30 (30 second TTL)

2. At 10:00:05 (5 seconds later)
   Old query: ✅ Included (created < 5 min ago)
   New query: ✅ Included (expires_at > now)

3. At 10:00:25 (25 seconds later)
   Old query: ✅ Included (created < 5 min ago)
   New query: ✅ Included (expires_at > now)

4. Heartbeat refreshes session
   created_at = 10:00:00 (unchanged)
   expires_at = 10:00:55 (extended)

5. At 10:06:00 (6 minutes after creation)
   Old query: ❌ EXCLUDED (created > 5 min ago)
   New query: ✅ Included (expires_at > now)
   
   This is the bug! Session is still active but old query excludes it.
```

## Console Logs to Look For

### Context Verification:
```
[Attendees] 🔍 Live presence values:
[Attendees]    presence.currentEvent: CharlestonHacks Test Event
[Attendees]    presence.currentContextId: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    presence.currentCommunityId: <user-id>
[Attendees]    Querying context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    Excluding user_id: <user-id>
```

### Query Parameters:
```
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    exclude user_id: <user-id>
[Attendees]    expires_at > 2026-03-10T15:22:00Z
[Attendees]    (active sessions only)
```

### Query Results:
```
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 1
[Attendees]    Raw user_ids returned:
[Attendees]      [0] user_id: <other-user-id>
[Attendees]          created_at: 2026-03-10 15:20:00 +0000
[Attendees]          age: 120s ago
[Attendees]          expires_at: 2026-03-10 15:22:30 +0000
[Attendees]          expires_in: 30s
[Attendees]          energy: 0.75
[Attendees] ✅ Final attendee count: 1
```

## What Changed in the Attendee Query

### Filter Change
- **Old:** `created_at >= (now - 5 minutes)`
- **New:** `expires_at > now`

### SELECT Clause
- **Old:** `"user_id, energy, created_at"`
- **New:** `"user_id, energy, created_at, expires_at"`

### Time Calculation
- **Old:** Calculate 5 minutes ago, format as ISO string
- **New:** Use current time, format as ISO string

### Comparison Operator
- **Old:** `.gte("created_at", ...)` (greater than or equal)
- **New:** `.gt("expires_at", ...)` (greater than)

## Context ID Being Logged

The fix logs the exact `context_id` being queried:
```swift
print("[Attendees]    Querying context_id: \(contextId.uuidString)")
```

This allows verification that:
1. The app is using the correct hardcoded beacon ID: `8b7c40b1-0c94-497a-8f4e-a815f570cc25`
2. The query matches what's in Supabase
3. Both devices are querying the same context

## AttendeePresenceRow Updated

The model now includes `expiresAt`:
```swift
let expiresAt: Date
```

With corresponding coding key:
```swift
case expiresAt = "expires_at"
```

This allows:
- Decoding the `expires_at` column from Supabase
- Logging time until expiry
- Future filtering or sorting by expiry time

## Benefits

1. **Correct Active Definition**: Uses TTL-based expiration, not arbitrary time window
2. **Handles Long Sessions**: Works even if session created hours ago but still active
3. **Matches Backend Logic**: Aligns with how Supabase defines active presence
4. **Better Debugging**: Logs show exact context IDs and expiry times
5. **More Reliable**: Won't miss active users due to creation time

## Testing Checklist

- [ ] Turn Event Mode ON on both devices
- [ ] Both detect MOONSIDE-S1
- [ ] Both write presence (green timestamp)
- [ ] Check console for context_id logs
- [ ] Verify both devices query same context_id
- [ ] Check "expires_at > now" in query logs
- [ ] See "Total rows returned: 1" on each device
- [ ] See "expires_in: Xs" showing positive seconds
- [ ] Network view shows "Attendees: 1"
- [ ] On-screen diagnostics show attendees.attendees.count = 1
- [ ] "You're Here Alone" message disappears

## What Was NOT Changed

- BLE services
- UI layout (except debug diagnostics)
- Supabase schema
- RLS policies
- EventAttendeesService architecture
- Refresh interval (still 15 seconds)
- Profile resolution logic
- Deduplication logic

## Expected Result

After this fix, with both devices active near the same beacon:

**On-screen diagnostics should show:**
```
displayAttendees.count = 1
attendees.attendeeCount = 1
attendees.attendees.count = 1
showMockAttendees = false
```

**Network view should show:**
- "Attendees: 1" (not 0)
- Other user's name in the network visualization
- No "You're Here Alone" message

**Console should show:**
```
[Attendees] ✅ Final attendee count: 1
```

## Why This Fix Works

The fix aligns the iOS query with how Supabase defines active presence:

**Supabase Active Presence:**
- Rows where `expires_at > NOW()`
- TTL-based expiration
- Heartbeat extends `expires_at`

**iOS Query (Now Fixed):**
- Rows where `expires_at > now`
- Matches Supabase definition
- Includes all active sessions regardless of creation time

This ensures the iOS app sees the same active users that Supabase considers active.
