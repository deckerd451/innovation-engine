# Attendee Expiry Filtering Fix

## Problem Diagnosis

EventAttendeesService was showing many expired historical presence rows instead of only currently active attendees. Logs showed:
- Many presence rows with `expires_in` negative by thousands of seconds
- Repeated rows for the same `user_id` (multiple heartbeat entries)
- Attendee count inflated by expired and duplicate rows

### Root Causes

1. **No expiry filtering**: Query fetched all rows without checking `expires_at > now()`
2. **No active flag check**: Query didn't filter by `is_active = true`
3. **Poor deduplication**: Used first occurrence instead of most recent `last_seen`
4. **Wrong timestamp field**: Used `created_at` instead of `last_seen` for recency

## Solution Implemented

### 1. Server-Side Expiry Filtering

Added filters to the Supabase query:

```swift
let sessions: [AttendeePresenceRow] = try await supabase
    .from("presence_sessions")
    .select("user_id, energy, last_seen, expires_at, is_active")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: contextId.uuidString)
    .eq("is_active", value: true)                    // Only active sessions
    .gt("expires_at", value: nowISO)                 // Only non-expired
    .neq("user_id", value: userId.uuidString)        // Exclude self
    .order("last_seen", ascending: false)            // Most recent first
    .limit(100)
    .execute()
    .value
```

Filters applied:
- `context_type = 'beacon'`: Only beacon-based presence
- `context_id = <current>`: Only current event context
- `is_active = true`: Only active sessions
- `expires_at > now()`: Only non-expired sessions
- `user_id != <self>`: Exclude current user
- Order by `last_seen DESC`: Most recent activity first

### 2. Client-Side Belt-and-Suspenders Check

Added additional client-side filtering:

```swift
// Client-side expiry check (belt and suspenders)
let activeRows = sessions.filter { $0.expiresAt > now && $0.isActive }
let expiredRowsFiltered = totalRowsFetched - activeRows.count

if expiredRowsFiltered > 0 {
    print("[Attendees]    ⚠️ Filtered \(expiredRowsFiltered) expired rows client-side")
}
```

This catches any edge cases where:
- Server-side filtering had timing issues
- Rows expired between query and processing
- Database clock skew exists

### 3. Improved Deduplication by Most Recent last_seen

Changed deduplication logic to keep most recent activity:

```swift
// Deduplicate by user_id, keeping most recent last_seen
var uniqueSessions: [UUID: AttendeePresenceRow] = [:]
for session in activeRows {
    if let existing = uniqueSessions[session.userId] {
        // Keep the one with most recent last_seen
        if session.lastSeen > existing.lastSeen {
            uniqueSessions[session.userId] = session
        }
    } else {
        uniqueSessions[session.userId] = session
    }
}
```

Before: Kept first occurrence (arbitrary)
After: Keeps most recent `last_seen` per user

### 4. Updated Data Model

Changed from `created_at` to `last_seen`:

```swift
private struct AttendeePresenceRow: Codable {
    let userId: UUID
    let energy: Double
    let lastSeen: Date      // Changed from createdAt
    let expiresAt: Date
    let isActive: Bool      // Added
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case lastSeen = "last_seen"    // Changed from created_at
        case expiresAt = "expires_at"
        case isActive = "is_active"    // Added
    }
}
```

`last_seen` is updated on every heartbeat, making it more accurate for "currently active" determination.

### 5. Enhanced Logging

Added comprehensive logging at each stage:

```swift
print("[Attendees] 📥 Query results:")
print("[Attendees]    Total rows fetched: \(totalRowsFetched)")
print("[Attendees]    Active rows after expiry check: \(activeRows.count)")
print("[Attendees]    Unique attendees: \(uniqueUserIds.count)")

debugStatus = "Fetched \(totalRowsFetched) rows → \(activeRows.count) active → \(uniqueUserIds.count) unique"
```

Shows the filtering pipeline:
1. Total rows fetched from database
2. Active rows after expiry filtering
3. Unique attendees after deduplication

## How Expired Rows Are Excluded

### Server-Side Filtering (Primary)

The Supabase query includes:

```swift
.eq("is_active", value: true)
.gt("expires_at", value: nowISO)
```

This filters at the database level:
- `is_active = true`: Only sessions marked as active
- `expires_at > now()`: Only sessions that haven't expired yet

Example:
```
Current time: 2024-01-15 10:30:00

Row 1: expires_at = 2024-01-15 10:35:00 → INCLUDED (expires in 5 minutes)
Row 2: expires_at = 2024-01-15 10:25:00 → EXCLUDED (expired 5 minutes ago)
Row 3: expires_at = 2024-01-15 09:00:00 → EXCLUDED (expired 90 minutes ago)
```

### Client-Side Filtering (Backup)

After fetching, additional check:

```swift
let activeRows = sessions.filter { $0.expiresAt > now && $0.isActive }
```

This catches edge cases:
- Rows that expired during network transit
- Clock skew between server and client
- Race conditions in query execution

### Result

Only currently active attendees are shown:
- No expired historical rows
- No inactive sessions
- Only users present at the event right now

## How One Attendee Is Shown Once

### Problem: Multiple Heartbeat Rows

Each user writes presence every 25 seconds, creating multiple rows:

```
user_id: abc-123
  Row 1: last_seen = 10:30:00, expires_at = 10:35:00
  Row 2: last_seen = 10:30:25, expires_at = 10:35:25
  Row 3: last_seen = 10:30:50, expires_at = 10:35:50
```

Without deduplication, this user would appear 3 times.

### Solution: Deduplication by Most Recent

