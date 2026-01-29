# OAuth Profile Linking Strategy

## Overview
This guide explains how migrated users from the old non-OAuth system can seamlessly access their existing profiles when logging in with OAuth (GitHub/Google).

## Strategy: Email-Based Automatic Linking

### How It Works

1. **User logs in with OAuth** (GitHub or Google)
2. **System checks for existing profile**:
   - First, looks for profile with matching `user_id` (OAuth user ID)
   - If not found, looks for profile with matching `email` and `user_id = NULL`
3. **If existing profile found**:
   - Automatically links the OAuth account to the existing profile
   - Updates `user_id` field with OAuth user ID
   - User sees their existing profile with all data intact
4. **If no existing profile found**:
   - System treats as new user
   - Profile creation flow triggers

## Implementation

### 1. Database Migration (Optional but Recommended)

Run the SQL migration to:
- Ensure email column exists and is indexed
- Backfill existing OAuth users to their profiles
- Create helper function for future linking

```bash
# Run this in your Supabase SQL editor
cat migrations/LINK_OAUTH_TO_EXISTING_PROFILES.sql
```

### 2. Application-Level Linking (Already Implemented)

The `auth.js` file now includes automatic profile linking logic in the `fetchUserProfile()` function:

```javascript
// Pseudocode flow:
1. Try to find profile by user_id (OAuth ID)
2. If not found, try to find by email where user_id is NULL
3. If found, update that profile with the OAuth user_id
4. Return the linked profile
```

## Prerequisites for Migrated Users

### Required Data in Community Table

For automatic linking to work, migrated user profiles MUST have:

1. **Email address** populated in the `email` column
2. **user_id** set to `NULL` (indicating not yet linked to OAuth)

### Migration Checklist

- [ ] Ensure all migrated profiles have `email` populated
- [ ] Ensure all migrated profiles have `user_id = NULL`
- [ ] Run the SQL migration (optional but recommended)
- [ ] Deploy updated `auth.js` with linking logic
- [ ] Test with a few migrated users

## Testing the Linking

### Test Scenario 1: Migrated User First Login

1. **Setup**: User "john@example.com" exists in `community` table with `user_id = NULL`
2. **Action**: John logs in with GitHub (email: john@example.com)
3. **Expected Result**:
   - System finds existing profile by email
   - Links OAuth user to existing profile
   - John sees his existing profile data
   - Notification: "Welcome back! Your existing profile has been linked..."

### Test Scenario 2: New User First Login

1. **Setup**: User "jane@example.com" does NOT exist in `community` table
2. **Action**: Jane logs in with Google (email: jane@example.com)
3. **Expected Result**:
   - System finds no existing profile
   - Triggers new profile creation flow
   - Jane creates a new profile

### Test Scenario 3: Already Linked User

1. **Setup**: User "bob@example.com" exists with `user_id = 'abc123'`
2. **Action**: Bob logs in with GitHub (user_id: 'abc123')
3. **Expected Result**:
   - System finds profile by user_id immediately
   - No linking needed
   - Bob sees his profile normally

## Edge Cases Handled

### 1. Email Mismatch
**Problem**: User's OAuth email differs from their migrated profile email

**Solution**: 
- User will be treated as new user
- Manual admin intervention needed to merge profiles
- Consider adding a "Link Existing Profile" feature in settings

### 2. Multiple Profiles with Same Email
**Problem**: Multiple profiles exist with the same email (data quality issue)

**Solution**:
- System links to the FIRST profile found (LIMIT 1)
- Recommend data cleanup before migration:
  ```sql
  -- Find duplicate emails
  SELECT email, COUNT(*) 
  FROM community 
  WHERE user_id IS NULL 
  GROUP BY email 
  HAVING COUNT(*) > 1;
  ```

### 3. Profile Already Linked to Different OAuth Account
**Problem**: Profile has `user_id` set to a different OAuth user

**Solution**:
- System will NOT overwrite existing link
- User will be treated as new user
- This prevents account hijacking

## Data Preparation Script

Before enabling OAuth, run this to prepare your migrated data:

