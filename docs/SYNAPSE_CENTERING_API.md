# Synapse Centering & Focus API

## Overview

The Synapse view provides a robust centering and focus system that automatically centers on the current user on load and allows smooth navigation to any node via search or programmatic API calls.

## Architecture

### Core Components

1. **focus-system.js** - Core centering logic and state management
2. **core.js** - Integration with Synapse graph and event handling
3. **search-integration.js** - Search result → focus routing

### State Management

The system tracks:
- `currentFocusedNodeId` - ID of the currently focused node
- `isDefaultUserFocus` - Whether showing default user-centered view
- `currentFocalNode` - Node object for distance-based dimming

## Default Behavior

### On Load (Initialization)

When the Synapse view initializes:

1. Graph simulation runs and positions all nodes
2. After simulation settles (alpha < 0.1, tickCount > 50):
   - System finds the current user's node
   - Automatically centers on the user node
   - Applies smooth animation (1000ms duration)
   - Sets `isDefaultUserFocus = true`

**Fallback**: If user node cannot be resolved, logs warning and centers on canvas center.

### Search → Focus Interaction

When a user searches and selects a result:

1. Search modal closes
2. `synapseApi.focusNode(nodeId)` is called
3. System checks if Synapse is ready
4. If ready: Centers on node with smooth animation
5. If not ready: Queues focus request for replay after initialization
6. Node becomes visually emphasized (distance-based dimming)
7. Previous focus is cleared
8. Sets `isDefaultUserFocus = false`

## API Reference

### Global Functions

#### `window.centerOnNode(nodeId, options)`

Centers the view on a specific node without applying focus effects.

**Parameters:**
- `nodeId` (string) - ID of the node to center on
- `options` (object, optional):
  - `duration` (number) - Animation duration in ms (default: 750)
  - `scale` (number|null) - Target zoom level, null preserves current zoom (default: null)
  - `skipAnimation` (boolean) - Skip animation for instant centering (default: false)

**Returns:** `boolean` - Success status

**Example:**
```javascript
// Center on a node with default animation
window.centerOnNode('user-123');

// Center with custom zoom and duration
window.centerOnNode('project-456', { 
  duration: 500, 
  scale: 1.5 
});

// Instant centering (no animation)
window.centerOnNode('theme-789', { 
  skipAnimation: true 
});
```

#### `window.focusOnNode(nodeId, options)`

Centers on a node AND applies distance-based dimming effects.

**Parameters:**
- `nodeId` (string) - ID of the node to focus on
- `options` (object, optional) - Same as `centerOnNode`

**Returns:** `boolean` - Success status

**Example:**
```javascript
// Focus on a person (center + dim others)
window.focusOnNode('user-123');

// Focus with custom options
window.focusOnNode('project-456', { 
  duration: 1000, 
  scale: 1.2 
});
```

#### `window.centerOnCurrentUser()`

Returns to "home" position by centering on the current user's node.

**Returns:** `boolean` - Success status

**Example:**
```javascript
// Return to home view
window.centerOnCurrentUser();
```

### Synapse API (Event-Driven)

#### `window.synapseApi.focusNode(nodeId)`

Event-driven focus system with readiness checking and queueing.

**Parameters:**
- `nodeId` (string) - ID of the node to focus on

**Features:**
- Automatically queues if Synapse not ready
- Replays queued focus after initialization
- Dispatches `synapse:focus-node` event
- Handles fallback to current user if node not found

**Example:**
```javascript
// Focus via event system (recommended for external integrations)
window.synapseApi.focusNode('user-123');
```

#### `window.synapseApi.focusTheme(themeId)`

Focus on a theme node and open its card.

**Parameters:**
- `themeId` (string) - ID of the theme (with or without 'theme:' prefix)

**Example:**
```javascript
window.synapseApi.focusTheme('theme-uuid-here');
// or
window.synapseApi.focusTheme('uuid-here'); // Auto-prefixes with 'theme:'
```

