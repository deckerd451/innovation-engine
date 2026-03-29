# Web Event Presence Diagnostic - Complete Analysis

## Problem Statement
Web UI shows "active in test beacon event" but iPhone does not show laptop/web user as an attendee.

## Root Cause: DUPLICATE DISCONNECTED PRESENCE WRITE PATHS

### Discovery
The web app has **TWO SEPARATE** event presence systems that are NOT connected:

### Path 1: Join Event Button (Command Dashboard - Left Panel)
**Location**: `#cd-event-presence` section in index.html  
**Module**: `assets/js/eventPresenceWeb.js`  
**Write Method**: Direct `INSERT` to `presence_sessions` table  
**Beacon ID**: Hardcoded `3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`  
**Status Display**: `#event-presence-status` ("Not in event" / "Active in test beacon event")

**Code Path**:
```javascript
// index.html inline script
document.getElementById('btn-join-event').addEventListener('click', async () => {
  await window.WebEventPresence.joinEvent();
});

// eventPresenceWeb.js
async function joinEvent(beaconId = CONFIG.TEST_BEACON_ID) {
  const payload = {
    user_id: currentUserCommunityId,
    context_type: 'beacon',
    context_id: beaconId,  // 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
    energy: 1.0,
    is_active: true,
    last_seen: now.toISOString(),
    expires_at: expiresAt.toISOString()
  };
  
  await supabase.from('presence_sessions').insert(payload);
}
```

### Path 2: Event Mode Gravity Button (Desktop Synapse Overlay)
**Location**: Created by `assets/js/ble-ui.js` `createEventModeGravityButton()`  
**Module**: `assets/js/eventModeGravity.js`  
**Write Method**: RPC `upsert_presence_ping()`  
**Beacon ID**: Dynamic - passed to `enableEventMode({ beaconId, groupId })`  
**Status Display**: None (visual overlay only)

**Code Path**:
```javascript
// ble-ui.js
async function toggleEventModeGravity() {
  const beaconId = '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b';  // Hardcoded in ble-ui.js
  await window.EventModeGravity.enableEventMode({ beaconId, groupId });
}

// eventModeGravity.js
async function sendPresencePing() {
  await supabase.rpc('upsert_presence_ping', {
    p_context_type: 'beacon',
    p_context_id: currentBeacon.id,  // From loaded beacon
    p_energy: 0.7,
    p_ttl_seconds: 25
  });
}
```

### Path 3: "Event Mode Active" Card (BLE Status Indicator)
**Location**: Bottom of screen, created by `assets/js/ble-ui.js` `createStatusIndicator()`  
**Module**: `assets/js/ble-ui.js`  
**Write Method**: NONE - Visual only  
**Purpose**: Shows BLE scanning status  
**Status Display**: "Event Mode Active" with beacon name

**Code Path**:
```javascript
// ble-ui.js
function createStatusIndicator() {
  statusIndicator.innerHTML = `
    <div>Event Mode Active</div>
    <div id="ble-closest-beacon">Scanning for beacons...</div>
  `;
}

// This is VISUAL ONLY - does NOT write presence_sessions
```

## The Problem

### User Confusion
When user sees "Event Mode Active" card, they think they're in an event, but:
- This card is for BLE scanning status (iOS-style)
- It does NOT write presence_sessions
- It's controlled by BLEPassiveNetworking module (not available in most browsers)

### Actual Presence Write
The ONLY way to write web presence is:
- Click "Join Event" in left panel Command Dashboard
- This calls `eventPresenceWeb.js`

BUT: If user clicks Event Mode Gravity button instead:
- It ALSO writes presence via RPC
- Uses same hardcoded beacon ID (currently)
- Creates duplicate/conflicting presence writes

## Exact Row Shape Written by Web

### From eventPresenceWeb.js (Join Event button):
```javascript
{
  user_id: "<community-id>",           // UUID from window.currentUserProfile.id
  context_type: "beacon",              // Fixed string
  context_id: "3a4f2cfe-eb2e-4d17-abc3-a075f38b713b",  // Test beacon UUID
  energy: 1.0,                         // Fixed value
  is_active: true,                     // Fixed boolean
  last_seen: "2026-03-07T12:34:56Z",  // ISO timestamp
  expires_at: "2026-03-07T12:39:56Z"  // ISO timestamp (now + 5 minutes)
}
```

### From eventModeGravity.js (Event Mode Gravity button):
```javascript
// Via RPC upsert_presence_ping which creates:
{
  user_id: "<community-id>",           // From synapseCore.currentUserCommunityId
  context_type: "beacon",              // From p_context_type param
  context_id: "<beacon-id>",           // From p_context_id param (currentBeacon.id)
  energy: 0.7,                         // From p_energy param
  is_active: true,                     // Set by RPC
  last_seen: now(),                    // Set by RPC
  expires_at: now() + ttl_seconds      // Set by RPC (25 seconds)
}
```

## Phone-Side Attendee Query Expectations

### iOS Query (from EventModeDataService.swift):
```swift
supabase
    .from("presence_sessions")
    .select("user_id, energy, expires_at, last_seen, is_active, created_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: beaconId.uuidString)
    .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
```

### Requirements:
1. ✅ `context_type = 'beacon'` - Web writes this correctly
2. ✅ `context_id = beaconId` - Web uses test beacon ID
3. ✅ `expires_at > now()` - Web sets 5 minutes TTL
4. ✅ `user_id` is UUID - Web uses community.id
5. ✅ `user_id` resolves in community table - Depends on user profile

### Why Phone Might Not Show Web Attendee:

#### Scenario 1: Beacon ID Mismatch
**Web writes**: `3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`  
**Phone queries**: Different beacon ID from BLE detection  
**Result**: No match, web attendee not shown

