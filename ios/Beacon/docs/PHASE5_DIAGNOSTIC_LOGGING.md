# Phase 5: Diagnostic Logging Added

## Overview

Added comprehensive diagnostic logging to EventAttendeesService to identify why web user presence isn't appearing on iPhone.

## Changes Made

### EventAttendeesService.swift

#### 1. Enhanced startRefreshing() Logging

**Added:**
```
[Attendees] ✅ Starting attendee refresh
[Attendees]    Current user community.id: <uuid>
[Attendees]    Current event/beacon context_id: <uuid>
[Attendees]    Refresh interval: 15.0s
```

**Error case:**
```
[Attendees] ❌ Cannot start: missing context_id or user_id
[Attendees]    context_id: <uuid or nil>
[Attendees]    user_id: <uuid or nil>
```

**Already running:**
```
[Attendees] ℹ️ Already refreshing same context, skipping
```

**Periodic refresh:**
```
[Attendees] 🔄 Periodic refresh triggered
```

#### 2. Comprehensive fetchAttendees() Logging

**Query parameters:**
```
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: <uuid>
[Attendees]    exclude user_id: <uuid>
[Attendees]    created_at >= 2026-03-07T14:25:00Z
[Attendees]    (5 minutes ago from now)
```

**Raw query results:**
```
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 3
[Attendees]    Raw user_ids returned:
[Attendees]      [0] user_id: a50a9484-26a5-4083-9e7a-b698f7145bb8
[Attendees]          created_at: 2026-03-07 14:28:45 +0000
[Attendees]          age: 45s ago
[Attendees]          energy: 0.75
[Attendees]      [1] user_id: a50a9484-26a5-4083-9e7a-b698f7145bb8
[Attendees]          created_at: 2026-03-07 14:28:20 +0000
[Attendees]          age: 70s ago
[Attendees]          energy: 0.73
[Attendees]      [2] user_id: b1234567-89ab-cdef-0123-456789abcdef
[Attendees]          created_at: 2026-03-07 14:27:30 +0000
[Attendees]          age: 120s ago
[Attendees]          energy: 0.65
```

**After deduplication:**
```
[Attendees] 🔍 After deduplication:
[Attendees]    Unique user_ids: 2
[Attendees]    ℹ️ Dropped 1 duplicate rows
```

**Profile resolution:**
```
[Attendees] 👤 Fetching community profiles for 2 user(s)
[Attendees] 🔍 Community query filter: id.eq.a50a9484-26a5-4083-9e7a-b698f7145bb8,id.eq.b1234567-89ab-cdef-0123-456789abcdef
[Attendees] 📥 Community profiles returned: 2
[Attendees]    ✓ Douglas Hamilton (a50a9484-26a5-4083-9e7a-b698f7145bb8)
[Attendees]    ✓ Test User (b1234567-89ab-cdef-0123-456789abcdef)
```

**Missing profiles:**
```
[Attendees] 📋 Profile resolution:
[Attendees]    Profiles found: 1
[Attendees]    ⚠️ Missing profiles for 1 user(s)
[Attendees]       Missing profile for: b1234567-89ab-cdef-0123-456789abcdef
```

**Final attendees:**
```
[Attendees]    ✓ Added attendee: Douglas Hamilton (a50a9484-26a5-4083-9e7a-b698f7145bb8)
[Attendees]    ✓ Added attendee: Test User (b1234567-89ab-cdef-0123-456789abcdef)
[Attendees] ✅ Final attendee count: 2
```

**Query failure:**
```
[Attendees] ❌ Query failed: <error>
[Attendees]    Error details: <description>
```

#### 3. Profile Resolution Logging

**Community query:**
```
[Attendees] 🔍 Community query filter: id.eq.<uuid1>,id.eq.<uuid2>
[Attendees] 📥 Community profiles returned: 2
[Attendees]    ✓ Alice Johnson (uuid1)
[Attendees]    ✓ Bob Smith (uuid2)
```

### EventModeView.swift

#### Added onChange Handler

