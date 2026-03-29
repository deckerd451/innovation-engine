# Phase 5 Diagnostic Pass - iOS Attendee Query Analysis

## Overview
Added comprehensive diagnostic logging to the iOS Beacon app's attendee query system to identify why web presence is not appearing in the Active Attendees list.

## Changes Made

### 1. EventModeDataService.swift - Enhanced Attendee Query Logging

**Location**: `ios/InnovationEngine/Services/EventModeDataService.swift`

**Function**: `fetchActiveAttendees(beaconId:)`

#### Added Diagnostic Logging:

**Query Context:**
- Current event name (beacon label)
- Current context_id (beacon UUID)
- Current user community.id
- Query timestamp

**Query Filters Logged:**
```swift
print("  🔎 Query Filters:")
print("     - context_type = 'beacon'")
print("     - context_id = '\(beaconId.uuidString)'")
print("     - expires_at > '\(nowString)'")
```

**Raw Results:**
- Raw presence_sessions row count returned
- Each raw presence row with:
  - user_id (full UUID)
  - energy value
  - expires_at timestamp
  - Marker if row belongs to current user (👤 YOU)

**Debug Mode for Empty Results:**
When no rows are returned, automatically runs a debug query:
- Fetches ALL presence rows for the beacon (no time filter)
- Shows total count without expiration filter
- Displays sample rows with expiration status
- Shows time difference (seconds until/since expiration)

**Profile Resolution:**
- Number of user IDs to resolve
- Number of profiles successfully resolved
- Per-user resolution status (✓ success / ✗ failed)
- Missing profile warnings with UUIDs

**Final Results:**
- Final attendee count after filtering/dedup
- Each attendee added with name and current user marker

#### Updated Data Model:

Extended `PresenceSessionRow` to include additional fields for diagnostics:
```swift
private struct PresenceSessionRow: Codable {
    let userId: UUID
    let energy: Double
    let expiresAt: Date
    let lastSeen: Date?      // NEW
    let isActive: Bool?      // NEW
    let createdAt: Date?     // NEW
}
```

### 2. Enhanced Profile Resolution Logging

**Function**: `fetchUserProfiles(for:)`

Added logging for:
- Number of profiles being fetched
- Query filter string
- Number of profiles successfully fetched
- Missing profiles (users without community records)
- Detailed error information on failure

### 3. BeaconRadarView.swift - Radar Refresh Logging

**Location**: `ios/InnovationEngine/Views/BeaconRadarView.swift`

**Function**: `refreshData()`

Added logging for:
- Beacon label and ID being refreshed
- Success/failure status
- Final attendee and edge counts
- Detailed error information

## Exact Attendee Query Filters

### Primary Query (Active Attendees)
```swift
supabase
    .from("presence_sessions")
    .select("user_id, energy, expires_at, last_seen, is_active, created_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: beaconId.uuidString)
    .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
```

**Filters Applied:**
1. ✅ `context_type = 'beacon'` - Correct, matches web presence write
2. ✅ `context_id = beaconId.uuidString` - Uses the beacon UUID from BLE detection
3. ✅ `expires_at > now()` - Only active (non-expired) sessions
4. ❌ NO `is_active` filter - Not currently used
5. ❌ NO `last_seen` filter - Not currently used
6. ❌ NO `created_at` filter - Not currently used

### Debug Query (When Empty)
```swift
supabase
    .from("presence_sessions")
    .select("user_id, energy, expires_at, last_seen, is_active, created_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: beaconId.uuidString)
    // NO time filter - shows all rows regardless of expiration
```

## Query Analysis

### What the Query Does Right:
1. ✅ Uses correct table: `presence_sessions`
2. ✅ Filters by context_type: `beacon`
3. ✅ Filters by context_id: matches beacon UUID
4. ✅ Filters by expiration: only active sessions
5. ✅ Does NOT filter out current user
6. ✅ Batch resolves profiles from community table

### Potential Issues Identified:

#### 1. Expiration Time Filter
**Current**: Uses `expires_at > now()`
**Issue**: If web presence writes `expires_at` in the past or with incorrect timezone, rows will be filtered out

**Diagnostic Output Will Show:**
- Whether ANY rows exist for the beacon (debug query)
- Exact expiration timestamps
- Time difference showing if rows are expired

#### 2. Beacon Context ID Mismatch
**Potential Issue**: Web app uses hardcoded test beacon ID, iOS app uses detected beacon ID from BLE scanning

**Diagnostic Output Will Show:**
- Exact beacon ID being queried
- Beacon label/name for context

#### 3. Profile Resolution Failures
**Potential Issue**: Web user's community.id might not exist in community table

**Diagnostic Output Will Show:**
- Which user IDs failed to resolve
- Whether web user's ID is in the missing list

#### 4. No Current User Filtering
**Confirmed**: The query does NOT exclude the current user
- Current user WILL appear in attendee list if they have an active presence session
- This is correct behavior for cross-client testing

## Expected Console Output

