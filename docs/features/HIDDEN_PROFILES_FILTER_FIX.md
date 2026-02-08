# Hidden Profiles Filter Fix

## Problem

Search and discovery queries were returning hidden profiles (duplicate profiles marked with `is_hidden = true` during profile linking consolidation), causing:
- Duplicate users appearing in search results
- Hidden profiles showing up in suggestions
- Confusion for users seeing the same person multiple times

## Solution

Added `is_hidden` filter to all community search queries using:
```javascript
.or('is_hidden.is.null,is_hidden.eq.false')
```

This filter ensures only active profiles are returned (where `is_hidden` is NULL or false).

## Files Modified

### Core Search & Discovery
1. **assets/js/searchEngine.js**
   - `loadCommunityData()` - Main search data loader
   - Filters out hidden profiles from search index

2. **assets/data.js**
   - `getCommunity()` - Get all community members
   - `searchByName()` - Name search
   - `searchBySkills()` - Skills search

3. **assets/js/enhanced-search-discovery.js**
   - People loading for enhanced search

### Suggestions & Matching
4. **assets/js/suggestions/queries.js**
   - `getCandidatePeople()` - Get suggestion candidates

5. **assets/js/suggestions/engine.js**
   - Active users fallback for suggestions

6. **assets/js/suggestions/engine-v2.js**
   - Active users fallback for suggestions v2

7. **assets/js/smart-connection-suggestions.js**
   - Connection suggestion algorithm

8. **assets/js/matchEngine.js**
   - Match algorithm for team building

### Dashboard & UI
9. **dashboard.js**
   - `loadSuggestedConnections()` - Two queries updated
   - Filters hidden profiles from dashboard suggestions

10. **assets/js/mentor-guide.js**
    - Two queries for finding relevant people
    - Mentor matching algorithm

### User Flows
11. **assets/js/start-flow-sequential.js**
    - `loadPeople()` - Initial people loading

12. **assets/js/start-ui-enhanced.js**
    - Profile loading for connections display

13. **assets/js/node-panel.js**
    - Mutual connections display

## Filter Pattern

All queries now follow this pattern:

```javascript
// Before
const { data } = await supabase
  .from('community')
  .select('*')
  .neq('id', currentUserId);

// After
const { data } = await supabase
  .from('community')
  .select('*')
  .neq('id', currentUserId)
  .or('is_hidden.is.null,is_hidden.eq.false');
```

## Why `.or('is_hidden.is.null,is_hidden.eq.false')`?

This pattern handles both cases:
- **`is_hidden.is.null`** - Profiles created before the `is_hidden` column was added
- **`is_hidden.eq.false`** - Profiles explicitly marked as visible

This ensures backward compatibility with existing profiles.

## Queries NOT Modified

The following queries were intentionally NOT modified because they:
- Are admin-only queries (need to see hidden profiles)
- Are profile-specific lookups by ID or user_id (not search/discovery)
- Are update/insert operations (not queries)

### Admin Queries
- `assets/js/admin-analytics.js` - Admin needs to see all profiles

### Profile Lookups (by ID/user_id)
- `auth.js` - Profile linking by user_id/email (needs to find hidden profiles)
- `assets/js/login.js` - User's own profile lookup
- `assets/js/profile-completion-helper.js` - Profile updates
- `assets/js/enhancements.js` - User's own profile
- `assets/js/smart-onboarding.js` - Profile updates
- `assets/js/synapse/themes.js` - User's own profile
- `assets/js/notification-integration.js` - Specific profile by ID
- `assets/js/node-panel-fixes.js` - Specific user by ID
- `assets/js/presence-session-manager.js` - Profile verification
- `assets/js/daily-engagement.js` - User's own profile
- `assets/js/supabaseClient.js` - Profile creation/linking
- `assets/js/api/profiles.js` - Profile CRUD operations
- `assets/js/node-panel.js` - Profile detail view (by ID)

### Test Scripts
- `test-profile-linking.js` - Diagnostic queries (needs to see hidden profiles)

## Testing Checklist

### Test Case 1: Search Results
- [ ] Search by name - no duplicates appear
- [ ] Search by skills - no duplicates appear
- [ ] Hidden profiles do not appear in results

