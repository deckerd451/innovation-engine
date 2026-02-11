# Testing Presence System V2

## Quick Test Checklist

### 1. Database Setup

Run these SQL migrations in Supabase SQL Editor:

```bash
# 1. Add last_seen_at column to community table
supabase/sql/fixes/ADD_LAST_SEEN_TO_COMMUNITY.sql

# 2. Fix RLS policies for presence data
supabase/sql/fixes/FIX_COMMUNITY_PRESENCE_RLS.sql
```

Verify:
```sql
-- Check column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'community' AND column_name = 'last_seen_at';

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'community' AND indexname LIKE '%last_seen%';

-- Check RLS policy
SELECT policyname 
FROM pg_policies 
WHERE tablename = 'community';
```

### 2. Code Verification

Check that files are loaded in correct order in `index.html`:

```html
<!-- Should appear in this order: -->
<script src="assets/js/presence-realtime.js?v=20260211-1"></script>
<script src="assets/js/presence-session-manager.js?v=20260211-1"></script>
<script src="assets/js/presence-ui.js?v=20260211-1"></script>
```

### 3. Browser Console Tests

Open browser console and run:

```javascript
// 1. Check modules loaded
console.log('PresenceRealtime:', !!window.PresenceRealtime);
console.log('PresenceUI:', !!window.PresenceUI);

// 2. Check initialization
console.log('Presence initialized:', window.__IE_PRESENCE_INIT__);
console.log('Presence UI initialized:', window.__IE_PRESENCE_UI_INIT__);

// 3. Get debug info
PresenceRealtime.getDebugInfo();
// Expected output:
// {
//   mode: 'realtime',
//   isRealtimeConnected: true,
//   onlineCount: 1,
//   onlineUsers: ['your-profile-id'],
//   lastSeenCacheSize: 0,
//   channelName: 'presence:global',
//   currentProfileId: 'your-profile-id'
// }

// 4. Check realtime manager
realtimeManager.getActiveChannels();
// Should include: 'presence:global'

// 5. Check online status
PresenceRealtime.isOnline('your-profile-id'); // Should be true
PresenceRealtime.getOnlineCount(); // Should be >= 1
```

### 4. Multi-Tab Test

**Test online indicators:**

1. Open dashboard in Tab 1
2. Open dashboard in Tab 2 (same browser, different tab)
3. In Tab 1 console:
   ```javascript
   PresenceRealtime.getOnlineCount(); // Should be 1 (same user)
   ```
4. Open dashboard in incognito/different browser with different user
5. In Tab 1 console:
   ```javascript
   PresenceRealtime.getOnlineCount(); // Should be 2
   PresenceRealtime.getOnlineUsers(); // Should show both profile IDs
   ```

**Expected behavior:**
- ✅ Green dots appear next to online users
- ✅ Status shows "available" for online users
- ✅ "Active now" appears for online users

### 5. Offline Test

**Test offline indicators:**

1. Open dashboard in Tab 1
2. Note your profile ID:
   ```javascript
   PresenceRealtime.getDebugInfo().currentProfileId
   ```
3. Close Tab 1
4. In Tab 2 (different user), wait 10 seconds
5. Check console:
   ```javascript
   PresenceRealtime.isOnline('closed-user-profile-id'); // Should be false
   ```

**Expected behavior:**
- ✅ Green dot turns gray
- ✅ Status shows "offline"
- ✅ "Last seen X seconds ago" appears

### 6. Last Seen Persistence Test

**Test database updates:**

1. Open dashboard
2. Check initial last_seen_at:
   ```sql
   SELECT id, name, last_seen_at 
   FROM community 
   WHERE id = 'your-profile-id';
   ```
3. Wait 30-60 minutes (or trigger manually):
   ```javascript
   // Manually trigger update (for testing)
   PresenceRealtime.cleanup();
   ```
4. Check updated last_seen_at:
   ```sql
   SELECT id, name, last_seen_at 
   FROM community 
   WHERE id = 'your-profile-id';
   ```

**Expected behavior:**
- ✅ last_seen_at updates on page hide
- ✅ last_seen_at updates every 30-60 minutes
- ✅ last_seen_at does NOT update every few seconds

### 7. Mobile Fallback Test

**Test polling mode:**

1. Open browser DevTools
2. Go to Network tab
3. Filter by "WS" (WebSocket)
4. Block WebSocket connections (or disable Realtime in Supabase dashboard)
5. Reload page
6. Wait 15 seconds
7. Check console:
   ```
   ⚠️ [Presence] Realtime not connected, enabling polling fallback
   🔄 [Presence] Mode: Polling (every 60s)
   🔄 [Presence] Polled: X active users
   ```

**Expected behavior:**
- ✅ Falls back to polling after 15 seconds
- ✅ Polls every 60 seconds
- ✅ Shows online users based on last_seen_at
- ✅ Green dots still work (based on last 5 minutes)

### 8. Performance Test

**Check database write frequency:**

