# Avatar URL Fix - ERR_NAME_NOT_RESOLVED

## Problem

Browser console shows errors like:
```
GET https://hvmotpzhliufzomewzfl.supabase.co/storage/v1/object/public/hacksbucket/1748609033178.jpg 
net::ERR_NAME_NOT_RESOLVED
```

## Root Cause

The `profiles` table contains avatar URLs pointing to an old/different Supabase instance (`hvmotpzhliufzomewzfl.supabase.co`) that no longer exists or is inaccessible.

Current correct instance: `mqbsjlgnsirqsmfnreqd.supabase.co`

## Investigation

Run `investigate_avatar_urls.sql` in your Supabase SQL Editor to:
1. See all avatar URLs and their types
2. Count how many profiles have the old URL
3. Find specific problematic URLs
4. Check upload date patterns

## Solution

You have two options:

### Option 1: Update URLs to Correct Instance (Recommended if images exist)

If the avatar images were migrated to the new Supabase instance with the same filenames:

```sql
UPDATE profiles
SET avatar_url = REPLACE(
  avatar_url,
  'hvmotpzhliufzomewzfl.supabase.co',
  'mqbsjlgnsirqsmfnreqd.supabase.co'
)
WHERE avatar_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
```

### Option 2: Reset to Default Avatars (If images don't exist)

If the images don't exist in the new instance:

```sql
UPDATE profiles
SET avatar_url = NULL
WHERE avatar_url LIKE '%hvmotpzhliufzomewzfl.supabase.co%';
```

This will make the app use default avatars for these users.

## How to Run

1. Open your Supabase dashboard
2. Go to SQL Editor
3. Run `investigate_avatar_urls.sql` first to see the scope
4. Choose and run the appropriate fix from `fix_avatar_urls.sql`
5. Refresh your app - errors should be gone

## Prevention

When uploading new avatars, ensure they use the correct Supabase instance URL from `assets/js/supabaseClient.js`:
```javascript
"https://mqbsjlgnsirqsmfnreqd.supabase.co"
```

## Files

- `investigate_avatar_urls.sql` - Diagnostic queries
- `fix_avatar_urls.sql` - Fix scripts with both options
- This README - Documentation
