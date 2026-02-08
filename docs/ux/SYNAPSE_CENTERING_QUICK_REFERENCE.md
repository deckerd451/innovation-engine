# Synapse Centering - Quick Reference

## TL;DR

The Synapse view now automatically centers on the current user on load and smoothly navigates to any node when selected via search.

## Quick Start

### Center on a Node

```javascript
// Simple centering (preserves zoom)
window.centerOnNode('user-123');

// With custom zoom
window.centerOnNode('project-456', { scale: 1.5 });

// Instant (no animation)
window.centerOnNode('theme-789', { skipAnimation: true });
```

### Focus on a Node (Center + Dim Others)

```javascript
// Focus with dimming effect
window.focusOnNode('user-123');

// Custom duration
window.focusOnNode('project-456', { duration: 1000 });
```

### Return Home

```javascript
// Center on current user
window.centerOnCurrentUser();
```

### Event-Driven API (Recommended)

```javascript
// Best for external integrations
window.synapseApi.focusNode('user-123');
window.synapseApi.focusTheme('theme-uuid');
window.synapseApi.showActivity();
```

## Options

All centering functions accept an optional `options` object:

```javascript
{
  duration: 750,        // Animation duration in ms
  scale: null,          // Target zoom (null = preserve current)
  skipAnimation: false  // Skip animation for instant centering
}
```

## Common Use Cases

### Search Result → Focus

```javascript
// Automatically handled by search-integration.js
// Just call:
window.synapseApi.focusNode(resultId);
```

### Pathway Animation → Focus

```javascript
// Dispatch event to focus without toast
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { 
    nodeId: targetId,
    skipToast: true 
  }
}));
```

### START Suggestion → Focus

```javascript
// Open Synapse and focus on suggestion
window.synapseApi.open();
window.synapseApi.focusNode(suggestionId);
```

### Home Button

```javascript
// Return to user-centered view
window.centerOnCurrentUser();
```

## Debugging

```javascript
// Check if ready
window.synapseApi.debug.isReady();

// Get all nodes
window.synapseApi.debug.getNodes();

// Test centering
window.centerOnNode('user-123');
```

## State Tracking

The system tracks:
- `currentFocusedNodeId` - Currently focused node
- `isDefaultUserFocus` - Whether showing default user view

## Behavior

### On Load
- Automatically centers on current user after simulation settles
- Smooth 1000ms animation with scale 1.0
- Falls back to canvas center if user node not found

### On Search
- Closes search modal
- Centers on selected node
- Applies distance-based dimming
- Preserves zoom level

### On Focus
- Centers the node in viewport
- Dims distant nodes (0-200px: full, 200-500px: fade, 500px+: dim)
- Dims links based on endpoint distances
- Smooth transitions (300ms)

## Events

```javascript
// Focus on node
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { nodeId: 'user-123', skipToast: false }
}));

// Focus on theme
window.dispatchEvent(new CustomEvent('synapse:focus-theme', {
  detail: { themeId: 'theme-uuid' }
}));

// Show activity
window.dispatchEvent(new CustomEvent('synapse:show-activity', {
  detail: { userId: 'user-123' }
}));
```

## Full Documentation

See `docs/SYNAPSE_CENTERING_API.md` for complete API reference.
