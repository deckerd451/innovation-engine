# Dave Ingram Profile Issue - Analysis & Fix

## Problem Summary

When Dave Ingram (a migrated user from the old system) logs in for the first time with OAuth:
1. ✅ A second account is created (duplicate profile)
2. ✅ He sees Doug Hamilton's network instead of his own
3. ✅ His profile shows as "Dave Ingram" but isn't editable
4. ✅ The old "Start" button is showing instead of the notification bell

## Root Cause Analysis

### Issue 1: Duplicate Profile Created

**Expected Behavior:**
- Dave's existing profile (with `user_id = NULL`) should be linked to his OAuth account
- The auth.js `fetchUserProfile()` function should find his profile by email and link it

**What Went Wrong:**
- The profile linking logic in `auth.js` is correct
- BUT there might be:
  - Email mismatch (OAuth email ≠ migrated profile email)
  - Multiple profiles with same email (duplicate data)
  - Profile linking failed silently

**Evidence:**
```javascript
// auth.js line 140-148
const { data: profile, error: pErr } = await supabase
  .from("community")
  .select("id")
  .eq("user_id", currentUserId)
  .single();
```
This query only finds profiles already linked to OAuth. It doesn't attempt email-based linking.

### Issue 2: Seeing Doug's Network

**Expected Behavior:**
- Synapse should center on Dave's profile
- `currentUserCommunityId` should be Dave's community profile ID

**What Went Wrong:**
- The `connections.js` `refreshCurrentUser()` function queries for profile by `user_id`
- It finds the NEW duplicate profile (which has the OAuth `user_id`)
- This new profile might have wrong data or be linked to Doug somehow

**Evidence:**
```javascript
// connections.js line 136-148
const { data: profile, error: pErr } = await supabase
  .from("community")
  .select("id")
  .eq("user_id", currentUserId)
  .single();

currentUserCommunityId = profile?.id || null;
```

The synapse then centers on this `currentUserCommunityId`, which is the wrong profile.

### Issue 3: Profile Not Editable

**Cause:**
- Dave is viewing Doug's profile (or a profile he doesn't own)
- The profile panel checks ownership before allowing edits

### Issue 4: Start Button Showing

**Cause:**
- Old UI element not properly hidden
- Notification bell system not initialized
- Likely a CSS/DOM issue, not related to profile linking

## The Fix

### Step 1: Database Cleanup (CRITICAL)

Run the diagnostic queries in `FIX_DAVE_PROFILE_ISSUE.sql` to:
1. Find Dave's original profile (oldest, has connections)
2. Find Dave's duplicate profile (newest, has OAuth `user_id`)
3. Link the original profile to the OAuth `user_id`
4. Hide the duplicate profile

```sql
-- Example fix (replace IDs with actual values):
-- 1. Link original profile
UPDATE community 
SET 
  user_id = 'dave-oauth-user-id',
  updated_at = NOW()
WHERE id = 'dave-original-profile-id'
  AND user_id IS NULL;

-- 2. Hide duplicate
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = 'dave-duplicate-profile-id';
```

### Step 2: Code Fix - Improve Profile Linking

The issue is that `connections.js` doesn't use the same profile linking logic as `auth.js`. We need to ensure consistency.

**Option A: Use auth.js profile (RECOMMENDED)**
```javascript
// In connections.js, use the profile already loaded by auth.js
export async function refreshCurrentUser() {
  try {
    // Use the profile already loaded by auth.js
    if (window.currentUserProfile?.id) {
      currentUserCommunityId = window.currentUserProfile.id;
      currentUserId = window.currentAuthUser?.id || null;
      return { currentUserId, currentUserCommunityId };
    }
    
    // Fallback to existing logic
    // ... existing code ...
  } catch (err) {
    console.warn("refreshCurrentUser error:", err);
    return null;
  }
}
```

