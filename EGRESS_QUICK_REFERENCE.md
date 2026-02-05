# Supabase Egress Optimization - Quick Reference

## 🎯 What Was Done

Three low-risk, high-impact fixes to reduce Supabase cached egress by 60-75%:

1. **Community Query Optimization** - Fetch only needed columns, reduce limits
2. **Synapse Reload Cooldown** - Max 1 reload per 5 minutes
3. **Presence Heartbeat Optimization** - 5-minute interval with idle detection

## 📊 Expected Impact

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Community query size | 2 MB | 600 KB | 70% |
| Synapse reloads/session | 20 | 4 | 80% |
| Presence updates/hour | 120 | 12 | 90% |
| **Monthly egress** | **8-12 GB** | **2-4 GB** | **60-75%** |

## 🔍 How to Verify

### 1. Check Console Logs

**Synapse cooldown working:**
```
⏱️ Synapse reload skipped (cooldown active, 4min remaining)
```

**Presence idle detection working:**
```
⏸️ User idle (145s), skipping presence update
```

### 2. Check Network Tab

1. Open DevTools → Network
2. Filter by "supabase"
3. Look for community queries:
   - **Should be ~600 KB** (was 2 MB)
   - Look for `select=id,name,image_url...` (not `select=*`)

### 3. Check Supabase Dashboard

1. Go to Supabase Dashboard
2. Project Settings → Usage
3. Monitor "Egress" metric
4. Should see 60-75% reduction within 24-48 hours

## 🚨 Troubleshooting

### Issue: Dashboard not loading

**Check:**
- Browser console for errors
- Network tab for failed requests
- Verify all files deployed correctly

**Fix:**
```bash
# Rollback if needed
git revert HEAD
git push origin main
```

### Issue: Synapse not updating

**Expected behavior:**
- Updates appear within 5 minutes (not instant)
- User-initiated actions (search, view switch) work immediately

**If broken:**
- Check console for errors
- Verify `forceRefreshSynapse()` function exists

### Issue: Presence not working

**Check:**
- Console shows heartbeat logs every 5 minutes
- Idle detection logs when inactive
- Session created on login

**If broken:**
- Verify activity listeners are attached
- Check `HEARTBEAT_INTERVAL` is set correctly

## 📝 Files Modified

- `assets/data.js` - Community queries
- `assets/js/synapse/data.js` - Synapse data loading
- `assets/js/synapse/realtime.js` - Realtime cooldown
- `assets/js/presence-session-manager.js` - Heartbeat optimization

## 🎬 Deployment

```bash
# Deploy all changes
./deploy-egress-optimization.sh

# Or manually
git add assets/data.js assets/js/synapse/data.js assets/js/synapse/realtime.js assets/js/presence-session-manager.js
git commit -m "feat: optimize Supabase egress (60-75% reduction)"
git push origin main
```

## 🔄 Rollback

```bash
# Revert all changes
git revert HEAD
git push origin main

# Verify rollback
git log --oneline -5
```

## 📖 Full Documentation

- **Analysis:** `SUPABASE_EGRESS_ANALYSIS.md`
- **Implementation:** `EGRESS_OPTIMIZATION_COMPLETE.md`
- **This guide:** `EGRESS_QUICK_REFERENCE.md`

## ✅ Success Checklist

- [ ] Changes deployed to production
- [ ] No console errors
- [ ] Dashboard loads correctly
- [ ] Synapse visualization works
- [ ] Presence tracking active
- [ ] Network tab shows smaller payloads
- [ ] Supabase egress trending down (check after 24h)

## 💡 Tips

- **Monitor for 48 hours** before declaring success
- **Check Supabase dashboard daily** for first week
- **Keep an eye on console logs** for any unexpected behavior
- **User experience should be identical** (or better)

## 🎯 Next Steps (If Needed)

If you need further optimization:

1. **Shared data cache** - Prevent duplicate queries (additional 20% reduction)
2. **Connection query optimization** - Remove unnecessary joins (additional 10% reduction)
3. **Query size monitoring** - Track and alert on large queries

---

**Questions?** Check the full documentation or rollback if issues arise.
