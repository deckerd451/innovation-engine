# Notification System - Data Source Wiring Guide

## 🎯 What's Already Wired Up

✅ **Connection Requests** - Fully functional
- Shows count in notification bell
- Real-time updates when requests arrive
- Toast notifications for new requests
- Notifications when requests are accepted

✅ **Notification Infrastructure** - Complete
- Visual notification system
- Toast notifications
- Notification center UI
- Badge animations
- Sound effects
- Desktop notifications
- Settings management

## 🔌 What Needs to Be Wired

### 1. Messages (Unread Count)

**Current Status:** Placeholder (returns 0)

**What You Need to Provide:**

The messaging system exists at `assets/js/messaging.js` with a state that tracks `unreadCount`. To wire it up:

**Option A: Use Existing Messaging Module**
```javascript
// In notification-integration.js, replace the placeholder:

async function getUnreadMessagesCount() {
  try {
    if (!supabase || !currentUserId) return 0;

    // Get community profile ID
    const { data: profile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', currentUserId)
      .single();

    if (!profile) return 0;

    // Count unread messages across all conversations
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .or(`participant_1_id.eq.${profile.id},participant_2_id.eq.${profile.id}`);

    if (!conversations) return 0;

    let totalUnread = 0;
    for (const conv of conversations) {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('read', false)
        .neq('sender_id', profile.id);  // Only messages from others

      totalUnread += count || 0;
    }

    return totalUnread;
  } catch (error) {
    console.error('Error getting unread messages:', error);
    return 0;
  }
}
```

**Option B: Add Unread Count to Conversations Table**
```sql
-- Add a column to track unread count per conversation
ALTER TABLE conversations
ADD COLUMN unread_count INTEGER DEFAULT 0;

-- Then use simpler query:
```
```javascript
async function getUnreadMessagesCount() {
  const { data: profile } = await supabase
    .from('community')
    .select('id')
    .eq('user_id', currentUserId)
    .single();

  const { data } = await supabase
    .from('conversations')
    .select('unread_count')
    .or(`participant_1_id.eq.${profile.id},participant_2_id.eq.${profile.id}`);

  return data?.reduce((sum, conv) => sum + (conv.unread_count || 0), 0) || 0;
}
```

**Database Schema Needed:**
```sql
-- Already exists based on messaging.js:
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  participant_1_id UUID REFERENCES community(id),
  participant_2_id UUID REFERENCES community(id),
  last_message_at TIMESTAMP,
  last_message_preview TEXT
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  sender_id UUID REFERENCES community(id),
  content TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP
);
```

---

### 2. Project/Team Invites

**Current Status:** Placeholder (returns 0)

**What You Need to Provide:**

**Database Schema:**
```sql
-- project_members table (already exists)
CREATE TABLE project_members (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES community(id),
  role TEXT,  -- 'owner', 'member', 'pending', etc.
  invited_by UUID REFERENCES community(id),
  invited_at TIMESTAMP,
  accepted_at TIMESTAMP
);
```

**Implementation:**
```javascript
async function getProjectInvitesCount() {
  try {
    if (!supabase || !currentUserId) return 0;

    // Get community profile ID
    const { data: profile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', currentUserId)
      .single();

    if (!profile) return 0;

    // Count pending project invitations
    const { count, error } = await supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('role', 'pending');  // or whatever status indicates pending

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting project invites:', error);
    return 0;
  }
}
```

**Real-time Listener:**
```javascript
// Add to setupRealtimeNotifications() in notification-integration.js
supabase
  .channel('project-invites')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'project_members',
      filter: `user_id=eq.${profileId},role=eq.pending`
    },
    async (payload) => {
      const project = await getProjectName(payload.new.project_id);
      const inviter = await getUserName(payload.new.invited_by);

      window.showNotification({
        type: 'team_invite',
        title: 'Project Invitation',
        message: `${inviter} invited you to join "${project}"`,
        duration: 7000,
        onClick: () => window.openNotificationCenter()
      });

      updateNotificationCounts();
    }
  )
  .subscribe();
```

---

### 3. Project Updates

**Current Status:** Placeholder (not implemented)

**What You Need to Provide:**

This is optional and depends on what kind of updates you want to track.

**Option A: Activity Table**
```sql
CREATE TABLE project_activities (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  actor_id UUID REFERENCES community(id),
  action_type TEXT,  -- 'comment', 'file_upload', 'status_change', etc.
  description TEXT,
  created_at TIMESTAMP
);
```

