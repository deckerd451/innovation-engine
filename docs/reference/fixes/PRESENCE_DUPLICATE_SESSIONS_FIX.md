# Presence Duplicate Sessions - Fix Applied

## 🐛 Issue Identified

**Error Message:**
```
Error fetching user presence: {
  code: 'PGRST116', 
  details: 'Results contain 2 rows, application/vnd.pgrst.object+json requires 1 row', 
  hint: null, 
  message: 'JSON object requested, multiple (or no) rows returned'
}
```

**Root Cause:** Multiple active presence sessions exist for the same user, causing the `.maybeSingle()` query to fail.

---

## ✅ Fixes Applied

### 1. Updated Query Logic (`assets/js/presence-ui.js`)

**Before:**
```javascript
const { data: session, error } = await supabase
  .from('presence_sessions')
  .select('user_id, is_active, last_seen')
  .eq('user_id', userId)
  .eq('is_active', true)
  .maybeSingle(); // ❌ Fails with multiple rows
```

**After:**
```javascript
const { data: sessions, error } = await supabase
  .from('presence_sessions')
  .select('user_id, is_active, last_seen')
  .eq('user_id', userId)
  .eq('is_active', true)
  .order('last_seen', { ascending: false })
  .limit(1); // ✅ Always returns most recent session

const session = sessions && sessions.length > 0 ? sessions[0] : null;
```

**Result:** Query now handles duplicate sessions gracefully by selecting the most recent one.

---

### 2. Prevent Future Duplicates (`assets/js/presence-session-manager.js`)

**Added cleanup before creating new session:**
```javascript
async function createPresenceSession() {
  try {
    // Delete any existing active sessions for this user
    const { error: deleteError } = await supabase
      .from('presence_sessions')
      .delete()
      .eq('user_id', communityProfileId)
      .eq('is_active', true);
    
    if (deleteError) {
      console.warn('⚠️ Could not delete existing sessions:', deleteError);
    } else {
      console.log('🧹 Cleaned up any existing sessions');
    }
    
    // Then create new session...
  }
}
```

**Result:** Each user will only have one active session at a time.

---

### 3. Database Cleanup Script (`cleanup-duplicate-presence-sessions.sql`)

Created SQL script to clean up existing duplicates in the database.

---

## 🔧 How to Apply the Fix

### Step 1: Deploy Code Changes

The code changes have been committed and pushed to GitHub. They will take effect on next page load.

**To verify deployment:**
1. Hard refresh the dashboard (Ctrl+Shift+R or Cmd+Shift+R)
2. Open browser console
3. Look for: `🧹 Cleaned up any existing sessions`

---

### Step 2: Clean Up Existing Duplicates

Run this SQL in Supabase to remove duplicate sessions:

```sql
-- View duplicates first (optional)
SELECT 
  user_id,
  COUNT(*) as session_count,
  ARRAY_AGG(id ORDER BY last_seen DESC) as session_ids
FROM presence_sessions
WHERE is_active = true
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Delete duplicates (keeps most recent for each user)
WITH sessions_to_keep AS (
  SELECT DISTINCT ON (user_id) 
    id
  FROM presence_sessions
  WHERE is_active = true
  ORDER BY user_id, last_seen DESC
)
DELETE FROM presence_sessions
WHERE is_active = true
  AND id NOT IN (SELECT id FROM sessions_to_keep);

-- Verify cleanup
SELECT 
  user_id,
  COUNT(*) as session_count
FROM presence_sessions
WHERE is_active = true
GROUP BY user_id
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

---

## 🧪 Testing the Fix

### Test 1: No More Errors

1. Open the dashboard
2. Click on any person's profile
3. Check browser console
4. **Expected:** No "multiple rows returned" errors

### Test 2: Only One Session Per User

Run this SQL query:
```sql
SELECT 
  c.name,
  COUNT(ps.id) as session_count
FROM community c
LEFT JOIN presence_sessions ps ON c.id = ps.user_id AND ps.is_active = true
GROUP BY c.id, c.name
HAVING COUNT(ps.id) > 1;
```

**Expected Result:** 0 rows (no users with multiple sessions)

### Test 3: Presence Indicators Work

1. Open the dashboard
2. Click on your profile button (top-left)
3. **Expected:** Green dot, "available" status, "Active now"
4. Click on another user's profile
5. **Expected:** Green or gray dot (no errors)

---

## 📊 Why Duplicates Occurred

### Possible Causes

1. **Multiple tabs/windows:** User opened dashboard in multiple tabs
2. **Page refresh during session creation:** Session creation interrupted
3. **Network issues:** Insert succeeded but confirmation failed
4. **Race condition:** Multiple initializations before guard check

### Prevention Strategy

The fix prevents duplicates by:
1. **Deleting existing sessions** before creating new one
2. **Using order+limit** instead of maybeSingle in queries
3. **Graceful handling** of multiple sessions if they occur

---

## 🔍 Monitoring

### Check for Duplicates

Run this query periodically:
```sql
SELECT 
  user_id,
  COUNT(*) as session_count,
  MAX(last_seen) as most_recent
FROM presence_sessions
WHERE is_active = true
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY session_count DESC;
```

**Expected:** 0 rows

### Active Sessions Summary

```sql
SELECT 
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_sessions,
  COUNT(*) - COUNT(DISTINCT user_id) as duplicate_sessions
FROM presence_sessions
WHERE is_active = true;
```

**Expected:** `duplicate_sessions = 0`

---

## ✅ Success Criteria

The fix is working correctly if:

- ✅ No "multiple rows returned" errors in console
- ✅ Presence indicators display without errors
- ✅ Each user has at most 1 active session
- ✅ New sessions automatically clean up old ones
- ✅ Profile panels open without errors

---

## 🚀 Deployment Status

| Component | Status | Notes |
|-----------|--------|-------|
| Code Fix (presence-ui.js) | ✅ Deployed | Uses order+limit instead of maybeSingle |
| Code Fix (presence-session-manager.js) | ✅ Deployed | Cleans up existing sessions before creating new |
| SQL Cleanup Script | 📝 Ready | Run manually in Supabase |
| Documentation | ✅ Complete | This file |

---

## 📝 Next Steps

1. **Immediate:** Hard refresh dashboard to load new code
2. **Database:** Run cleanup SQL script to remove existing duplicates
3. **Monitor:** Check for duplicates over next 24 hours
4. **Verify:** Confirm no more errors in browser console

---

## 🔮 Future Improvements (Optional)

### Database Constraint

Add a unique constraint to prevent duplicates at database level:

```sql
-- Create unique index on user_id where is_active = true
CREATE UNIQUE INDEX presence_sessions_active_user_unique 
ON presence_sessions (user_id) 
WHERE is_active = true;
```

**Pros:**
- Prevents duplicates at database level
- Enforces one active session per user

**Cons:**
- Insert will fail if duplicate exists (need to handle error)
- Requires updating insert logic to use upsert

**Recommendation:** Current fix is sufficient. Add constraint only if duplicates continue to occur.

---

## 📞 Support

If duplicates continue to occur after applying this fix:

1. Check browser console for new error messages
2. Run monitoring queries to identify affected users
3. Verify code changes are deployed (check for `🧹 Cleaned up any existing sessions` message)
4. Check for race conditions in initialization code

---

## ✅ Summary

**Problem:** Multiple active presence sessions per user causing query errors  
**Solution:** Clean up existing sessions before creating new ones + use order+limit in queries  
**Status:** Fixed and deployed  
**Action Required:** Run SQL cleanup script to remove existing duplicates  

The presence UI system will now work correctly without errors! 🎉
