# Connection Count Fix - February 5, 2026

## Issues Identified

### 1. Search Bar Still Overlaying Profile Content
**Problem:** CSS selectors weren't working to hide the search bar when modals opened
**Solution:** Added JavaScript MutationObserver to detect modal state changes and hide/show search bar dynamically

### 2. Incorrect Connection Count Display
**Problem:** Profile showing "1 connections" when actual count should be higher
**Root Cause:** Connection count only includes connections with `status = 'accepted'`

## Connection Count Logic

The `connection_count` field in the `community` table is calculated by:

```sql
SELECT COUNT(*) 
FROM connections
WHERE (user_id = [your_id] OR connected_user_id = [your_id])
AND status = 'accepted'
```

### Possible Reasons for Low Count:

1. **Pending Connections** - Connections with `status = 'pending'` are not counted
2. **Rejected Connections** - Connections with `status = 'rejected'` are not counted
3. **Stale Data** - The trigger may not have fired to update the count
4. **Missing Connections** - Actual connections may not be in the database

## Diagnostic Steps

Run the `fix-connection-count.sql` script in Supabase SQL Editor:

### Step 1: Check Current vs Actual Counts
```sql
SELECT 
  c.id,
  c.name,
  c.email,
  c.connection_count as current_count,
  (
    SELECT COUNT(*) 
    FROM connections conn
    WHERE (conn.user_id = c.id OR conn.connected_user_id = c.id)
    AND conn.status = 'accepted'
  ) as actual_count
FROM community c
WHERE c.user_id IS NOT NULL
ORDER BY c.name;
```

This will show if there's a mismatch between stored count and actual count.

### Step 2: Recalculate All Counts
```sql
UPDATE community
SET connection_count = (
  SELECT COUNT(*)
  FROM connections
  WHERE (connections.user_id = community.id OR connections.connected_user_id = community.id)
  AND connections.status = 'accepted'
);
```

This forces a recalculation for all users.

### Step 3: Check for Non-Accepted Connections
```sql
SELECT 
  c1.name as from_user,
  c2.name as to_user,
  conn.status,
  conn.created_at
FROM connections conn
JOIN community c1 ON conn.user_id = c1.id
JOIN community c2 ON conn.connected_user_id = c2.id
WHERE conn.status != 'accepted'
ORDER BY conn.created_at DESC;
```

This shows any pending or rejected connections that aren't being counted.

## Search Bar Fix

### Implementation
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

- [ ] Run `fix-connection-count.sql` in Supabase
- [ ] Verify connection count matches actual accepted connections
- [ ] Check if there are pending connections that should be accepted
- [ ] Test search bar hides when profile modal opens
- [ ] Test search bar shows when profile modal closes
- [ ] Test with other modals (projects, messages, etc.)

## Next Steps

1. **Run the diagnostic SQL** to see actual vs displayed counts
2. **Check connection statuses** - Are there pending connections that should be accepted?
3. **Verify the trigger** - Is `trigger_update_connection_count` working?
4. **Consider UI changes** - Should we show pending connections separately?

## Files Modified
- `dashboard.html` - Added MutationObserver for search bar visibility
- `fix-connection-count.sql` - Diagnostic and fix script

## Notes

The connection count system is designed to only show **accepted** connections. If you have many pending connection requests, they won't be included in the count. This is intentional to show only confirmed connections.

If the count is still wrong after running the fix script, there may be an issue with:
- The trigger not firing properly
- RLS policies preventing count updates
- Actual missing connection records in the database
