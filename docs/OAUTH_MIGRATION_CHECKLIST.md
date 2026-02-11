# OAuth Migration Checklist

## TL;DR - What You Need to Do

### Required Database Changes: **MINIMAL** ✅

The good news: Your `community` table **already has the `email` column**, so you only need to:

1. **Add an index** (for performance)
2. **Verify your data** (make sure emails are populated)

That's it! The application code (already deployed) handles everything else automatically.

---

## Step-by-Step Checklist

### ☑️ Step 1: Run Minimal Database Migration (5 minutes)

**What it does:**
- Adds index on `email` column (for fast lookups)
- Normalizes existing emails (lowercase, trim spaces)
- Verifies setup

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy/paste contents of: `migrations/MINIMAL_OAUTH_LINKING_SETUP.sql`
3. Click "Run"
4. Check the verification queries at the bottom

**Expected result:**
```
✅ Email column exists
✅ Indexes created
✅ Shows count of profiles ready for linking
```

---

### ☑️ Step 2: Check Data Readiness (5 minutes)

**What it does:**
- Shows how many profiles are ready to link
- Identifies profiles missing emails
- Finds duplicate emails

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy/paste contents of: `migrations/CHECK_MIGRATION_READINESS.sql`
3. Click "Run"
4. Review the results

**What to look for:**
- ✅ **Readiness Score**: Should be close to 100%
- ⚠️ **Missing Emails**: Profiles that need manual email addition
- ⚠️ **Duplicate Emails**: Profiles that might need merging

---

### ☑️ Step 3: Fix Any Issues Found (10-30 minutes, if needed)

**Only if Step 2 found issues:**

Use the scripts in `migrations/FIX_COMMON_MIGRATION_ISSUES.sql` to:
- Add missing emails
- Merge duplicate profiles
- Clean up email formats

**Most common fixes:**
```sql
-- Fix 1: Add missing email for a specific user
UPDATE community 
SET email = 'user@example.com'
WHERE id = 'user-profile-id';

-- Fix 2: Normalize all emails
UPDATE community
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL;

-- Fix 3: Remove duplicate profiles (keep the oldest/most complete)
DELETE FROM community 
WHERE id = 'duplicate-profile-id';
```

---

### ☑️ Step 4: Test with Real Users (15 minutes)

**Test Scenario 1: Migrated User**
1. Find a migrated user's email in your database
2. Have them (or you) log in with OAuth using that email
3. Verify they see their existing profile data
4. Check browser console for: `"Successfully linked existing profile"`

**Test Scenario 2: New User**
1. Use an email NOT in your database
2. Log in with OAuth
3. Verify new profile creation flow works
4. Check browser console for: `"New user — no profile row"`

---

### ☑️ Step 5: Monitor and Support (Ongoing)

**What to watch:**
- Browser console logs for linking success/failures
- User support requests about "can't find my profile"
- Supabase logs for any database errors

**Common support scenarios:**
```sql
-- User can't find their profile - check if email matches
SELECT * FROM community WHERE email = 'user@example.com';

-- Manually link a profile if needed
UPDATE community
SET user_id = 'oauth-user-id-from-auth-users'
WHERE email = 'user@example.com'
  AND user_id IS NULL;
```

---

## What's Already Done (No Action Needed) ✅

- ✅ Application code updated (`auth.js`) - **already deployed**
- ✅ Automatic linking logic - **works on next login**
- ✅ User notifications - **shows success message**
- ✅ Security checks - **prevents account hijacking**

---

## Database Changes Summary

### What You MUST Run:
```sql
-- Just this one file:
migrations/MINIMAL_OAUTH_LINKING_SETUP.sql
```

### What's Optional (but helpful):
```sql
-- Check readiness:
migrations/CHECK_MIGRATION_READINESS.sql

-- Fix issues (if any found):
migrations/FIX_COMMON_MIGRATION_ISSUES.sql

-- Advanced (only if you want database-level triggers):
migrations/LINK_OAUTH_TO_EXISTING_PROFILES.sql
```

---

## FAQ

### Q: Do I need to run all the SQL files?
**A:** No! Just run `MINIMAL_OAUTH_LINKING_SETUP.sql`. The others are optional helpers.

### Q: What if my users don't have emails in the database?
**A:** You'll need to add them manually or they'll be treated as new users. Use the fix scripts to add emails.

### Q: Will this affect existing OAuth users?
**A:** No. Users already linked (with `user_id` set) are unaffected.

### Q: What if a user's OAuth email doesn't match their profile email?
**A:** They'll be treated as a new user. You can manually link them later using SQL.

### Q: Is this safe to run on production?
**A:** Yes! The migration is non-destructive:
- Uses `IF NOT EXISTS` (won't break if already exists)
- Only adds indexes (doesn't modify data structure)
- Normalizes emails (safe operation)
- Application code has safety checks

### Q: Can I rollback if something goes wrong?
**A:** Yes! The linking is just setting `user_id` on profiles. You can unlink by setting `user_id = NULL`.

---

## Quick Start (Minimum Steps)

If you're in a hurry, just do this:

1. **Run this SQL** (in Supabase SQL Editor):
   ```sql
   -- Copy/paste from: migrations/MINIMAL_OAUTH_LINKING_SETUP.sql
   ```

2. **Test with one user**:
   - Have a migrated user log in with OAuth
   - Verify they see their profile

3. **Done!** 🎉

The application code (already deployed) handles everything else automatically.

---

## Need Help?

- 📖 Full guide: `docs/OAUTH_PROFILE_LINKING_GUIDE.md`
- 🔍 Check readiness: `migrations/CHECK_MIGRATION_READINESS.sql`
- 🔧 Fix issues: `migrations/FIX_COMMON_MIGRATION_ISSUES.sql`
- 💬 Questions? Check browser console logs for detailed info

---

## Timeline Estimate

- ⏱️ **Minimal setup**: 5 minutes
- ⏱️ **With data check**: 15 minutes
- ⏱️ **With fixes (if needed)**: 30-60 minutes
- ⏱️ **Testing**: 15 minutes

**Total: 15-90 minutes** depending on data quality
