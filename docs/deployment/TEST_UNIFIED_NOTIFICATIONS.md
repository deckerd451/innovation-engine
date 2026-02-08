# Testing the Unified Notification System

## Quick Test Checklist

### 1. Visual Verification
- [ ] Green START button is now a bell icon
- [ ] Bell icon is cyan/blue color (#00e0ff)
- [ ] Badge appears if there are notifications
- [ ] Badge shows correct count

### 2. Panel Functionality
- [ ] Click bell icon to open panel
- [ ] Panel slides in smoothly from top-right
- [ ] Panel shows categorized notifications
- [ ] Close button (X) works
- [ ] Click outside panel to close

### 3. Notification Categories
- [ ] Connection Requests section appears if you have pending requests
- [ ] Project Bids section appears if you have bids to review
- [ ] Unread Messages section appears if you have unread messages
- [ ] Opportunities section appears if there are skill matches
- [ ] Empty state shows if no notifications

### 4. Click Actions
- [ ] Click connection request → navigates to connections
- [ ] Click message → opens messaging interface
- [ ] Click project bid → opens project details
- [ ] Click opportunity → opens projects

### 5. Real-time Updates
- [ ] Send yourself a test message
- [ ] Badge count increases immediately
- [ ] New message appears in panel
- [ ] Badge updates without page refresh

### 6. Mobile Responsive
- [ ] Open on mobile device or resize browser
- [ ] Panel is full-width on mobile
- [ ] Touch targets are large enough
- [ ] Scrolling works smoothly
- [ ] Badge is visible on mobile

## Detailed Test Scenarios

### Scenario 1: First Login
**Steps:**
1. Log in to the dashboard
2. Look at top-right navigation
3. Find the bell icon (where START button was)

**Expected:**
- Bell icon is visible
- Badge shows count if you have notifications
- Icon is cyan/blue color

### Scenario 2: Open Notification Panel
**Steps:**
1. Click the bell icon
2. Wait for panel to appear

**Expected:**
- Panel slides in from top-right
- Shows "Updates" header
- Shows count of items needing attention
- Notifications are categorized
- Each notification has icon, title, and timestamp

### Scenario 3: Navigate from Notification
**Steps:**
1. Open notification panel
2. Click on a connection request

**Expected:**
- Panel closes
- Navigates to connections section
- Shows the person who sent the request

### Scenario 4: Empty State
**Steps:**
1. Mark all notifications as read
2. Open notification panel

**Expected:**
- Shows green checkmark icon
- Shows "All caught up!" message
- Shows "No new updates at the moment"

### Scenario 5: Real-time Update
**Steps:**
1. Open two browser windows
2. Log in as different users
3. Send connection request from one to the other
4. Watch the recipient's notification badge

**Expected:**
- Badge count increases immediately
- New notification appears in panel
- No page refresh needed

### Scenario 6: Mobile View
**Steps:**
1. Open dashboard on mobile device
2. Click bell icon
3. Scroll through notifications

**Expected:**
- Panel is full-width
- Text is readable
- Touch targets are easy to tap
- Scrolling is smooth
- Close button is accessible

## Browser Console Tests

Open browser console and run these commands:

### Check if system is loaded
```javascript
console.log('Unified Notifications:', window.UnifiedNotifications);
// Should show object with init, refresh, show, cleanup methods
```

### Check current user profile
```javascript
console.log('Current User:', window.currentUserProfile);
// Should show your profile object with id, name, etc.
```

### Manually refresh data
```javascript
await window.UnifiedNotifications.refresh();
console.log('Data refreshed');
```

### Manually show panel
```javascript
window.UnifiedNotifications.show();
```

### Check START sequence data
```javascript
const data = await window.getStartSequenceData();
console.log('START Data:', data);
// Should show immediate_actions, opportunities, etc.
```

## Common Issues & Solutions

### Issue: Badge not showing
**Solution:**
- Check console for errors
- Verify you have notifications: `await window.UnifiedNotifications.refresh()`
- Check badge element: `document.querySelector('.notification-badge')`

### Issue: Panel not opening
**Solution:**
- Check if button exists: `document.getElementById('btn-start-nav')`
- Check for JavaScript errors in console
- Verify system is initialized: `window.UnifiedNotifications`

### Issue: Real-time not working
**Solution:**
- Check Supabase connection: `window.supabase`
- Check realtime status in Supabase dashboard
- System falls back to 30-second polling if realtime fails

### Issue: Wrong notification count
**Solution:**
- Manually refresh: `await window.UnifiedNotifications.refresh()`
- Check each data source:
  ```javascript
  const startData = await window.getStartSequenceData();
  console.log('Pending requests:', startData.immediate_actions.pending_requests.count);
  ```

### Issue: Notifications not clickable
**Solution:**
- Check browser console for errors
- Verify navigation functions exist:
  ```javascript
  console.log('Messaging:', window.openMessagingInterface);
  ```

## Performance Tests

### Load Time
```javascript
console.time('notification-load');
await window.UnifiedNotifications.refresh();
console.timeEnd('notification-load');
// Should be < 500ms
```

### Panel Animation
- Open panel and observe
- Should animate smoothly in 300ms
- No jank or stuttering

### Memory Usage
```javascript
// Before opening panel
console.log('Memory:', performance.memory.usedJSHeapSize);

// Open and close panel 10 times
for (let i = 0; i < 10; i++) {
  window.UnifiedNotifications.show();
  await new Promise(r => setTimeout(r, 500));
  document.getElementById('unified-notification-panel')?.remove();
}

// After
console.log('Memory:', performance.memory.usedJSHeapSize);
// Should not increase significantly
```

## Accessibility Tests

### Keyboard Navigation
- [ ] Tab to bell icon
- [ ] Press Enter to open panel
- [ ] Tab through notifications
- [ ] Press Escape to close panel

### Screen Reader
- [ ] Bell icon has title attribute
- [ ] Badge is announced
- [ ] Notification items are readable
- [ ] Close button is announced

### Color Contrast
- [ ] Text is readable on backgrounds
- [ ] Icons are visible
- [ ] Badge stands out
- [ ] Hover states are clear

## Load Testing

### Multiple Notifications
1. Create test data with 50+ notifications
2. Open panel
3. Verify smooth scrolling
4. Check performance

### Rapid Updates
1. Send multiple messages quickly
2. Watch badge update
3. Verify no race conditions
4. Check for duplicate notifications

## Integration Tests

### With START Sequence
```javascript
// Verify START data is accessible
const startData = await window.getStartSequenceData();
console.log('START integration:', !!startData);
```

### With Messaging
```javascript
// Verify messaging integration
console.log('Messaging integration:', !!window.openMessagingInterface);
```

### With Notifications
```javascript
// Verify notification bell integration
console.log('Notification bell:', !!window.NotificationBell);
```

## Regression Tests

Verify these existing features still work:
- [ ] START sequence modal (if accessed directly)
- [ ] Notification bell (separate system)
- [ ] Messaging interface
- [ ] Connection requests panel
- [ ] Project details
- [ ] User profile

## Sign-off Checklist

Before deploying to production:
- [ ] All visual tests pass
- [ ] All functionality tests pass
- [ ] Mobile responsive works
- [ ] Real-time updates work
- [ ] No console errors
- [ ] Performance is acceptable
- [ ] Accessibility is good
- [ ] Integration tests pass
- [ ] Regression tests pass
- [ ] Documentation is complete

## Test Results Template

```
Date: ___________
Tester: ___________
Browser: ___________
Device: ___________

Visual Tests:        [ ] Pass  [ ] Fail
Functionality Tests: [ ] Pass  [ ] Fail
Mobile Tests:        [ ] Pass  [ ] Fail
Real-time Tests:     [ ] Pass  [ ] Fail
Performance Tests:   [ ] Pass  [ ] Fail
Accessibility Tests: [ ] Pass  [ ] Fail
Integration Tests:   [ ] Pass  [ ] Fail
Regression Tests:    [ ] Pass  [ ] Fail

Issues Found:
1. ___________
2. ___________
3. ___________

Overall Status: [ ] Ready for Production  [ ] Needs Work

Notes:
___________
___________
___________
```
