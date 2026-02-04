# Infinite Loop Fix - Theme Focus Error

## Issue
Console was flooded with thousands of errors:
```
⚠️ Node not found: theme:ec692dca-207a-4186-891e-0fdfc127f525
ℹ️ Falling back to activity view (centering on current user)
```

This created an infinite loop that degraded performance and filled the console.

## Root Cause
Circular event loop in the unified-network-synapse-bridge:

1. User clicks on a theme suggestion in START flow
2. `synapse:focus-theme` event fired with theme ID
3. Bridge tries to focus theme node via `unifiedApi.focusNode()`
4. Theme node doesn't exist in current network view
5. Core.js falls back to centering on current user
6. Unified API emits `node-focused` event for current user
7. Bridge converts this back to `synapse:focus-theme` event
8. **Loop back to step 2** → infinite recursion

## Solution

### 1. Pre-check Node Existence
Added validation before attempting to focus nodes:

```javascript
// Check if theme node exists before trying to focus
const nodes = window.unifiedNetworkIntegration?.state?.nodes || [];
const themeExists = nodes.some(n => n.id === themeNodeId);

if (!themeExists) {
  logger.warn('Theme node not found, skipping focus to prevent infinite loop');
  // Show user-friendly notification
  return; // Exit early, don't attempt focus
}
```

### 2. Prevent Circular Event Emission
Added guard flag to prevent re-emitting events that would cause loops:

```javascript
// Don't re-emit events that would cause circular loops
if (bridgeState.preventCircularEmit) {
  logger.debug('Skipping circular event emission');
  bridgeState.preventCircularEmit = false;
  return;
}
```

### 3. User-Friendly Notifications
Instead of silent failures, users now see helpful messages:
- "This theme is not currently visible in your network view."
- "This person or resource is not currently visible in your network view."

## Changes Made

### `assets/js/unified-network-synapse-bridge.js`

1. **Added `preventCircularEmit` flag** to bridge state
2. **Enhanced `focusThemeListener`**:
   - Pre-checks if theme node exists
   - Shows notification if not found
   - Returns early to prevent fallback loop
3. **Enhanced `focusNodeListener`**:
   - Pre-checks if node exists
   - Shows notification if not found (respects skipToast flag)
   - Returns early to prevent fallback loop
4. **Added circular emission guard** in `node-focused` event handler

## Testing
- Theme suggestions that don't exist in network view now fail gracefully
- No more infinite loops
- Console remains clean
- Users get helpful feedback instead of silent failures

## Impact
- **Performance**: Eliminated infinite loop that could freeze browser
- **UX**: Users now understand why a suggestion can't be focused
- **Debugging**: Console logs are now useful instead of flooded
- **Stability**: Prevents cascade failures in event system

## Files Modified
- `assets/js/unified-network-synapse-bridge.js`
