# Fix Dave's Issue - Execute Now

## Step-by-Step Instructions

### Step 1: Open Supabase SQL Editor (30 seconds)
1. Go to your Supabase project
2. Click "SQL Editor" in left sidebar
3. Click "New query"

### Step 2: Find Dave's Profiles (1 minute)

Paste and run this query:

```sql
SELECT 
  id,
  user_id,
  email,
  name,
  created_at,
  CASE WHEN user_id IS NULL THEN '🔴 MIGRATED (not linked)' ELSE '🟢 OAUTH LINKED' END as status
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
   OR LOWER(name) LIKE '%dave%ingram%'
ORDER BY created_at;
```

**Expected Result**: You should see 2 rows:
- Row 1: Older date, `user_id = NULL`, status = "🔴 MIGRATED"
- Row 2: Newer date, `user_id = <some-uuid>`, status = "🟢 OAUTH LINKED"

**Copy these values:**
- `ORIGINAL_PROFILE_ID` = ID from Row 1 (the older one)
- `DUPLICATE_PROFILE_ID` = ID from Row 2 (the newer one)
- `OAUTH_USER_ID` = user_id from Row 2

### Step 3: Verify Which Profile Has Connections (1 minute)

```sql
-- Replace ORIGINAL_PROFILE_ID with actual ID from Step 2
SELECT 
  COUNT(*) as connection_count,
  'Connections for ORIGINAL profile' as description
FROM connections 
WHERE from_user_id = 'ORIGINAL_PROFILE_ID'
   OR to_user_id = 'ORIGINAL_PROFILE_ID';

-- Replace DUPLICATE_PROFILE_ID with actual ID from Step 2
SELECT 
  COUNT(*) as connection_count,
  'Connections for DUPLICATE profile' as description
FROM connections 
WHERE from_user_id = 'DUPLICATE_PROFILE_ID'
   OR to_user_id = 'DUPLICATE_PROFILE_ID';
```

**Expected Result**: Original profile should have connections, duplicate should have 0.

### Step 4: Apply the Fix (1 minute)

**IMPORTANT**: Replace the placeholder IDs with actual values from Step 2!

```sql
-- Link Dave's original profile to his OAuth account
UPDATE community 
SET 
  user_id = 'OAUTH_USER_ID',  -- Replace with actual value
  updated_at = NOW()
WHERE id = 'ORIGINAL_PROFILE_ID'  -- Replace with actual value
  AND user_id IS NULL;

-- Hide the duplicate profile
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = 'DUPLICATE_PROFILE_ID';  -- Replace with actual value
```

### Step 5: Verify the Fix (30 seconds)

```sql
-- Should return 1 row (Dave's original profile, now linked)
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  'This should be Dave\'s ORIGINAL profile' as note
FROM community 
WHERE user_id = 'OAUTH_USER_ID'  -- Replace with actual value
  AND (is_hidden IS NULL OR is_hidden = false);

-- Should return 1 row (the duplicate, now hidden)
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  'This should be the DUPLICATE profile' as note
FROM community 
WHERE id = 'DUPLICATE_PROFILE_ID'  -- Replace with actual value
  AND is_hidden = true;
```

**Expected Result**: Both queries should return 1 row each.

### Step 6: Have Dave Test (5 minutes)

Send Dave these instructions:

```
Hi Dave,

We've fixed the profile issue. Please follow these steps:

1. Sign out of the dashboard completely
2. Clear your browser cache:
   - Mac: Cmd + Shift + Delete
   - Windows: Ctrl + Shift + Delete
   - Select "All time" and check "Cached images and files"
3. Close and reopen your browser
4. Sign in again with OAuth (GitHub or Google)
5. You should now see your own network!

Let me know if you still have issues.
```

### Step 7: Verify Success (2 minutes)

After Dave signs in, check:

```sql
-- Verify Dave is using the correct profile
SELECT 
  id,
  user_id,
  email,
  name,
  created_at,
  'Dave should be using this profile' as note
FROM community 
WHERE user_id = 'OAUTH_USER_ID'  -- Replace with actual value
  AND (is_hidden IS NULL OR is_hidden = false);
```

## Troubleshooting

### If Dave Still Sees Doug's Network

1. **Check browser console** (F12):
   - Look for `[PROFILE-LINK]` logs
   - Look for `[CONNECTIONS]` logs
   - Should see: "Using profile from auth.js"

2. **Verify profile ID**:
   ```javascript
   // In browser console:
   console.log('Current profile:', window.currentUserProfile);
   console.log('Current user:', window.currentAuthUser);
   ```

3. **Check localStorage**:
   - Open DevTools → Application → Local Storage
   - Look for Supabase auth keys
   - Clear all and sign in again

### If No Profiles Found in Step 2

Dave might be using a different email. Try:

```sql
-- Search by partial name
SELECT * FROM community 
WHERE LOWER(name) LIKE '%dave%'
ORDER BY created_at DESC
LIMIT 10;

-- Search by partial email
SELECT * FROM community 
WHERE LOWER(email) LIKE '%ingram%'
ORDER BY created_at DESC
LIMIT 10;
```

### If Multiple Profiles Found

Run the full diagnostic:

```sql
-- See all Dave's profiles
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  created_at,
  updated_at
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
ORDER BY created_at;
```

Choose the oldest profile with connections as the canonical one.

## Code Fix Status

✅ **COMPLETED**: Updated `assets/js/connections.js` to use profile from `auth.js`

This fix ensures all modules use the same profile, preventing future occurrences.

## Rollback Plan

If something goes wrong:

```sql
-- Unlink the profile
UPDATE community 
SET 
  user_id = NULL,
  updated_at = NOW()
WHERE id = 'ORIGINAL_PROFILE_ID';

-- Unhide the duplicate
UPDATE community 
SET 
  is_hidden = false,
  updated_at = NOW()
WHERE id = 'DUPLICATE_PROFILE_ID';
```

## Success Checklist

- [ ] Step 1: Supabase SQL Editor open
- [ ] Step 2: Found Dave's 2 profiles
- [ ] Step 3: Verified original has connections
- [ ] Step 4: Applied database fix
- [ ] Step 5: Verified fix in database
- [ ] Step 6: Dave tested and confirmed
- [ ] Step 7: Verified Dave using correct profile

## Time Estimate

- **Database work**: 3-4 minutes
- **User testing**: 5 minutes
- **Total**: ~10 minutes

## Questions?

- Check `DAVE_ISSUE_SUMMARY.md` for full analysis
- Check `DAVE_PROFILE_ISSUE_ANALYSIS.md` for detailed troubleshooting
- Check `FIX_DAVE_PROFILE_ISSUE.sql` for more diagnostic queries

---

**Ready to execute!** Start with Step 1 above.
