# Start Sequence Debugging Guide

## Quick Reference

### Theme Query (from start-flow-unified.js)
```javascript
// CORRECTED: Uses actual schema (is_active, not status)
await supabase
  .from('theme_circles')
  .select('id, title, description, is_active, expires_at, created_at')
  .eq('is_active', true)
  .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
  .order('created_at', { ascending: false })
  .limit(5);

// Then gets participant count separately:
await supabase
  .from('theme_participants')
  .select('*', { count: 'exact', head: true })
  .eq('theme_id', theme.id);
```

### Organization Query (from start-flow-unified.js)
```javascript
// CORRECTED: Gets follower_count separately
await supabase
  .from('organizations')
  .select('id, name, slug, description, logo_url, verified, is_active, created_at')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(5);

// Then gets follower count separately:
await supabase
  .from('organization_followers')
  .select('*', { count: 'exact', head: true })
  .eq('organization_id', org.id);
```

## Common Issues & Solutions

### Issue 1: No Themes Showing Up

**Possible Causes:**
1. No themes in database with `is_active = true`
2. All themes have `expires_at` in the past (or NULL is not handled)
3. Table doesn't exist or has different column names
4. `theme_participants` table doesn't exist (needed for counts)

**How to Check:**
```sql
-- Run this in Supabase SQL Editor
SELECT COUNT(*) as active_themes
FROM theme_circles
WHERE is_active = true 
  AND (expires_at IS NULL OR expires_at > NOW());
```

**Solution:**
- If count is 0, you need to add themes or update existing ones
- Use the sample data insertion queries in `START_SEQUENCE_TEST_QUERIES.sql`

### Issue 2: No Organizations Showing Up

**Possible Causes:**
1. No organizations with `is_active = true`
2. Table doesn't exist or has different column names
3. `organization_followers` table doesn't exist (needed for counts)

**How to Check:**
```sql
-- Run this in Supabase SQL Editor
SELECT COUNT(*) as active_orgs
FROM organizations
WHERE is_active = true;
```

**Solution:**
- If count is 0, you need to add organizations
- Use the sample data insertion queries in `START_SEQUENCE_TEST_QUERIES.sql`

### Issue 3: "Already Interested/Following" Error

**Possible Causes:**
1. Duplicate entries in `theme_participants` or `organization_followers`
2. Previous test data not cleaned up

**How to Check:**
```sql
-- Check theme participants for a user
SELECT * FROM theme_participants 
WHERE community_id = 'YOUR_USER_ID';

-- Check organization followers for a user
SELECT * FROM organization_followers 
WHERE community_id = 'YOUR_USER_ID';
```

**Solution:**
```sql
-- Clear test data (CAREFUL - this deletes data!)
DELETE FROM theme_participants WHERE community_id = 'YOUR_USER_ID';
DELETE FROM organization_followers WHERE community_id = 'YOUR_USER_ID';
```

### Issue 4: JavaScript Errors in Console

**Common Errors:**
- `Cannot read property 'id' of null` - Data structure mismatch
- `relation "theme_circles" does not exist` - Table not created
- `column "status" does not exist` - Column name mismatch

**How to Debug:**
1. Open browser console (F12)
2. Look for errors in the "Console" tab
3. Check the "Network" tab for failed API calls
4. Look at the response data to see what Supabase is returning

## Testing Steps

### 1. Verify Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('theme_circles', 'organizations', 'theme_participants', 'organization_followers');
```

### 2. Check Data Exists
```sql
-- Quick counts
SELECT 
  (SELECT COUNT(*) FROM theme_circles WHERE status = 'active' AND expires_at > NOW()) as active_themes,
  (SELECT COUNT(*) FROM organizations WHERE is_active = true) as active_orgs;
```

### 3. Test the Exact Queries
Run the queries from `START_SEQUENCE_TEST_QUERIES.sql` in order:
1. Themes query
2. Organizations query
3. Diagnostic queries if needed

### 4. Test in Browser
1. Open dashboard
2. Open browser console (F12)
3. Click START button
4. Watch console for errors
5. Check Network tab for API responses

## Expected Data Structure

### Theme Object (from database)
```javascript
{
  id: "uuid",
  title: "Theme Name",
  description: "Theme description",
  is_active: true,
  expires_at: "2026-02-28T00:00:00Z", // or NULL
  created_at: "2026-01-15T00:00:00Z"
}
// Note: participant_count is calculated separately via theme_participants table
```

### Organization Object (from database)
```javascript
{
  id: "uuid",
  name: "Organization Name",
  slug: "org-slug",
  description: "Org description",
  logo_url: "https://...",
  verified: true,
  is_active: true,
  created_at: "2026-01-15T00:00:00Z"
}
// Note: follower_count is calculated separately via organization_followers table
```

## Quick Fixes

### Add Sample Themes
```sql
INSERT INTO theme_circles (title, description, is_active, expires_at)
VALUES 
  ('AI & Machine Learning', 'Explore AI projects', true, NOW() + INTERVAL '30 days'),
  ('Web Development', 'Build web apps', true, NOW() + INTERVAL '30 days');
```

### Add Sample Organizations
```sql
INSERT INTO organizations (name, slug, description, is_active, verified)
VALUES 
  ('Tech Innovators', 'tech-innovators', 'Leading tech company', true, true),
  ('Data Analytics Corp', 'data-analytics', 'Data solutions', true, true);
```

### Update Expired Themes
```sql
UPDATE theme_circles 
SET expires_at = NOW() + INTERVAL '30 days'
WHERE expires_at IS NOT NULL AND expires_at < NOW();
```

### Activate Inactive Organizations
```sql
UPDATE organizations 
SET is_active = true
WHERE is_active = false;
```

## Files to Check

1. **`assets/js/start-flow-unified.js`** - Main start sequence logic
   - Line ~285: `loadThemes()` function
   - Line ~375: `loadOrganizations()` function

2. **`START_SEQUENCE_TEST_QUERIES.sql`** - SQL queries for testing

3. **Browser Console** - Real-time errors and logs

## Support

If issues persist:
1. Check all SQL queries return data
2. Verify table/column names match exactly
3. Check browser console for JavaScript errors
4. Verify user is logged in (check `userProfile.id`)
5. Check Supabase RLS policies allow reads
