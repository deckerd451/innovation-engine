# Community Table Schema Reference

## Actual Column Names

Based on the Supabase schema query, here are the **actual** columns in the `community` table:

### Core Identity
- `id` - UUID (PRIMARY KEY, NOT NULL, default: uuid_generate_v4())
- `user_id` - UUID (NULLABLE, links to auth.users)
- `email` - TEXT (NULLABLE)
- `name` - TEXT (NOT NULL) ⚠️ **NOT** `display_name`

### Profile Information
- `bio` - TEXT (NULLABLE)
- `image_url` - TEXT (NULLABLE)
- `image_path` - TEXT (NULLABLE)
- `avatar_storage_path` - TEXT (NULLABLE)
- `role` - TEXT (NULLABLE)
- `user_role` - TEXT (default: 'Member')
- `availability` - TEXT (NULLABLE)

### Skills & Interests
- `skills` - TEXT (NULLABLE)
- `interests` - ARRAY (NULLABLE)

### Position (Synapse)
- `x` - INTEGER (NULLABLE)
- `y` - INTEGER (NULLABLE)

### Engagement & Stats
- `connection_count` - INTEGER (default: 0)
- `projects_created` - INTEGER (default: 0)
- `projects_joined` - INTEGER (default: 0)
- `bids_submitted` - INTEGER (default: 0)
- `bids_accepted` - INTEGER (default: 0)
- `endorsements_given` - INTEGER (default: 0)
- `endorsements_received` - INTEGER (default: 0)
- `endorsements` - JSONB (NULLABLE)

### Gamification
- `xp` - INTEGER (default: 0)
- `total_xp` - INTEGER (default: 0)
- `level` - INTEGER (default: 1)
- `login_streak` - INTEGER (default: 0)
- `current_streak` - INTEGER (default: 0)
- `daily_quests_completed` - JSONB (default: '[]')

### Onboarding
- `onboarding_completed` - BOOLEAN (default: false)
- `onboarding_step` - INTEGER (default: 0)
- `onboarding_started_at` - TIMESTAMPTZ (NULLABLE)
- `onboarding_completed_at` - TIMESTAMPTZ (NULLABLE)
- `profile_completed` - BOOLEAN (default: false)

### Activity Tracking
- `last_login` - TIMESTAMPTZ (NULLABLE)
- `previous_login_at` - TIMESTAMPTZ (NULLABLE)
- `last_activity_date` - DATE (NULLABLE)
- `last_start_view_at` - TIMESTAMPTZ (NULLABLE)
- `start_view_count` - INTEGER (default: 0)

### Newsletter
- `newsletter_opt_in` - BOOLEAN (default: false)
- `newsletter_opt_in_at` - TIMESTAMPTZ (NULLABLE)

### Visibility
- `is_hidden` - BOOLEAN (default: false) ✅ **Used for hiding duplicate profiles**

### Timestamps
- `created_at` - TIMESTAMPTZ (NULLABLE)
- `updated_at` - TIMESTAMPTZ (default: now())

## Important Notes

### ⚠️ Common Mistakes

1. **Column name is `name`, NOT `display_name`**
   ```sql
   -- ❌ WRONG
   SELECT display_name FROM community;
   
   -- ✅ CORRECT
   SELECT name FROM community;
   ```

2. **There is NO `username` column**
   ```sql
   -- ❌ WRONG
   SELECT username FROM community;
   
   -- ✅ CORRECT
   SELECT name FROM community;  -- Use name instead
   ```

3. **`is_hidden` is a BOOLEAN, not NULL by default**
   ```sql
   -- ✅ CORRECT - Filter hidden profiles
   WHERE is_hidden IS NULL OR is_hidden = false
   
   -- Or simply
   WHERE COALESCE(is_hidden, false) = false
   ```

## Profile Linking Fields

For the OAuth migration profile linking fix:

```javascript
// Required fields for profile linking
{
  id: 'uuid',
  user_id: 'uuid | null',  // NULL for migrated profiles
  email: 'string | null',
  name: 'string',          // NOT display_name
  onboarding_completed: 'boolean',
  profile_completed: 'boolean',
  is_hidden: 'boolean',
  created_at: 'timestamp',
  updated_at: 'timestamp'
}
```

## Onboarding Check

```javascript
// Correct onboarding check (auth.js)
const needsOnboarding = 
  !profile.onboarding_completed || 
  !profile.profile_completed ||
  !profile.name;  // NOT display_name or username
```

## SQL Query Examples

### Get visible profiles
```sql
SELECT 
  id,
  name,
  email,
  bio,
  image_url,
  connection_count
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
ORDER BY name;
```

### Get orphaned profiles (need linking)
```sql
SELECT 
  id,
  email,
  name,
  created_at
FROM community
WHERE user_id IS NULL
ORDER BY created_at DESC;
```

### Get hidden profiles (duplicates)
```sql
SELECT 
  id,
  email,
  name,
  user_id,
  is_hidden,
  updated_at
FROM community
WHERE is_hidden = true
ORDER BY updated_at DESC;
```

### Check for duplicate emails
```sql
SELECT 
  email,
  COUNT(*) as count,
  ARRAY_AGG(id) as profile_ids,
  ARRAY_AGG(name) as names
FROM community
WHERE (is_hidden IS NULL OR is_hidden = false)
  AND email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;
```

## Index Recommendations

```sql
-- Email lookup (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_community_email_lower 
ON community(LOWER(email));

-- user_id lookup (should exist from UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_community_user_id 
ON community(user_id);

-- Hidden profiles (partial index)
CREATE INDEX IF NOT EXISTS idx_community_is_hidden 
ON community(is_hidden) 
WHERE is_hidden = true;

-- Name search
CREATE INDEX IF NOT EXISTS idx_community_name_lower
ON community(LOWER(name));
```

## Migration Notes

### If you need to add username column (optional)
```sql
-- Only if you want to add username support
ALTER TABLE community 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_community_username_lower
ON community(LOWER(username));
```

### If you need to rename name to display_name (NOT recommended)
```sql
-- NOT RECOMMENDED - would break existing code
-- ALTER TABLE community 
-- RENAME COLUMN name TO display_name;
```

## Code References

### Files that use community table columns:

1. **auth.js** - Uses: `id`, `user_id`, `email`, `name`, `onboarding_completed`, `profile_completed`, `is_hidden`
2. **dashboard.js** - Uses: `id`, `name`, `email`, `bio`, `image_url`, `connection_count`
3. **searchEngine.js** - Uses: `id`, `name`, `email`, `image_url`, `skills`, `bio`, `availability`
4. **synapse/data.js** - Uses: `id`, `name`, `email`, `image_url`, `skills`, `interests`, `bio`, `x`, `y`, `connection_count`, `is_hidden`

## Summary

✅ **Use these column names:**
- `name` (not `display_name`)
- `is_hidden` (for filtering duplicates)
- `user_id` (for OAuth linking)

❌ **Don't use these (they don't exist):**
- `display_name`
- `username`

---

**Last Updated:** February 4, 2026  
**Source:** Supabase schema query  
**Status:** Verified and Accurate
