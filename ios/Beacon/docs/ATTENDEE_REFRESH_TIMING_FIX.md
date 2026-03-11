# Attendee Refresh Timing Fix

## Problem

EventAttendeesService was starting attendee refresh too early, before the presence context was fully ready.

### Root Cause

The service observed only `presence.$currentEvent`, which becomes non-nil immediately when a beacon is detected. However, `currentContextId` and `currentCommunityId` are not set until after the first presence write completes.

**Timeline of the bug:**
1. Beacon detected → `currentEvent` set to event name
2. `observePresenceState()` fires → calls `startRefreshing()`
3. `startRefreshing()` guard fails because `currentContextId` and `currentCommunityId` are still `nil`
4. Refresh never actually starts
5. Later, presence write completes and sets context IDs, but no observer fires
6. Attendee count stays at 0 forever

## Solution

### 1. Changed observePresenceState() to use CombineLatest

**Before:**
```swift
private func observePresenceState() {
    presence.$currentEvent
        .receive(on: RunLoop.main)
        .sink { [weak self] event in
            if event != nil {
                self?.startRefreshing()
            } else {
                self?.stopRefreshing()
            }
        }
        .store(in: &cancellables)
}
```

**After:**
```swift
private func observePresenceState() {
    // Wait for both event AND actual presence write to ensure context is ready
    Publishers.CombineLatest(
        presence.$currentEvent,
        presence.$lastPresenceWrite
    )
    .receive(on: RunLoop.main)
    .sink { [weak self] event, _ in
        guard let self else { return }
        
        // Only start refreshing when:
        // 1. Event is active
        // 2. Context ID is ready
        // 3. User ID is ready
        if event != nil,
           self.presence.currentContextId != nil,
           self.presence.currentCommunityId != nil {
            print("[Attendees] 🟢 Presence context ready - starting refresh")
            print("[Attendees]    Event: \(event!)")
            print("[Attendees]    Context ID: \(self.presence.currentContextId!)")
            print("[Attendees]    User ID: \(self.presence.currentCommunityId!)")
            self.startRefreshing()
        } else {
            print("[Attendees] 🔴 Presence context not ready - stopping refresh")
            print("[Attendees]    Event: \(event ?? "nil")")
            print("[Attendees]    Context ID: \(self.presence.currentContextId?.uuidString ?? "nil")")
            print("[Attendees]    User ID: \(self.presence.currentCommunityId?.uuidString ?? "nil")")
            self.stopRefreshing()
        }
    }
    .store(in: &cancellables)
}
```

**Key Changes:**
- Uses `Publishers.CombineLatest` to observe both `currentEvent` and `lastPresenceWrite`
- Checks that `currentContextId` and `currentCommunityId` are not nil before starting
- Fires whenever either publisher changes, ensuring refresh starts after first presence write
- Added detailed logging to show exactly when context becomes ready

### 2. Hardened duplicate-refresh guard

**Before:**
```swift
if currentContextId == contextId && refreshTask != nil {
    print("[Attendees] ℹ️ Already refreshing same context, skipping")
    return
}
```

**After:**
```swift
if currentContextId == contextId,
   currentUserId == userId,
   refreshTask != nil,
   !(refreshTask?.isCancelled ?? true) {
    print("[Attendees] ℹ️ Already refreshing same context, skipping")
    return
}
```

**Key Changes:**
- Also checks `currentUserId` matches (prevents edge case where user changes)
- Checks that task is not cancelled: `!(refreshTask?.isCancelled ?? true)`
- Prevents stale cancelled task from blocking a real refresh restart

## How Refresh Timing Changed

### Before (Broken):
```
1. Beacon detected
2. currentEvent = "CharlestonHacks Test Event"
3. observePresenceState() fires
4. startRefreshing() called
5. Guard fails: currentContextId == nil
6. Refresh never starts
7. [Later] Presence write completes, sets contextId
8. No observer fires
9. Attendee count stays 0
```

### After (Fixed):
```
1. Beacon detected
2. currentEvent = "CharlestonHacks Test Event"
3. observePresenceState() fires
4. Check: currentContextId == nil → stopRefreshing()
5. Presence write completes
6. currentContextId and currentCommunityId set
7. lastPresenceWrite updated
8. observePresenceState() fires again (CombineLatest)
9. Check: event != nil, contextId != nil, userId != nil → startRefreshing()
10. Refresh starts successfully
11. Attendees fetched every 15 seconds
```

## Acceptance Criteria

After this fix, attendee refresh starts only when:
- ✅ Event is active (`currentEvent != nil`)
- ✅ Context ID is ready (`currentContextId != nil`)
- ✅ User ID is ready (`currentCommunityId != nil`)
- ✅ At least one presence write has occurred (`lastPresenceWrite` updated)

## Console Logs to Look For

### When context becomes ready:
```
[Attendees] 🟢 Presence context ready - starting refresh
[Attendees]    Event: CharlestonHacks Test Event
[Attendees]    Context ID: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    User ID: <community-id>
[Attendees] ✅ Starting attendee refresh
[Attendees]    Current user community.id: <community-id>
[Attendees]    Current event/beacon context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    Refresh interval: 15.0s
```

### When context is not ready:
```
[Attendees] 🔴 Presence context not ready - stopping refresh
[Attendees]    Event: CharlestonHacks Test Event
[Attendees]    Context ID: nil
[Attendees]    User ID: nil
```

### When refresh actually runs:
```
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees]    exclude user_id: <community-id>
[Attendees]    created_at >= <timestamp>
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 1
[Attendees] ✅ Final attendee count: 1
```

## What Was NOT Changed

- Periodic refresh loop (still 15 seconds)
- Fetch logic (query remains the same)
- Profile resolution logic
- Public API
- Supabase schema
- RLS policies

## Next Steps

If attendee count is still 0 after this fix:
1. Check Supabase RLS policies on `presence_sessions` table
2. Verify SELECT policy allows reading other users' rows
3. Check that both devices are writing to the same `context_id`
4. Verify `created_at` timestamps are recent (within 5 minutes)

## Testing Checklist

- [ ] Turn Event Mode ON on Device A
- [ ] Turn Event Mode ON on Device B
- [ ] Both devices detect MOONSIDE-S1
- [ ] Both devices write presence (check green timestamp)
- [ ] Wait for "Presence context ready" log
- [ ] Check attendee count updates to 1 on each device
- [ ] Verify periodic refresh every 15 seconds
- [ ] Turn Event Mode OFF → attendee count clears
- [ ] Turn Event Mode ON again → attendees reappear

## Benefits

1. **Correct Timing**: Refresh starts only when context is fully ready
2. **Reliable**: Uses CombineLatest to catch all state changes
3. **Debuggable**: Clear logs show exactly when context becomes ready
4. **Robust**: Hardened guard prevents stale task state
5. **No Race Conditions**: Waits for actual presence write before starting

## Edge Cases Handled

### Rapid Event Changes
- If event changes before context is ready, refresh won't start
- When context becomes ready, refresh starts correctly

### Task Cancellation
- Checks if task is cancelled before skipping duplicate refresh
- Allows restart if previous task was cancelled

### User Changes
- Checks both contextId and userId match
- Prevents refresh with wrong user context

### Bluetooth Interruptions
- If presence write fails, context stays nil
- Refresh won't start until successful write
- When write succeeds, refresh starts automatically
