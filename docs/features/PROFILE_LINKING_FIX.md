# Profile Linking Fix - OAuth Migration Support

## Problem Summary

**Root Cause:** 62 migrated profiles exist with `email` set but `user_id = NULL`. When users sign in via OAuth (GitHub/Google), the system was creating NEW community rows with `user_id = auth.uid()`, resulting in:
- Duplicate email entries in the database
- Users skipping profile onboarding (appearing as "completed")
- Loss of migrated profile data

## Solution Implemented

Updated the authentication flow to **LINK** OAuth sign-ins to existing migrated profiles by email instead of creating duplicates.

## Algorithm Details

### On SIGNED_IN Event

**Inputs:**
- `uid` = user.id (from Supabase auth)
- `emailNorm` = lower(trim(user.email))

### Step 1: Primary Lookup (by user_id)
```sql
SELECT * FROM community WHERE user_id = uid LIMIT 1
```
- If found → use this profile
- If not found → proceed to Step 2

### Step 2: Link by Email (handle migrated profiles)

Query all profiles with matching email:
```sql
SELECT * FROM community 
WHERE lower(email) = emailNorm 
ORDER BY created_at NULLS LAST
```

#### Case A: Exactly One Profile

**Sub-case A1: Migrated profile (user_id = NULL)**
```sql
UPDATE community 
SET user_id = uid, updated_at = now() 
WHERE id = row.id
```
- Links the migrated profile to OAuth user
- Shows success notification: "Your existing profile has been linked"
- Logs: `linked-by-email`

**Sub-case A2: Collision (user_id != NULL and != uid)**
- Do NOT create another profile
- Log admin warning: `duplicate-email-collision`
- Return existing profile to prevent further duplicates

**Sub-case A3: Already linked (user_id = uid)**
- Return profile (shouldn't happen, but handled gracefully)

#### Case B: Multiple Profiles (Duplicates)

**Choose Canonical Profile:**
1. Priority 1: `profile_completed = true` OR `onboarding_completed = true`
2. Priority 2: Oldest `created_at`

**Rehome UID (if needed):**
If any non-canonical profile has `user_id = uid`:
```sql
-- Clear old link
UPDATE community 
SET user_id = NULL, is_hidden = true 
WHERE id = old_profile_id;

-- Link canonical
UPDATE community 
SET user_id = uid 
WHERE id = canonical_id;
```
- Logs: `rehomed-uid`

**Hide Duplicates:**
```sql
UPDATE community 
SET is_hidden = true 
WHERE id IN (non_canonical_ids);
```

### Step 3: Create New Profile (if no match)

If no email match exists:
```sql
INSERT INTO community (
  user_id, 
  email, 
  created_at, 
  updated_at,
  onboarding_completed,
  profile_completed,
  is_hidden
) VALUES (
  uid,
  user.email,
  now(),
  now(),
  false,
  false,
  false
);
```
- Logs: `created-new`

## Onboarding Enforcement

After profile resolution, the system checks if onboarding is required:

```javascript
const needsOnboarding = 
  !profile.onboarding_completed || 
  !profile.profile_completed ||
  !profile.display_name ||
  !profile.username;
```

If true:
- Sets `profile._needsOnboarding = true`
- Logs: `onboarding-forced` with details
- Dashboard detects flag and can show onboarding UI

## Logging

All profile linking operations include detailed logs with `[PROFILE-LINK]` prefix:

- ✅ `found-by-uid` - Profile found by user_id (primary lookup)
- 🔗 `linked-by-email` - Migrated profile linked to OAuth user
- ⚠️ `duplicate-email-collision` - Email already linked to different user
- 🔄 `rehomed-uid` - UID moved from non-canonical to canonical profile
- 🆕 `created-new` - New profile created (no existing match)
- ⚠️ `onboarding-forced` - User redirected to onboarding

## Files Modified

### 1. `auth.js`
- **Function:** `fetchUserProfile(user)` - Complete rewrite with 3-step algorithm
- **Function:** `loadUserProfileOnce(user)` - Added profile creation and onboarding enforcement
- **Logging:** Added comprehensive `[PROFILE-LINK]` logs throughout

### 2. `dashboard.js`
- **Event Handler:** `profile-loaded` - Added onboarding enforcement check
- **Behavior:** Detects `profile._needsOnboarding` flag and logs requirement
- **Note:** UI team can implement actual onboarding modal/redirect

## Testing Checklist

### Test Case 1: Migrated Profile (user_id = NULL)
- [ ] User signs in with OAuth (email matches migrated profile)
- [ ] System links profile instead of creating new one
- [ ] User sees "Your existing profile has been linked" notification
- [ ] Console shows `linked-by-email` log
- [ ] Database: `user_id` updated, `updated_at` set

### Test Case 2: New User (no existing profile)
- [ ] User signs in with OAuth (email not in database)
- [ ] System creates new profile with `user_id = uid`
- [ ] Console shows `created-new` log
- [ ] User is flagged for onboarding
- [ ] Database: New row with all required fields

### Test Case 3: Duplicate Emails (multiple profiles)
- [ ] User signs in with OAuth (multiple profiles with same email)
- [ ] System selects canonical profile (completed or oldest)
- [ ] Non-canonical profiles marked `is_hidden = true`
- [ ] Console shows duplicate resolution logs
- [ ] User sees "We've consolidated your duplicate profiles" notification

### Test Case 4: Email Collision
- [ ] User A signs in with OAuth (email already linked to User B)
- [ ] System does NOT create duplicate profile
- [ ] Console shows `duplicate-email-collision` warning
- [ ] Admin can investigate collision

### Test Case 5: Onboarding Enforcement
- [ ] User with incomplete profile signs in
- [ ] System sets `_needsOnboarding` flag
- [ ] Dashboard detects flag and logs requirement
- [ ] Console shows `onboarding-forced` with details

## Database Schema Requirements

The fix assumes the following schema:

```sql
-- community table
CREATE TABLE community (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE,  -- Links to auth.users
  email TEXT,
  display_name TEXT,
  username TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  profile_completed BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_community_email ON community(lower(email));
CREATE INDEX idx_community_user_id ON community(user_id);
```

## Migration Notes

### For Existing Migrated Profiles (62 rows)

These profiles will be automatically linked when users sign in via OAuth:
1. User signs in with GitHub/Google
2. System finds profile by email
3. System updates `user_id` to link profile
4. User retains all existing profile data

### For Duplicate Profiles

If duplicates exist (like Aya's case):
1. System identifies all profiles with same email
2. Selects canonical (completed or oldest)
3. Links canonical to OAuth user
4. Hides non-canonical profiles
5. User sees consolidated profile

## Next Steps

1. **Deploy to Production:** Test with a few migrated users first
2. **Monitor Logs:** Watch for `[PROFILE-LINK]` logs in console
3. **Implement Onboarding UI:** Add modal/redirect when `_needsOnboarding` is true
4. **Admin Dashboard:** Add tool to view/resolve email collisions
5. **Database Cleanup:** After successful deployment, review `is_hidden` profiles

## Security Considerations

- ✅ Email matching is case-insensitive and trimmed
- ✅ UNIQUE constraint on `user_id` prevents multiple profiles per auth user
- ✅ Collision detection prevents unauthorized profile takeover
- ✅ Transaction-like operations for rehoming UIDs
- ✅ All operations logged for audit trail

## Performance Notes

- Email lookup uses case-insensitive search (may need index optimization)
- Multiple database queries for duplicate resolution (acceptable for rare case)
- Single-flight profile loading prevents race conditions
- Timeout protection (15s) for all database queries
