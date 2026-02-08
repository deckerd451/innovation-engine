# Presence UI System - Complete Guide

## ✅ Status: FULLY IMPLEMENTED AND DEPLOYED

The presence UI system is **already live** and working in production. This document explains how it works.

---

## 🎯 What It Does

The presence UI system displays real-time online/offline status indicators throughout the Innovation Engine:

- **Green dot** = User is online (active within last 10 minutes)
- **Gray dot** = User is offline
- **Status text** = "available" or "offline"
- **Last seen** = "Active now" or "Last seen X minutes ago"

---

## 🏗️ Architecture

### 1. **Presence Session Manager** (`assets/js/presence-session-manager.js`)
- Creates presence sessions when users log in
- Sends heartbeats every 5 minutes (with idle detection)
- Tracks user activity (mouse, keyboard, clicks, scroll, touch)
- Marks sessions inactive when tab is hidden
- Cleans up sessions on logout

### 2. **Presence UI** (`assets/js/presence-ui.js`)
- Fetches presence data from `presence_sessions` table
- Updates UI indicators every 30 seconds
- Listens for profile panel opens to update specific users
- Provides helper functions to add presence dots to avatars

### 3. **Database** (`presence_sessions` table)
```sql
- id: uuid (primary key)
- user_id: uuid (references community.id)
- is_active: boolean
- last_seen: timestamp
- expires_at: timestamp
- context_type: text
- context_id: uuid
- energy: numeric
```

---

## 📍 Where Presence Indicators Appear

### Profile Panels (Node Side Panel)
When you click on a person's node in the network:
- **Avatar**: Green/gray dot in bottom-right corner
- **Status line**: "available" or "offline" with colored dot
- **Last seen**: "Active now" or "Last seen X minutes ago"

### Future Integration Points
The system is designed to easily add presence indicators to:
- Connection lists
- Search results
- Project member lists
- Messaging interfaces

---

## 🔧 How It Works

### Initialization Flow

1. **User logs in** → `auth.js` authenticates user
2. **Profile loads** → `main.js` receives `profile-loaded` event
3. **Presence session starts** → `PresenceSessionManager.initialize(supabase, profileId)`
4. **Presence UI starts** → `PresenceUI.init(supabase)`
5. **Heartbeats begin** → Every 5 minutes, updates `last_seen` timestamp

### Update Flow

1. **Every 30 seconds** → `PresenceUI.updateAllPresence()` fetches active sessions
2. **Checks timestamps** → If `last_seen` < 10 minutes ago = online
3. **Updates DOM** → All elements with `data-presence-*` attributes get updated
4. **Profile panel opens** → Immediately updates that specific user's presence

### Cleanup Flow

1. **User closes tab** → `beforeunload` event fires
2. **Session deleted** → Removes row from `presence_sessions` table
3. **Tab hidden** → Marks session as `is_active = false`
4. **Tab visible again** → Marks session as `is_active = true`

---

## 🎨 Adding Presence Indicators to New UI Elements

### Method 1: Using Data Attributes (Automatic)

Add these attributes to any element and the system will automatically update them:

```html
<!-- Presence dot (changes color) -->
<div data-presence-user-id="USER_ID_HERE" 
     style="width: 12px; height: 12px; border-radius: 50%; background-color: #666;">
</div>

<!-- Status text (changes text and color) -->
<span data-presence-status-user-id="USER_ID_HERE">offline</span>

<!-- Last seen text (changes text) -->
<span data-presence-lastseen-user-id="USER_ID_HERE">Last seen: unknown</span>
```

### Method 2: Using JavaScript API

```javascript
// Add presence dot to an avatar
const avatar = document.querySelector('.user-avatar');
window.PresenceUI.addPresenceDotToAvatar(avatar, userId);

// Create a standalone presence dot
const dot = window.PresenceUI.createPresenceDot(userId, 12); // 12px size
someContainer.appendChild(dot);

// Check if user is online
const isOnline = window.PresenceUI.isOnline(userId);

// Force update for specific user
window.PresenceUI.updatePresenceForUser(userId);

// Force update for all users
window.PresenceUI.updateAllPresence();
```

