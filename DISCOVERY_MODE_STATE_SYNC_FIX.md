# Discovery Mode State Synchronization Fix

## Problem

Discovery mode toggle wasn't working properly:

1. **Button showed wrong state**: Button said "Discovery Mode" (green) but full community was already visible
2. **Toggle didn't work**: Clicking the button didn't change anything
3. **State desync**: Auto-discovery enabled full community view but button didn't know about it

## Root Cause

**State Synchronization Issue**: The synapse core module has a local `showFullCommunity` variable that wasn't properly synced with the global `window.synapseShowFullCommunity` state that the UI button reads.

**Timeline of the bug**:
1. User loads dashboard with ≤10 visible nodes
2. Auto-discovery activates: `showFullCommunity = true` (local variable)
3. Network reloads showing full community (50+ nodes)
4. Button checks `window.synapseShowFullCommunity` → still `false` (not updated!)
5. Button shows "Discovery Mode" (green) even though discovery is already ON
6. Clicking button tries to toggle but state is already confused

## Solution

### 1. Update Global State in Auto-Discovery

When auto-discovery activates, immediately update the global state:

```javascript
if (visibleNodes.length <= 10) {
  if (!showFullCommunity) {
    showFullCommunity = true;
    window.synapseShowFullCommunity = showFullCommunity; // ✅ Update global
    
    // ✅ Update button UI
    if (typeof window.updateDiscoveryButtonState === 'function') {
      window.updateDiscoveryButtonState();
    }
    
    await reloadAllData();
    await rebuildGraph();
    return;
  }
}
```

### 2. Expose Button Update Function Globally

Allow synapse core to update the button state:

```javascript
// In dashboard-actions.js
const updateDiscoveryButton = () => {
  const currentMode = window.synapseShowFullCommunity || false;
  if (currentMode) {
    discoveryBtnText.textContent = 'My Network';
    discoveryBtn.style.background = 'linear-gradient(135deg, #ff6b6b, #ff8c8c)';
  } else {
    discoveryBtnText.textContent = 'Discovery Mode';
    discoveryBtn.style.background = 'linear-gradient(135deg, #00ff88, #00e0ff)';
  }
};

// ✅ Expose globally
window.updateDiscoveryButtonState = updateDiscoveryButton;
```

### 3. Call Button Update After Toggle

Ensure button updates after manual toggle:

```javascript
export async function toggleFullCommunityView(show) {
  // ... toggle logic ...
  
  window.synapseShowFullCommunity = showFullCommunity; // ✅ Update global
  
  await reloadAllData();
  await rebuildGraph();
  
  // ✅ Update button
  if (typeof window.updateDiscoveryButtonState === 'function') {
    window.updateDiscoveryButtonState();
  }
}
```

### 4. Delay Initial Button State Check

Give synapse time to initialize before checking state:

```javascript
// Initial state - check after a delay to let synapse initialize
setTimeout(() => {
  updateDiscoveryButton();
  console.log('🔍 Initial discovery button state set');
}, 1000);
```

## How It Works Now

### Scenario 1: Auto-Discovery Activates (New User)

1. User loads dashboard
2. Synapse counts visible nodes: 6 nodes (≤10 threshold)
3. Auto-discovery activates:
   - Sets `showFullCommunity = true`
   - Sets `window.synapseShowFullCommunity = true` ✅
   - Calls `window.updateDiscoveryButtonState()` ✅
4. Button updates to show "My Network" (red) ✅
5. Network reloads with full community (50+ nodes)

### Scenario 2: Manual Toggle (Experienced User)

1. User clicks "My Network" button (currently in discovery mode)
2. Click handler calls `window.toggleFullCommunityView()`
3. Toggle function:
   - Sets `showFullCommunity = false`
   - Sets `window.synapseShowFullCommunity = false` ✅
   - Calls `window.updateDiscoveryButtonState()` ✅
4. Button updates to show "Discovery Mode" (green) ✅
5. Network reloads with filtered view (only connections)

## Console Logs for Debugging

### When Auto-Discovery Activates:
```
🔍 Limited content found, enabling discovery mode...
🌐 Discovery mode enabled - reloading data...
🔍 Updating discovery button, current mode: true
```

### When User Clicks Toggle:
```
🔍 Discovery button clicked
🔍 Current state BEFORE toggle: true
🔍 toggleFullCommunityView available: function
🔍 Calling toggleFullCommunityView...
🌐 Synapse view mode: My Network (showFullCommunity=false)
🔍 Toggle complete, new mode: false
🔍 Updating discovery button, current mode: false
```

## Files Modified

1. **assets/js/synapse/core.js**
   - Auto-discovery updates `window.synapseShowFullCommunity`
   - Auto-discovery calls `window.updateDiscoveryButtonState()`
   - `toggleFullCommunityView()` calls `window.updateDiscoveryButtonState()`
   - Added logging to show boolean values

2. **assets/js/dashboard-actions.js**
   - Exposed `updateDiscoveryButton` as `window.updateDiscoveryButtonState`
   - Delayed initial state check by 1 second
   - Added logging to show state before/after toggle

## Testing Checklist

### Test 1: Auto-Discovery State Sync
- [x] Load dashboard with few connections (≤10 nodes)
- [x] Auto-discovery activates
- [x] Button shows "My Network" (red) ✅
- [x] Full community visible (50+ nodes)
- [x] Console shows state sync logs

### Test 2: Manual Toggle from Discovery to Filtered
- [x] Button shows "My Network" (red)
- [x] Click button
- [x] Button changes to "Discovery Mode" (green)
- [x] Network reloads with fewer nodes
- [x] Console shows toggle logs

### Test 3: Manual Toggle from Filtered to Discovery
- [x] Button shows "Discovery Mode" (green)
- [x] Click button
- [x] Button changes to "My Network" (red)
- [x] Network reloads with more nodes
- [x] Console shows toggle logs

### Test 4: Multiple Toggles
- [x] Toggle back and forth multiple times
- [x] Button state always matches network state
- [x] No state desync issues

## About Projects

**Note**: You mentioned "only 2 projects are showing" - this is actually correct behavior in the current architecture!

**How Projects Work**:
- Projects are NOT separate nodes in the graph
- Projects are embedded WITHIN theme nodes
- Projects appear as small circles/overlays on their parent themes
- You see 2 project overlays because you have 2 themes with projects

**To see more projects**:
1. Assign more projects to themes (use Admin Panel → Manage Projects)
2. Projects without `theme_id` won't appear in synapse
3. Each theme shows its projects as small circles within the theme circle

## Status: FIXED ✅

Discovery mode toggle now works correctly:
- Button state syncs with actual network state
- Auto-discovery updates button immediately
- Manual toggle works in both directions
- State stays consistent across reloads

## Next Steps (Optional)

1. **Persist Mode Preference**: Save user's preferred mode in localStorage
2. **Smooth Transitions**: Animate nodes when switching modes
3. **Project Visibility**: Make projects more prominent in the visualization
4. **Onboarding**: Add tooltip explaining the two modes on first visit
