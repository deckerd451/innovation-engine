# Presence System - Quick Reference

## 🚀 Quick Start

### 1. Run SQL Migrations
```sql
-- In Supabase SQL Editor:
supabase/sql/fixes/ADD_LAST_SEEN_TO_COMMUNITY.sql
supabase/sql/fixes/FIX_COMMUNITY_PRESENCE_RLS.sql
```

### 2. Verify Installation
```javascript
// In browser console:
PresenceRealtime.getDebugInfo()
// Should show: { mode: 'realtime', isRealtimeConnected: true, ... }
```

### 3. Test
```javascript
// Check if user is online:
PresenceRealtime.isOnline('profile-id')

// Get online count:
PresenceRealtime.getOnlineCount()
```

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENCE SYSTEM V2                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Realtime        │         │  Database        │         │
│  │  Presence        │         │  Persistence     │         │
│  │  (Primary)       │         │  (Backup)        │         │
│  ├──────────────────┤         ├──────────────────┤         │
│  │ • Ephemeral      │         │ • last_seen_at   │         │
│  │ • No DB writes   │         │ • 2-4 writes/hr  │         │
│  │ • Real-time sync │         │ • Page hide only │         │
│  │ • WebSocket      │         │ • Throttled      │         │
│  └──────────────────┘         └──────────────────┘         │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        │                                     │
│                        ▼                                     │
│           ┌──────────────────────┐                          │
│           │  Mobile Fallback     │                          │
│           │  (Polling)           │                          │
│           ├──────────────────────┤                          │
│           │ • 15s timeout        │                          │
│           │ • 60s interval       │                          │
│           │ • Indexed queries    │                          │
│           └──────────────────────┘                          │
│                        │                                     │
│                        ▼                                     │
│           ┌──────────────────────┐                          │
│           │  Presence UI         │                          │
│           ├──────────────────────┤                          │
│           │ • Green/gray dots    │                          │
│           │ • Status text        │                          │
│           │ • Last seen          │                          │
│           └──────────────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 Key Concepts

### Identity Key
- **Always use `community.id`** (not `auth.user.id`)
- Consistent across all presence queries
- Matches graph people nodes

### Write Frequency
- **Old:** 120 writes/hour per user
- **New:** 2-4 writes/hour per user
- **Reduction:** 95%+

### Modes
- **Realtime:** WebSocket-based, ephemeral
- **Polling:** HTTP-based, fallback

## 📝 Common Tasks

### Check if User is Online
```javascript
const isOnline = PresenceRealtime.isOnline(profileId);
```

### Get Last Seen Timestamp
```javascript
const lastSeen = PresenceRealtime.getLastSeen(profileId);
const date = new Date(lastSeen);
```

### Get All Online Users
```javascript
const onlineUsers = PresenceRealtime.getOnlineUsers();
console.log(`${onlineUsers.length} users online`);
```

### Add Presence Dot to Avatar
```javascript
// HTML:
<div class="avatar" id="user-avatar">
  <img src="avatar.jpg" />
</div>

// JavaScript:
const avatar = document.getElementById('user-avatar');
PresenceUI.addPresenceDotToAvatar(avatar, profileId);
```

### Update Presence Indicators
```javascript
// Update all:
PresenceUI.updateAllIndicators();

// Update specific user:
PresenceUI.updateIndicatorsForUser(profileId);
```

## 🎨 HTML Attributes

### Presence Dot
```html
<div data-presence-user-id="[profile-id]"></div>
```

### Status Text
```html
<span data-presence-status-user-id="[profile-id]"></span>
<!-- Shows: "available" or "offline" -->
```

### Last Seen Text
```html
<span data-presence-lastseen-user-id="[profile-id]"></span>
<!-- Shows: "Active now" or "Last seen 5 minutes ago" -->
```

## 🐛 Debug Commands

### Get Debug Info
```javascript
const debug = PresenceRealtime.getDebugInfo();
console.table(debug);
```

