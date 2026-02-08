# Presence UI System - Test Checklist

## ✅ Quick Verification Steps

### 1. Check System is Loaded

Open browser console and verify:

```javascript
// Should return an object with methods
console.log(window.PresenceUI);

// Should return an object with methods
console.log(window.PresenceSessionManager);

// Should show initialization messages
// Look for:
// ✅ Presence session manager loaded
// ✅ Presence UI module loaded
// 👋 Initializing presence session for community profile: [UUID]
// ✅ Presence session initialized
// 👁️ Initializing presence UI system...
// ✅ Presence UI system initialized
```

### 2. Check Presence Session Created

Run this SQL query in Supabase:

```sql
-- Replace with your community profile ID
SELECT 
  id,
  user_id,
  is_active,
  last_seen,
  expires_at,
  NOW() - last_seen as idle_time
FROM presence_sessions
WHERE user_id = 'YOUR_COMMUNITY_PROFILE_ID_HERE'
ORDER BY last_seen DESC
LIMIT 1;
```

**Expected Result:**
- One row with `is_active = true`
- `last_seen` should be recent (within last 5 minutes)
- `expires_at` should be 10 minutes after `last_seen`

### 3. Check Heartbeat is Working

1. Open browser console
2. Wait 5 minutes
3. Look for message: `💓 Presence heartbeat sent`
4. Run the SQL query again - `last_seen` should have updated

### 4. Check Presence Indicators in UI

1. **Open a profile panel:**
   - Click on any person node in the network
   - Look for presence dot on avatar (bottom-right corner)
   - Look for status text ("available" or "offline")
   - Look for "Last seen" text

2. **Check your own profile:**
   - Click on your profile button (top-left)
   - Your presence dot should be **green** (you're online!)
   - Status should say "available"
   - Last seen should say "Active now"

3. **Check another user's profile:**
   - Click on another person's node
   - If they're online (logged in within last 10 minutes): green dot
   - If they're offline: gray dot

### 5. Test Tab Switching

1. Open the dashboard
2. Switch to another tab for 30 seconds
3. Switch back
4. Check console for: `👀 Presence marked as active`

### 6. Test Idle Detection

1. Open the dashboard
2. Don't touch mouse/keyboard for 3 minutes
3. Wait for next heartbeat (5 minutes total)
4. Check console for: `⏸️ User idle (XXXs), skipping presence update`

### 7. Test Cleanup on Logout

1. Open the dashboard
2. Note your session ID from SQL query
3. Click logout
4. Run SQL query again - your session should be deleted

---

## 🐛 Common Issues and Solutions

### Issue: No presence session created

**Symptoms:**
- SQL query returns no rows
- Console shows: `⚠️ Cannot create presence session: User profile not found`

**Solution:**
- Verify user has a community profile: `SELECT * FROM community WHERE user_id = 'AUTH_USER_ID';`
- If no profile exists, complete onboarding first

### Issue: Presence indicators not showing

**Symptoms:**
- Profile panel opens but no green/gray dot visible
- Status text doesn't update

**Solution:**
1. Check if `PresenceUI` is initialized: `console.log(window.PresenceUI)`
2. Check if elements have correct attributes: `document.querySelectorAll('[data-presence-user-id]')`
3. Force update: `window.PresenceUI.updateAllPresence()`

### Issue: Heartbeat not sending

**Symptoms:**
- No `💓 Presence heartbeat sent` messages in console
- `last_seen` timestamp not updating

**Solution:**
1. Check if session was created: `window.PresenceSessionManager.getSessionInfo()`
2. Check for JavaScript errors in console
3. Verify tab is visible (heartbeat pauses when tab is hidden)

### Issue: Always showing offline

**Symptoms:**
- All users show gray dot and "offline" status
- Even your own profile shows offline

**Solution:**
1. Check `ONLINE_THRESHOLD` in `presence-ui.js` (default: 10 minutes)
2. Verify `last_seen` timestamps are recent: `SELECT user_id, last_seen FROM presence_sessions WHERE is_active = true;`
3. Check system clock is correct (time sync issues can cause this)

---

## 📊 Monitoring Queries

### Active Users Right Now
```sql
SELECT 
  c.name,
  c.email,
  ps.last_seen,
  NOW() - ps.last_seen as idle_time,
  CASE 
    WHEN ps.last_seen > NOW() - INTERVAL '10 minutes' THEN '🟢 ONLINE'
    ELSE '⚪ OFFLINE'
  END as status
FROM presence_sessions ps
JOIN community c ON ps.user_id = c.id
WHERE ps.is_active = true
ORDER BY ps.last_seen DESC;
```

### Session Statistics
```sql
SELECT 
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE is_active = true) as active_sessions,
  COUNT(*) FILTER (WHERE is_active = false) as inactive_sessions,
  COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '10 minutes') as online_users,
  MAX(last_seen) as most_recent_activity
FROM presence_sessions;
```

### Cleanup Old Sessions
```sql
-- Delete sessions older than 24 hours
DELETE FROM presence_sessions 
WHERE last_seen < NOW() - INTERVAL '24 hours';

-- Mark expired sessions as inactive
UPDATE presence_sessions 
SET is_active = false 
WHERE expires_at < NOW() AND is_active = true;
```

---

## ✅ Expected Behavior Summary

| Scenario | Expected Result |
|----------|----------------|
| User logs in | Presence session created, heartbeat starts |
| User active | Green dot, "available" status, "Active now" |
| User idle 2+ min | Heartbeat skipped, but still shows online |
| User offline 10+ min | Gray dot, "offline" status, "Last seen X ago" |
| User switches tab | Session marked inactive, heartbeat pauses |
| User returns to tab | Session marked active, heartbeat resumes |
| User logs out | Session deleted from database |
| Profile panel opens | Presence indicators update immediately |
| Every 30 seconds | All presence indicators refresh |
| Every 5 minutes | Heartbeat updates `last_seen` timestamp |

---

## 🎯 Success Criteria

The system is working correctly if:

✅ Console shows initialization messages  
✅ Presence session exists in database  
✅ Heartbeat messages appear every 5 minutes  
✅ Your own profile shows green dot and "Active now"  
✅ Other online users show green dots  
✅ Offline users show gray dots  
✅ Status text updates automatically  
✅ Tab switching pauses/resumes heartbeat  
✅ Logout deletes session  

If all criteria are met, the system is **fully operational**! 🎉
