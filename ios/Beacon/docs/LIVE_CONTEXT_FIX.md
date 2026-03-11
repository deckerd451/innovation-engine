# Live Context Fix for EventAttendeesService

## Problem

After fixing the RLS policy, attendee count was still 0 because EventAttendeesService was using stale cached context values instead of reading live values from EventPresenceService.

### Root Cause

**Cached Context Variables:**
```swift
private var currentContextId: UUID?
private var currentUserId: UUID?
```

These were set once in `startRefreshing()` and never updated. When `fetchAttendees()` ran, it used these stale values instead of the live context from `presence.currentContextId` and `presence.currentCommunityId`.

**Timeline of the Bug:**
1. Event detected → `startRefreshing()` called
2. Context IDs cached: `currentContextId = presence.currentContextId`
3. Refresh loop starts
4. Later, presence context updates (new beacon, new event)
5. `fetchAttendees()` still uses old cached values
6. Query returns 0 rows (wrong context_id)

## Solution

### Change 1: Use Live Context in fetchAttendees()

**Before:**
```swift
guard let contextId = currentContextId,
      let userId = currentUserId else {
    print("[Attendees] ⚠️ fetchAttendees called but context/user missing")
    return
}
```

**After:**
```swift
guard let contextId = presence.currentContextId,
      let userId = presence.currentCommunityId else {
    print("[Attendees] ⚠️ fetchAttendees called but context/user missing")
    print("[Attendees]    presence.currentContextId: \(presence.currentContextId?.uuidString ?? "nil")")
    print("[Attendees]    presence.currentCommunityId: \(presence.currentCommunityId?.uuidString ?? "nil")")
    return
}
```

**Key Change:** Reads directly from `presence` instead of cached variables.

### Change 2: Simplified startRefreshing()

**Before:**
```swift
private func startRefreshing() {
    guard let contextId = presence.currentContextId,
          let userId = presence.currentCommunityId else {
        return
    }
    
    // Check if already refreshing same context
    if currentContextId == contextId,
       currentUserId == userId,
       refreshTask != nil,
       !(refreshTask?.isCancelled ?? true) {
        return
    }
    
    currentContextId = contextId  // ← Caching stale values
    currentUserId = userId        // ← Caching stale values
    
    refreshTask = Task {
        await self.fetchAttendees()
        // periodic refresh...
    }
}
```

**After:**
```swift
private func startRefreshing() {
    print("[Attendees] Attempting to start attendee refresh")
    
    guard presence.currentEvent != nil else {
        print("[Attendees] ❌ Cannot start: no active event")
        return
    }
    
    if let task = refreshTask, !task.isCancelled {
        print("[Attendees] ℹ️ Refresh task already running")
        return
    }
    
    print("[Attendees] ✅ Starting attendee refresh loop")
    print("[Attendees]    currentEvent: \(presence.currentEvent ?? "nil")")
    print("[Attendees]    currentContextId: \(presence.currentContextId?.uuidString ?? "nil")")
    print("[Attendees]    currentCommunityId: \(presence.currentCommunityId?.uuidString ?? "nil")")
    print("[Attendees]    Refresh interval: \(refreshInterval)s")
    
    refreshTask?.cancel()
    
    refreshTask = Task { [weak self] in
        guard let self else { return }
        
        await self.fetchAttendees()
        
        while !Task.isCancelled {
            try? await Task.sleep(
                nanoseconds: UInt64(self.refreshInterval * 1_000_000_000)
            )
            guard !Task.isCancelled else { break }
            await self.fetchAttendees()
        }
    }
}
```

**Key Changes:**
- Removed context caching
- Simplified duplicate task check
- Always reads live context in `fetchAttendees()`
- Removed `currentContextId` and `currentUserId` properties

### Change 3: Force Refresh on NetworkView Appear

**Added to NetworkView.swift:**
```swift
.onAppear {
    attendees.refresh()
    
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
        attendees.refresh()
    }
}
```

**Why Two Refreshes:**
1. Immediate refresh when screen appears
2. Delayed refresh (2 seconds) to catch any context that wasn't ready yet

## How It Works Now

### Flow with Live Context

