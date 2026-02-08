# Deployment Checklist

## Pre-Deployment

- [ ] Read QUICK_START_GUIDE.md
- [ ] Read IMPLEMENTATION_SUMMARY.md
- [ ] Backup current database
- [ ] Backup current code

## Database Setup

- [ ] Open Supabase SQL Editor
- [ ] Run migrations/COMPREHENSIVE_FIXES_SCHEMA.sql
- [ ] Verify no errors in SQL execution
- [ ] Create 'avatars' storage bucket
- [ ] Add storage RLS policies
- [ ] Test: SELECT total_xp, level FROM community LIMIT 1;
- [ ] Test: SELECT * FROM project_requests LIMIT 1;
- [ ] Test: SELECT * FROM notifications LIMIT 1;

## File Deployment

- [ ] Copy assets/js/comprehensive-fixes.js
- [ ] Copy assets/js/notification-bell.js
- [ ] Copy assets/js/avatar-upload.js
- [ ] Copy assets/js/node-panel-fixes.js
- [ ] Verify all files uploaded successfully

## Dashboard.html Updates

- [ ] Add notification bell to header
- [ ] Add CSS for notification badge
- [ ] Add CSS fixes for blue bar
- [ ] Add CSS fixes for scrolling
- [ ] Add script includes (4 new files)
- [ ] Add notification bell initialization script
- [ ] Save and upload dashboard.html

## Testing

- [ ] Open test-comprehensive-fixes.html
- [ ] Run all tests
- [ ] Verify all tests pass
- [ ] Check browser console for errors

## Manual Verification

- [ ] Logout button visible in dropdown
- [ ] Notification bell visible in header
- [ ] No blue bar on profile pages
- [ ] Projects panel scrolls
- [ ] Level shows dynamically
- [ ] Streak shows dynamically
- [ ] Clicking member opens profile
- [ ] Clicking skill shows people list
- [ ] Join organization creates request
- [ ] Avatar upload works

## Post-Deployment

- [ ] Clear browser cache
- [ ] Test on multiple browsers
- [ ] Monitor error logs
- [ ] Gather user feedback
- [ ] Document any issues

## Rollback Plan

If issues occur:
- [ ] Restore database backup
- [ ] Restore code backup
- [ ] Clear browser caches
- [ ] Notify users of rollback
