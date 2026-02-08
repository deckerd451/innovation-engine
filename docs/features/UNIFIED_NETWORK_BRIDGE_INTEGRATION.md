# Unified Network - Synapse Bridge Integration

## Overview

The Synapse Bridge provides deep integration between the new Unified Network Discovery system and the existing legacy Synapse visualization. This ensures seamless backward compatibility while enabling a smooth transition to the new system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (dashboard.js, search-integration.js, node-panel.js, etc.) │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Synapse Bridge Layer                       │
│  • Event forwarding (bidirectional)                          │
│  • Window function enhancement                               │
│  • Focus system integration                                  │
│  • Search integration                                        │
│  • Graceful fallback                                         │
└──────────┬────────────────────────────────┬─────────────────┘
           │                                │
           ▼                                ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│  Unified Network     │      │   Legacy Synapse             │
│  Discovery System    │      │   Visualization              │
│  (New)               │      │   (Existing)                 │
└──────────────────────┘      └──────────────────────────────┘
```

## Key Features

### 1. Bidirectional Event Forwarding

**Legacy → Unified:**
- `synapse:focus-node` → `unifiedNetworkApi.focusNode()`
- `synapse:focus-theme` → `unifiedNetworkApi.focusNode(themeNodeId)`
- `synapse:show-activity` → `unifiedNetworkApi.centerOnCurrentUser()`

**Unified → Legacy:**
- `node-focused` → `synapse:focus-node` / `synapse:focus-theme`
- `state-changed` → Updates legacy UI components
- `action-completed` → Refreshes legacy stats

### 2. Window Function Enhancement

The bridge enhances existing window functions to work transparently with both systems:

```javascript
// Before bridge:
window.focusOnNode(nodeId) // Only works with legacy synapse

// After bridge:
window.focusOnNode(nodeId) // Works with unified network OR legacy synapse
                           // Automatically routes to active system
                           // Falls back gracefully on errors
```

Enhanced functions:
- `window.focusOnNode(nodeId, options)`
- `window.centerOnNode(nodeId, options)`
- `window.centerOnCurrentUser()`
- `window.openSearchResult(type, id)`

### 3. Focus System Integration

The bridge ensures the focus system works seamlessly:

```javascript
// Existing code continues to work:
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { nodeId: 'user-123' }
}));

// Bridge automatically routes to:
// - Unified network (if enabled)
// - Legacy synapse (if unified disabled or failed)
```

### 4. Search Integration

Search results work with both systems:

```javascript
// Search result click:
window.openSearchResult('person', 'user-123');

// Bridge routes to active system:
// - Unified: unifiedNetworkApi.focusNode('user-123')
// - Legacy: window.synapseApi.focusNode('user-123')
```

### 5. Graceful Fallback

If unified network fails to initialize or encounters errors:

1. Bridge detects the failure
2. Automatically switches to legacy synapse
3. All function calls route to legacy system
4. User experience is uninterrupted

## Usage

### Initialization

The bridge initializes automatically after both systems are loaded:

```javascript
// In main.js:
window.addEventListener('profile-loaded', async (e) => {
  // Initialize unified network
  await window.unifiedNetworkIntegration.init(user.id);
  
  // Initialize bridge (automatic integration)
  window.synapseBridge.init();
});
```

### Checking Active System

```javascript
// Get active system
const activeSystem = window.synapseBridge.getActiveSystem();
// Returns: 'unified' or 'legacy'

// Check if unified is active
if (window.synapseBridge.isUnifiedActive()) {
  console.log('Using unified network');
}

// Check if legacy is active
if (window.synapseBridge.isLegacyActive()) {
  console.log('Using legacy synapse');
}
```

### Getting Bridge State

```javascript
const state = window.synapseBridge.getState();
console.log(state);
// {
//   initialized: true,
//   unifiedNetworkAvailable: true,
//   legacySynapseAvailable: true,
//   activeSystem: 'unified',
//   eventListeners: [...]
// }
```

## Integration Points

### 1. Synapse Core (`assets/js/synapse/core.js`)

**No changes required!** The bridge works with existing synapse events:

```javascript
// Existing code in synapse/core.js:
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { nodeId }
}));

// Bridge automatically forwards to unified network
```

### 2. Focus System (`assets/js/synapse/focus-system.js`)

**No changes required!** The bridge enhances window functions:

```javascript
// Existing code in focus-system.js:
export function centerOnNode(node, svg, container, zoomBehavior, options) {
  // ... existing implementation
}

// Bridge wraps this to work with unified network too
```

### 3. Search Integration (`assets/js/search-integration.js`)

**No changes required!** The bridge enhances search handlers:

```javascript
// Existing code in search-integration.js:
async function openPersonResult(personId) {
  window.synapseApi.focusNode(personId);
}

// Bridge ensures this works with unified network too
```

## Testing

### Running Bridge Tests

```javascript
// From browser console:
const tests = new BridgeIntegrationTests();
const results = await tests.runAll();

