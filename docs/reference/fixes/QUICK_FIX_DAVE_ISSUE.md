# Quick Fix: Dave Ingram Profile Issue

## TL;DR
Dave is seeing Doug's network because a duplicate profile was created. Fix: link his original profile to his OAuth account.

## Immediate Steps

### 1. Run Diagnostics (2 minutes)
```sql
-- In Supabase SQL Editor, run:
SELECT 
  id,
  user_id,
  email,
  name,
  created_at,
  CASE 
    WHEN user_id IS NULL THEN 'MIGRATED'
    ELSE 'OAUTH'
  END as type
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
   OR LOWER(name) LIKE '%dave%ingram%'
ORDER BY created_at;
```

### 2. Identify Profiles
From the results above:
- **ORIGINAL**: Oldest profile, `user_id = NULL`, has connections
- **DUPLICATE**: Newest profile, `user_id = <some-uuid>`, no connections

### 3. Apply Fix (1 minute)
```sql
-- Replace these values with actual IDs from step 2:
-- ORIGINAL_PROFILE_ID = Dave's original profile ID
-- OAUTH_USER_ID = user_id from the duplicate profile

-- Link original profile to OAuth
UPDATE community 
SET 
  user_id = 'OAUTH_USER_ID',
  updated_at = NOW()
WHERE id = 'ORIGINAL_PROFILE_ID';

-- Hide duplicate
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = 'DUPLICATE_PROFILE_ID';
```

### 4. Verify Fix
```sql
-- Should return 1 row (Dave's original profile, now linked)
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden
FROM community 
WHERE user_id = 'OAUTH_USER_ID'
  AND (is_hidden IS NULL OR is_hidden = false);
```

### 5. Have Dave Test
1. Sign out completely
2. Clear browser cache (Cmd+Shift+Delete on Mac, Ctrl+Shift+Delete on Windows)
3. Sign in again with OAuth
4. Should now see his own network

## Code Fix Applied

Updated `assets/js/connections.js` to use the profile loaded by `auth.js` instead of querying independently. This ensures consistency.

## Why This Happened

1. Dave's migrated profile had `user_id = NULL`
2. When he signed in with OAuth, the system should have linked his profile
3. Instead, it created a new profile with his OAuth `user_id`
4. The synapse loaded the new (empty) profile instead of his original one
5. The new profile somehow showed Doug's network (data corruption or wrong ID)

## Prevention

This fix also prevents future occurrences by:
- Making `connections.js` use the profile from `auth.js`
- Ensuring consistent profile loading across all modules
- Better logging to catch profile linking failures

## If This Doesn't Work

Check these:
1. **Email mismatch**: Dave's OAuth email ≠ migrated profile email
2. **Multiple profiles**: Dave has more than 2 profiles
3. **Data corruption**: Profile data is corrupted
4. **Cache issue**: Browser cache not cleared

Run full diagnostics:
```bash
# See FIX_DAVE_PROFILE_ISSUE.sql for complete diagnostic queries
```

## Start Button Issue

Separate issue - the old "Start" button is showing instead of notification bell.

Quick fix:
```javascript
// In browser console:
document.querySelector('#start-button')?.style.setProperty('display', 'none', 'important');
document.querySelector('#notification-bell')?.style.setProperty('display', 'block', 'important');
```

Permanent fix: Check dashboard.html and ensure Start button is removed/hidden.

## Files Changed

- ✅ `assets/js/connections.js` - Now uses auth.js profile
- ✅ `FIX_DAVE_PROFILE_ISSUE.sql` - Database diagnostic queries
- ✅ `DAVE_PROFILE_ISSUE_ANALYSIS.md` - Full analysis
- ✅ `QUICK_FIX_DAVE_ISSUE.md` - This file

## Success Criteria

- [ ] Dave sees his own profile name
- [ ] Dave sees his own network (not Doug's)
- [ ] Dave can edit his profile
- [ ] Dave's connections are visible
- [ ] No duplicate profiles for Dave
- [ ] No console errors

## Timeline

- **Diagnostics**: 2 minutes
- **Database fix**: 1 minute
- **User testing**: 5 minutes
- **Total**: ~10 minutes

## Support

If issues persist:
1. Check browser console for `[PROFILE-LINK]` and `[CONNECTIONS]` logs
2. Run full diagnostics in `FIX_DAVE_PROFILE_ISSUE.sql`
3. Review `DAVE_PROFILE_ISSUE_ANALYSIS.md` for detailed analysis
