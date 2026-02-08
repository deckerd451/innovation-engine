# SQL Execution Order - Step by Step

## For Fixing Dave RIGHT NOW (10 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project
2. Click "SQL Editor" in left sidebar
3. Click "New query"

### Step 2: Run FIX_DAVE_SIMPLE.sql

Open the file `FIX_DAVE_SIMPLE.sql` and run queries in this order:

#### Query 1: Find Dave's profiles
```sql
SELECT 
  id,
  user_id,
  email,
  name,
  created_at,
  CASE 
    WHEN user_id IS NULL THEN '🔴 MIGRATED (not linked)'
    ELSE '🟢 OAUTH LINKED'
  END as status
FROM community 
WHERE LOWER(email) LIKE '%dave%ingram%'
   OR LOWER(name) LIKE '%dave%ingram%'
ORDER BY created_at;
```

**Expected Result:** 2 rows
- Row 1 (older): status = 🔴 MIGRATED → Copy the `id` 
- Row 2 (newer): status = 🟢 OAUTH LINKED → Copy the `id` and `user_id`

**Write down:**
- `ORIGINAL_PROFILE_ID` = id from Row 1
- `DUPLICATE_PROFILE_ID` = id from Row 2  
- `OAUTH_USER_ID` = user_id from Row 2

---

#### Query 2: Check connections (optional verification)
```sql
-- Replace 'ORIGINAL_PROFILE_ID' with actual ID
SELECT 
  COUNT(*) as connection_count,
  'Connections for ORIGINAL profile' as description
FROM connections 
WHERE from_user_id = 'ORIGINAL_PROFILE_ID'
   OR to_user_id = 'ORIGINAL_PROFILE_ID';
```

**Expected Result:** Should show Dave's connections (probably > 0)

---

#### Query 3: Link original profile to OAuth
```sql
-- Replace ALL THREE values with actual IDs from Query 1
UPDATE community 
SET 
  user_id = 'OAUTH_USER_ID',
  updated_at = NOW()
WHERE id = 'ORIGINAL_PROFILE_ID'
  AND user_id IS NULL;
```

**Expected Result:** `UPDATE 1` (1 row updated)

---

#### Query 4: Hide duplicate profile
```sql
-- Replace with actual ID from Query 1
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = 'DUPLICATE_PROFILE_ID';
```

**Expected Result:** `UPDATE 1` (1 row updated)

---

#### Query 5: Verify the fix
```sql
-- Replace with actual OAUTH_USER_ID
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  'This should be Dave ORIGINAL profile' as note
FROM community 
WHERE user_id = 'OAUTH_USER_ID'
  AND (is_hidden IS NULL OR is_hidden = false);
```

