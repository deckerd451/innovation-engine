# Theme Visibility Fix - Complete

## Problem
Themes were not appearing in the Synapse view even though they existed in the database. User had 4 theme participations but only saw 0-2 themes rendering.

## Root Cause
The `calculateNestedPosition()` function in `assets/js/synapse/core.js` had a logic error:

1. **Overlapping Conditions**: The code used `if (shouldShowTheme || showFullCommunity)` which meant both user themes AND discoverable themes tried to execute the same positioning code
2. **Array Index Error**: When a theme wasn't in the user's themes (`shouldShowTheme = false`), it tried to find its index in `myThemes` array, resulting in `myIndex = -1`
3. **Invalid Positioning**: Themes with `myIndex = -1` got invalid positions, causing rendering issues
4. **Hidden Flag**: Some themes were being marked with `hidden: true`, which caused them to be filtered out by `visibleNodes = nodes.filter(n => !n.hidden)` on line 1319

## Solution
Fixed the conditional logic to properly separate user themes from discoverable themes:

### Before (Broken):
```javascript
if (shouldShowTheme || showFullCommunity) {
  // Both user themes AND discoverable themes tried to use this code
  const myThemes = themes.filter(...);
  const myIndex = myThemes.findIndex(t => t.id === node.id); // -1 for discoverable themes!
  // ... positioning based on myIndex
}
```

### After (Fixed):
```javascript
if (shouldShowTheme) {
  // User's themes - position in INNER orbit
  const myThemes = themes.filter(...);
  const myIndex = myThemes.findIndex(t => t.id === node.id);
  // ... position close to center
  return { ..., hidden: false };
  
} else if (showFullCommunity) {
  // Discoverable themes - position in OUTER orbit
  const otherThemes = themes.filter(...);
  const otherIndex = otherThemes.findIndex(t => t.id === node.id);
  // ... position far from center
  return { ..., hidden: false };
  
} else {
  // Fallback: hide theme (should never happen since Discovery Mode is always on)
  return { ..., hidden: true };
}
```

## Changes Made

### 1. Fixed Theme Positioning Logic (`assets/js/synapse/core.js`)
- Changed overlapping `if (A || B)` to proper `if (A) {} else if (B) {} else {}`
- User's themes: positioned in inner orbit (close to center)
- Discoverable themes: positioned in outer orbit (far from center)
- All themes now explicitly set `hidden: false` in Discovery Mode

### 2. Added Debugging Support
- Exposed `window.synapseData` globally with `{ nodes, links, connectionsData, projectMembersData }`
- Added warning logs when themes can't be found in their respective arrays
- User can now run `window.synapseData.nodes.filter(n => n.type === 'theme')` in console to see all theme nodes

### 3. Improved Error Handling
- Added checks for `myIndex === -1` and `otherIndex === -1` with warning logs
- Added fallback branch for unexpected cases (though it should never execute)

## Testing
After this fix, you should see:
- ✅ All 12 themes from the database appear in the Synapse view
- ✅ Your 4 participated themes positioned close to center
- ✅ Other 8 discoverable themes positioned in outer orbit
- ✅ Console shows "Found 12 theme nodes" instead of "Found 0 theme nodes"
- ✅ No more "71 culled" messages for themes

## How to Verify
1. Hard refresh the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. Open browser console
3. Run: `window.synapseData.nodes.filter(n => n.type === 'theme').length`
4. Should return: `12` (or however many active themes you have)
5. Run: `window.synapseData.nodes.filter(n => n.type === 'theme' && n.user_is_participant).length`
6. Should return: `4` (your participated themes)

## Debug Commands
```javascript
// See all themes
window.synapseData.nodes.filter(n => n.type === 'theme')

// See your themes
window.synapseData.nodes.filter(n => n.type === 'theme' && n.user_is_participant)

// See discoverable themes
window.synapseData.nodes.filter(n => n.type === 'theme' && !n.user_is_participant)

// Check if any themes are hidden
window.synapseData.nodes.filter(n => n.type === 'theme' && n.hidden)
// Should return: [] (empty array)
```

## Status
✅ **FIXED** - Pushed to GitHub (commit d55745e8)

The fix ensures all themes appear in Discovery Mode (which is always enabled), with proper positioning based on user participation.
