# Presence System V2 - Implementation Guide

## Overview

The new presence system uses **Supabase Realtime Presence** (ephemeral) for online status and **low-frequency database writes** for last_seen persistence. This design minimizes database usage while providing reliable presence indicators across desktop and mobile.

## Architecture

### Components

1. **presence-realtime.js** - Core presence system
   - Manages Realtime Presence channel
   - Handles mobile fallback polling
   - Throttles database writes

2. **presence-ui.js** - UI layer
   - Updates green dots and status text
   - Listens to presence-realtime events
   - No direct database queries

3. **presence-session-manager.js** - DEPRECATED
   - Kept for backward compatibility
   - Replaced by presence-realtime.js

### Identity Key

**Uses `community.id` consistently** (not `auth.user.id`)
- Matches graph people nodes
- Consistent across all presence queries
- Simplifies RLS policies

## How It Works

### Online Status (Realtime Presence)

```
User opens page
  ↓
PresenceRealtime.initialize()
  ↓
Registers with realtimeManager
  ↓
Creates channel: "presence:global"
  ↓
Tracks presence: { profile_id, online_at }
  ↓
Listens for sync/join/leave events
  ↓
Updates onlineUsers Map (in-memory)
  ↓
Notifies PresenceUI via 'presence-updated' event
```

**Key Features:**
- ✅ Ephemeral (no database writes)
- ✅ Real-time sync across all clients
- ✅ Automatic cleanup on disconnect
- ✅ Integrated with realtimeManager

### Last Seen Persistence (Database)

**Low-frequency updates to `community.last_seen_at`:**

1. **On page hide/unload** (immediate)
   - Uses `navigator.sendBeacon()` for reliability
   - Ensures last_seen is updated when user leaves

2. **Every 30-60 minutes** (throttled)
   - Prevents excessive database writes
   - Keeps last_seen reasonably fresh

3. **On tab visibility change** (when hidden)
   - Updates when user switches tabs
   - Minimal overhead

**Write Frequency:**
- Old system: Every 30 seconds = 120 writes/hour
- New system: Every 30 minutes + page hide = ~2-4 writes/hour
- **Reduction: 95%+ fewer database writes**

### Mobile Fallback (Polling)

If Realtime Presence fails to connect within 15 seconds:

```
Timeout (15s)
  ↓
Enable polling fallback
  ↓
Query community.last_seen_at every 60s
  ↓
Filter: last_seen_at > NOW() - 5 minutes
  ↓
Update lastSeenCache (in-memory)
  ↓
Notify PresenceUI
```

**Fallback Characteristics:**
- ✅ Minimal query (only active users)
- ✅ Indexed for performance
- ✅ 60-second polling interval
- ✅ Automatic switch back to Realtime if it reconnects

## Database Schema

### community.last_seen_at

```sql
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_community_last_seen_at 
ON community(last_seen_at);

-- Index for active users (last 5 minutes)
CREATE INDEX IF NOT EXISTS idx_community_recent_activity 
ON community(last_seen_at) 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes';
```

### RLS Policy

```sql
CREATE POLICY "Authenticated users can view profiles and presence"
ON community
FOR SELECT
TO authenticated
USING (
  (is_hidden IS NULL OR is_hidden = false)
  OR
  (user_id = auth.uid())
);
```

## API Reference

### PresenceRealtime

```javascript
// Initialize
await PresenceRealtime.initialize(supabase, communityProfileId);

// Check if user is online
const isOnline = PresenceRealtime.isOnline(profileId);

// Get last seen timestamp
const lastSeen = PresenceRealtime.getLastSeen(profileId);

// Get all online users
const onlineUsers = PresenceRealtime.getOnlineUsers();

// Get online count
const count = PresenceRealtime.getOnlineCount();

// Get current mode
const mode = PresenceRealtime.getMode(); // 'realtime' or 'polling'

// Get debug info
const debug = PresenceRealtime.getDebugInfo();

// Cleanup
PresenceRealtime.cleanup();
```

### PresenceUI

```javascript
// Initialize
await PresenceUI.init(supabase, currentUserId);

// Check if user is online (delegates to PresenceRealtime)
const isOnline = PresenceUI.isOnline(profileId);

// Create presence dot
const dot = PresenceUI.createPresenceDot(profileId, size);

// Add presence dot to avatar
PresenceUI.addPresenceDotToAvatar(avatarElement, profileId);

// Update all indicators
PresenceUI.updateAllIndicators();

// Update indicators for specific user
PresenceUI.updateIndicatorsForUser(profileId);
```

## UI Integration

### HTML Attributes