```sql
-- 1. Check how many profiles need linking
SELECT 
  COUNT(*) as profiles_ready_for_linking,
  COUNT(DISTINCT email) as unique_emails
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL;

-- 2. Find profiles missing email (need manual fix)
SELECT id, name, created_at
FROM community
WHERE user_id IS NULL
  AND (email IS NULL OR email = '');

-- 3. Update profiles with missing emails (if you have the data)
-- UPDATE community 
-- SET email = 'user@example.com'
-- WHERE id = 'profile-id';

-- 4. Find duplicate emails (potential issues)
SELECT email, COUNT(*), array_agg(id) as profile_ids
FROM community
WHERE user_id IS NULL
GROUP BY email
HAVING COUNT(*) > 1;
```

## Monitoring and Verification

### Check Linking Success Rate

```sql
-- Profiles successfully linked
SELECT COUNT(*) as linked_profiles
FROM community
WHERE user_id IS NOT NULL;

-- Profiles still waiting to be linked
SELECT COUNT(*) as unlinked_profiles
FROM community
WHERE user_id IS NULL;

-- Recent linkings (last 7 days)
SELECT 
  name,
  email,
  user_id,
  updated_at
FROM community
WHERE user_id IS NOT NULL
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
```

### Application Logs

Watch for these log messages in browser console:

- ✅ `"Found existing profile by email, linking to OAuth user"`
- 🎉 `"Successfully linked existing profile to OAuth user"`
- ⚠️ `"Failed to link existing profile"` (investigate if seen)

## Rollback Plan

If linking causes issues:

1. **Disable automatic linking** (comment out linking logic in auth.js)
2. **Unlink profiles** (if needed):
   ```sql
   UPDATE community
   SET user_id = NULL
   WHERE user_id = 'problematic-oauth-id';
   ```
3. **Investigate** the specific issue
4. **Fix and re-enable**

## User Communication

### Email Template for Migrated Users

```
Subject: Your CharlestonHacks Account - Action Required

Hi [Name],

We've upgraded our platform with secure OAuth login! 

To access your existing profile:
1. Visit dashboard.charlestonhacks.com
2. Click "Continue with GitHub" or "Continue with Google"
3. Use the SAME email address: [user-email]

Your profile data will be automatically linked and preserved.

Questions? Reply to this email.

- CharlestonHacks Team
```

## Troubleshooting

### User Can't Find Their Profile

1. **Check email match**:
   ```sql
   SELECT * FROM community WHERE email = 'user@example.com';
   ```

2. **Check if already linked**:
   ```sql
   SELECT * FROM community WHERE user_id = 'oauth-user-id';
   ```

3. **Manual linking** (if needed):
   ```sql
   UPDATE community
   SET user_id = 'oauth-user-id'
   WHERE email = 'user@example.com'
     AND user_id IS NULL;
   ```

### User Has Multiple Profiles

1. **Identify duplicates**:
   ```sql
   SELECT * FROM community 
   WHERE email = 'user@example.com'
   ORDER BY created_at;
   ```

2. **Merge data** (manual process - keep oldest/most complete)
3. **Delete duplicate**:
   ```sql
   DELETE FROM community WHERE id = 'duplicate-id';
   ```

## Security Considerations

✅ **Safe**: Only links profiles with `user_id = NULL` (unlinked)
✅ **Safe**: Matches on email (OAuth providers verify email)
✅ **Safe**: Won't overwrite existing OAuth links
⚠️ **Risk**: Email spoofing (mitigated by OAuth provider verification)
⚠️ **Risk**: User changes email in OAuth provider (profile won't link)

## Next Steps

1. ✅ Review this guide
2. ✅ Prepare your data (ensure emails are populated)
3. ✅ Run the SQL migration
4. ✅ Deploy updated auth.js
5. ✅ Test with a few users
6. ✅ Monitor logs and linking success
7. ✅ Communicate with users
8. ✅ Provide support for edge cases

## Support

For issues or questions:
- Check browser console logs
- Check Supabase logs
- Review this guide
- Contact: [your-support-email]