### Check Mode
```javascript
const mode = PresenceRealtime.getMode();
console.log(`Mode: ${mode}`); // 'realtime' or 'polling'
```

### Check Realtime Manager
```javascript
console.log('Channels:', realtimeManager.getActiveChannels());
console.log('Presence active:', realtimeManager.isChannelActive('presence:global'));
```

### Monitor Events
```javascript
window.addEventListener('presence-updated', (e) => {
  console.log('Presence updated:', e.detail);
});
```

## ⚠️ Common Issues

### Users Always Offline
```javascript
// Check connection:
PresenceRealtime.getDebugInfo().isRealtimeConnected

// Check profile ID:
PresenceRealtime.getDebugInfo().currentProfileId

// Check if user is tracked:
PresenceRealtime.getOnlineUsers()
```

### Polling Not Working
```sql
-- Check column exists:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'community' AND column_name = 'last_seen_at';

-- Check index exists:
SELECT indexname FROM pg_indexes 
WHERE tablename = 'community' AND indexname LIKE '%last_seen%';
```

### Too Many DB Writes
```javascript
// Check initialization:
console.log('Init count:', window.__IE_PRESENCE_INIT__);

// Check interval (should be 1800000ms = 30min):
console.log('Interval:', 30 * 60 * 1000);
```

## 📊 Performance Metrics

### Database Writes
- **Target:** 2-4 writes/hour per user
- **Monitor:** Supabase > Database > Logs

### Query Performance
- **Active users query:** <10ms
- **Realtime sync:** <100ms
- **UI updates:** <5ms

### Network Usage
- **Realtime:** ~100 bytes per event
- **Polling:** ~1-5 KB per query
- **Last seen:** ~200 bytes per update

## 🔍 SQL Queries

### Check Last Seen
```sql
SELECT id, name, last_seen_at, 
       NOW() - last_seen_at as idle_time
FROM community 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes'
ORDER BY last_seen_at DESC;
```

### Check Active Users
```sql
SELECT COUNT(*) as active_users
FROM community 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes';
```

### Check RLS Policies
```sql
SELECT policyname, cmd, qual
FROM pg_policies 
WHERE tablename = 'community';
```

## 📚 Documentation

- **Full Docs:** `docs/PRESENCE_SYSTEM_V2.md`
- **Testing Guide:** `docs/TESTING_PRESENCE_V2.md`
- **Summary:** `PRESENCE_FIX_SUMMARY.md`

## 🎯 Success Criteria

✅ Green dots appear for online users  
✅ Gray dots appear for offline users  
✅ "Active now" shows for online users  
✅ "Last seen X ago" shows for offline users  
✅ Real-time updates (no page refresh needed)  
✅ 2-4 database writes per hour (not 120!)  
✅ Works on desktop and mobile  
✅ Graceful fallback when Realtime unavailable  

## 🚨 Emergency Commands

### Force Cleanup
```javascript
PresenceRealtime.cleanup();
```

### Restart Presence
```javascript
// 1. Cleanup
PresenceRealtime.cleanup();

// 2. Wait 2 seconds
await new Promise(r => setTimeout(r, 2000));

// 3. Reinitialize
await PresenceRealtime.initialize(window.supabase, profileId);
```

### Reset Flags
```javascript
window.__IE_PRESENCE_INIT__ = false;
window.__IE_PRESENCE_UI_INIT__ = false;
```

## 💡 Tips

1. **Always use `community.id`** as the identity key
2. **Check mode** before debugging (realtime vs polling)
3. **Monitor database writes** to ensure throttling works
4. **Test with multiple users** to verify real-time sync
5. **Check console logs** for presence events

## 🔗 Related Systems

- **realtimeManager:** Manages all Realtime channels
- **bootstrapSession:** Provides user context
- **presence-ui:** Renders presence indicators
- **unified-network:** Uses presence for graph visualization

---

**Last Updated:** February 11, 2026  
**Version:** 2.0  
**Status:** Production Ready