```html
<!-- Presence dot -->
<div data-presence-user-id="[profile-id]"></div>

<!-- Status text -->
<span data-presence-status-user-id="[profile-id]"></span>

<!-- Last seen text -->
<span data-presence-lastseen-user-id="[profile-id]"></span>
```

### CSS

```css
/* Online dot */
[data-presence-user-id] {
  background-color: #00ff88; /* Online */
  box-shadow: 0 0 8px rgba(0,255,136,0.6);
}

/* Offline dot */
[data-presence-user-id].offline {
  background-color: #666;
  box-shadow: none;
}
```

## Debug Logging

All presence logs are prefixed with `[Presence]`:

```javascript
// Connection status
console.log('✅ [Presence] Realtime connected');
console.log('📱 [Presence] Realtime not connected, enabling polling fallback');

// Presence events
console.log('👋 [Presence] User joined:', profileId);
console.log('👋 [Presence] User left:', profileId);
console.log('📊 [Presence] Sync: 5 users online');

// Mode changes
console.log('📊 [Presence] Mode: Realtime (ephemeral)');
console.log('🔄 [Presence] Mode: Polling (every 60s)');

// Database updates
console.log('💾 [Presence] Updated last_seen (throttled)');
console.log('👋 [Presence] Page hiding, updating last_seen');
```

## Performance Characteristics

### Database Writes

| Scenario | Old System | New System | Reduction |
|----------|-----------|------------|-----------|
| Active user (1 hour) | 120 writes | 2-4 writes | 95%+ |
| Page hide/unload | 1 write | 1 write | Same |
| Tab switching | 2 writes | 1 write | 50% |

### Network Usage

| Mode | Frequency | Data Size | Notes |
|------|-----------|-----------|-------|
| Realtime Presence | Real-time | ~100 bytes | Ephemeral, no DB |
| Polling Fallback | 60 seconds | ~1-5 KB | Only active users |
| Last Seen Update | 30-60 minutes | ~200 bytes | Throttled |

### Query Performance

```sql
-- Active users query (polling fallback)
-- Uses idx_community_recent_activity
SELECT id, last_seen_at 
FROM community 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes'
ORDER BY last_seen_at DESC 
LIMIT 100;

-- Execution time: <10ms (indexed)
```

## Migration Guide

### From Old System

1. **Run SQL migrations:**
   ```bash
   # Add last_seen_at column
   supabase/sql/fixes/ADD_LAST_SEEN_TO_COMMUNITY.sql
   
   # Fix RLS policies
   supabase/sql/fixes/FIX_COMMUNITY_PRESENCE_RLS.sql
   ```

2. **Update code:**
   - Replace `PresenceSessionManager` with `PresenceRealtime`
   - Update initialization in `main.js` (already done)
   - Load `presence-realtime.js` before `presence-ui.js` (already done)

3. **Test:**
   - Open multiple tabs/browsers
   - Check green dots appear/disappear
   - Verify "Active now" vs "Last seen X ago"
   - Test mobile fallback (disable Realtime in dev tools)

### Backward Compatibility

The old `presence-session-manager.js` is kept as a deprecated stub:
- Logs warnings when used
- Provides no-op methods
- Prevents breaking existing code

## Troubleshooting

### Users appear offline

1. Check Realtime connection:
   ```javascript
   PresenceRealtime.getDebugInfo()
   // mode: 'realtime' or 'polling'
   // isRealtimeConnected: true/false
   ```

2. Check if user is tracked:
   ```javascript
   PresenceRealtime.getOnlineUsers()
   // Should include the user's profile ID
   ```

3. Check RLS policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'community';
   ```

### Polling fallback not working

1. Check last_seen_at column exists:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'community' AND column_name = 'last_seen_at';
   ```

2. Check indexes:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'community' AND indexname LIKE '%last_seen%';
   ```

3. Check console for polling logs:
   ```
   🔄 [Presence] Polled: 5 active users
   ```

### High database writes

1. Check update interval:
   ```javascript
   // Should be 30-60 minutes, not seconds
   CONFIG.LAST_SEEN_UPDATE_INTERVAL
   ```

2. Check for duplicate initializations:
   ```javascript
   // Should only initialize once
   window.__IE_PRESENCE_INIT__
   ```

## Future Enhancements

- [ ] Presence tiers (idle, active, focused)
- [ ] Typing indicators
- [ ] "Viewing same page" detection
- [ ] Presence analytics dashboard
- [ ] Custom presence status messages

## References

- [Supabase Realtime Presence Docs](https://supabase.com/docs/guides/realtime/presence)
- [Navigator.sendBeacon() API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
