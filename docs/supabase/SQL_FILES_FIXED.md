# SQL Files Fixed - Username Column Removed

## Problem
The `username` column doesn't exist in your `community` table, causing SQL errors.

## Fixed Files
✅ All SQL files have been updated to remove references to `username` column:

1. **`FIX_DAVE_PROFILE_ISSUE.sql`** - Fixed
2. **`profile-linking-diagnostics.sql`** - Fixed
3. **`PRE_MIGRATION_CLEANUP.sql`** - Fixed

## New Simple File
✅ **`FIX_DAVE_SIMPLE.sql`** - Created a simplified version for immediate use

## How to Use FIX_DAVE_SIMPLE.sql

### Step 1: Run the first query
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

### Step 2: Copy the values from results
You should see 2 rows:
- **Row 1** (older): `status = 🔴 MIGRATED` → Copy the `id` (this is ORIGINAL_PROFILE_ID)
- **Row 2** (newer): `status = 🟢 OAUTH LINKED` → Copy the `id` (this is DUPLICATE_PROFILE_ID) and `user_id` (this is OAUTH_USER_ID)

### Step 3: Run the fix queries
Uncomment and replace the placeholders in `FIX_DAVE_SIMPLE.sql`:

```sql
-- Link original profile
UPDATE community 
SET 
  user_id = 'paste-OAUTH_USER_ID-here',
  updated_at = NOW()
WHERE id = 'paste-ORIGINAL_PROFILE_ID-here'
  AND user_id IS NULL;

-- Hide duplicate
UPDATE community 
SET 
  is_hidden = true,
  updated_at = NOW()
WHERE id = 'paste-DUPLICATE_PROFILE_ID-here';
```

### Step 4: Verify
Run the verification queries in `FIX_DAVE_SIMPLE.sql` to confirm the fix worked.

### Step 5: Have Dave test
1. Sign out
2. Clear browser cache
3. Sign in again
4. Should see his own network!

## What Was Changed

### Before (Broken)
```sql
SELECT 
  id,
  user_id,
  email,
  name,
  username,  -- ❌ This column doesn't exist
  created_at
FROM community;
```

### After (Fixed)
```sql
SELECT 
  id,
  user_id,
  email,
  name,
  created_at
FROM community;
```

## All Files Now Work

You can now run any of these files without errors:
- ✅ `FIX_DAVE_SIMPLE.sql` - Simplest, use this one
- ✅ `FIX_DAVE_PROFILE_ISSUE.sql` - More detailed diagnostics
- ✅ `profile-linking-diagnostics.sql` - Full system diagnostics
- ✅ `PRE_MIGRATION_CLEANUP.sql` - Pre-migration cleanup

## Next Steps

1. **Use `FIX_DAVE_SIMPLE.sql`** - It's the easiest
2. Follow the steps in the file
3. Should take ~5 minutes
4. Dave will see his own network after signing in again

## If You Need to Check Schema

Run this to see all columns in your `community` table:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'community'
ORDER BY ordinal_position;
```

This will show you exactly what columns exist.
