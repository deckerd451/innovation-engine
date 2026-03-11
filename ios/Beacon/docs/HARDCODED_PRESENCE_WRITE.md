# Hardcoded Presence Write Implementation

## Overview

This implementation guarantees that presence rows are written to Supabase for the MOONSIDE-S1 event beacon without relying on database lookups or console logs.

## Changes Made

### 1. EventPresenceService.swift

#### Hardcoded Context ID
Replaced the database lookup in `startPresenceLoop()`:

**Before:**
```swift
guard let contextId = await resolveBeaconId(beaconKey: mapping.beaconKey) else {
    print("[Presence] ❌ FAILED to resolve beacons.id - STOPPING")
    return
}
_currentContextId = contextId
```

**After:**
```swift
// Hardcoded event beacon context_id for MOONSIDE-S1
let contextId = UUID(uuidString: "8b7c40b1-0c94-497a-8f4e-a815f570cc25")!
_currentContextId = contextId
print("[Presence] CHECKPOINT C: contextId = \(contextId) (HARDCODED)")
```

#### Added Manual Test Function
New public function for manual presence writes:

```swift
func debugWritePresenceNow() async {
    guard let communityId = await resolveCommunityId() else {
        print("❌ Could not resolve communityId")
        return
    }
    
    let contextId = UUID(uuidString: "8b7c40b1-0c94-497a-8f4e-a815f570cc25")!
    
    let fakeBeacon = ConfidentBeacon(
        id: contextId,
        name: "MOONSIDE-S1",
        rssi: -60,
        confidenceState: .stable,
        firstSeen: Date(),
        lastSeen: Date()
    )
    
    await writePresence(
        beacon: fakeBeacon,
        communityId: communityId,
        contextId: contextId
    )
}
```

### 2. NetworkView.swift

#### Added Presence Status Display
In `eventHeader`, added real-time presence status:

```swift
// Presence status indicator
if let lastWrite = presence.lastPresenceWrite {
    Text("Presence updated: \(lastWrite.formatted(date: .omitted, time: .standard))")
        .font(.caption)
        .foregroundColor(.green)
} else if presence.currentEvent != nil {
    Text("Connected to event: \(presence.currentEvent!)")
        .font(.caption)
        .foregroundColor(.orange)
}
```

#### Added Test Button
In `settingsSheet`, added manual test button:

```swift
Button(action: {
    Task {
        await EventPresenceService.shared.debugWritePresenceNow()
    }
}) {
    HStack {
        Image(systemName: "arrow.up.doc.fill")
        Text("Test Presence Write")
        Spacer()
    }
}
```

Also added "Last Presence Write" timestamp in the Info section.

## How to Use

### Automatic Presence (via BLE)
1. Enable Event Mode
2. Get near MOONSIDE-S1 beacon
3. Wait for stable detection (~3 seconds)
4. Presence writes automatically every ~25 seconds
5. Check NetworkView header for: "Presence updated: 7:42:13 PM"

### Manual Presence (Test Button)
1. Open Network tab
2. Tap gear icon (⚙️) in top right
3. Tap "Test Presence Write" button
4. Check "Last Presence Write" timestamp in Info section
5. Verify in Supabase

## Verification

### In the App
Look for green text in Network View:
```
Presence updated: 7:42:13 PM
```

### In Supabase
Run this query:
```sql
SELECT 
    created_at,
    user_id,
    context_type,
    context_id,
    energy
FROM presence_sessions 
WHERE context_id = '8b7c40b1-0c94-497a-8f4e-a815f570cc25'
ORDER BY created_at DESC 
LIMIT 10;
```

Expected results:
- `context_type` = `beacon`
- `context_id` = `8b7c40b1-0c94-497a-8f4e-a815f570cc25`
- Multiple rows from both devices
- Recent timestamps

## Success Criteria

✅ Presence rows appear in Supabase from both devices
✅ UI shows green "Presence updated" timestamp
✅ Manual test button works without BLE detection
✅ Automatic writes occur every ~25 seconds when beacon is stable
✅ No dependency on database beacon lookup

## What Was NOT Modified

- BLE scanning logic (BLEScannerService)
- Beacon confidence logic (BeaconConfidenceService)
- BLE advertising (BLEAdvertiserService)
- Supabase schema
- Event anchor vs peer device separation

## Next Steps

After verifying this works:
1. Remove hardcoded `context_id`
2. Restore `resolveBeaconId()` database lookup
3. Add proper beacon registration flow
4. Implement event attendee visualization
5. Add peer-to-peer interaction tracking

## Hardcoded Values

**MOONSIDE-S1 Beacon Context ID:**
```
8b7c40b1-0c94-497a-8f4e-a815f570cc25
```

This UUID must exist in the `beacons` table with:
- `beacon_key` = `"MOONSIDE-S1"`
- `is_active` = `true`
- `label` = `"MOONSIDE-S1"` (or similar)

## Troubleshooting

### No presence rows appearing
1. Check that user is authenticated
2. Verify community profile exists for user
3. Check that beacon UUID exists in `beacons` table
4. Use "Test Presence Write" button to isolate BLE issues
5. Check Xcode console for error messages

### "Could not resolve communityId" error
- User's auth session is missing
- No community row exists for `auth.users.id`
- Run `AuthService.loadCurrentUser()` to create profile

### Timestamp not updating
- Check that Event Mode is enabled
- Verify MOONSIDE-S1 is detected as stable
- Check that beacon is not filtered as peer device
- Look for `[Presence] ✅ INSERT SUCCESSFUL` logs