```swift
Text("Active attendees: \(attendees.attendeeCount)")
    .onChange(of: attendees.attendeeCount) { newCount in
        print("[ATTENDEES UI] current count = \(newCount)")
    }
```

**Output:**
```
[ATTENDEES UI] current count = 0
[ATTENDEES UI] current count = 2
[ATTENDEES UI] current count = 1
```

## Diagnostic Flow

### Expected Log Sequence (Successful)

```
1. [Presence] beacon stable: MOONSIDE-S1
2. [Presence] resolved community.id: 1dabe68d-aa99-4d14-a479-96b8daae6e0b
3. [Presence] found beacon in database: CharlestonHacks Test Event (3a4f2cfe-eb2e-4d17-abc3-a075f38b713b)
4. [Presence] mapping beacon -> event: CharlestonHacks Test Event (3a4f2cfe-eb2e-4d17-abc3-a075f38b713b)
5. [Attendees] ✅ Starting attendee refresh
6. [Attendees]    Current user community.id: 1dabe68d-aa99-4d14-a479-96b8daae6e0b
7. [Attendees]    Current event/beacon context_id: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
8. [Attendees] 📊 Query parameters:
9. [Attendees]    context_type: beacon
10. [Attendees]    context_id: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
11. [Attendees]    exclude user_id: 1dabe68d-aa99-4d14-a479-96b8daae6e0b
12. [Attendees] 📥 Raw query results:
13. [Attendees]    Total rows returned: 1
14. [Attendees]    Raw user_ids returned:
15. [Attendees]      [0] user_id: a50a9484-26a5-4083-9e7a-b698f7145bb8
16. [Attendees] 🔍 After deduplication:
17. [Attendees]    Unique user_ids: 1
18. [Attendees] 👤 Fetching community profiles for 1 user(s)
19. [Attendees] 📥 Community profiles returned: 1
20. [Attendees]    ✓ Douglas Hamilton (a50a9484-26a5-4083-9e7a-b698f7145bb8)
21. [Attendees]    ✓ Added attendee: Douglas Hamilton
22. [Attendees] ✅ Final attendee count: 1
23. [ATTENDEES UI] current count = 1
```

## Diagnostic Questions Answered

### 1. Does the phone receive raw matching rows for the web user?

**Check:** Look for `[Attendees] 📥 Raw query results:` section

**If YES:**
- Will show `Total rows returned: N` where N > 0
- Will list web user's UUID in raw user_ids

**If NO:**
- Will show `Total rows returned: 0`
- Will show `ℹ️ No rows matched query`

**Possible causes if NO:**
- Wrong context_id (check query parameters)
- Wrong context_type (should be "beacon")
- Web user's presence_sessions have wrong context_id
- Web user's created_at is older than 5 minutes
- Web user's user_id is being excluded (shouldn't be)

### 2. Are rows dropped by self-exclusion?

**Check:** Compare raw rows vs unique user_ids

**If web user UUID appears in raw results but not in unique user_ids:**
- Self-exclusion is working correctly
- Web user UUID should NOT match phone user's community.id

**If web user UUID is missing from raw results:**
- Self-exclusion is NOT the issue
- Problem is in the query itself

**Verify:**
```
[Attendees]    exclude user_id: <phone-user-uuid>
[Attendees]      [0] user_id: <web-user-uuid>
```
These should be DIFFERENT UUIDs.

### 3. Are rows dropped by profile resolution?

**Check:** Compare unique user_ids count vs profiles returned count

**If counts match:**
- Profile resolution is working
- All users have community profiles

**If counts don't match:**
```
[Attendees]    ⚠️ Missing profiles for N user(s)
[Attendees]       Missing profile for: <uuid>
```

**Possible causes:**
- Web user has no community profile
- Web user's community.id doesn't match their user_id in presence_sessions
- Community table query is failing

### 4. Are rows dropped by recency/active filtering?

**Check:** Row timestamps in raw results

**Current filter:** `created_at >= NOW() - 5 minutes`

