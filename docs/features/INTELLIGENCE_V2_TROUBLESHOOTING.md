# Intelligence Layer V2 - Troubleshooting Guide

## Common Issues & Solutions

---

## Issue: "column 'source' does not exist"

### Error Message
```
ERROR: 42703: column "source" does not exist
```

### Cause
You ran `create_daily_suggestions_table_v2.sql` on an existing V1 table, which tried to insert data with a `source` column that doesn't exist in the V1 schema.

### Solution
Run the **safe upgrade migration** instead:

```sql
-- In Supabase SQL Editor:
migrations/upgrade_daily_suggestions_to_v2.sql
```

This migration:
- ✅ Detects if table exists
- ✅ Adds missing columns (`source`, `data`) if needed
- ✅ Preserves existing data
- ✅ Creates new table if it doesn't exist

### Verification
After running the upgrade migration, verify columns exist:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'daily_suggestions'
ORDER BY ordinal_position;
```

Expected columns:
- `id` (uuid)
- `user_id` (uuid)
- `date` (date)
- `suggestion_type` (text)
- `target_id` (uuid)
- `score` (integer)
- `why` (jsonb)
- `source` (text) ← Should be present
- `data` (jsonb) ← Should be present
- `created_at` (timestamp with time zone)

---

## Issue: Migration runs but no suggestions appear

### Symptoms
- Console shows: "✅ Generated N suggestions"
- But START modal shows no suggestions

### Possible Causes & Solutions

#### 1. Cache Issue
**Solution:** Clear cache and regenerate

```javascript
// In browser console:
localStorage.clear();

// Then refresh page
location.reload();
```

#### 2. RLS Policies Blocking
**Check:** Verify RLS policies exist

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'daily_suggestions';
```

**Solution:** If no policies, run upgrade migration again.

#### 3. User Not Logged In
**Check:** Verify user profile exists

```javascript
console.log(window.currentUserProfile);
```

**Solution:** Log in first, then suggestions will generate.

---

## Issue: No coordination moments detected

### Symptoms
```
✨ Coordination moments found: 0
```

### Possible Causes

#### 1. Not Enough Network Activity
**Expected behavior** for:
- New users with few connections
- Users with no recent theme activity
- Users with no active projects

**Solution:** This is normal. System will show heuristic suggestions instead.

#### 2. No Recent Activity in Database
**Check:** Verify activity data exists

```sql
-- Check theme participants
SELECT COUNT(*) FROM theme_participants
WHERE last_seen_at >= NOW() - INTERVAL '21 days';

-- Check activity log
SELECT COUNT(*) FROM activity_log
WHERE created_at >= NOW() - INTERVAL '14 days';

-- Check messages
SELECT COUNT(*) FROM messages
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Solution:** If counts are 0, coordination detection won't find anything. This is expected.

---

## Issue: No project_recruit suggestions

### Symptoms
```
📦 Suggestions by type: people=5, projects_join=3, projects_recruit=0
```

### Possible Causes

#### 1. User Doesn't Own Projects
**Check:** Verify owned projects

```javascript
const profile = window.currentUserProfile;
const ownedProjects = await queries.getUserOwnedProjects(profile.id);
console.log('Owned projects:', ownedProjects);
```

**Solution:** This is expected. Only project owners see recruit suggestions.

#### 2. All Projects in Cooldown
**Check:** Recent suggestions

```javascript
const cooldown = await window.DailySuggestionsStoreV2.getRecentSuggestions(profile.id, 7);
const recruitCooldown = cooldown.filter(s => s.suggestion_type === 'project_recruit');
console.log('Recruit suggestions in cooldown:', recruitCooldown);
```

**Solution:** Wait 7 days or clear cooldown manually.

---

## Issue: Suggestions not cached

### Symptoms
- Suggestions regenerate every time START opens
- Console shows "🔄 Generating new suggestions..." repeatedly

### Possible Causes & Solutions

#### 1. Supabase Table Not Accessible
**Check:** Test table access

```javascript
const { data, error } = await window.supabase
  .from('daily_suggestions')
  .select('id')
  .limit(1);

console.log('Table accessible:', !error);
console.log('Error:', error);
```

**Solution:** If error, run upgrade migration again.

#### 2. RLS Blocking Writes
**Check:** Test insert

```javascript
const profile = window.currentUserProfile;
const { error } = await window.supabase
  .from('daily_suggestions')
  .insert({
    user_id: profile.id,
    date: new Date().toISOString().split('T')[0],
    suggestion_type: 'test',
    target_id: null,
    score: 0,
    why: ['test'],
    source: 'test',
    data: {}
  });

