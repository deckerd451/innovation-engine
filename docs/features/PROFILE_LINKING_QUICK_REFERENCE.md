# Profile Linking - Quick Reference Card

## 🎯 What Was Fixed

**Problem:** OAuth sign-ins created duplicate profiles instead of linking to existing migrated profiles (62 profiles with `user_id = NULL`).

**Solution:** Updated auth flow to link by email before creating new profiles.

## 🔍 How It Works

```
User Signs In → Check user_id → Check email → Link or Create
```

### 3-Step Algorithm

1. **Find by user_id** (primary) → If found, use it
2. **Find by email** (migration) → If found, link it
3. **Create new** (new user) → If not found, create it

## 📊 Key Logs to Watch

| Log | Meaning | Action |
|-----|---------|--------|
| `found-by-uid` | Profile found by user_id | ✅ Normal |
| `linked-by-email` | Migrated profile linked | ✅ Success |
| `created-new` | New profile created | ✅ Normal |
| `duplicate-email-detected` | Multiple profiles found | ⚠️ Auto-resolved |
| `duplicate-email-collision` | Email conflict | ⚠️ Admin review |
| `rehomed-uid` | UID moved to canonical | ⚠️ Auto-resolved |
| `onboarding-forced` | User needs onboarding | ℹ️ Expected |

## 🧪 Quick Test

```javascript
// In browser console after sign-in:
testProfileLinking()
```

## 📁 Files Changed

- `auth.js` - Profile linking logic
- `dashboard.js` - Onboarding enforcement
- `PROFILE_LINKING_FIX.md` - Full documentation
- `test-profile-linking.js` - Test script
- `profile-linking-diagnostics.sql` - Database queries

## 🗄️ Database Queries

### Check orphaned profiles
```sql
SELECT COUNT(*) FROM community WHERE user_id IS NULL;
```

### Check duplicates
```sql
SELECT email, COUNT(*) 
FROM community 
GROUP BY email 
HAVING COUNT(*) > 1;
```

### Check hidden profiles
```sql
SELECT COUNT(*) FROM community WHERE is_hidden = true;
```

## 🚨 Common Issues

### Issue: User sees duplicate profile
**Solution:** Sign out and sign in again - system will consolidate

### Issue: Profile not loading
**Check:** Browser console for `[PROFILE-LINK]` errors

### Issue: Onboarding not showing
**Check:** `profile._needsOnboarding` flag in console

## 📞 Troubleshooting Steps

1. Open browser console (F12)
2. Look for `[PROFILE-LINK]` logs
3. Run `testProfileLinking()` for diagnostics
4. Check database with SQL queries
5. Review `PROFILE_LINKING_FIX.md` for details

## ✅ Success Indicators

- No new duplicate profiles created
- Orphaned profile count decreasing
- Users see "profile linked" notification
- No JavaScript errors in console
- Onboarding shown when needed

## 🔗 Related Docs

- **Full Details:** `PROFILE_LINKING_FIX.md`
- **Deployment:** `PROFILE_LINKING_DEPLOYMENT.md`
- **SQL Queries:** `profile-linking-diagnostics.sql`
- **Test Script:** `test-profile-linking.js`

## 💡 Quick Tips

- All operations are logged with `[PROFILE-LINK]` prefix
- Email matching is case-insensitive
- Duplicates are auto-resolved on sign-in
- Hidden profiles can be cleaned up after 30 days
- System prevents profile takeover (collision detection)

## 🎓 For Developers

### Key Functions

```javascript
// auth.js
fetchUserProfile(user)      // 3-step profile resolution
loadUserProfileOnce(user)   // Single-flight loader with onboarding check

// dashboard.js
profile-loaded event        // Checks _needsOnboarding flag
```

### Key Database Columns

```sql
user_id              -- Links to auth.users (UNIQUE)
email                -- Used for linking migrated profiles
is_hidden            -- Marks duplicate profiles
onboarding_completed -- Onboarding status
profile_completed    -- Profile completion status
```

## 📈 Monitoring

### Daily Check
```sql
-- Run in Supabase SQL Editor
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as linked,
  COUNT(CASE WHEN user_id IS NULL THEN 1 END) as orphaned,
  COUNT(CASE WHEN is_hidden = true THEN 1 END) as hidden
FROM community;
```

### Expected Progress
- Week 1: Orphaned profiles decrease as users sign in
- Week 2: Most active users linked
- Week 3: Duplicates consolidated
- Week 4: Ready for cleanup

## 🛡️ Safety Features

- ✅ UNIQUE constraint prevents multiple profiles per user
- ✅ Collision detection prevents unauthorized takeover
- ✅ Transaction-like operations for data integrity
- ✅ Comprehensive logging for audit trail
- ✅ Timeout protection (15s) on all queries

## 🎯 Next Steps

1. Deploy to production
2. Monitor logs for 24 hours
3. Check orphaned profile count daily
4. Implement onboarding UI (if needed)
5. Clean up hidden profiles after 30 days

---

**Last Updated:** February 4, 2026  
**Version:** 1.0  
**Status:** Ready for Production