console.log(`Passed: ${results.passed}/${results.total}`);
console.log('Results:', results.results);
```

### Admin Panel

Press `Ctrl+Shift+U` to open the admin panel, then click "Run Integration Test" to test:

1. Bridge initialization
2. System detection
3. Event forwarding (both directions)
4. Window function enhancement
5. Focus system integration
6. Search integration
7. Fallback behavior
8. Backward compatibility
9. Performance impact

### Test Coverage

The bridge includes 10 comprehensive integration tests:

1. ✅ Bridge Initialization - Verifies bridge loads correctly
2. ✅ System Detection - Checks active system detection
3. ✅ Legacy → Unified Events - Tests event forwarding
4. ✅ Unified → Legacy Events - Tests reverse forwarding
5. ✅ Window Function Enhancement - Verifies function wrapping
6. ✅ Focus System Integration - Checks focus event handling
7. ✅ Search Integration - Verifies search result routing
8. ✅ Fallback Behavior - Tests graceful degradation
9. ✅ Backward Compatibility - Ensures legacy API preserved
10. ✅ Performance Impact - Measures overhead

## Performance

The bridge is designed for minimal performance impact:

- **Initialization:** < 10ms
- **Event forwarding:** < 1ms per event
- **Function call overhead:** < 0.1ms
- **Memory footprint:** ~3-5 event listeners
- **No polling or timers**

## Backward Compatibility

### Existing Code Works Unchanged

All existing code continues to work without modifications:

```javascript
// ✅ Works with both systems:
window.focusOnNode('user-123');
window.centerOnCurrentUser();
window.synapseApi.focusNode('user-123');
window.dispatchEvent(new CustomEvent('synapse:focus-node', { ... }));
```

### Legacy API Preserved

The legacy `window.synapseApi` remains available:

```javascript
// Legacy API still works:
window.synapseApi.open();
window.synapseApi.focusNode(nodeId);
window.synapseApi.focusTheme(themeId);
window.synapseApi.showActivity();
```

### Feature Flag Control

Users can toggle between systems without code changes:

```javascript
// Enable unified network:
localStorage.setItem('enable-unified-network', 'true');
location.reload();

// Disable unified network (use legacy):
localStorage.removeItem('enable-unified-network');
location.reload();
```

## Troubleshooting

### Bridge Not Initializing

**Symptom:** Bridge state shows `initialized: false`

**Solutions:**
1. Check if both systems are loaded:
   ```javascript
   console.log('Unified:', typeof window.unifiedNetworkIntegration);
   console.log('Legacy:', typeof window.synapseApi);
   ```

2. Check for initialization errors:
   ```javascript
   const state = window.synapseBridge.getState();
   console.log('Error:', state.error);
   ```

3. Verify script load order in `dashboard.html`:
   - synapse.js (legacy)
   - unified-network-integration.js
   - unified-network-synapse-bridge.js ← Must be after both
   - main.js

### Events Not Forwarding

**Symptom:** Focus events don't work with unified network

**Solutions:**
1. Check if bridge is initialized:
   ```javascript
   console.log(window.synapseBridge.getState().initialized);
   ```

2. Check active system:
   ```javascript
   console.log(window.synapseBridge.getActiveSystem());
   ```

3. Check event listeners:
   ```javascript
   const state = window.synapseBridge.getState();
   console.log('Listeners:', state.eventListeners.length);
   ```

### Fallback Not Working

**Symptom:** App breaks when unified network fails

**Solutions:**
1. Check if legacy synapse is available:
   ```javascript
   console.log(typeof window.synapseApi);
   ```

2. Check fallback state:
   ```javascript
   const state = window.synapseBridge.getState();
   console.log('Fallback active:', state.activeSystem === 'legacy');
   ```

3. Force fallback for testing:
   ```javascript
   localStorage.removeItem('enable-unified-network');
   location.reload();
   ```

## Migration Path

### Phase 1: Bridge Installation (Current)
- ✅ Bridge installed and tested
- ✅ Both systems run in parallel
- ✅ Feature flag controls which is active
- ✅ Graceful fallback to legacy

### Phase 2: Gradual Rollout (Next)
- Enable unified network for beta users
- Monitor performance and errors
- Collect user feedback
- Fix issues as they arise

### Phase 3: Full Deployment (Future)
- Enable unified network for all users
- Keep legacy synapse as fallback
- Monitor stability

### Phase 4: Legacy Deprecation (Long-term)
- Remove legacy synapse code
- Remove bridge (no longer needed)
- Unified network becomes primary system

## Files

### Core Bridge Files
- `assets/js/unified-network-synapse-bridge.js` - Main bridge implementation
- `assets/js/unified-network/integration-test-bridge.js` - Bridge integration tests

### Integration Files
- `assets/js/unified-network-integration.js` - Unified network integration
- `assets/js/unified-network-admin.js` - Admin control panel
- `main.js` - Bridge initialization
- `dashboard.html` - Script loading

### Documentation
- `UNIFIED_NETWORK_BRIDGE_INTEGRATION.md` - This file
- `DASHBOARD_INTEGRATION_GUIDE.md` - General integration guide
- `UNIFIED_NETWORK_PROJECT_SUMMARY.md` - Project overview

## API Reference

### `window.synapseBridge`

#### Methods

**`init()`**
Initialize the bridge. Call after both systems are loaded.

**`getActiveSystem()`**
Returns: `'unified'` or `'legacy'`

**`isUnifiedActive()`**
Returns: `boolean` - True if unified network is active

**`isLegacyActive()`**
Returns: `boolean` - True if legacy synapse is active

**`getState()`**
Returns: Bridge state object with:
- `initialized: boolean`
- `unifiedNetworkAvailable: boolean`
- `legacySynapseAvailable: boolean`
- `activeSystem: 'unified' | 'legacy'`
- `eventListeners: Array`

**`cleanup()`**
Remove all event listeners and reset bridge state.

## Support

For issues or questions:
1. Check this documentation
2. Run bridge integration tests
3. Check browser console for errors
4. Review `DASHBOARD_INTEGRATION_GUIDE.md`
5. Contact development team

## Version History

- **v1.0** (2026-02-01) - Initial bridge implementation
  - Bidirectional event forwarding
  - Window function enhancement
  - Focus system integration
  - Search integration
  - Graceful fallback
  - Comprehensive testing