### Test Case 2: Suggestions
- [ ] Connection suggestions - no duplicates
- [ ] Daily suggestions - no duplicates
- [ ] Smart suggestions - no duplicates

### Test Case 3: Dashboard
- [ ] Suggested connections - no duplicates
- [ ] Recent connections - no duplicates
- [ ] Discovery tab - no duplicates

### Test Case 4: Synapse View
- [ ] Network visualization - no duplicate nodes
- [ ] Search in synapse - no duplicates
- [ ] Theme filtering - no duplicates

### Test Case 5: Profile Access
- [ ] User can still access their own profile
- [ ] Profile by ID still works (node panel)
- [ ] Admin can see hidden profiles (if needed)

## Database Verification

Check that hidden profiles are properly marked:

```sql
-- Count hidden profiles
SELECT COUNT(*) FROM community WHERE is_hidden = true;

-- List hidden profiles
SELECT id, email, user_id, is_hidden, updated_at 
FROM community 
WHERE is_hidden = true
ORDER BY updated_at DESC;

-- Verify no hidden profiles in search results (simulate query)
SELECT COUNT(*) FROM community 
WHERE (is_hidden IS NULL OR is_hidden = false);
```

## Performance Considerations

### Index Recommendation
Add an index on `is_hidden` for better query performance:

```sql
CREATE INDEX IF NOT EXISTS idx_community_is_hidden 
ON community(is_hidden) 
WHERE is_hidden = true;
```

This partial index only indexes hidden profiles, keeping it small and efficient.

### Query Performance
The `.or('is_hidden.is.null,is_hidden.eq.false')` filter is efficient because:
- Most profiles have `is_hidden = false` or NULL
- Hidden profiles are a small subset (only duplicates)
- The filter is applied early in the query pipeline

## Deduplication Logic (Optional Enhancement)

For extra safety, you can add client-side deduplication:

```javascript
// Deduplicate by email with preference for completed profiles
function deduplicateProfiles(profiles) {
  const seen = new Map();
  
  profiles.forEach(profile => {
    const key = profile.email?.toLowerCase() || profile.id;
    const existing = seen.get(key);
    
    if (!existing) {
      seen.set(key, profile);
    } else {
      // Prefer completed profiles
      const isCurrentBetter = 
        profile.profile_completed && !existing.profile_completed ||
        profile.onboarding_completed && !existing.onboarding_completed;
      
      if (isCurrentBetter) {
        seen.set(key, profile);
      }
    }
  });
  
  return Array.from(seen.values());
}
```

This can be added to search engines as an extra safety layer.

## Monitoring

### Check for Hidden Profiles in Results
Add logging to detect if hidden profiles slip through:

```javascript
// In search results rendering
if (profile.is_hidden === true) {
  console.error('⚠️ Hidden profile in results:', profile.id, profile.email);
}
```

### Track Hidden Profile Count
Monitor the number of hidden profiles over time:

```sql
-- Daily check
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as hidden_count
FROM community
WHERE is_hidden = true
GROUP BY DATE(updated_at)
ORDER BY date DESC
LIMIT 7;
```

## Rollback Plan

If issues occur, the filter can be temporarily disabled:

```javascript
// Emergency rollback - remove .or() filter
const { data } = await supabase
  .from('community')
  .select('*')
  .neq('id', currentUserId);
  // .or('is_hidden.is.null,is_hidden.eq.false'); // Commented out
```

## Related Documentation

- **Profile Linking:** `PROFILE_LINKING_FIX.md` - How profiles are marked as hidden
- **Diagnostics:** `profile-linking-diagnostics.sql` - SQL queries for hidden profiles
- **Deployment:** `PROFILE_LINKING_DEPLOYMENT.md` - Deployment checklist

## Summary

✅ **13 files updated** with `is_hidden` filter  
✅ **All search and discovery queries** now filter hidden profiles  
✅ **Profile lookups by ID** still work (not filtered)  
✅ **Admin queries** preserved (can see hidden profiles)  
✅ **Backward compatible** (handles NULL values)  
✅ **Performance optimized** (partial index recommended)

Hidden profiles will no longer appear in search results, suggestions, or discovery features, eliminating duplicate user confusion.

---

**Last Updated:** February 4, 2026  
**Related Fix:** Profile Linking (PROFILE_LINKING_FIX.md)  
**Status:** Ready for Testing