**Option B: Use Existing Tables**
Track updates from:
- New members joining projects
- Project status changes
- Comments/discussions
- File uploads

**Implementation Example:**
```javascript
async function getProjectUpdatesCount() {
  // Get projects user is a member of
  const { data: projects } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', profileId);

  if (!projects) return 0;

  const projectIds = projects.map(p => p.project_id);

  // Count recent activities (last 7 days, unread)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count } = await supabase
    .from('project_activities')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .neq('actor_id', profileId)  // Not from current user
    .gte('created_at', sevenDaysAgo.toISOString());

  return count || 0;
}
```

---

## 📝 Implementation Steps

### Step 1: Choose What to Wire
Decide which notifications you want:
- [ ] Messages (recommended)
- [ ] Project Invites (recommended)
- [ ] Project Updates (optional)

### Step 2: Update notification-integration.js

Replace the placeholder functions:

```javascript
// Find this in notification-integration.js (line ~70):
async function updateNotificationCounts() {
  try {
    // Get connection requests count
    const connectionRequests = await getConnectionRequestsCount();

    // TODO: Replace these placeholders
    const unreadMessages = 0;  // ← Replace with getUnreadMessagesCount()
    const projectInvites = 0;   // ← Replace with getProjectInvitesCount()
    const projectUpdates = 0;   // ← Optional

    // Calculate total
    const totalCount = connectionRequests + unreadMessages + projectInvites + projectUpdates;

    // Update badge
    updateNotificationBadge(totalCount);

    console.log('🔔 Notification counts updated:', {
      connectionRequests,
      unreadMessages,
      projectInvites,
      projectUpdates,
      total: totalCount
    });

    return totalCount;
  } catch (error) {
    console.error('❌ Error updating notification counts:', error);
    return 0;
  }
}
```

### Step 3: Add Real-time Listeners

Add to `setupRealtimeNotifications()` function:

```javascript
// Messages
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'messages'
}, handleNewMessage)

// Project Invites
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'project_members',
  filter: `user_id=eq.${profileId}`
}, handleProjectInvite)
```

### Step 4: Test

```javascript
// In browser console:
testNotification('info')
testNotification('connection')
updateNotificationCounts()
openNotificationCenter()
```

---

## 🗄️ Required Database Tables

### Already Exists:
- ✅ `connections` - For connection requests
- ✅ `community` - User profiles
- ✅ `conversations` - Message conversations
- ✅ `messages` - Individual messages
- ✅ `project_members` - Project memberships

### May Need to Add:
- ⚠️ `project_activities` - For project updates (optional)
- ⚠️ `unread_count` column in conversations (optional optimization)

---

## 🎨 Customization

### Notification Types
You can add custom notification types in `notification-system.js`:

```javascript
const NOTIFICATION_TYPES = {
  MESSAGE: 'message',
  TEAM_INVITE: 'team_invite',
  CONNECTION_REQUEST: 'connection_request',
  PROJECT_UPDATE: 'project_update',
  ACHIEVEMENT: 'achievement',
  SYSTEM: 'system',
  // Add your own:
  CUSTOM_TYPE: 'custom_type'
};
```

### Notification Priorities
```javascript
const NOTIFICATION_PRIORITY = {
  LOW: 1,      // Background updates
  NORMAL: 2,   // Regular notifications
  HIGH: 3,     // Important updates
  URGENT: 4    // Critical alerts
};
```

---

## 🚀 Quick Start (Minimal Implementation)

If you just want to get messages working quickly:

1. **Open:** `assets/js/notification-integration.js`

2. **Find line ~70** and replace:
```javascript
const unreadMessages = 0;
```

with:

```javascript
const unreadMessages = await getUnreadMessagesCount();
```

3. **Add this function** after `getConnectionRequestsCount()`:
```javascript
async function getUnreadMessagesCount() {
  // Copy implementation from Option A or B above
}
```

4. **Test:**
```javascript
updateNotificationCounts()
```

That's it! The notification system will now show message counts.

---

## 📞 Need Help?

**Database Schema Questions:**
- Check existing tables with Supabase dashboard
- Verify column names and types match examples

**Implementation Questions:**
- Test notification functions in console
- Check browser console for errors
- Use `testNotification()` to verify system works

**Real-time Not Working:**
- Verify Supabase real-time is enabled
- Check RLS policies allow subscriptions
- Confirm channel subscription status in console logs
