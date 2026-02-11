# Presence System V2 - Deployment Checklist

## Pre-Deployment

### 1. Database Migrations
- [ ] Run `supabase/sql/fixes/ADD_LAST_SEEN_TO_COMMUNITY.sql`
- [ ] Run `supabase/sql/fixes/FIX_COMMUNITY_PRESENCE_RLS.sql`
- [ ] Verify column exists:
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'community' AND column_name = 'last_seen_at';
  ```
- [ ] Verify indexes exist:
  ```sql
  SELECT indexname FROM pg_indexes 
  WHERE tablename = 'community' AND indexname LIKE '%last_seen%';
  ```
- [ ] Verify RLS policy exists:
  ```sql
  SELECT policyname FROM pg_policies 
  WHERE tablename = 'community' 
  AND policyname = 'Authenticated users can view profiles and presence';
  ```

### 2. Code Review
- [ ] Review `assets/js/presence-realtime.js`
- [ ] Review `assets/js/presence-ui.js` changes
- [ ] Review `main.js` changes
- [ ] Review `index.html` changes
- [ ] Verify no syntax errors
- [ ] Verify no console errors in dev

### 3. Local Testing
- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test on mobile (iOS/Android)
- [ ] Test multi-tab scenario
- [ ] Test offline scenario
- [ ] Test polling fallback
- [ ] Verify database write frequency

## Deployment

### 1. Backup
- [ ] Backup current `community` table:
  ```sql
  CREATE TABLE community_backup_20260211 AS 
  SELECT * FROM community;
  ```
- [ ] Backup current code (git commit)
- [ ] Document current state

### 2. Deploy Database Changes
- [ ] Run migrations in Supabase SQL Editor
- [ ] Verify no errors
- [ ] Check affected rows
- [ ] Test query performance:
  ```sql
  EXPLAIN ANALYZE
  SELECT id, last_seen_at FROM community 
  WHERE last_seen_at > NOW() - INTERVAL '5 minutes';
  ```

### 3. Deploy Code Changes
- [ ] Push code to repository
- [ ] Deploy to staging (if available)
- [ ] Test in staging
- [ ] Deploy to production
- [ ] Clear browser cache
- [ ] Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### 4. Verify Deployment
- [ ] Check files loaded:
  ```javascript
  console.log('PresenceRealtime:', !!window.PresenceRealtime);
  console.log('PresenceUI:', !!window.PresenceUI);
  ```
- [ ] Check initialization:
  ```javascript
  console.log('Presence init:', window.__IE_PRESENCE_INIT__);
  console.log('Presence UI init:', window.__IE_PRESENCE_UI_INIT__);
  ```
- [ ] Check debug info:
  ```javascript
  PresenceRealtime.getDebugInfo();
  ```

## Post-Deployment

### 1. Immediate Checks (0-5 minutes)
- [ ] No JavaScript errors in console
- [ ] Presence system initializes
- [ ] Green dots appear for online users
- [ ] Realtime connection established
- [ ] No infinite loops or crashes

### 2. Short-Term Monitoring (5-30 minutes)
- [ ] Monitor Supabase logs for errors
- [ ] Check database write frequency
- [ ] Verify Realtime Presence channel active
- [ ] Test with multiple users
- [ ] Check mobile devices

### 3. Medium-Term Monitoring (30 minutes - 2 hours)
- [ ] Monitor database writes (should be 2-4 per hour)
- [ ] Check for memory leaks
- [ ] Verify polling fallback works
- [ ] Test tab switching behavior
- [ ] Check page hide/unload updates

### 4. Long-Term Monitoring (2-24 hours)
- [ ] Review Supabase logs for patterns
- [ ] Check database write frequency over time
- [ ] Monitor user feedback
- [ ] Check for edge cases
- [ ] Verify no performance degradation

## Rollback Plan

### If Issues Occur

1. **Immediate Rollback (Code Only)**
   ```bash
   git revert [commit-hash]
   git push
   ```
   - Reverts to old presence system
   - Database changes remain (safe)

2. **Full Rollback (Code + Database)**
   ```sql
   -- Remove column (if needed)
   ALTER TABLE community DROP COLUMN IF EXISTS last_seen_at;
   
   -- Remove indexes
   DROP INDEX IF EXISTS idx_community_last_seen_at;
   DROP INDEX IF EXISTS idx_community_recent_activity;
   
   -- Restore old RLS policy (if needed)
   -- [Add old policy here]
   ```

3. **Restore from Backup**
   ```sql
   -- If needed (extreme case)
   DROP TABLE community;
   ALTER TABLE community_backup_20260211 RENAME TO community;
   ```

## Success Metrics

### Immediate (0-5 minutes)
- ✅ No errors in console
- ✅ Presence system initializes
- ✅ Green dots appear

### Short-Term (5-30 minutes)
- ✅ Realtime connection stable
- ✅ Multiple users show online
- ✅ No crashes or loops

### Medium-Term (30 minutes - 2 hours)
- ✅ Database writes: 2-4 per hour
- ✅ Polling fallback works
- ✅ UI updates correctly

### Long-Term (2-24 hours)
- ✅ No performance issues
- ✅ Consistent behavior
- ✅ Positive user feedback

## Monitoring Commands

### Check System Health
```javascript
// Get debug info
const debug = PresenceRealtime.getDebugInfo();
console.table(debug);

