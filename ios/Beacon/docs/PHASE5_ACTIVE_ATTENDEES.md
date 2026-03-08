# Phase 5: Active Attendees - Implementation Summary

## Overview

Phase 5 adds real-time visibility of other active attendees in the same beacon context. When Event Mode is active and a stable beacon is detected, the app queries Supabase for other users' presence sessions and displays them in a read-only UI section.

## Files Changed

### 1. New File: `Beacon/Services/EventAttendeesService.swift`
**Purpose:** Manages active attendee queries and state

**Key Features:**
- Observes EventPresenceService for current event context
- Queries presence_sessions for active users
- Refreshes attendee list every 15 seconds
- Excludes current user from results
- Resolves community profiles for display names

### 2. Modified: `Beacon/Services/EventPresenceService.swift`
**Changes:**
- Exposed `currentContextId` and `currentCommunityId` as computed properties
- Renamed internal properties to `_currentContextId` and `_currentCommunityId`
- No changes to presence write logic

### 3. Modified: `Beacon/BeaconApp.swift`
**Changes:**
- Added EventAttendeesService initialization in `init()`

### 4. Modified: `Beacon/Views/EventModeView.swift`
**Changes:**
- Added `@ObservedObject` for EventAttendeesService
- Added `activeAttendeesSection` view component
- Conditionally displays attendees when event is active

## Query Logic

### Attendee Query Filter

```swift
let sessions: [AttendeePresenceRow] = try await supabase
    .from("presence_sessions")
    .select("user_id, energy, created_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: contextId.uuidString)  // Current beacon/event UUID
    .neq("user_id", value: userId.uuidString)       // Exclude current user
    .gte("created_at", value: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-300)))  // Last 5 minutes
    .order("created_at", ascending: false)
    .execute()
    .value
```

### Filter Criteria

1. **context_type = "beacon"** - Only beacon-based presence
2. **context_id = current event/beacon UUID** - Same beacon context
3. **user_id != current user** - Exclude self
4. **created_at >= NOW() - 5 minutes** - Recent activity only
5. **Order by created_at DESC** - Most recent first

### Deduplication

- Takes most recent session per user
- Handles multiple presence writes from same user
- Ensures unique attendee list

### Profile Resolution

```swift
let profiles: [AttendeeCommunityRow] = try await supabase
    .from("community")
    .select("id, name, avatar_url")
    .or(filters)  // id.eq.<uuid1>,id.eq.<uuid2>,...
    .execute()
    .value
```

## Refresh Behavior

### Automatic Refresh

- **Trigger:** When `EventPresenceService.currentEvent` becomes non-nil
- **Interval:** Every 15 seconds
- **Stop:** When `currentEvent` becomes nil (beacon lost or Event Mode disabled)

### Refresh Loop

```
EventPresenceService.currentEvent changes
  ↓
EventAttendeesService.startRefreshing()
  ↓
Initial fetch
  ↓
while !Task.isCancelled {
    await Task.sleep(15s)
    await fetchAttendees()
}
```

## UI Display

### Active Attendees Section

**Location:** EventModeView, below Nearby Signals section

**Visibility:**
- Only shown when `presence.currentEvent != nil`
- Only shown when `attendees.attendees.isEmpty == false`

**Components:**

1. **Header**
   - Icon: person.2.fill (purple)
   - Title: "Active Attendees"
   - Count badge: Shows total attendee count

2. **Attendee List** (max 5 shown)
   - Avatar circle (green if active now, gray if recent)
   - Name from community profile
   - Last seen indicator
   - Energy level indicator (color-coded dot)

3. **Overflow Indicator**
   - Shows "+ X more" if more than 5 attendees

### Attendee Display

```
┌─────────────────────────────────────┐
│ 👥 Active Attendees            [3] │
│                                     │
│ 🟢 Alice Johnson                   │
│    Active now                    🟢 │
│                                     │
│ ⚪ Bob Smith                        │
│    45s ago                       🟠 │
│                                     │
│ ⚪ Carol Davis                      │
│    2m ago                        ⚫ │
└─────────────────────────────────────┘
```

### Status Indicators

**Active Now (Green Circle):**
- Last seen < 30 seconds ago
- Text: "Active now"

**Recent (Gray Circle):**
- Last seen 30-300 seconds ago
- Text: "Xs ago" or "Xm ago"

**Energy Level (Dot Color):**
- Green: energy 0.7-1.0 (very close)
- Orange: energy 0.4-0.7 (medium)
- Gray: energy 0.0-0.4 (far)

## Debug Logging

### Attendee Service Logs

```
[Attendees] Starting attendee refresh for context: <uuid>
[Attendees] Querying active attendees for beacon context: <uuid>
[Attendees] Found X active attendee(s)
[Attendees] Stopping attendee refresh
[Attendees] Cannot start: missing context_id or user_id
[Attendees] Failed to fetch attendees: <error>
```

### Log Locations

1. **Start Refresh:** When presence service has active event
2. **Query Start:** Before each Supabase query
3. **Query Result:** After receiving attendee count
4. **Stop Refresh:** When event becomes inactive
5. **Errors:** On query failures or missing context

