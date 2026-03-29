# Diagnostic Quick Reference - Web + iOS Presence Testing

## Quick Diagnostic Checklist

### Step 1: Verify Web Presence Write
**Check browser console for:**
```
✅ [WEB PRESENCE] Initialized
[WEB PRESENCE] Writing presence payload: { ... }
✅ [WEB PRESENCE] heartbeat refresh successful
```

**If you see errors:**
- ❌ Upsert error → Already fixed (using insert now)
- ❌ Permission denied → Check Supabase RLS policies
- ❌ Not initialized → Profile not loaded yet

### Step 2: Check iOS Attendee Query
**Check Xcode console for:**
```
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: <uuid>
  📊 Raw Presence Rows Returned: <count>
```

**Key Metrics:**
- `Raw Presence Rows Returned: 0` → No presence data found
- `Raw Presence Rows Returned: N` → Data exists, check profile resolution

### Step 3: Compare Beacon IDs
**Web beacon ID (from browser console):**
```
context_id: "3a4f2cfe-eb2e-4d17-abc3-a075f38b713b"
```

**iOS beacon ID (from Xcode console):**
```
📍 Beacon ID: <uuid>
```

**Must match exactly!**

### Step 4: Check Expiration Status
**If iOS shows debug output:**
```
🔍 Total rows for beacon (no time filter): 1
📋 Sample rows (showing expiration status):
     [1] status: ❌ EXPIRED (-300s)
```

**Expired rows won't appear in active attendees**

### Step 5: Verify Profile Resolution
**Check iOS console for:**
```
✅ Profiles resolved: 2 / 2
   ✓ abc123... → John Doe
   ✓ def456... → Jane Smith
```

**If you see:**
```
⚠️  Missing profiles for 1 users:
   - <web-user-uuid>
```

**Web user's community.id is not in community table**

## Common Issues & Solutions

### Issue 1: Beacon ID Mismatch
**Symptom:**
- Web: `context_id: "3a4f2cfe-eb2e-4d17-abc3-a075f38b713b"`
- iOS: `Beacon ID: <different-uuid>`

**Cause:** iOS is detecting a different beacon than the test beacon

**Solution:**
1. Check which beacon iOS is actually detecting
2. Either:
   - Update web to use the detected beacon ID, OR
   - Ensure iOS app is near the test beacon (UUID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b)

### Issue 2: Expired Presence
**Symptom:**
```
📊 Raw Presence Rows Returned: 0
🔍 Total rows for beacon (no time filter): 1
status: ❌ EXPIRED (-300s)
```

**Cause:** Web presence expired (TTL too short or heartbeat stopped)

**Solution:**
1. Check web console - is heartbeat running?
2. Verify web presence TTL (should be 5 minutes)
3. Check if "Leave Event" was clicked accidentally

### Issue 3: Profile Not Found
**Symptom:**
```
⚠️  Missing profiles for 1 users:
   - <web-user-uuid>
```

**Cause:** Web user's community.id doesn't exist in community table

**Solution:**
1. Verify web user is logged in
2. Check `window.currentUserProfile.id` in browser console
3. Query Supabase community table for that ID
4. If missing, user profile wasn't created properly during signup

### Issue 4: No Presence Rows at All
**Symptom:**
```
📊 Raw Presence Rows Returned: 0
🔍 Total rows for beacon (no time filter): 0
```

**Cause:** Web presence write is failing or not happening

**Solution:**
1. Check browser console for web presence errors
2. Verify "Join Event" button was clicked
3. Check Supabase presence_sessions table directly
4. Verify Supabase RLS policies allow insert

### Issue 5: iOS Not Detecting Beacon
**Symptom:**
- iOS shows "Scanning for beacons..."
- No beacon detected
- No attendee query runs

**Cause:** No physical beacon nearby or BLE permission denied

**Solution:**
1. Check iOS location permissions
2. Ensure physical beacon is powered on and nearby
3. Check beacon UUID/major/minor configuration
4. For testing without physical beacon, manually trigger with test beacon ID