console.log('Insert error:', error);
```

**Solution:** If error, check RLS policies.

#### 3. localStorage Fallback Active
**Check:** Console for warning

```
⚠️ daily_suggestions table not found, using localStorage fallback
```

**Solution:** This is acceptable. localStorage works fine as fallback.

---

## Issue: Console errors on page load

### Error: "Cannot read property 'id' of undefined"

**Cause:** Profile not loaded yet

**Solution:** Engine waits for `profile-loaded` event. Ensure profile loads first.

**Check:**
```javascript
// Should fire after login:
window.addEventListener('profile-loaded', (e) => {
  console.log('Profile loaded:', e.detail);
});
```

---

### Error: "queries is not defined"

**Cause:** Module import issue

**Solution:** Ensure `index-v2.js` is loaded as module:

```html
<script type="module" src="assets/js/suggestions/index-v2.js"></script>
```

Not:
```html
<script src="assets/js/suggestions/index-v2.js"></script>
```

---

## Issue: Performance is slow

### Symptoms
- Generation takes >5 seconds
- Page feels sluggish

### Solutions

#### 1. Check Query Count
```javascript
// Enable query logging in Supabase dashboard
// Settings → API → Enable query logging
```

**Expected:** 12-18 queries per generation

**If more:** Check for query loops in coordination detector.

#### 2. Check Network Tab
- Open DevTools → Network
- Filter by "supabase"
- Look for slow queries (>1s)

**Solution:** Add indexes if queries are slow.

#### 3. Reduce Candidate Pool
Edit `queries.js`:

```javascript
// Reduce from 50 to 30
.limit(30)
```

---

## Issue: Rollback needed

### To Revert to V1

#### Option 1: Keep Data, Remove V2 Columns
```sql
-- Run in Supabase SQL Editor:
migrations/rollback_daily_suggestions_v2.sql
```

#### Option 2: Revert HTML Only
```html
<!-- Change back to V1 -->
<script type="module" src="assets/js/suggestions/index.js"></script>
```

#### Option 3: Clear All Data
```sql
-- DESTRUCTIVE - loses all suggestions
DROP TABLE daily_suggestions CASCADE;
```

Then run V1 migration if needed.

---

## Debugging Commands

### Check Initialization
```javascript
console.log('Engine V2:', window.DailySuggestionsEngineV2);
console.log('Store V2:', window.DailySuggestionsStoreV2);
console.log('UI V2:', window.DailySuggestionsUIV2);
```

### Force Regeneration
```javascript
// Clear cache
localStorage.clear();

// Delete from Supabase
const profile = window.currentUserProfile;
await window.supabase
  .from('daily_suggestions')
  .delete()
  .eq('user_id', profile.id)
  .eq('date', new Date().toISOString().split('T')[0]);

// Regenerate
await window.DailySuggestionsEngineV2.ensureTodaysSuggestions();
```

### Inspect Suggestions
```javascript
const suggestions = await window.DailySuggestionsEngineV2.ensureTodaysSuggestions();

// View all
console.table(suggestions);

// Filter by source
console.table(suggestions.filter(s => s.source === 'coordination'));
console.table(suggestions.filter(s => s.source === 'heuristic'));
console.table(suggestions.filter(s => s.source === 'fallback'));

// Filter by type
console.table(suggestions.filter(s => s.suggestion_type === 'project_recruit'));
```

### Check User Context
```javascript
const profile = window.currentUserProfile;
const connectedIds = await queries.getUserConnections(profile.id);
const projectIds = await queries.getUserProjectMemberships(profile.id);
const ownedProjects = await queries.getUserOwnedProjects(profile.id);
const themeIds = await queries.getUserThemeParticipations(profile.id);

console.log({
  profile: profile.name,
  connections: connectedIds.length,
  projects: projectIds.length,
  ownedProjects: ownedProjects.length,
  themes: themeIds.length
});
```

---

## Getting Help

If issues persist:

1. ✅ Check console for errors
2. ✅ Verify migration ran successfully
3. ✅ Test with debugging commands above
4. ✅ Check Supabase logs (Dashboard → Logs)
5. ✅ Open GitHub issue with:
   - Console output
   - Migration verification results
   - User context (connections, projects, themes counts)

---

## Quick Fixes Summary

| Issue | Quick Fix |
|-------|-----------|
| "source" column error | Run `upgrade_daily_suggestions_to_v2.sql` |
| No suggestions appear | Clear cache: `localStorage.clear()` |
| No coordination moments | Expected for new users |
| No recruit suggestions | Expected if user doesn't own projects |
| Not cached | Check RLS policies or use localStorage |
| Slow performance | Reduce candidate pool limits |
| Need to rollback | Run `rollback_daily_suggestions_v2.sql` |

---

**Last Updated:** January 31, 2026