**Option B: Replicate email-based linking in connections.js**
```javascript
// Add email-based fallback to connections.js
const { data: profile, error: pErr } = await supabase
  .from("community")
  .select("id, email")
  .eq("user_id", currentUserId)
  .single();

if (pErr && session?.user?.email) {
  // Try email-based lookup
  const { data: emailProfile } = await supabase
    .from("community")
    .select("id")
    .ilike("email", session.user.email)
    .is("user_id", null)
    .single();
    
  if (emailProfile) {
    // Link it
    await supabase
      .from("community")
      .update({ user_id: currentUserId })
      .eq("id", emailProfile.id);
      
    currentUserCommunityId = emailProfile.id;
  }
}
```

### Step 3: Fix Start Button Issue

Check the dashboard HTML and ensure:
1. Start button is hidden: `display: none` or removed
2. Notification bell is visible
3. Unified notification system is initialized

### Step 4: User Instructions

After database fix:
1. Dave should **sign out completely**
2. **Clear browser cache and localStorage**
3. **Sign in again with OAuth**
4. System should now load his original profile
5. He should see his own network

## Prevention

To prevent this from happening to other migrated users:

### 1. Pre-Migration Data Cleanup
```sql
-- Ensure all migrated profiles have valid emails
SELECT id, name, email 
FROM community 
WHERE user_id IS NULL 
  AND (email IS NULL OR email = '');

-- Fix missing emails before OAuth migration
```

### 2. Improve Error Logging
```javascript
// In auth.js fetchUserProfile()
if (!profile) {
  console.error('❌ [PROFILE-LINK] No profile found for:', {
    uid: user.id,
    email: user.email,
    emailNorm: emailNorm
  });
  
  // Alert admin
  if (typeof window.reportProfileLinkingFailure === 'function') {
    window.reportProfileLinkingFailure(user);
  }
}
```

### 3. Add Profile Linking Verification
```javascript
// After profile linking, verify it worked
if (profile && profile.user_id !== uid) {
  console.error('❌ [PROFILE-LINK] Verification failed:', {
    expected_uid: uid,
    actual_uid: profile.user_id
  });
}
```

### 4. Consistent Profile Loading
Ensure all modules use the same profile source:
- `auth.js` loads profile → stores in `window.currentUserProfile`
- All other modules read from `window.currentUserProfile`
- No module should independently query for profile

## Testing Checklist

After applying the fix:

- [ ] Dave can sign in with OAuth
- [ ] Dave sees his own profile (not Doug's)
- [ ] Dave's profile is editable
- [ ] Dave sees his own network in synapse
- [ ] Dave's connections are visible
- [ ] No duplicate profiles exist for Dave
- [ ] Start button is hidden
- [ ] Notification bell is visible
- [ ] No console errors related to profile loading

## Monitoring

Watch for these log messages:
- ✅ `[PROFILE-LINK] found-by-uid` - Profile found correctly
- ⚠️ `[PROFILE-LINK] created-new` - New profile created (might be duplicate)
- ⚠️ `[PROFILE-LINK] duplicate-email-detected` - Multiple profiles found
- ❌ `[PROFILE-LINK] No profile found` - Profile linking failed

## Rollback Plan

If the fix causes issues:
1. Restore from backup: `community_backup_YYYYMMDD`
2. Revert code changes
3. Investigate specific failure
4. Re-apply fix with corrections

## Related Files

- `auth.js` - Profile linking logic
- `connections.js` - Current user profile loading
- `assets/js/synapse/core.js` - Synapse initialization
- `FIX_DAVE_PROFILE_ISSUE.sql` - Database diagnostic queries
- `profile-linking-diagnostics.sql` - General diagnostics
- `PROFILE_LINKING_FIX.md` - Original profile linking documentation

## Next Steps

1. **IMMEDIATE**: Run diagnostic queries to understand Dave's specific situation
2. **DATABASE FIX**: Link Dave's original profile to his OAuth account
3. **CODE FIX**: Ensure connections.js uses auth.js profile
4. **TEST**: Have Dave sign out, clear cache, sign in again
5. **VERIFY**: Check that he sees his own network
6. **MONITOR**: Watch for similar issues with other migrated users

## Contact

If issues persist after applying this fix:
- Check browser console for `[PROFILE-LINK]` logs
- Run diagnostic queries in Supabase
- Review this document for missed steps
- Check for email mismatches between OAuth and migrated profile
