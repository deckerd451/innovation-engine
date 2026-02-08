# Unified Notification System - Quick Reference

## Overview

The Unified Notification System replaces the green START button with an enhanced notification center that combines:
- START sequence updates (connection requests, project bids, opportunities)
- Unread messages from conversations
- System notifications
- Real-time updates via Supabase

## What Changed

### Before
- Green START button (play icon) in top-right navigation
- Separate notification bell for system notifications
- START sequence opened a modal with daily digest

### After
- Bell icon replaces the START button
- Single unified notification panel shows all updates
- Badge shows total count of all unread items
- Real-time updates for messages and notifications

## Features

### 1. Unified Badge Count
The notification badge shows the total of:
- Pending connection requests
- Unread messages
- Project bids to review
- Pending bids on your projects
- System notifications
- Skill-matched project opportunities

### 2. Categorized Notifications
The panel organizes notifications into sections:
- **Connection Requests** - People who want to connect with you
- **Project Bids to Review** - New bids on your projects
- **Unread Messages** - Conversations with unread messages
- **Notifications** - System notifications (endorsements, acceptances, etc.)
- **Opportunities** - Projects that match your skills

### 3. Real-time Updates
- Automatically refreshes every 30 seconds
- Subscribes to real-time Supabase channels for instant updates
- Badge updates immediately when new items arrive

### 4. Click Actions
Each notification item is clickable:
- Connection requests → Opens connections panel
- Messages → Opens messaging interface for that conversation
- Project bids → Opens project details
- Opportunities → Opens project browser

## Technical Details

### Files
- `assets/js/unified-notification-system.js` - Main notification system
- `dashboard.html` - Integration and initialization

### Initialization
```javascript
// Automatically initialized on profile load
window.addEventListener('profile-loaded', (e) => {
  const { profile } = e.detail;
  if (window.UnifiedNotifications && profile) {
    window.UnifiedNotifications.init(profile);
  }
});
```

### Public API
```javascript
// Refresh all data
window.UnifiedNotifications.refresh();

// Show notification panel
window.UnifiedNotifications.show();

// Cleanup (on logout)
window.UnifiedNotifications.cleanup();
```

### Data Sources
1. **START Sequence Data** - `window.getStartSequenceData()`
   - Immediate actions (requests, bids)
   - Opportunities (skill matches, themes)
   - Network insights

2. **Messages** - Supabase `conversations` and `messages` tables
   - Unread message counts per conversation
   - Last message preview

3. **Notifications** - Supabase `notifications` table
   - System notifications
   - Read/unread status

### Realtime Subscriptions
- `unified-notifications` channel - Listens for new notifications
- `unified-messages` channel - Listens for new messages
- Auto-refreshes data when changes detected

## Mobile Responsive

The notification panel is fully responsive:
- Desktop: 450px wide panel, positioned top-right
- Tablet: Adjusts to screen width
- Mobile: Full-width panel with touch-friendly sizing

## Empty State

When there are no notifications:
- Shows "All caught up!" message
- Green checkmark icon
- Encourages user to explore

## Future Enhancements

Potential additions:
1. Mark individual notifications as read
2. Filter notifications by type
3. Notification preferences/settings
4. Push notifications (browser API)
5. Notification history/archive
6. Snooze notifications
7. Priority sorting

## Troubleshooting

### Badge not updating
- Check browser console for errors
- Verify Supabase connection
- Check that profile is loaded: `window.currentUserProfile`

### Panel not showing
- Verify script is loaded: `window.UnifiedNotifications`
- Check for JavaScript errors in console
- Ensure button exists: `document.getElementById('btn-start-nav')`

### Real-time not working
- Check Supabase realtime status
- Verify subscription channels are active
- Falls back to 30-second polling if realtime fails

## Testing

To test the system:
1. Log in to the dashboard
2. Click the bell icon in top-right
3. Verify panel opens with your notifications
4. Check badge count matches total items
5. Click a notification to verify navigation works
6. Send yourself a test message to verify real-time updates

## Rollback

To revert to the old START button:
1. Remove `unified-notification-system.js` script from dashboard.html
2. Remove initialization code from profile-loaded event
3. Change button icon back to play-circle in HTML:
   ```html
   <i class="fas fa-play-circle" style="color:#00ff88; font-size:1.2rem;"></i>
   ```
4. Restore original onclick handler:
   ```javascript
   onclick="if(window.EnhancedStartUI && window.EnhancedStartUI.open) { window.EnhancedStartUI.open(); }"
   ```
