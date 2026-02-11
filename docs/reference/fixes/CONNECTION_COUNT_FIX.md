# Connection Count Fix - February 5, 2026

## Issues Identified

### 1. Search Bar Still Overlaying Profile Content ✅ FIXED
**Problem:** CSS selectors weren't working to hide the search bar when modals opened
**Solution:** Added JavaScript MutationObserver to detect modal state changes and hide/show search bar dynamically

### 2. Incorrect Connection Count Display 🔧 NEEDS DATABASE FIX
**Problem:** Profile showing "1 connections" when actual count should be higher
**Root Cause:** The trigger function was using wrong column names (user_id/connected_user_id instead of from_user_id/to_user_id)

## Connection Count Logic

The `connection_count` field in the `community` table is calculated by:

```sql
SELECT COUNT(*) 
FROM connections
WHERE (from_user_id = [your_id] OR to_user_id = [your_id])
AND status = 'accepted'
```

### Important: Column Names
The `connections` table uses:
- ✅ `from_user_id` - The user who initiated the connection
- ✅ `to_user_id` - The user who received the connection request
- ❌ NOT `user_id` and `connected_user_id` (these don't exist)

## Fix Instructions

### Step 1: Fix the Trigger Function
Run `fix-connection-count-trigger.sql` in Supabase SQL Editor. This will:
1. Update the trigger function to use correct column names
2. Recreate the trigger
3. Recalculate all connection counts
4. Show verification results

### Step 2: Verify the Fix (Optional)
Run `fix-connection-count.sql` to see detailed diagnostics:
- Current vs actual counts
- Any pending or rejected connections
- Verification of the fix

## What the Fix Does

### Before (Broken):
```sql
-- Wrong column names
WHERE (conn.user_id = c.id OR conn.connected_user_id = c.id)
```

### After (Fixed):
```sql
-- Correct column names
WHERE (conn.from_user_id = c.id OR conn.to_user_id = c.id)
```

## Possible Reasons for Low Count:

1. **Pending Connections** - Connections with `status = 'pending'` are not counted
2. **Rejected Connections** - Connections with `status = 'rejected'` are not counted
3. **Broken Trigger** - The trigger was using wrong column names, so counts weren't updating
4. **Stale Data** - Old counts that were never updated

## Search Bar Fix

### Implementation ✅
Added JavaScript that:
1. Uses `MutationObserver` to watch for class changes on modal elements
2. Detects when any modal has the `active` class
3. Hides `#centered-search-container` when modal is open
4. Shows it again when modal closes

### Code Location
`dashboard.html` - After the profile modal definition

```javascript
// Hide search container when any modal opens
const observer = new MutationObserver(() => {
  const anyModalOpen = document.querySelector('.modal.active');
  if (searchContainer) {
    searchContainer.style.display = anyModalOpen ? 'none' : 'flex';
  }
});
```

## Testing Checklist

- [ ] Run `fix-connection-count-trigger.sql` in Supabase ⚠️ **DO THIS FIRST**
- [ ] Verify connection count matches actual accepted connections
- [ ] Check if there are pending connections that should be accepted
- [ ] Test search bar hides when profile modal opens ✅
- [ ] Test search bar shows when profile modal closes ✅
- [ ] Test with other modals (projects, messages, etc.)

## Files Created

1. **fix-connection-count.sql** - Diagnostic queries to check connection counts
2. **fix-connection-count-trigger.sql** - Fixes the trigger function and recalculates counts ⚠️ **RUN THIS**

## Next Steps

1. **Run `fix-connection-count-trigger.sql` in Supabase** - This is the main fix
2. Check your connection count - it should now be correct
3. If still wrong, run `fix-connection-count.sql` for diagnostics
4. Check if you have pending connections that need to be accepted

## Notes

The connection count system is designed to only show **accepted** connections. If you have many pending connection requests, they won't be included in the count. This is intentional to show only confirmed connections.

The trigger was broken because it was written for a different schema (using `user_id`/`connected_user_id`) but your actual table uses `from_user_id`/`to_user_id`. This has now been fixed.
