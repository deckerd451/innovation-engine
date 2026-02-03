# Theme Visibility Bug Fix

## Problem
Themes that users were connected to (via `theme_participants` table) were not appearing in the synapse view. In fact, NO nodes were appearing at all - console showed "🎨 Rendered 0 nodes (71 culled)".

## Root Causes

### Critical Bug #1: Missing showFullCommunity Parameter
The `calculateNestedPosition` function was using `showFullCommunity` in its logic but the parameter was NOT being passed when the function was called. This caused `showFullCommunity` to be `undefined`, which evaluates to `false`, resulting in ALL nodes being marked as `hidden: true`.

```javascript
// BEFORE (BROKEN):
function calculateNestedPosition(
  node, allNodes, allLinks, centerX, centerY, currentUserCommunityId
) {
  // showFullCommunity is undefined here!
  if (!shouldShowTheme && !showFullCommunity) {
    return { hidden: true }; // ALL themes hidden!
  }
}

// Called without showFullCommunity:
calculateNestedPosition(node, nodes, links, centerX, centerY, currentUserCommunityId);
```

### Bug #2: Incorrect Theme Participation Check
The theme visibility logic was trying to recalculate theme participation by checking if `userThemes.includes(node.theme_id)`, but this was unreliable.

```javascript
// BEFORE (BROKEN):
const isUserConnected = userThemes.includes(node.theme_id);
```

## Solution

### Fix #1: Pass showFullCommunity Parameter
```javascript
// AFTER (FIXED):
function calculateNestedPosition(
  node, allNodes, allLinks, centerX, centerY, currentUserCommunityId,
  showFullCommunity = true // Added parameter with default
) {
  // Now showFullCommunity is properly defined
}

// Called WITH showFullCommunity:
calculateNestedPosition(
  node, nodes, links, centerX, centerY, currentUserCommunityId, showFullCommunity
);
```

### Fix #2: Use Pre-computed Flag
The theme node already has a pre-computed `user_is_participant` flag that is calculated correctly during data loading:

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


## Why This Caused "0 nodes rendered (71 culled)"

When `showFullCommunity` was `undefined`:
1. **Themes**: All themes without user participation were marked `hidden: true` (even in Discovery Mode)
2. **People**: All people without theme participation were marked `hidden: true`
3. **Projects**: Projects in hidden themes were also affected
4. **Result**: Nearly all nodes were hidden, showing "0 nodes rendered (71 culled)"

The fix ensures `showFullCommunity` is properly passed and defaults to `true` (Discovery Mode), allowing all nodes to be visible by default.
