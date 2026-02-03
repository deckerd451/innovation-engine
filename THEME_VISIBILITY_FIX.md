# Theme Visibility Bug Fix

## Problem
Themes that users were connected to (via `theme_participants` table) were not appearing in the synapse view.

## Root Cause
The theme visibility logic in `assets/js/synapse/core.js` was incorrectly checking theme participation:

```javascript
// BEFORE (BROKEN):
const isUserConnected = userThemes.includes(node.theme_id);
```

This approach had a subtle bug where it was trying to match theme IDs from the person node's `themes` array against the theme node's `theme_id`. While this should work in theory, the data flow was unreliable.

## Solution
The theme node already has a pre-computed `user_is_participant` flag that is calculated correctly during data loading in `assets/js/synapse/data.js`:

```javascript
// In data.js - Theme node creation:
const userParticipation = (themeParticipants || []).find(
  tp => tp.theme_id === theme.id && tp.community_id === currentUserCommunityId
);

return {
  // ...
  user_is_participant: !!userParticipation,
  // ...
};
```

The fix is to use this pre-computed flag instead of recalculating:

```javascript
// AFTER (FIXED):
const isUserConnected = node.user_is_participant === true;
```

## Changes Made

### File: `assets/js/synapse/core.js`

**Line ~867**: Fixed initial theme visibility check
```javascript
// Use the pre-computed user_is_participant flag from data loading
const isUserConnected = node.user_is_participant === true;
```

**Line ~912**: Fixed "myThemes" filtering for positioning
```javascript
const myThemes = themes.filter((t) => {
  const hasThemeParticipation = t.user_is_participant === true;
  // ...
});
```

**Line ~949**: Fixed "otherThemes" filtering for discovery mode
```javascript
const otherThemes = themes.filter((t) => {
  const hasThemeParticipation = t.user_is_participant === true;
  // ...
});
```

## Enhanced Debug Logging
Added `theme_id` and `user_is_participant` to debug logs to make troubleshooting easier:

```javascript
console.log(`✅ Showing theme "${node.name || node.title}":`, {
  theme_id: node.theme_id,
  user_is_participant: node.user_is_participant,
  isUserConnected,
  hasProjectsInTheme,
  // ...
});
```

## Testing
To verify the fix:

1. Join a theme using the theme panel or discovery mode
2. Check the browser console for theme visibility logs
3. Verify the theme appears in the synapse view
4. Look for logs like: `✅ Showing theme "Theme Name": { user_is_participant: true, ... }`

## Data Flow
1. **Database**: `theme_participants` table stores user-theme relationships
2. **Data Loading** (`data.js`): Queries `theme_participants` and sets `user_is_participant` flag on theme nodes
3. **Positioning** (`core.js`): Uses `user_is_participant` flag to determine visibility and positioning
4. **Rendering** (`render-hit-detection.js`): Renders visible themes

## Related Files
- `assets/js/synapse/data.js` - Data loading and node creation
- `assets/js/synapse/core.js` - Theme visibility and positioning logic
- `assets/js/node-panel.js` - Join/leave theme functions
- `migrations/CREATE_THEME_PARTICIPANTS.sql` - Database schema