## Expected Success Output

### Web Console (Success)
```
✅ [WEB PRESENCE] Initialized { communityId: "abc-123", testBeaconId: "3a4f2cfe-..." }
[WEB PRESENCE] Attempting to join event... { beaconId: "3a4f2cfe-...", communityId: "abc-123" }
[WEB PRESENCE] Writing presence payload: {
  user_id: "abc-123",
  context_type: "beacon",
  context_id: "3a4f2cfe-eb2e-4d17-abc3-a075f38b713b",
  energy: 1.0,
  is_active: true,
  last_seen: "2026-03-07T12:34:56Z",
  expires_at: "2026-03-07T12:39:56Z"
}
✅ [WEB PRESENCE] heartbeat refresh successful
✅ [WEB PRESENCE] joined event
```

### iOS Console (Success)
```
🔄 [RADAR] Refreshing data for beacon: Test Beacon
  📍 Beacon ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
🔍 [ATTENDEE QUERY] Starting attendee fetch
  📍 Beacon ID: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
  👤 Current User ID: def-456
  🏷️  Beacon Name: Test Beacon
  ⏰ Query Time: 2026-03-07T12:34:58Z
  🔎 Query Filters:
     - context_type = 'beacon'
     - context_id = '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b'
     - expires_at > '2026-03-07T12:34:58Z'
  📊 Raw Presence Rows Returned: 2
  📋 Raw Presence Rows:
     [1] 👤 (YOU)
         user_id: def-456
         energy: 0.85
         expires_at: 2026-03-07T12:39:58Z
     [2] 
         user_id: abc-123
         energy: 1.0
         expires_at: 2026-03-07T12:39:56Z
  🔑 User IDs to resolve: 2
  🔄 Fetching community profiles...
  🔍 [PROFILE RESOLUTION] Fetching profiles for 2 users
  ✅ Profiles fetched: 2 / 2
  ✅ Profiles resolved: 2 / 2
     ✓ def456... → iOS User
     ✓ abc123... → Web User
     + Added attendee: iOS User 👤 (YOU)
     + Added attendee: Web User
  🎯 Final Attendee Count: 2
  ✅ [ATTENDEE QUERY] Complete
✅ [RADAR] Refresh complete: 2 attendees, 0 edges
```

## Troubleshooting Commands

### Check Web User Profile
```javascript
// In browser console
console.log('User ID:', window.currentUserProfile?.id);
console.log('Profile:', window.currentUserProfile);
```

### Check Web Presence Status
```javascript
// In browser console
window.WebEventPresence.getStatus();
```

### Query Supabase Directly (Web Console)
```javascript
// Check if presence row exists
const { data, error } = await window.supabase
  .from('presence_sessions')
  .select('*')
  .eq('context_type', 'beacon')
  .eq('context_id', '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b');
console.log('Presence rows:', data);
```

### Check Community Profile (Web Console)
```javascript
// Verify user exists in community table
const userId = window.currentUserProfile?.id;
const { data, error } = await window.supabase
  .from('community')
  .select('*')
  .eq('id', userId);
console.log('Community profile:', data);
```

## Summary of Diagnostic Capabilities

### What We Can Now See:

✅ **Beacon Context**
- Exact beacon ID being queried
- Beacon name/label
- Whether beacon IDs match between web and iOS

✅ **Query Execution**
- Exact filters applied
- Query timestamp
- Raw row count returned

✅ **Presence Data**
- Each presence row with full details
- Expiration status (active vs expired)
- Energy levels
- Which rows belong to current user

✅ **Profile Resolution**
- Which user IDs need profiles
- Which profiles were found
- Which profiles are missing
- Exact names resolved

✅ **Final Results**
- Attendee count after all processing
- Each attendee added to list
- Success/failure status

### What We Can Diagnose:

✅ Beacon ID mismatches
✅ Expired presence sessions
✅ Missing community profiles
✅ Failed presence writes
✅ Profile resolution failures
✅ Empty result causes
✅ Current user filtering (none applied)
✅ Query filter correctness