1. Open dashboard
2. Monitor database writes:
   ```sql
   -- Enable query logging in Supabase dashboard
   -- Or check logs in Supabase > Database > Logs
   ```
3. Leave page open for 1 hour
4. Count UPDATE queries to community.last_seen_at

**Expected results:**
- ✅ 2-4 writes per hour (not 120!)
- ✅ Writes occur on:
  - Page hide/unload
  - Every 30-60 minutes
  - Tab visibility change

### 9. UI Integration Test

**Test presence indicators in UI:**

1. Find user cards/avatars in the UI
2. Check for presence dots:
   ```javascript
   document.querySelectorAll('[data-presence-user-id]').length
   ```
3. Verify dots are colored correctly:
   - Green (#00ff88) = online
   - Gray (#666) = offline
4. Check status text:
   ```javascript
   document.querySelectorAll('[data-presence-status-user-id]')
   ```
5. Check last seen text:
   ```javascript
   document.querySelectorAll('[data-presence-lastseen-user-id]')
   ```

**Expected behavior:**
- ✅ Dots appear on avatars
- ✅ Colors update in real-time
- ✅ Status text shows "available" or "offline"
- ✅ Last seen shows "Active now" or "Last seen X ago"

### 10. Error Handling Test

**Test graceful degradation:**

1. Disable Supabase connection
2. Reload page
3. Check console for errors
4. Verify app doesn't crash

**Expected behavior:**
- ✅ Errors logged but app continues
- ✅ Presence shows "unknown" or "offline"
- ✅ No infinite loops or crashes

## Debug Commands

### Check Presence State

```javascript
// Get full debug info
const debug = PresenceRealtime.getDebugInfo();
console.table(debug);

// Check specific user
const userId = 'profile-id-here';
console.log('Online:', PresenceRealtime.isOnline(userId));
console.log('Last seen:', new Date(PresenceRealtime.getLastSeen(userId)));

// List all online users
console.log('Online users:', PresenceRealtime.getOnlineUsers());
```

### Check Realtime Manager

```javascript
// List all channels
console.log('Active channels:', realtimeManager.getActiveChannels());

// Check if presence channel is active
console.log('Presence active:', realtimeManager.isChannelActive('presence:global'));

// Get channel count
console.log('Channel count:', realtimeManager.getChannelCount());
```

### Force Updates

```javascript
// Force UI update
PresenceUI.updateAllIndicators();

// Force presence update for specific user
PresenceUI.updateIndicatorsForUser('profile-id-here');

// Manually trigger last_seen update
PresenceRealtime.cleanup(); // Updates last_seen then cleans up
```

### Monitor Events

```javascript
// Listen for presence updates
window.addEventListener('presence-updated', (e) => {
  console.log('Presence updated:', e.detail);
});

// Listen for profile loaded
window.addEventListener('profile-loaded', (e) => {
  console.log('Profile loaded:', e.detail);
});
```

## Common Issues

### Issue: Users always show offline

**Possible causes:**
1. Realtime not connected
2. Profile ID mismatch
3. RLS policy blocking reads

**Debug:**
```javascript
// Check connection
PresenceRealtime.getDebugInfo().isRealtimeConnected

// Check profile ID
PresenceRealtime.getDebugInfo().currentProfileId

// Check RLS
// Run in Supabase SQL Editor:
SELECT * FROM community WHERE id = 'profile-id-here';
```

### Issue: Polling not working

**Possible causes:**
1. last_seen_at column missing
2. Index missing
3. RLS policy blocking reads

**Debug:**
```sql
-- Check column
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'community' AND column_name = 'last_seen_at';

-- Check index
SELECT indexname FROM pg_indexes 
WHERE tablename = 'community' AND indexname LIKE '%last_seen%';

-- Test query
SELECT id, last_seen_at FROM community 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes';
```

### Issue: Too many database writes

**Possible causes:**
1. Multiple initializations
2. Interval too short
3. Old system still running

**Debug:**
```javascript
// Check initialization count
console.log('Init count:', window.__IE_PRESENCE_INIT__);

// Check interval
console.log('Update interval:', 30 * 60 * 1000, 'ms'); // Should be 1800000

// Check for old system
console.log('Old system:', !!window.PresenceSessionManager);
```

## Success Criteria

✅ **Realtime Mode:**
- Green dots appear/disappear in real-time
- Online count updates immediately
- No database writes for online status

✅ **Polling Mode:**
- Falls back within 15 seconds
- Polls every 60 seconds
- Shows online users from last 5 minutes

✅ **Database Writes:**
- 2-4 writes per hour (not 120!)
- Updates on page hide/unload
- Updates every 30-60 minutes

✅ **UI:**
- Green dots on online users
- Gray dots on offline users
- "Active now" for online
- "Last seen X ago" for offline

✅ **Performance:**
- No lag or freezing
- Fast queries (<10ms)
- Low network usage

## Next Steps

After testing:

1. Monitor Supabase logs for 24 hours
2. Check database write frequency
3. Verify no errors in production
4. Collect user feedback on presence accuracy
5. Consider adding presence analytics
