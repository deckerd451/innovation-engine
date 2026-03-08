# Phase 5: Active Attendees - Quick Summary

## What Changed

### Files Modified
1. **NEW:** `Beacon/Services/EventAttendeesService.swift` - Manages attendee queries
2. **MODIFIED:** `Beacon/Services/EventPresenceService.swift` - Exposed context IDs
3. **MODIFIED:** `Beacon/BeaconApp.swift` - Initialize attendees service
4. **MODIFIED:** `Beacon/Views/EventModeView.swift` - Added attendees UI

## Query Logic

### Exact Filter
```sql
SELECT user_id, energy, created_at
FROM presence_sessions
WHERE context_type = 'beacon'
  AND context_id = '<current-beacon-uuid>'
  AND user_id != '<current-user-uuid>'
  AND created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
```

### Key Points
- Uses current beacon context_id from EventPresenceService
- Excludes current user
- Only last 5 minutes of activity
- Deduplicates to most recent session per user
- Resolves community profiles for names

## UI Appearance

### When Another User is Active

```
┌─────────────────────────────────────┐
│ 👥 Active Attendees            [2] │
│                                     │
│ 🟢 Alice Johnson                   │
│    Active now                    🟢 │
│                                     │
│ ⚪ Bob Smith                        │
│    45s ago                       🟠 │
└─────────────────────────────────────┘
```

### Display Rules
- Only shown when `currentEvent != nil` AND attendees list not empty
- Shows up to 5 attendees
- Green circle = active now (< 30s ago)
- Gray circle = recent (30s-5m ago)
- Energy dot color: green (close), orange (medium), gray (far)
- "+ X more" if > 5 attendees

## Behavior

### Automatic Refresh
- Starts when stable beacon detected and event mapped
- Queries every 15 seconds
- Stops when beacon lost or Event Mode disabled

### User Experience
1. User A at event → sees no attendees (alone)
2. User B arrives → User B sees User A after 15s
3. User A's next refresh → sees User B
4. User A leaves → User B stops seeing User A after 5 minutes

## Debug Logs

```
[Attendees] Starting attendee refresh for context: <uuid>
[Attendees] Querying active attendees for beacon context: <uuid>
[Attendees] Found 2 active attendee(s)
```

## Phase 5 Compliance ✅

- ✅ No changes to BLE scanning
- ✅ No changes to confidence logic
- ✅ No changes to presence heartbeat
- ✅ Read-only UI (no interactions)
- ✅ No interaction_edges
- ✅ No suggested connections changes
- ✅ No auto-connection logic
- ✅ Excludes current user
- ✅ Uses existing beacon context

## Status

✅ Compilation successful
✅ All diagnostics clean
✅ Ready for testing
✅ Phase 4 functionality preserved