// Check mode
console.log('Mode:', PresenceRealtime.getMode());

// Check online count
console.log('Online:', PresenceRealtime.getOnlineCount());

// Check channels
console.log('Channels:', realtimeManager.getActiveChannels());
```

### Check Database
```sql
-- Check last_seen updates
SELECT id, name, last_seen_at, 
       NOW() - last_seen_at as idle_time
FROM community 
ORDER BY last_seen_at DESC 
LIMIT 10;

-- Count active users
SELECT COUNT(*) as active_users
FROM community 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes';

-- Check write frequency (requires logging)
-- Review Supabase > Database > Logs
```

### Check Realtime
```javascript
// Check Realtime status
console.log('Realtime connected:', PresenceRealtime.getDebugInfo().isRealtimeConnected);

// Check presence channel
console.log('Presence channel:', realtimeManager.isChannelActive('presence:global'));

// Monitor events
window.addEventListener('presence-updated', (e) => {
  console.log('Presence update:', e.detail);
});
```

## Troubleshooting

### Issue: Users not showing online
1. Check Realtime connection
2. Verify profile IDs match
3. Check RLS policies
4. Review console logs

### Issue: Too many database writes
1. Check initialization count
2. Verify interval is 30-60 minutes
3. Check for duplicate initializations
4. Review Supabase logs

### Issue: Polling not working
1. Verify column exists
2. Check indexes
3. Test query manually
4. Review RLS policies

## Communication

### User Notification (Optional)
```
🎉 Presence System Update

We've improved the online status indicators:
- More accurate online/offline status
- Real-time updates
- Better mobile support

You may need to refresh your browser to see the changes.
```

### Team Notification
```
✅ Presence System V2 Deployed

Changes:
- Realtime Presence for online status
- Low-frequency database writes
- Mobile fallback polling

Monitoring:
- Check Supabase logs
- Verify write frequency
- Monitor user feedback

Docs:
- docs/PRESENCE_SYSTEM_V2.md
- docs/TESTING_PRESENCE_V2.md
- PRESENCE_FIX_SUMMARY.md
```

## Sign-Off

- [ ] Database migrations completed
- [ ] Code deployed successfully
- [ ] Initial testing passed
- [ ] Monitoring in place
- [ ] Team notified
- [ ] Documentation updated
- [ ] Rollback plan ready

**Deployed By:** _________________  
**Date:** _________________  
**Time:** _________________  
**Status:** _________________  

---

**Next Review:** 24 hours after deployment  
**Full Review:** 1 week after deployment
