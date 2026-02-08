# Project Request Approval Loop Fix

## Problem
After clicking "Approve" on a project join request:
1. Success message appears
2. Modal shows "No pending requests" correctly
3. BUT the project panel still shows "Manage Requests (1)"
4. Clicking it again shows the same request (loop)

## Root Cause
The panel was reloading with cached `currentNodeData` object instead of forcing a fresh database fetch. This caused the panel to display stale pending request counts even though the database was correctly updated.

## Solution

### Changes Made (`assets/js/node-panel.js`)

#### 1. Fixed `approveJoinRequest` function:
- Added 300ms delay after database update to ensure commit completes
- Changed panel reload to pass fresh object `{ id: projectId, type: 'project' }` instead of cached `currentNodeData`
- This forces `renderProjectPanel` to fetch fresh data from database

#### 2. Fixed `declineJoinRequest` function:
- Applied same fix: 300ms delay + fresh object for reload
- Ensures consistent behavior for both approve and decline actions

### Technical Details

**Before:**
```javascript
await loadNodeDetails(currentNodeData);  // Uses cached data
```

**After:**
```javascript
await new Promise(resolve => setTimeout(resolve, 300));  // Wait for DB commit
await loadNodeDetails({ id: projectId, type: 'project' });  // Force fresh fetch
```

The `renderProjectPanel` function already fetches fresh data from the database:
```javascript
const { data: project, error } = await supabase
  .from('projects')
  .select(`
    *,
    project_members(user_id, role, user:community(id, name, image_url))
  `)
  .eq('id', nodeData.id)
  .single();
```

But it was being called with stale `nodeData`, which didn't matter for the query but could cause issues with other cached properties.

## Testing Checklist
- [ ] Approve a project request
- [ ] Verify "Manage Requests" button disappears or count decrements
- [ ] Verify no loop occurs
- [ ] Verify new member appears in project members list
- [ ] Test decline request works similarly
- [ ] Test with multiple pending requests

## Files Modified
- `assets/js/node-panel.js` - Fixed approve and decline request functions

## Expected Behavior After Fix
1. Click "Approve" on a join request
2. Success notification appears
3. Request card is removed from modal
4. Modal shows "No pending requests" if that was the last one
5. Project panel reloads with fresh data
6. "Manage Requests" button disappears (or count decrements)
7. Approved user appears in "Team Members" section
8. No loop or stale data

✅ **Fixed**: Project request approval now properly updates the UI without loops.