### Successful Query (With Attendees)
```
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
  👤 Current User ID: <current-user-uuid>
  🏷️  Beacon Name: Test Beacon
  ⏰ Query Time: 2026-03-07T12:34:56Z
  🔎 Query Filters:
     - context_type = 'beacon'
     - context_id = '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b'
     - expires_at > '2026-03-07T12:34:56Z'
  📊 Raw Presence Rows Returned: 2
  📋 Raw Presence Rows:
     [1] 👤 (YOU)
         user_id: <ios-user-uuid>
         energy: 0.85
         expires_at: 2026-03-07T12:39:56Z
     [2] 
         user_id: <web-user-uuid>
         energy: 1.0
         expires_at: 2026-03-07T12:39:56Z
  🔑 User IDs to resolve: 2
  🔄 Fetching community profiles...
  🔍 [PROFILE RESOLUTION] Fetching profiles for 2 users
  📝 Query: community table with filter: id.eq.<ios-uuid>,id.eq.<web-uuid>
  ✅ Profiles fetched: 2 / 2
  ✅ Profiles resolved: 2 / 2
     ✓ <ios-uuid-prefix>... → John Doe
     ✓ <web-uuid-prefix>... → Jane Smith
     + Added attendee: John Doe 👤 (YOU)
     + Added attendee: Jane Smith
  🎯 Final Attendee Count: 2
  ✅ [ATTENDEE QUERY] Complete
```

### Empty Query (No Attendees - With Debug)
```
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
  👤 Current User ID: <current-user-uuid>
  🏷️  Beacon Name: Test Beacon
  ⏰ Query Time: 2026-03-07T12:34:56Z
  🔎 Query Filters:
     - context_type = 'beacon'
     - context_id = '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b'
     - expires_at > '2026-03-07T12:34:56Z'
  📊 Raw Presence Rows Returned: 0
  ⚠️  NO PRESENCE ROWS FOUND
  💡 Debug: Checking if ANY presence rows exist for this beacon...
  🔍 Total rows for beacon (no time filter): 1
  📋 Sample rows (showing expiration status):
     [1] user_id: <web-user-uuid-prefix>...
         expires_at: 2026-03-07T12:29:56Z
         status: ❌ EXPIRED (-300s)
         energy: 1.0
  ✅ [ATTENDEE QUERY] Complete
```

## Root Cause Identification

Based on the diagnostic output, you can identify:

### 1. No Rows Returned
**Symptom**: `Raw Presence Rows Returned: 0`
**Possible Causes**:
- Wrong beacon context_id (web vs iOS mismatch)
- All presence rows expired
- Web presence write failed
- Wrong context_type

**Debug Output Shows**:
- Whether ANY rows exist (debug query)
- Expiration status of existing rows

### 2. Rows Returned But Not Displayed
**Symptom**: `Raw Presence Rows Returned: N` but `Final Attendee Count: 0`
**Possible Causes**:
- Profile resolution failed for all users
- Error during attendee list building

**Debug Output Shows**:
- Which profiles failed to resolve
- Error messages from profile fetch

### 3. Web User Missing But iOS User Present
**Symptom**: iOS user appears, web user doesn't
**Possible Causes**:
- Web user's community.id not in community table
- Web presence expired
- Web presence using wrong beacon ID

**Debug Output Shows**:
- Exact user_ids in presence rows
- Which profiles failed to resolve
- Expiration status of each row

## Testing Instructions

### 1. Run iOS App with Diagnostics
1. Open Xcode and run the iOS Beacon app
2. Navigate to Event Mode
3. Start Event Mode (BLE scanning)
4. Wait for beacon detection
5. Check Xcode console for diagnostic output

### 2. Join from Web App
1. Open web app in browser
2. Open browser console (F12)
3. Click "Join Event" button
4. Verify web presence write succeeds
5. Note the beacon ID and user ID

### 3. Compare Outputs
**Web Console Should Show**:
```
✅ [WEB PRESENCE] Initialized { communityId: "...", testBeaconId: "3a4f2cfe-..." }
[WEB PRESENCE] Writing presence payload: { user_id: "...", context_id: "3a4f2cfe-...", ... }
✅ [WEB PRESENCE] heartbeat refresh successful
```

**iOS Console Should Show**:
```
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: <should-match-web-beacon-id>
  📊 Raw Presence Rows Returned: <should-be-1-or-more>
```

### 4. Identify Mismatch
Compare:
- Beacon IDs (web vs iOS)
- User IDs (web community.id vs iOS query results)
- Expiration timestamps
- Profile resolution results

## Next Steps Based on Findings

### If Beacon ID Mismatch:
- Web uses: `3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`
- iOS detects: Different UUID
- **Solution**: Ensure iOS app is detecting the test beacon, or update web to use detected beacon ID

### If Expiration Issue:
- Web writes expired timestamps
- **Solution**: Fix web presence TTL calculation

### If Profile Resolution Fails:
- Web user's community.id not in community table
- **Solution**: Verify web user profile exists in community table

### If No Rows at All:
- Web presence write is failing silently
- **Solution**: Check web console for errors, verify Supabase permissions

## Commit Information
- **Commit Message**: "Add Phase 5 diagnostic logging to iOS attendee query system"
- **Branch**: main
- **Files Modified**:
  - `ios/InnovationEngine/Services/EventModeDataService.swift`
  - `ios/InnovationEngine/Views/BeaconRadarView.swift`
- **Status**: Committed and pushed to GitHub
