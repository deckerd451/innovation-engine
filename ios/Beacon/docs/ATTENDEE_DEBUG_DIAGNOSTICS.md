# Attendee Debug Diagnostics

## Purpose

Added temporary on-screen diagnostics to NetworkView to determine whether the attendee count = 0 issue is:
- **UI rendering issue**: Service has data but UI doesn't display it
- **Service/data issue**: Service is not producing attendee data

## Changes Made

### NetworkView.swift

Added debug counters in the `activeEventView` section, wrapping the existing `displayAttendees.isEmpty` logic.

**Location:** Inside `activeEventView`, after `nearbyDevicesSection`

**Code Added:**
```swift
// TEMP DEBUG: attendee rendering diagnostics
VStack(spacing: 12) {
    Text("displayAttendees.count = \(displayAttendees.count)")
        .font(.caption)
        .foregroundColor(.white)
    
    Text("attendees.attendeeCount = \(attendees.attendeeCount)")
        .font(.caption)
        .foregroundColor(.white)
    
    Text("attendees.attendees.count = \(attendees.attendees.count)")
        .font(.caption)
        .foregroundColor(.white)
    
    Text("showMockAttendees = \(showMockAttendees ? "true" : "false")")
        .font(.caption)
        .foregroundColor(.white)
    
    if displayAttendees.isEmpty {
        emptyState
    } else {
        attendeeVisualization
            .frame(height: 420)
    }
}
```

## What Values Are Shown

When the Network screen is open during an active event, these values will be visible:

### 1. displayAttendees.count
- **Source:** Computed property in NetworkView
- **Shows:** Number of attendees being passed to the visualization
- **Expected:** Should match `attendees.attendees.count` (or mock count if enabled)

### 2. attendees.attendeeCount
- **Source:** `@Published` property in EventAttendeesService
- **Shows:** Count maintained by the service
- **Expected:** Should match `attendees.attendees.count`

### 3. attendees.attendees.count
- **Source:** `@Published` array in EventAttendeesService
- **Shows:** Actual number of EventAttendee objects in the array
- **Expected:** Should be > 0 when other users are present

### 4. showMockAttendees
- **Source:** `@State` variable in NetworkView
- **Shows:** Whether mock mode is enabled
- **Expected:** Should be `false` in production use

## Diagnostic Scenarios

### Scenario 1: UI Rendering Issue
```
displayAttendees.count = 0
attendees.attendeeCount = 1
attendees.attendees.count = 1
showMockAttendees = false
```

**Diagnosis:** Service has data, but UI logic is filtering it out
**Next Step:** Check `displayAttendees` computed property logic

### Scenario 2: Service Not Producing Data
```
displayAttendees.count = 0
attendees.attendeeCount = 0
attendees.attendees.count = 0
showMockAttendees = false
```

**Diagnosis:** Service is not fetching or storing attendee data
**Next Step:** Check EventAttendeesService fetch logic and RLS policies

### Scenario 3: Mock Mode Confusion
```
displayAttendees.count = 5
attendees.attendeeCount = 0
attendees.attendees.count = 0
showMockAttendees = true
```

**Diagnosis:** Mock mode is enabled, showing fake data
**Next Step:** Turn off mock mode in settings

### Scenario 4: Count Mismatch
```
displayAttendees.count = 0
attendees.attendeeCount = 1
attendees.attendees.count = 0
```

**Diagnosis:** Service count is set but array is empty
**Next Step:** Check where `attendeeCount` is set vs where `attendees` array is populated

### Scenario 5: Everything Working
```
displayAttendees.count = 1
attendees.attendeeCount = 1
attendees.attendees.count = 1
showMockAttendees = false
```

**Diagnosis:** Service and UI both working correctly
**Next Step:** Remove debug diagnostics

## How to Use

1. **Turn Event Mode ON** on both devices
2. **Both devices detect** MOONSIDE-S1 beacon
3. **Wait for presence writes** (green timestamp appears)
4. **Open Network view** on one device
5. **Read the debug values** at the top of the screen
6. **Compare to expected scenario** above
7. **Determine next debugging step**

## What Was NOT Changed

- BLE services (unchanged)
- Supabase code (unchanged)
- EventAttendeesService fetch logic (unchanged)
- Empty state view (still shown when appropriate)
- Attendee visualization (still shown when appropriate)
- Any layout beyond adding debug text

## Temporary Nature

These diagnostics are marked with:
```swift
// TEMP DEBUG: attendee rendering diagnostics
```

**To Remove Later:**
1. Delete the entire `VStack(spacing: 12)` wrapper
2. Restore the original `if displayAttendees.isEmpty` logic
3. Keep `emptyState` and `attendeeVisualization` as they were

## Expected Console Logs

When viewing the Network screen, also check console for:

```
[Attendees] 📊 Query parameters:
[Attendees]    context_type: beacon
[Attendees]    context_id: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: X
[Attendees] ✅ Final attendee count: X
```

Compare console logs with on-screen values to verify consistency.

## Debugging Decision Tree

```
Start: Check on-screen values
│
├─ attendees.attendees.count = 0?
│  ├─ YES → Service issue
│  │  ├─ Check console logs for query results
│  │  ├─ Check RLS policies
│  │  └─ Check presence.currentContextId is set
│  │
│  └─ NO → attendees.attendees.count > 0
│     │
│     ├─ displayAttendees.count = 0?
│     │  ├─ YES → UI filtering issue
│     │  │  └─ Check displayAttendees computed property
│     │  │
│     │  └─ NO → displayAttendees.count > 0
│     │     │
│     │     └─ Still showing emptyState?
│     │        ├─ YES → Logic bug in isEmpty check
│     │        └─ NO → Everything working!
│     │
│     └─ attendeeCount != attendees.count?
│        └─ YES → Sync issue between count and array
```

## Success Criteria

After adding these diagnostics, we should be able to definitively answer:

✅ Is EventAttendeesService fetching data? (check `attendees.attendees.count`)
✅ Is the count being set correctly? (check `attendees.attendeeCount`)
✅ Is the UI receiving the data? (check `displayAttendees.count`)
✅ Is mock mode interfering? (check `showMockAttendees`)

## Next Steps Based on Results

### If Service Issue (attendees.attendees.count = 0):
1. Check console logs for query errors
2. Verify RLS policy was applied
3. Check presence.currentContextId is not nil
4. Verify both users writing to same context_id
5. Check Supabase directly for presence_sessions rows

### If UI Issue (attendees.attendees.count > 0 but displayAttendees.count = 0):
1. Find `displayAttendees` computed property
2. Check filtering logic
3. Check if mock mode toggle is interfering
4. Verify data transformation is correct

### If Everything Working:
1. Remove debug diagnostics
2. Document the fix that worked
3. Test on both devices
4. Verify periodic refresh continues working
