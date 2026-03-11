# Avatar URL Column Fix

## Problem

EventAttendeesService was failing when fetching community profiles with the error:
```
column community.avatar_url does not exist
```

### Root Cause

The community table schema uses:
- `image_url` ✅ (actual column name)

But the iOS code was querying:
- `avatar_url` ❌ (incorrect column name)

This caused the profile fetch to fail, which prevented attendee objects from being created, leaving the attendee list empty.

## Solution

Fixed all references from `avatar_url` to `image_url` to match the database schema.

### Change 1: Fixed Community Profile Query

**File:** `ios/Beacon/Beacon/Services/EventAttendeesService.swift`

**Before:**
```swift
.select("id, name, avatar_url")
```

**After:**
```swift
.select("id, name, image_url")
```

### Change 2: Updated AttendeeCommunityRow Model

**Before:**
```swift
private struct AttendeeCommunityRow: Codable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatarUrl = "avatar_url"
    }
}
```

**After:**
```swift
private struct AttendeeCommunityRow: Codable {
    let id: UUID
    let name: String
    let imageUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case imageUrl = "image_url"
    }
}
```

### Change 3: Updated CommunityProfileInfo

**Before:**
```swift
private struct CommunityProfileInfo {
    let name: String
    let avatarUrl: String?
}
```

**After:**
```swift
private struct CommunityProfileInfo {
    let name: String
    let imageUrl: String?
}
```

### Change 4: Updated Profile Mapping

**Before:**
```swift
profiles.map {
    ($0.id, CommunityProfileInfo(name: $0.name, avatarUrl: $0.avatarUrl))
}
```

**After:**
```swift
profiles.map {
    ($0.id, CommunityProfileInfo(name: $0.name, imageUrl: $0.imageUrl))
}
```

### Change 5: Updated Attendee Creation

**Before:**
```swift
EventAttendee(
    id: userId,
    name: name,
    avatarUrl: profile?.avatarUrl,
    energy: session.energy,
    lastSeen: session.createdAt
)
```

**After:**
```swift
EventAttendee(
    id: userId,
    name: name,
    avatarUrl: profile?.imageUrl,  // Maps imageUrl to avatarUrl for UI
    energy: session.energy,
    lastSeen: session.createdAt
)
```

**Note:** The `EventAttendee` struct still uses `avatarUrl` as the property name (for UI consistency), but it now correctly receives the value from `profile?.imageUrl`.

## Why This Preserves UI Compatibility

The `EventAttendee` model (used by the UI) keeps its `avatarUrl` property name:
```swift
struct EventAttendee {
    let avatarUrl: String?  // UI property name unchanged
    // ...
}
```

We only changed:
1. Database query column name: `avatar_url` → `image_url`
2. Internal model property names to match database
3. Mapping from database model to UI model

This means:
- ✅ Database query works (uses correct column name)
- ✅ UI code unchanged (still uses `avatarUrl`)
- ✅ Mapping layer handles the translation

## Expected Result

After this fix:

### 1. Profile Fetch Succeeds
```
[Attendees] 🔍 Community query filter: id.eq.<uuid>
[Attendees] 📥 Community profiles returned: 1
[Attendees]    ✓ Doug Hamilton (<uuid>)
```

### 2. Attendee Objects Created
```
[Attendees]    ✓ Added attendee: Doug Hamilton (<uuid>)
[Attendees] ✅ Final attendee count: 1
```

### 3. On-Screen Diagnostics Show Success
```
displayAttendees.count = 1
attendees.attendeeCount = 1
attendees.attendees.count = 1
attendees.debugStatus = raw sessions count = 1, contextId = ..., userId = ...
```

### 4. Network Screen Displays Attendee
- Shows other user's name
- Shows avatar if image_url is set
- No longer shows "You're Here Alone"

## Console Logs to Look For

### Before Fix (Error):
```
[Attendees] ❌ Query failed: column community.avatar_url does not exist
[Attendees]    Error details: column community.avatar_url does not exist
```

### After Fix (Success):
```
[Attendees] 🔍 Fetching community profiles for 1 user(s)
[Attendees] 📋 Profile resolution:
[Attendees]    Profiles found: 1
[Attendees]    ✓ Doug Hamilton (<uuid>)
[Attendees] ✅ Final attendee count: 1
```

## What Was NOT Changed

- BLE services
- Presence queries
- Attendee refresh logic
- UI layout
- SQL policies
- EventAttendee model (UI-facing)
- Any other database queries

## Database Schema Reference

The `community` table has these columns:
```sql
CREATE TABLE community (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,  -- ✅ Correct column name
    -- other columns...
);
```

**Not:**
```sql
avatar_url TEXT  -- ❌ This column doesn't exist
```

## Why This Error Occurred

Likely causes:
1. Schema was changed from `avatar_url` to `image_url` at some point
2. iOS code wasn't updated to match
3. Different naming conventions between web and mobile code
4. Copy-paste from another model that used `avatar_url`

## Testing Checklist

- [ ] Turn Event Mode ON on both devices
- [ ] Both detect MOONSIDE-S1 beacon
- [ ] Both write presence successfully
- [ ] Open Network view on Device A
- [ ] Check console for "Community profiles returned: 1"
- [ ] Check console for "Added attendee: <name>"
- [ ] See attendee count = 1 on screen
- [ ] See other user's name displayed
- [ ] Repeat on Device B
- [ ] Both devices show each other as attendees

## Success Criteria

✅ No "column avatar_url does not exist" error
✅ Profile fetch succeeds
✅ Attendee objects created
✅ attendees.attendeeCount = 1
✅ Network view shows other attendee
✅ Names displayed correctly
✅ Avatars displayed if image_url is set

## Related Files

All changes in:
```
ios/Beacon/Beacon/Services/EventAttendeesService.swift
```

No other files needed changes because:
- `EventAttendee` model already uses `avatarUrl` (UI property)
- UI code already expects `avatarUrl` property
- Only the database mapping layer needed fixing
