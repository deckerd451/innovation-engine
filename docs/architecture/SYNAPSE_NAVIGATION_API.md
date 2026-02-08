# Synapse Navigation API Reference

## Overview

The Synapse Navigation API provides a clean interface for routing users from START suggestions to specific nodes and themes in the Synapse network visualization.

## API Methods

### `window.synapseApi.open()`

Opens the Synapse view and closes the START modal.

```javascript
window.synapseApi.open();
```

**Use Case**: Switch from START to Synapse view

---

### `window.synapseApi.focusNode(nodeId)`

Focuses on a specific node (person, project, or organization) with distance-based dimming.

```javascript
window.synapseApi.focusNode('12345678-1234-1234-1234-123456789abc');
```

**Parameters**:
- `nodeId` (string, required): UUID of the node to focus on

**Use Cases**:
- Focus on a person
- Focus on a project
- Focus on an organization

---

### `window.synapseApi.focusTheme(themeId)`

Focuses on a theme and opens its theme card.

```javascript
window.synapseApi.focusTheme('12345678-1234-1234-1234-123456789abc');
```

**Parameters**:
- `themeId` (string, required): UUID of the theme (with or without `theme:` prefix)

**Use Cases**:
- Explore a theme
- View theme projects
- See theme participants

---

### `window.synapseApi.showActivity()`

Centers the view on the current user's node.

```javascript
window.synapseApi.showActivity();
```

**Use Cases**:
- Return to user's position
- Show user's connections
- View user's activity

---

## Events

The API uses custom events for decoupled communication:

### `synapse:focus-node`

Dispatched when a node should be focused.

```javascript
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { nodeId: '12345678-1234-1234-1234-123456789abc' }
}));
```

---

### `synapse:focus-theme`

Dispatched when a theme should be focused.

```javascript
window.dispatchEvent(new CustomEvent('synapse:focus-theme', {
  detail: { themeId: '12345678-1234-1234-1234-123456789abc' }
}));
```

---

### `synapse:show-activity`

Dispatched when the activity view should be shown.

```javascript
window.dispatchEvent(new CustomEvent('synapse:show-activity', {
  detail: { userId: '12345678-1234-1234-1234-123456789abc' }
}));
```

---

## Usage Examples

### Example 1: Route Person Suggestion

```javascript
// From START suggestion click
const personId = '12345678-1234-1234-1234-123456789abc';

// Open Synapse
window.synapseApi.open();

// Wait for view to open, then focus
setTimeout(() => {
  window.synapseApi.focusNode(personId);
}, 150);
```

---

### Example 2: Route Theme Suggestion

```javascript
// From START suggestion click
const themeId = '12345678-1234-1234-1234-123456789abc';

// Open Synapse
window.synapseApi.open();

// Wait for view to open, then focus theme
setTimeout(() => {
  window.synapseApi.focusTheme(themeId);
}, 150);
```

---

### Example 3: Route Coordination Suggestion

```javascript
// From coordination suggestion
const data = {
  subtype: 'theme_convergence',
  targetId: '12345678-1234-1234-1234-123456789abc'
};

// Open Synapse
window.synapseApi.open();

// Route based on subtype
setTimeout(() => {
  if (data.subtype === 'theme_convergence') {
    window.synapseApi.focusTheme(data.targetId);
  } else if (data.subtype === 'bridge_opportunity') {
    window.synapseApi.focusNode(data.targetId);
  } else if (data.subtype === 'momentum_shift') {
    window.synapseApi.focusNode(data.targetId);
  } else if (data.subtype === 'conversation_to_action') {
    window.synapseApi.showActivity();
  }
}, 150);
```

---

## Routing Logic

The routing system maps suggestion types to API methods:

| Suggestion Type | API Method | Notes |
|----------------|------------|-------|
| `person` | `focusNode()` | Focus on person node |
| `project` | `focusNode()` | Focus on project node |
| `project_join` | `focusNode()` | Focus on project node |
| `project_recruit` | `focusNode()` | Focus on project node |
| `theme` | `focusTheme()` | Focus on theme + open card |
| `org` | `focusNode()` | Focus on organization node |
| `coordination` (theme_convergence) | `focusTheme()` | Focus on converging theme |
| `coordination` (bridge_opportunity) | `focusNode()` | Focus on bridge person |
| `coordination` (momentum_shift) | `focusNode()` | Focus on active project |
| `coordination` (conversation_to_action) | `showActivity()` | Show user's activity |

---

## Best Practices

### 1. Always Add Delay After `open()`

```javascript
// ✅ Good
window.synapseApi.open();
setTimeout(() => {
  window.synapseApi.focusNode(nodeId);
}, 150);

// ❌ Bad
window.synapseApi.open();
window.synapseApi.focusNode(nodeId); // May fail - view not ready
```