#### Scenario 2: Expired Presence
**Web writes**: `expires_at` 5 minutes from write time  
**Phone queries**: After 5 minutes have passed  
**Result**: Row filtered out by `expires_at > now()` filter

#### Scenario 3: Community Profile Missing
**Web writes**: `user_id = <web-user-community-id>`  
**Phone queries**: Finds row but can't resolve profile from community table  
**Result**: Attendee shown with placeholder name OR dropped if profile required

#### Scenario 4: Heartbeat Stopped
**Web writes**: Initial row  
**Heartbeat**: Should refresh every 25 seconds  
**If heartbeat fails**: Row expires after 5 minutes  
**Result**: Attendee disappears from phone

## Changes Made

### 1. Enhanced Diagnostic Logging in eventPresenceWeb.js

**Initialize**:
- Shows auth user ID
- Shows resolved community ID
- Shows test beacon ID

**Join Event**:
- Shows full diagnostic banner
- Shows auth user ID vs community ID
- Shows context_id being written
- Shows context_type
- Shows post-join summary with iOS query expectations

**Write Presence**:
- Shows complete payload before write
- Shows each field individually
- Shows TTL in seconds
- Shows detailed error information on failure
- Shows success confirmation

### 2. Documentation Comments

**eventPresenceWeb.js**:
- Added comprehensive header comment
- Documents all three UI paths
- Clarifies which paths write presence
- Marks this module as SINGLE SOURCE OF TRUTH

**ble-ui.js**:
- Added header comment
- Clarifies this module is VISUAL ONLY
- Directs users to eventPresenceWeb.js for actual presence

## Exact Reason Phone Not Showing Web Attendee

Based on diagnostic capabilities, the most likely causes are:

### 1. Beacon ID Mismatch (MOST LIKELY)
**Evidence Needed**:
- Web console: `Context ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`
- iOS console: `Beacon ID: <different-uuid>`

**Why**: iOS app detects physical beacon via BLE, web uses hardcoded test beacon ID

### 2. User Not Clicking Correct Button
**Evidence Needed**:
- User clicks "Event Mode Active" card or Event Mode Gravity button
- These don't write presence (or write via different path)
- User thinks they're in event but presence not written

**Why**: Confusing UI with multiple event-related controls

### 3. Expired Presence
**Evidence Needed**:
- Web console shows successful write
- iOS query runs >5 minutes later
- iOS debug shows expired rows

**Why**: TTL too short or heartbeat stopped

## Recommendations

### Immediate Fix: Unify Event Presence Path

**Option A: Make Join Event the Only Path**
1. Disable presence write in eventModeGravity.js
2. Make Event Mode Gravity purely visual
3. Require users to click "Join Event" first
4. Event Mode Gravity reads presence but doesn't write

**Option B: Connect the Two Paths**
1. Make Event Mode Gravity call eventPresenceWeb.joinEvent()
2. Share state between modules
3. Single source of truth for presence writes

**Option C: Remove Duplicate UI**
1. Remove "Join Event" button
2. Use Event Mode Gravity as only event presence control
3. Ensure it uses correct beacon ID

### Long-Term Fix: Dynamic Beacon Selection

Instead of hardcoded test beacon:
1. Let user select from available beacons
2. Or detect closest beacon (if BLE available)
3. Or sync beacon ID from iOS app
4. Or use QR code to join specific beacon

## Testing Instructions

### Test Web Presence Write
1. Open browser console
2. Click "Join Event" in left panel
3. Look for diagnostic output:
```
🚀 [WEB PRESENCE] JOIN EVENT INITIATED
  🔐 Auth User ID: <auth-uuid>
  👤 Resolved Community ID: <community-uuid>
  📍 Context ID (Beacon): 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
📝 [WEB PRESENCE] Writing presence to database...
  📦 Payload: { ... }
✅ [WEB PRESENCE] Presence row written successfully
📊 [WEB PRESENCE] DIAGNOSTIC SUMMARY
  ✓ Web attendee row written to presence_sessions
  ✓ Community ID: <uuid>
  ✓ Context ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
```

### Test iOS Query
1. Open Xcode console
2. Start Event Mode on iOS
3. Look for diagnostic output:
```
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: <beacon-uuid>
  📊 Raw Presence Rows Returned: <count>
```

### Compare Beacon IDs
- Web: `3a4f2cfe-eb2e-4d17-abc3-a075f38b713b`
- iOS: `<from-console>`
- **Must match exactly**

## Summary

**Two Web Event Controls**:
1. ✅ "Join Event" button (left panel) - Writes presence via eventPresenceWeb.js
2. ✅ Event Mode Gravity button (desktop) - ALSO writes presence via eventModeGravity.js
3. ❌ "Event Mode Active" card (bottom) - Visual only, no presence write

**Which Writes presence_sessions**:
- "Join Event" button → eventPresenceWeb.js → Direct INSERT
- Event Mode Gravity button → eventModeGravity.js → RPC upsert_presence_ping
- "Event Mode Active" card → NONE (visual only)

**Exact Payload Written**:
```javascript
{
  user_id: "<community-id>",
  context_type: "beacon",
  context_id: "3a4f2cfe-eb2e-4d17-abc3-a075f38b713b",
  energy: 1.0,
  is_active: true,
  last_seen: "2026-03-07T...",
  expires_at: "2026-03-07T..." // +5 minutes
}
```

**Exact Reason Phone Not Showing**:
Most likely **Beacon ID mismatch** - iOS queries different beacon than web writes to.

**Change Made**:
Added comprehensive diagnostic logging to make web event presence path unambiguous and traceable.