#### `window.synapseApi.showActivity()`

Centers on the current user's node (activity view).

**Example:**
```javascript
window.synapseApi.showActivity();
```

## Centering Mechanics

### Zoom Behavior

- **Default**: Preserves current zoom level when centering
- **Custom**: Can specify target zoom via `scale` option
- **Initial Load**: Uses scale 1.0 for balanced view

### Animation

- **Duration**: Default 750ms, customizable
- **Easing**: Cubic-out for smooth deceleration
- **Skip**: Can disable for instant centering

### Canvas Bounds

- Centering calculates position to place node at viewport center
- Respects D3 zoom behavior constraints (scaleExtent: [0.2, 4])
- No hard clamping - allows panning beyond bounds

## Distance-Based Dimming

When focusing on a node, other nodes are dimmed based on distance:

- **Focal node**: Full opacity (1.0)
- **0-200px**: Full brightness (1.0)
- **200-500px**: Linear fade (1.0 → 0.4)
- **500px+**: Very dim (0.2)

Links are also dimmed based on endpoint distances.

## Event System

### Custom Events

#### `synapse:focus-node`
Dispatched when focusing on a node.

**Detail:**
```javascript
{
  nodeId: string,
  skipToast: boolean // Optional, prevents fallback toast
}
```

#### `synapse:focus-theme`
Dispatched when focusing on a theme.

**Detail:**
```javascript
{
  themeId: string
}
```

#### `synapse:show-activity`
Dispatched when showing activity view.

**Detail:**
```javascript
{
  userId: string
}
```

## Integration Examples

### Search Integration

```javascript
// In search-integration.js
async function openPersonResult(personId) {
  window.closeEnhancedSearch();
  window.synapseApi.open(); // Show Synapse view
  window.synapseApi.focusNode(personId); // Focus on person
}
```

### START Sequence Integration

```javascript
// From START suggestions
window.synapseApi.open(); // Switch to Synapse
window.synapseApi.focusNode(suggestedPersonId); // Focus on suggestion
```

### Pathway Animations

```javascript
// When clicking a pathway animation
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { 
    nodeId: targetId,
    skipToast: true // Don't show "not found" toast
  }
}));
```

## Success Criteria

✅ **On load**: User immediately sees themselves centered
✅ **Search**: Clicking a result always centers that node in view
✅ **Smooth**: All transitions use easing and feel natural
✅ **Predictable**: Centering behavior is consistent and reliable
✅ **Spatial coherence**: Users maintain orientation during navigation

## Non-Goals

❌ Does not re-layout the graph
❌ Does not reset zoom unless explicitly specified
❌ Does not hardcode node positions
❌ Does not modify simulation forces

## Debugging

### Console Commands

```javascript
// Check current focus state
window.synapseApi.debug.isReady(); // Check if Synapse is ready
window.synapseApi.debug.getNodes(); // Get all nodes
window.synapseApi.debug.getLinks(); // Get all links

// Test centering
window.centerOnNode('user-123');
window.focusOnNode('project-456');
window.centerOnCurrentUser();

// Test event system
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { nodeId: 'user-123' }
}));
```

### Logging

Enable debug logging by adding `?debug` to URL:
```
https://charlestonhacks.com/dashboard.html?debug
```

This will log:
- Viewport height updates
- Focus state changes
- Node centering operations
- Event dispatches

## Performance Considerations

- Centering uses D3 transitions (GPU-accelerated)
- Distance calculations are O(n) where n = visible nodes
- Dimming animations are debounced (300ms)
- Initial centering waits for simulation to settle (prevents jank)

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (including iOS)
- Mobile: Touch-friendly, respects viewport constraints

## Future Enhancements

- [ ] Breadcrumb trail showing navigation history
- [ ] "Back" button to return to previous focus
- [ ] Keyboard shortcuts (arrow keys for navigation)
- [ ] Mini-map showing current viewport position
- [ ] Smooth path animation between focuses
