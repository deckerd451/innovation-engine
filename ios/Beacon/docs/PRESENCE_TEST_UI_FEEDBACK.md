# Presence Test UI Feedback

## Overview

The Test Presence Write button now provides immediate visual feedback in the UI, eliminating the need to check Xcode console logs or Supabase directly.

## Changes Made

### 1. EventPresenceService.swift

Already had the necessary infrastructure:
- `@Published private(set) var debugStatus: String = "Idle"`
- Status updates in `writePresence()` function
- Status updates in `debugWritePresenceNow()` function

**Status Messages:**
- `"Idle"` - Initial state
- `"Starting manual presence test..."` - Test initiated
- `"Resolved communityId: <uuid>"` - Auth successful
- `"Writing presence row..."` - About to insert
- `"SUCCESS: insert completed at 7:45 PM"` - Insert succeeded
- `"FAILED: could not resolve communityId"` - Auth failed
- `"FAILED INSERT: <error message>"` - Insert failed

### 2. NetworkView.swift

#### Added State Variable
```swift
@State private var showPresenceTestResult = false
```

#### Updated Test Button
Added alert and status display:

```swift
Button(action: {
    Task {
        await EventPresenceService.shared.debugWritePresenceNow()
        
        await MainActor.run {
            showPresenceTestResult = true
        }
    }
}) {
    HStack {
        Image(systemName: "arrow.up.doc.fill")
        Text("Test Presence Write")
        Spacer()
    }
}
.padding(.vertical, 4)
.alert("Presence Test Result", isPresented: $showPresenceTestResult) {
    Button("OK", role: .cancel) { }
} message: {
    Text(presence.debugStatus)
}

if presence.debugStatus != "Idle" {
    Text(presence.debugStatus)
        .font(.caption)
        .foregroundColor(.secondary)
}
```

## User Experience

### Step 1: Open Network Settings
1. Navigate to Network tab
2. Tap gear icon (⚙️) in top right corner

### Step 2: Tap Test Button
Tap "Test Presence Write" button

### Step 3: View Result
An alert appears showing one of:

**Success:**
```
Presence Test Result
SUCCESS: insert completed at 7:45 PM
[OK]
```

**Auth Failure:**
```
Presence Test Result
FAILED: could not resolve communityId
[OK]
```

**Insert Failure:**
```
Presence Test Result
FAILED INSERT: The operation couldn't be completed
[OK]
```

### Step 4: Persistent Status
After dismissing the alert, the status remains visible below the button in gray text.

## Verification Flow

### In the App:
1. Tap "Test Presence Write"
2. Wait for alert (usually < 1 second)
3. Read result message
4. Tap "OK"
5. Status persists below button

### In Supabase (if success):
```sql
SELECT 
    created_at,
    user_id,
    context_type,
    context_id,
    energy
FROM presence_sessions 
ORDER BY created_at DESC 
LIMIT 5;
```

Should show a new row with:
- Recent `created_at` timestamp
- `context_type` = `beacon`
- `context_id` = `8b7c40b1-0c94-497a-8f4e-a815f570cc25`

## Success Scenarios

### ✅ Successful Write
```
User Action: Tap "Test Presence Write"
Alert Shows: "SUCCESS: insert completed at 7:45 PM"
Supabase: New row appears
Status Below Button: "SUCCESS: insert completed at 7:45 PM"
```

### ❌ Auth Failure
```
User Action: Tap "Test Presence Write"
Alert Shows: "FAILED: could not resolve communityId"
Supabase: No new row
Status Below Button: "FAILED: could not resolve communityId"
Cause: User not authenticated or no community profile
```

### ❌ Insert Failure
```
User Action: Tap "Test Presence Write"
Alert Shows: "FAILED INSERT: <error details>"
Supabase: No new row
Status Below Button: "FAILED INSERT: <error details>"
Cause: Network error, RLS policy, or invalid data
```

## Benefits

1. **No Console Required**: Users can verify presence writes without Xcode
2. **Immediate Feedback**: Alert appears within 1 second
3. **Persistent Status**: Message remains visible after dismissing alert
4. **Clear Error Messages**: Specific failure reasons shown
5. **Timestamp Included**: Success message shows exact write time

## Troubleshooting

### Alert doesn't appear
- Check that button was tapped (should see brief loading state)
- Verify `showPresenceTestResult` state is being set
- Check that `debugStatus` is being updated in EventPresenceService

### Shows "FAILED: could not resolve communityId"
- User is not authenticated
- No community profile exists for user
- Run app through OAuth login flow
- Check `community` table for user's row

### Shows "FAILED INSERT: <error>"
- Network connectivity issue
- Supabase RLS policy blocking insert
- Invalid beacon context_id
- Check Supabase logs for details

### Status shows "Idle" after test
- `debugStatus` not being updated
- Check EventPresenceService implementation
- Verify `writePresence()` is being called

## What Was NOT Modified

- BLE scanning logic
- Beacon confidence logic
- Supabase schema
- EventPresenceService core logic (only status updates)
- Automatic presence writes (still work as before)

## Next Steps

After verifying this works:
1. Test on both devices
2. Verify Supabase rows appear
3. Check that automatic presence writes also work
4. Remove hardcoded context_id
5. Restore database beacon lookup
6. Add event attendee visualization