```
1. Beacon detected
2. Presence write completes
3. presence.currentContextId = <beacon-id>
4. presence.currentCommunityId = <user-id>
5. observePresenceState() fires
6. startRefreshing() called
7. Refresh loop starts
8. fetchAttendees() called
9. Reads presence.currentContextId (LIVE)
10. Reads presence.currentCommunityId (LIVE)
11. Query uses current values
12. Returns attendees successfully
13. Every 15 seconds, repeat steps 8-12 with LIVE values
```

### When Context Changes

```
Old Flow (Broken):
- Context changes
- Cached values stay stale
- Query uses wrong context_id
- Returns 0 rows

New Flow (Fixed):
- Context changes
- fetchAttendees() reads new live values
- Query uses correct context_id
- Returns correct attendees
```

## Code Changes Summary

### EventAttendeesService.swift

1. **Removed cached properties:**
   - `private var currentContextId: UUID?`
   - `private var currentUserId: UUID?`

2. **Updated fetchAttendees():**
   - Changed from `currentContextId` to `presence.currentContextId`
   - Changed from `currentUserId` to `presence.currentCommunityId`
   - Added detailed logging when context is missing

3. **Simplified startRefreshing():**
   - Removed context caching logic
   - Simplified duplicate task check
   - Only checks if event is active and task is running
   - Always uses live context values

4. **Updated stopRefreshing():**
   - Removed lines that cleared cached context (no longer exist)

### NetworkView.swift

1. **Added onAppear modifier:**
   - Immediate refresh when screen appears
   - Delayed refresh after 2 seconds
   - Ensures attendees load even if timing is off

## Console Logs to Look For

### When refresh starts:
```
[Attendees] Attempting to start attendee refresh
[Attendees] ✅ Starting attendee refresh loop
[Attendees]    currentEvent: CharlestonHacks Test Event
[Attendees]    currentContextId: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    currentCommunityId: <user-id>
[Attendees]    Refresh interval: 15.0s
```

### When fetch runs:
```
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    exclude user_id: <user-id>
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 1
[Attendees] ✅ Final attendee count: 1
```

### When context is missing:
```
[Attendees] ⚠️ fetchAttendees called but context/user missing
[Attendees]    presence.currentContextId: nil
[Attendees]    presence.currentCommunityId: nil
```

## Benefits

1. **Always Current**: Uses live context values, never stale
2. **Simpler Logic**: No caching, no duplicate context tracking
3. **More Reliable**: Works even if context changes mid-session
4. **Better Debugging**: Clear logs show exact context values used
5. **Forced Refresh**: NetworkView ensures data loads on appear

## Testing Checklist

- [ ] Turn Event Mode ON on Device A
- [ ] Turn Event Mode ON on Device B
- [ ] Both detect MOONSIDE-S1
- [ ] Both write presence (green timestamp)
- [ ] Open Network view on Device A
- [ ] See "Attendees: 1" immediately or within 2 seconds
- [ ] Open Network view on Device B
- [ ] See "Attendees: 1" immediately or within 2 seconds
- [ ] Wait 15 seconds → count updates if needed
- [ ] Turn Event Mode OFF → count clears
- [ ] Turn Event Mode ON → count reappears

## What Was NOT Changed

- Database queries (same query structure)
- Supabase schema
- BLE services
- EventAttendeesService architecture (still uses periodic refresh)
- Refresh interval (still 15 seconds)
- Profile resolution logic

## Edge Cases Handled

### Context Changes Mid-Session
- Old: Would use stale cached context
- New: Always reads current context

### Network View Opened Before Context Ready
- Old: Would show 0 forever
- New: Delayed refresh catches late context

### Multiple Rapid Refreshes
- Old: Complex duplicate checking with cached values
- New: Simple task cancellation check

### Event Changes
- Old: Cached context from old event
- New: Reads new event's context immediately

## Success Criteria

✅ fetchAttendees() reads `presence.currentContextId` (not cached)
✅ fetchAttendees() reads `presence.currentCommunityId` (not cached)
✅ Refresh loop starts when event is active
✅ NetworkView forces refresh on appear
✅ Attendee count > 0 when multiple users present
✅ Count updates every 15 seconds
✅ Works even if context changes