**Expected Result:** 1 row (Dave's original profile, now linked)

---

#### Query 6: Verify duplicate is hidden
```sql
-- Replace with actual DUPLICATE_PROFILE_ID
SELECT 
  id,
  user_id,
  email,
  name,
  is_hidden,
  'This should be the DUPLICATE profile' as note
FROM community 
WHERE id = 'DUPLICATE_PROFILE_ID'
  AND is_hidden = true;
```

**Expected Result:** 1 row (duplicate profile, now hidden)

---

### Step 3: Have Dave Test
1. Tell Dave to **sign out** completely
2. **Clear browser cache**: Cmd+Shift+Delete (Mac) or Ctrl+Shift+Delete (Windows)
3. **Close and reopen browser**
4. **Sign in again** with OAuth
5. ✅ He should now see his own network!

---

## For Pre-Migration Cleanup (Before wider rollout - 1-2 hours)

Only run this BEFORE enabling OAuth for all migrated users.

### Step 1: Check your schema (optional)
```sql
-- From CHECK_COMMUNITY_SCHEMA.sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'community'
ORDER BY ordinal_position;
```

This shows what columns exist in your table.

---

### Step 2: Run diagnostics
Open `PRE_MIGRATION_CLEANUP.sql` and run **Section 1** queries one by one:

1. **Find duplicate emails** (1.1)
2. **Find missing emails** (1.2)
3. **Find invalid emails** (1.3)
4. **Find whitespace in emails** (1.4)
5. **Find uppercase emails** (1.5)
6. **Summary of issues** (1.6)

**Review the results** - these are issues that need fixing.

---

### Step 3: Create backup
```sql
-- From PRE_MIGRATION_CLEANUP.sql Section 5
CREATE TABLE community_backup_pre_oauth_migration AS 
SELECT * FROM community;
```

**Verify backup:**
```sql
SELECT COUNT(*) as backup_count 
FROM community_backup_pre_oauth_migration;
```

---

### Step 4: Run automatic fixes
From `PRE_MIGRATION_CLEANUP.sql` Section 2:

```sql
-- Normalize emails (trim and lowercase)
UPDATE community
SET 
  email = TRIM(LOWER(email)),
  updated_at = NOW()
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email != TRIM(LOWER(email));
```

```sql
-- Add is_hidden column if missing
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
```

```sql
-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_community_email_lower 
ON community(LOWER(email))
WHERE user_id IS NULL;
```

---

### Step 5: Manual fixes (if needed)
If Section 1 found issues, follow Section 3 in `PRE_MIGRATION_CLEANUP.sql`:

- **Duplicate emails**: Merge or hide non-canonical profiles
- **Missing emails**: Add emails manually
- **Invalid emails**: Correct email format

---

### Step 6: Verify everything is ready
```sql
-- From PRE_MIGRATION_CLEANUP.sql Section 4.1
SELECT 
  'Remaining duplicate emails' as check_name,
  COUNT(DISTINCT email) as count,
  CASE WHEN COUNT(DISTINCT email) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM (
  SELECT email
  FROM community
  WHERE user_id IS NULL AND email IS NOT NULL
  GROUP BY email
  HAVING COUNT(*) > 1
) sub

UNION ALL

SELECT 
  'Remaining missing emails' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '⚠️ WARN' END as status
FROM community
WHERE user_id IS NULL
  AND (email IS NULL OR email = '' OR TRIM(email) = '')

UNION ALL

SELECT 
  'Remaining invalid emails' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email NOT LIKE '%@%.%'

UNION ALL

SELECT 
  'Profiles ready for migration' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM community
WHERE user_id IS NULL
  AND email IS NOT NULL
  AND email LIKE '%@%.%'
  AND email = TRIM(LOWER(email))
  AND NOT EXISTS (
    SELECT 1 FROM community c2 
    WHERE c2.email = community.email 
      AND c2.id != community.id 
      AND c2.user_id IS NULL
  );
```

**All checks should PASS** before enabling OAuth for all users.

---

## For Ongoing Monitoring (After OAuth is enabled)

Run these queries daily for the first week:

### Check migration progress
```sql
-- From PRE_MIGRATION_CLEANUP.sql Section 6.1
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as profiles_linked,
  ARRAY_AGG(email ORDER BY updated_at) as emails_linked
FROM community
WHERE user_id IS NOT NULL
  AND updated_at >= NOW() - INTERVAL '7 days'
  AND created_at < updated_at - INTERVAL '1 hour'
GROUP BY DATE(updated_at)
ORDER BY date DESC;
```

### Find potential duplicates (like Dave's issue)
```sql
-- From PRE_MIGRATION_CLEANUP.sql Section 6.2
SELECT 
  c1.email,
  c1.id as new_profile_id,
  c1.user_id as new_user_id,
  c1.created_at as new_created_at,
  c2.id as old_profile_id,
  c2.created_at as old_created_at,
  '⚠️ POTENTIAL DUPLICATE - Check manually' as issue
FROM community c1
JOIN community c2 ON LOWER(c1.email) = LOWER(c2.email)
WHERE c1.user_id IS NOT NULL
  AND c2.user_id IS NULL
  AND c1.id != c2.id
  AND c1.created_at > c2.created_at
  AND c1.created_at >= NOW() - INTERVAL '7 days'
ORDER BY c1.created_at DESC;
```

If this finds any rows, fix them using the same process as Dave's fix.

---

## Quick Reference

### Files by Purpose

| File | When to Use | Time |
|------|-------------|------|
| `FIX_DAVE_SIMPLE.sql` | Fix Dave NOW | 10 min |
| `PRE_MIGRATION_CLEANUP.sql` | Before wider OAuth rollout | 1-2 hours |
| `profile-linking-diagnostics.sql` | General diagnostics anytime | 5 min |
| `CHECK_COMMUNITY_SCHEMA.sql` | Check table structure | 1 min |

### Execution Priority

1. **URGENT**: `FIX_DAVE_SIMPLE.sql` (do this now)
2. **BEFORE ROLLOUT**: `PRE_MIGRATION_CLEANUP.sql` (do before enabling OAuth for all)
3. **MONITORING**: Section 6 queries (do daily after rollout)

---

## Troubleshooting

### If a query fails:
1. Check the error message
2. Verify you replaced ALL placeholders with actual IDs
3. Make sure IDs are wrapped in single quotes: `'abc-123-def'`
4. Check that the profile exists with a SELECT query first

### If Dave still sees wrong network:
1. Verify the UPDATE queries returned `UPDATE 1`
2. Run the verification queries (Query 5 & 6)
3. Make sure Dave cleared browser cache
4. Check browser console for `[PROFILE-LINK]` and `[CONNECTIONS]` logs

### If you need help:
1. Run `profile-linking-diagnostics.sql` Section 1
2. Check `DAVE_PROFILE_ISSUE_ANALYSIS.md` for detailed troubleshooting
3. Review browser console logs

---

## Success Checklist

- [ ] Ran Query 1 (found Dave's profiles)
- [ ] Copied all 3 IDs (original, duplicate, oauth)
- [ ] Ran Query 3 (linked original profile)
- [ ] Ran Query 4 (hid duplicate)
- [ ] Ran Query 5 & 6 (verified fix)
- [ ] Dave signed out and cleared cache
- [ ] Dave signed in and sees his own network
- [ ] No console errors

**Total time:** ~10 minutes for Dave's fix