### 2. Validate UUIDs

```javascript
function isUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

if (isUUID(targetId)) {
  window.synapseApi.focusNode(targetId);
} else {
  console.warn('Invalid UUID:', targetId);
}
```

### 3. Handle Missing API Gracefully

```javascript
if (window.synapseApi) {
  window.synapseApi.open();
  setTimeout(() => {
    window.synapseApi.focusNode(nodeId);
  }, 150);
} else {
  console.warn('synapseApi not available');
  // Fallback behavior
}
```

### 4. Log for Debugging

```javascript
console.log('🎯 Routing to person:', personId);
window.synapseApi.focusNode(personId);
```

---

## Error Handling

The API includes comprehensive error handling:

### Missing Dependencies

```javascript
// API checks for required dependencies
if (!nodeId || !nodes || !svg || !container || !zoomBehavior) {
  console.warn('⚠️ Cannot focus node - missing dependencies');
  return;
}
```

### Node Not Found

```javascript
// API searches for node and warns if not found
const node = nodes.find(n => n.id === nodeId);
if (!node) {
  console.warn('⚠️ Node not found:', nodeId);
  return;
}
```

### Invalid Theme ID

```javascript
// API handles both formats: "theme:uuid" and "uuid"
const themeNodeId = themeId.startsWith('theme:') ? themeId : `theme:${themeId}`;
const themeNode = nodes.find(n => n.id === themeNodeId || n.theme_id === themeId);
```

---

## Testing

Use the test file to verify the implementation:

```bash
# Open in browser
open test-synapse-navigation.html
```

The test suite includes:
1. API availability tests
2. Navigation tests
3. Event system tests
4. Routing tests
5. UUID validation tests

---

## Console Logging

All API calls log to console for debugging:

```
🌐 synapseApi.open() called
🎯 synapseApi.focusNode() called: 12345678-1234-1234-1234-123456789abc
🎯 Handling synapse:focus-node event: 12345678-1234-1234-1234-123456789abc
👤 Routing to person: 12345678-1234-1234-1234-123456789abc
```

---

## Integration Points

### START Integration (`start-integration.js`)

```javascript
function handleSuggestionCTA(handler, data) {
  // Open Synapse
  window.synapseApi.open();
  
  // Route based on type
  setTimeout(() => {
    if (data.suggestionType === 'person') {
      window.synapseApi.focusNode(data.targetId);
    } else if (data.suggestionType === 'theme') {
      window.synapseApi.focusTheme(data.targetId);
    }
    // ... etc
  }, 150);
}
```

### UI Integration (`ui.js`)

```javascript
viewPerson(personId) {
  if (window.synapseApi) {
    window.synapseApi.open();
    setTimeout(() => {
      window.synapseApi.focusNode(personId);
    }, 150);
    return;
  }
  // Fallback behavior
}
```

---

## Architecture

```
START Suggestion Click
        ↓
handleSuggestionCTA()
        ↓
window.synapseApi.open()
        ↓
[150ms delay]
        ↓
window.synapseApi.focusNode/focusTheme/showActivity()
        ↓
CustomEvent dispatched
        ↓
Event listener in core.js
        ↓
setFocusOnNode() / openThemeCard()
        ↓
Synapse view updated
```

---

## Dependencies

- **D3.js**: For zoom and transitions
- **focus-system.js**: For `setFocusOnNode()`, `centerOnNode()`, `applyDistanceBasedDimming()`
- **core.js**: For `openThemeCard()`, `findCurrentUserNode()`
- **Synapse initialization**: Must be initialized before API is available

---

## Browser Compatibility

- Modern browsers with ES6+ support
- CustomEvent API support
- D3.js v7+ compatible

---

## Future Enhancements

1. **Animation Polish**
   - Particle effects during transition
   - Pulse effect on focused node
   - Trail animation from START to Synapse

2. **Context Preservation**
   - Remember which suggestion was clicked
   - Show "From START suggestion" badge
   - Allow "Back to START" quick action

3. **Keyboard Navigation**
   - Arrow keys to navigate suggestions
   - Enter to activate
   - Escape to close

4. **Analytics**
   - Track suggestion click rates
   - Measure time to action
   - A/B test routing strategies

---

## Support

For issues or questions:
1. Check console logs for error messages
2. Run test suite in `test-synapse-navigation.html`
3. Verify Synapse is initialized: `console.log(window.synapseApi)`
4. Check that nodes exist: `console.log(window.__synapseStats)`

---

**Last Updated**: January 31, 2026
**Version**: 1.0.0
**Status**: Production Ready