```swift
var uniqueSessions: [UUID: AttendeePresenceRow] = [:]
for session in activeRows {
    if let existing = uniqueSessions[session.userId] {
        // Keep the one with most recent last_seen
        if session.lastSeen > existing.lastSeen {
            uniqueSessions[session.userId] = session
        }
    } else {
        uniqueSessions[session.userId] = session
    }
}
```

Process:
1. Iterate through all active rows
2. For each `user_id`, check if we've seen it before
3. If yes, compare `last_seen` timestamps
4. Keep the row with the most recent `last_seen`
5. Result: One row per user, showing their latest activity

### Example

Input (3 rows for same user):
```
user_id: abc-123, last_seen: 10:30:00
user_id: abc-123, last_seen: 10:30:25
user_id: abc-123, last_seen: 10:30:50
```

After deduplication:
```
user_id: abc-123, last_seen: 10:30:50  ← Most recent kept
```

Output: User appears once with their latest activity timestamp.

### Logging

Deduplication is logged:

```
[Attendees] 🔍 After deduplication:
[Attendees]    Unique attendees: 5
[Attendees]    ℹ️ Removed 12 duplicate rows (kept most recent per user)
```

Shows how many duplicate heartbeat rows were collapsed.

## Expected Log Output

### Successful Query with Active Attendees

```
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    exclude user_id: user-abc-123
[Attendees]    is_active: true
[Attendees]    expires_at > 2024-01-15T10:30:00Z

[Attendees] 📥 Query results:
[Attendees]    Total rows fetched: 15
[Attendees]    Active rows after expiry check: 15
[Attendees]      [0] user_id: user-def-456
[Attendees]          last_seen: 2024-01-15 10:29:50
[Attendees]          last_seen_ago: 10s
[Attendees]          expires_at: 2024-01-15 10:34:50
[Attendees]          expires_in: 290s
[Attendees]          is_active: true
[Attendees]          energy: 0.75
[Attendees]      ... and 14 more

[Attendees] 🔍 After deduplication:
[Attendees]    Unique attendees: 5
[Attendees]    ℹ️ Removed 10 duplicate rows (kept most recent per user)

[Attendees] 👤 Fetching community profiles for 5 user(s)
[Attendees] 📋 Profile resolution:
[Attendees]    Profiles found: 5
[Attendees]    ✓ Added attendee: Alice (user-def-456)
[Attendees]    ✓ Added attendee: Bob (user-ghi-789)
[Attendees]    ✓ Added attendee: Carol (user-jkl-012)
[Attendees]    ✓ Added attendee: Dave (user-mno-345)
[Attendees]    ✓ Added attendee: Eve (user-pqr-678)

[Attendees] ✅ Final attendee count: 5

debugStatus: "Fetched 15 rows → 15 active → 5 unique"
```

### Query with Expired Rows Filtered

```
[Attendees] 📥 Query results:
[Attendees]    Total rows fetched: 20
[Attendees]    ⚠️ Filtered 3 expired rows client-side
[Attendees]    Active rows after expiry check: 17

[Attendees] 🔍 After deduplication:
[Attendees]    Unique attendees: 6
[Attendees]    ℹ️ Removed 11 duplicate rows (kept most recent per user)

[Attendees] ✅ Final attendee count: 6

debugStatus: "Fetched 20 rows → 17 active → 6 unique"
```

### No Active Attendees

```
[Attendees] 📥 Query results:
[Attendees]    Total rows fetched: 0
[Attendees]    ℹ️ No active presence rows found

[Attendees] ✅ Final attendee count: 0 (no other active users)

debugStatus: "No active attendees (0 rows)"
```

## Files Modified

### ios/Beacon/Beacon/Services/EventAttendeesService.swift

1. **AttendeePresenceRow model**:
   - Changed `createdAt` to `lastSeen`
   - Added `isActive` field
   - Updated CodingKeys

2. **fetchAttendees() query**:
   - Added `.eq("is_active", value: true)` filter
   - Added `.gt("expires_at", value: nowISO)` filter
   - Changed order from `created_at` to `last_seen`
   - Increased limit from 50 to 100
   - Added `is_active` to select clause

3. **Client-side filtering**:
   - Added expiry check: `filter { $0.expiresAt > now && $0.isActive }`
   - Log expired rows filtered client-side

4. **Deduplication logic**:
   - Changed to keep most recent `last_seen` per user
   - Was: First occurrence (arbitrary)
   - Now: Most recent activity

5. **Logging enhancements**:
   - Log total rows fetched
   - Log active rows after filtering
   - Log unique attendees after deduplication
   - Log sample rows with expiry details
   - Enhanced debugStatus with pipeline info

## Testing Recommendations

1. Verify no expired rows appear in attendee list
2. Check that each user appears only once
3. Confirm `last_seen` shows recent activity
4. Test with multiple users writing presence
5. Verify attendee count matches unique active users
6. Check logs show filtering pipeline
7. Test edge case: user's presence expires during query
8. Verify debugStatus shows correct counts

## Backward Compatibility

Changes are backward compatible:
- Query uses standard Supabase filters
- Client-side deduplication is additive
- Logging is enhanced, not removed
- No breaking changes to public API
- Works with existing presence_sessions schema

## Future Improvements

1. **Database-level deduplication**: Use DISTINCT ON or window functions
2. **Upsert-based presence**: Replace insert with upsert to avoid duplicates
3. **Materialized view**: Pre-compute active attendees
4. **Real-time subscriptions**: Use Supabase real-time for live updates
5. **Presence cleanup**: Background job to delete expired rows