**If web user's row shows:**
```
[Attendees]          created_at: 2026-03-07 14:20:00 +0000
[Attendees]          age: 600s ago
```

**And query shows:**
```
[Attendees]    created_at >= 2026-03-07 14:25:00Z
```

**Then:** Row is TOO OLD (600s > 300s), filtered out by recency

**Solution:** Web needs to write presence more frequently, or phone needs longer window

### 5. Schema Audit: created_at vs last_seen/expires_at/is_active

**Current implementation uses:** `created_at`

**Potential issues:**
- If presence_sessions has `last_seen` or `expires_at` columns
- And web is updating those instead of creating new rows
- Then phone query won't find them (looking at created_at only)

**Check web logs for:**
- Are new rows being INSERT-ed every 25 seconds?
- Or are existing rows being UPDATE-d?

**If UPDATE-d:**
- Phone query needs to use `last_seen` or `expires_at` instead of `created_at`

## Known Web User Data

From web logs:
- **auth user id:** `a50a9484-26a5-4083-9e7a-b698f7145bb8`
- **community.id:** `1dabe68d-aa99-4d14-a479-96b8daae6e0b`
- **context_id:** `3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`
- **context_type:** `beacon`
- **Writes:** Every 25 seconds

## Expected Diagnostic Output

### If web user appears correctly:

```
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 1
[Attendees]    Raw user_ids returned:
[Attendees]      [0] user_id: 1dabe68d-aa99-4d14-a479-96b8daae6e0b
[Attendees]          created_at: 2026-03-07 14:28:45 +0000
[Attendees]          age: 15s ago
[Attendees]          energy: 0.75
[Attendees] 🔍 After deduplication:
[Attendees]    Unique user_ids: 1
[Attendees] 👤 Fetching community profiles for 1 user(s)
[Attendees] 📥 Community profiles returned: 1
[Attendees]    ✓ <name> (1dabe68d-aa99-4d14-a479-96b8daae6e0b)
[Attendees] ✅ Final attendee count: 1
[ATTENDEES UI] current count = 1
```

### If web user is filtered by recency:

```
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 0
[Attendees]    ℹ️ No rows matched query
[Attendees] ✅ Final attendee count: 0
```

**Reason:** Web user's last presence write was > 5 minutes ago

### If web user has no community profile:

```
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 1
[Attendees]    Raw user_ids returned:
[Attendees]      [0] user_id: 1dabe68d-aa99-4d14-a479-96b8daae6e0b
[Attendees] 🔍 After deduplication:
[Attendees]    Unique user_ids: 1
[Attendees] 👤 Fetching community profiles for 1 user(s)
[Attendees] 📥 Community profiles returned: 0
[Attendees]    ⚠️ Missing profiles for 1 user(s)
[Attendees]       Missing profile for: 1dabe68d-aa99-4d14-a479-96b8daae6e0b
[Attendees]    ✓ Added attendee: User 1dabe68d (1dabe68d-aa99-4d14-a479-96b8daae6e0b)
[Attendees] ✅ Final attendee count: 1
```

**Note:** Attendee still appears but with fallback name "User 1dabe68d"

### If wrong context_id:

```
[Attendees] 📊 Query parameters:
[Attendees]    context_id: <different-uuid>
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 0
```

**Reason:** Phone and web are using different context_ids

## Testing Steps

1. **Enable Event Mode on iPhone**
2. **Wait for stable beacon**
3. **Check console for:**
   - `[Attendees] ✅ Starting attendee refresh`
   - Verify context_id matches web: `3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`
   - Verify user_id is phone's community.id (NOT web's)
4. **Check raw query results:**
   - Should show web user's community.id: `1dabe68d-aa99-4d14-a479-96b8daae6e0b`
   - Should show recent timestamp (< 5 minutes ago)
5. **Check profile resolution:**
   - Should find 1 profile
   - Should show web user's name
6. **Check final count:**
   - Should be 1
   - UI should update

## Status

✅ Comprehensive diagnostic logging added
✅ All compilation successful
✅ Ready for device testing
✅ Will identify exact failure point in attendee query flow
