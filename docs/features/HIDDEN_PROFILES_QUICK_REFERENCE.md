# Hidden Profiles Filter - Quick Reference

## 🎯 What Was Fixed

**Problem:** Search returning duplicate users (hidden profiles from profile linking consolidation)

**Solution:** Added `is_hidden` filter to all search/discovery queries

## 🔍 The Filter

```javascript
.or('is_hidden.is.null,is_hidden.eq.false')
```

Add this to every community query that:
- ✅ Searches for users (name, skills, etc.)
- ✅ Shows suggestions or recommendations
- ✅ Displays user lists or directories
- ❌ Looks up specific profile by ID (not needed)
- ❌ Is admin-only (needs to see all profiles)

## 📊 Files Updated (13 Total)

### Search & Discovery
- `assets/js/searchEngine.js` - Main search
- `assets/data.js` - Data layer (3 functions)
- `assets/js/enhanced-search-discovery.js` - Enhanced search

### Suggestions
- `assets/js/suggestions/queries.js` - Suggestion queries
- `assets/js/suggestions/engine.js` - Suggestion engine v1
- `assets/js/suggestions/engine-v2.js` - Suggestion engine v2
- `assets/js/smart-connection-suggestions.js` - Smart suggestions
- `assets/js/matchEngine.js` - Match algorithm

### UI & Flows
- `dashboard.js` - Dashboard queries (2 places)
- `assets/js/mentor-guide.js` - Mentor matching (2 places)
- `assets/js/start-flow-sequential.js` - Onboarding flow
- `assets/js/start-ui-enhanced.js` - Enhanced start UI
- `assets/js/node-panel.js` - Node panel mutuals

## 🧪 Quick Test

```javascript
// In browser console:
const { data } = await window.supabase
  .from('community')
  .select('id, email, is_hidden')
  .or('is_hidden.is.null,is_hidden.eq.false');

console.log('Visible profiles:', data.length);
console.log('Any hidden?', data.some(p => p.is_hidden === true)); // Should be false
```

## 🗄️ Database Check

```sql
-- Count visible vs hidden
SELECT 
  COUNT(CASE WHEN is_hidden IS NULL OR is_hidden = false THEN 1 END) as visible,
  COUNT(CASE WHEN is_hidden = true THEN 1 END) as hidden
FROM community;

-- Check for duplicates in visible profiles (should be 0)
SELECT email, COUNT(*) 
FROM community 
WHERE (is_hidden IS NULL OR is_hidden = false)
GROUP BY email 
HAVING COUNT(*) > 1;
```

## ⚡ Performance

Add this index for better performance:

```sql
CREATE INDEX IF NOT EXISTS idx_community_is_hidden 
ON community(is_hidden) 
WHERE is_hidden = true;
```

## 🚨 Common Issues

### Issue: Still seeing duplicates
**Check:** Run database query to verify hidden profiles are marked
```sql
SELECT * FROM community WHERE email = 'duplicate@example.com';
```

### Issue: User can't find someone
**Check:** Make sure profile isn't accidentally hidden
```sql
UPDATE community SET is_hidden = false WHERE id = '<profile_id>';
```

### Issue: Query is slow
**Check:** Index is created (see Performance section above)

## 📝 Pattern Examples

### Before (returns hidden profiles)
```javascript
const { data } = await supabase
  .from('community')
  .select('*')
  .neq('id', currentUserId);
```

### After (filters hidden profiles)
```javascript
const { data } = await supabase
  .from('community')
  .select('*')
  .neq('id', currentUserId)
  .or('is_hidden.is.null,is_hidden.eq.false');
```

## ✅ Testing Checklist

- [ ] Search by name - no duplicates
- [ ] Search by skills - no duplicates
- [ ] Connection suggestions - no duplicates
- [ ] Dashboard suggestions - no duplicates
- [ ] Synapse network view - no duplicates
- [ ] User can still access own profile
- [ ] Profile detail view works (by ID)

## 🔗 Related Docs

- **Full Details:** `HIDDEN_PROFILES_FILTER_FIX.md`
- **Profile Linking:** `PROFILE_LINKING_FIX.md`
- **SQL Verification:** `add-hidden-profiles-index.sql`

## 💡 Key Points

- Filter handles NULL values (backward compatible)
- Only affects search/discovery queries
- Profile lookups by ID still work
- Admin queries preserved
- Performance optimized with partial index

---

**Last Updated:** February 4, 2026  
**Status:** Ready for Production  
**Related:** Profile Linking Fix