## Expected Behavior

### Scenario 1: Single User at Event

```
User A arrives at MOONSIDE-S1 beacon
  ↓
Beacon becomes stable
  ↓
Presence writes start
  ↓
Attendees query returns 0 results (no other users)
  ↓
Active Attendees section NOT shown (empty list)
```

### Scenario 2: Multiple Users at Event

```
User A already at event (presence active)
  ↓
User B arrives at MOONSIDE-S1 beacon
  ↓
User B's beacon becomes stable
  ↓
User B's presence writes start
  ↓
User B's attendees query returns 1 result (User A)
  ↓
Active Attendees section shown with User A
  ↓
Every 15 seconds: refresh shows updated list
```

### Scenario 3: User Leaves Event

```
User A and User B both at event
  ↓
User A moves away from beacon
  ↓
User A's presence writes stop
  ↓
After 5 minutes: User A's presence sessions expire
  ↓
User B's next refresh (15s) no longer shows User A
  ↓
Active Attendees section updates automatically
```

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│ EventPresenceService                                │
│                                                     │
│ currentEvent: "CharlestonHacks Test Event"         │
│ currentContextId: <beacon-uuid>                    │
│ currentCommunityId: <user-uuid>                    │
└─────────────────────────────────────────────────────┘
                    ↓ observes
┌─────────────────────────────────────────────────────┐
│ EventAttendeesService                               │
│                                                     │
│ startRefreshing()                                   │
│   ↓                                                 │
│ fetchAttendees() every 15s                          │
│   ↓                                                 │
│ Query presence_sessions                             │
│   ↓                                                 │
│ Resolve community profiles                          │
│   ↓                                                 │
│ Update @Published attendees                         │
└─────────────────────────────────────────────────────┘
                    ↓ observes
┌─────────────────────────────────────────────────────┐
│ EventModeView                                       │
│                                                     │
│ if presence.currentEvent != nil &&                  │
│    !attendees.attendees.isEmpty {                   │
│   activeAttendeesSection                            │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

## Phase 5 Constraints (Maintained)

✅ No changes to BLE scanning logic
✅ No changes to confidence logic
✅ No changes to presence heartbeat logic
✅ Read-only UI (no interactions)
✅ No interaction_edges creation
✅ No suggested connections generation changes
✅ No auto-connection logic
✅ Excludes current user from attendee list
✅ Uses existing beacon context from EventPresenceService

## Testing Scenarios

### Test 1: Single User
1. User A enables Event Mode
2. MOONSIDE-S1 becomes stable
3. Presence writes start
4. Active Attendees section NOT shown (no other users)

**Expected:**
- No Active Attendees section visible
- No errors in console

### Test 2: Two Users
1. User A at event (presence active)
2. User B enables Event Mode
3. User B's beacon becomes stable
4. User B's presence writes start
5. After 15 seconds, attendees refresh

**Expected:**
- User B sees Active Attendees section
- User A listed with name and status
- Count shows "1"
- User A sees User B after their next refresh

### Test 3: User Leaves
1. User A and User B both at event
2. User A moves away from beacon
3. User A's presence stops
4. Wait 5+ minutes
5. User B's next refresh

**Expected:**
- User B no longer sees User A
- Count updates to "0"
- Active Attendees section disappears

### Test 4: Multiple Users
1. Users A, B, C, D, E, F all at event
2. All have stable beacons and active presence
3. User G arrives

**Expected:**
- User G sees Active Attendees section
- Shows first 5 users (A, B, C, D, E)
- Shows "+ 1 more" indicator
- Count shows "6"

## Database Requirements

### presence_sessions Table

Must have columns:
- `user_id` (UUID)
- `context_type` (TEXT)
- `context_id` (UUID)
- `energy` (DOUBLE PRECISION)
- `created_at` (TIMESTAMP)

### community Table

Must have columns:
- `id` (UUID)
- `name` (TEXT)
- `avatar_url` (TEXT, nullable)

### RLS Policies

Must allow:
- SELECT on presence_sessions for authenticated users
- SELECT on community for authenticated users

## Performance Considerations

### Query Optimization

- Uses indexed columns (context_type, context_id, created_at)
- Limits to last 5 minutes of data
- Orders by created_at DESC for efficient sorting
- Deduplicates in-memory (not in query)

### Refresh Rate

- 15-second interval balances freshness vs. load
- Only refreshes when event is active
- Stops immediately when event ends

### UI Updates

- @Published properties trigger automatic UI updates
- SwiftUI efficiently diffs attendee list
- Only shows first 5 attendees (limits rendering)

## Future Enhancements (Not in Phase 5)

- Tap attendee to view profile
- Filter by energy level
- Sort by proximity
- Show attendee count over time
- Export attendee list
- Attendee notifications

## Summary

Phase 5 successfully adds read-only active attendee visibility to Event Mode. When a stable beacon is detected and mapped to an event, the app queries Supabase every 15 seconds for other users' presence sessions in the same beacon context, resolves their community profiles, and displays them in a clean UI section. The implementation maintains all Phase 4 functionality while adding real-time awareness of other attendees at the event.