---

## ⚙️ Configuration

### Thresholds (in `presence-ui.js`)
```javascript
const ONLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
const UPDATE_INTERVAL = 30 * 1000; // 30 seconds
```

### Heartbeat Settings (in `presence-session-manager.js`)
```javascript
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes
```

---

## 🐛 Troubleshooting

### Users Not Showing as Online

**Check 1: Is presence session created?**
```sql
SELECT * FROM presence_sessions WHERE user_id = 'USER_ID_HERE';
```

**Check 2: Is heartbeat working?**
- Open browser console
- Look for: `💓 Presence heartbeat sent` every 5 minutes

**Check 3: Is user_id correct?**
- Presence uses **community profile ID** (not auth user ID)
- Check: `SELECT id, user_id FROM community WHERE email = 'user@example.com';`

### Presence Indicators Not Updating

**Check 1: Is PresenceUI initialized?**
```javascript
console.log(window.PresenceUI); // Should be an object
```

**Check 2: Are data attributes correct?**
```javascript
// Should find elements
document.querySelectorAll('[data-presence-user-id]');
```

**Check 3: Check browser console for errors**
- Look for errors in `presence-ui.js` or `presence-session-manager.js`

### Expired Sessions Not Cleaning Up

This is **cosmetic only** and doesn't affect functionality. Expired sessions with `is_active = true` don't prevent new sessions from working. To clean them up:

```sql
UPDATE presence_sessions 
SET is_active = false 
WHERE expires_at < NOW();
```

---

## 📊 Database Maintenance

### Clean Up Old Sessions (Optional)
```sql
-- Delete sessions older than 24 hours
DELETE FROM presence_sessions 
WHERE last_seen < NOW() - INTERVAL '24 hours';
```

### Check Active Users
```sql
SELECT 
  c.name,
  c.email,
  ps.last_seen,
  ps.is_active,
  CASE 
    WHEN ps.last_seen > NOW() - INTERVAL '10 minutes' THEN 'ONLINE'
    ELSE 'OFFLINE'
  END as status
FROM presence_sessions ps
JOIN community c ON ps.user_id = c.id
WHERE ps.is_active = true
ORDER BY ps.last_seen DESC;
```

---

## 🚀 Performance Optimizations

### Egress Optimization
- Heartbeat reduced from 30 seconds to 5 minutes (90% reduction)
- Idle detection prevents unnecessary updates
- Only active sessions are queried

### UI Optimization
- Updates batched every 30 seconds
- Uses Map for O(1) cache lookups
- Passive event listeners for activity tracking

---

## 🔮 Future Enhancements

### Potential Additions
1. **Typing indicators** in messaging
2. **"Currently viewing" indicators** on project pages
3. **Presence in search results** (green dots next to online users)
4. **Presence in connection lists**
5. **Rich presence** (e.g., "Working on Project X")
6. **Do Not Disturb mode** (user can manually set status)

### Implementation Notes
All of these can be added by:
1. Adding the appropriate `data-presence-*` attributes to the UI
2. The system will automatically update them
3. No changes to backend needed

---

## 📝 Summary

The presence UI system is **fully functional** and requires no additional setup. It:

✅ Tracks user sessions automatically  
✅ Updates UI indicators every 30 seconds  
✅ Shows online/offline status in profile panels  
✅ Handles tab switching and page unload gracefully  
✅ Optimized for low database egress  
✅ Easy to extend to new UI elements  

**No action needed** - the system is working as designed!

---

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify database schema matches expected structure
3. Confirm user has a valid community profile
4. Check that `presence_sessions` table exists and is accessible

For questions about extending the system, refer to the "Adding Presence Indicators" section above.
