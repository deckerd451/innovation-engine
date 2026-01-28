# Start Sequence Debugging Guide

## Quick Reference

### Theme Query (from start-flow-unified.js)
```javascript
await supabase
  .from('theme_circles')
  .select('id, title, description, tags, participant_count, expires_at')
  .eq('status', 'active')
  .gt('expires_at', nowIso)
  .order('participant_count', { ascending: false })
  .limit(5);
```

### Organization Query (from start-flow-unified.js)
```javascript
await supabase
  .from('organizations')
  .select('id, name, slug, description, logo_url, industry, follower_count, verified')
  .eq('is_active', true)
  .order('follower_count', { ascending: false })
  .limit(5);
```

## Common Issues & Solutions

### Issue 1: No Themes Showing Up

**Possible Causes:**
1. No themes in database with `status = 'active'`
2. All themes have `expires_at` in the past
3. Table doesn't exist or has different column names

**How to Check:**
```sql
-- Run this in Supabase SQL Editor
SELECT COUNT(*) as active_themes
FROM theme_circles
WHERE status = 'active' AND expires_at > NOW();
```

**Solution:**
- If count is 0, you need to add themes or update existing ones
- Use the sample data insertion queries in `START_SEQUENCE_TEST_QUERIES.sql`

### Issue 2: No Organizations Showing Up

**Possible Causes:**
1. No organizations with `is_active = true`
2. Table doesn't exist or has different column names

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
  tags: ["tag1", "tag2"],
  participant_count: 10,
  expires_at: "2026-02-28T00:00:00Z",
  status: "active"
}
```

### Organization Object (from database)
```javascript
{
  id: "uuid",
  name: "Organization Name",
  slug: "org-slug",
  description: "Org description",
  logo_url: "https://...",
  industry: ["Industry1", "Industry2"],
  follower_count: 50,
  verified: true,
  is_active: true
}
```

## Quick Fixes

### Add Sample Themes
```sql
INSERT INTO theme_circles (title, description, status, expires_at, participant_count, tags)
VALUES 
  ('AI & Machine Learning', 'Explore AI projects', 'active', NOW() + INTERVAL '30 days', 15, ARRAY['AI', 'ML']),
  ('Web Development', 'Build web apps', 'active', NOW() + INTERVAL '30 days', 22, ARRAY['Web', 'Frontend']);
```

### Add Sample Organizations
```sql
INSERT INTO organizations (name, slug, description, is_active, follower_count, verified, industry)
VALUES 
  ('Tech Innovators', 'tech-innovators', 'Leading tech company', true, 150, true, ARRAY['Technology']),
  ('Data Analytics Corp', 'data-analytics', 'Data solutions', true, 89, true, ARRAY['Data']);
```

### Update Expired Themes
```sql
UPDATE theme_circles 
SET expires_at = NOW() + INTERVAL '30 days'
WHERE expires_at < NOW();
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
