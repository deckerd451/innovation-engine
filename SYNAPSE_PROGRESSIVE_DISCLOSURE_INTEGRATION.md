# Synapse Progressive Disclosure - Integration Guide

## Quick Start

### 1. Add CSS
```html
<!-- In dashboard.html, add before </head> -->
<link rel="stylesheet" href="assets/css/synapse-progressive-disclosure.css">
```

### 2. Import Module
```javascript
// In assets/js/synapse/core.js
import ProgressiveDisclosure from './progressive-disclosure.js';
```

### 3. Initialize After Graph Build
```javascript
// In initSynapseView(), after buildGraph()
await buildGraph();

// Initialize progressive disclosure
ProgressiveDisclosure.init({
  svg,
  container,
  nodes,
  links,
  nodeEls,
  linkEls,
  themeEls,
  zoomBehavior
});

// Mark as ready
markSynapseReady();
```

## Detailed Integration Steps

### Step 1: Update Synapse Core

**File:** `assets/js/synapse/core.js`

```javascript
// Add import at top
import ProgressiveDisclosure from './progressive-disclosure.js';

// In initSynapseView(), after buildGraph()
async function initSynapseView() {
  // ... existing code ...
  
  await buildGraph();
  
  // NEW: Initialize progressive disclosure
  try {
    ProgressiveDisclosure.init({
      svg,
      container,
      nodes,
      links,
      nodeEls,
      linkEls,
      themeEls,
      projectEls,
      zoomBehavior,
      simulation
    });
    console.log('✅ Progressive Disclosure initialized');
  } catch (e) {
    console.error('❌ Progressive Disclosure init failed:', e);
  }
  
  // ... rest of existing code ...
  
  markSynapseReady();
}
```

### Step 2: Update Node Rendering

**File:** `assets/js/synapse/render.js`

```javascript
// In renderNodes(), after creating node groups
export function renderNodes(container, nodes, simulation) {
  // ... existing node creation code ...
  
  // NEW: Add state classes
  nodeEls.each(function(d) {
    const node = d3.select(this);
    
    // Add state class
    if (d.isCurrentUser) {
      node.classed('current-user', true);
    } else {
      node.classed('dormant', true);
    }
  });
  
  // NEW: Dispatch event for progressive disclosure
  window.dispatchEvent(new CustomEvent('synapse:nodes-rendered'));
  
  return nodeEls;
}
```

### Step 3: Update Zoom Behavior

**File:** `assets/js/synapse/core.js`

```javascript
// In setupSVG(), update zoom handler
function setupSVG() {
  // ... existing code ...
  
  zoomBehavior = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
      
      // NEW: Notify progressive disclosure of zoom change
      if (window.ProgressiveDisclosure) {
        ProgressiveDisclosure.handleZoomChange(event.transform.k, {
          svg,
          container,
          nodes,
          links,
          nodeEls,
          linkEls,
          themeEls
        });
      }
    });
  
  // ... rest of existing code ...
}
```

### Step 4: Add Mode Switcher HTML

**File:** `dashboard.html`

The mode switcher is created automatically by the progressive disclosure system, but you can add a container for it:

```html
<!-- In synapse-main-view, add this div -->
<div id="synapse-main-view" class="tab-pane">
  <svg id="synapse-svg"></svg>
  
  <!-- Mode switcher will be inserted here automatically -->
  <!-- Or add manually: -->
  <!-- <div id="synapse-mode-switcher-container"></div> -->
</div>
```

### Step 5: Update Node Panel Integration

**File:** `assets/js/node-panel.js`

```javascript
// When opening node panel, mark node as active
export function openNodePanel(nodeId) {
  // ... existing code ...
  
  // NEW: Notify progressive disclosure
  window.dispatchEvent(new CustomEvent('synapse:node-selected', {
    detail: { nodeId }
  }));
  
  // ... rest of existing code ...
}
```

## Configuration Options

### Custom Configuration

```javascript
// Override default config
ProgressiveDisclosure.init(synapseCore, {
  // Visual states
  states: {
    dormant: {
      opacity: 0.2,  // More transparent
      scale: 0.7,    // Smaller
      // ... other properties
    }
  },
  
  // Zoom thresholds
  zoom: {
    far: { max: 0.4 },
    mid: { min: 0.4, max: 1.8 },
    close: { min: 1.8 }
  },
  
  // Label limits
  maxVisibleLabels: 5,  // Show more labels
  
  // Animation
  transitionDuration: 200,  // Faster transitions
  
  // Touch
  longPressDuration: 600,  // Longer long-press
  
  // Default mode
  defaultMode: 'discovery'  // Start in discovery mode
});
```

### Mode Configuration

```javascript
// Add custom mode
ProgressiveDisclosure.config.modes.custom = {
  name: 'Custom Mode',
  description: 'Your custom view',
  maxDegree: 3,
  showThemes: true,
  motionLevel: 'moderate'
};
```

## Event Handling

### Listen to Events

```javascript
// Mode changed
window.addEventListener('synapse:mode-changed', (e) => {
  console.log('Mode changed to:', e.detail.mode);
});

// Node selected
window.addEventListener('synapse:node-selected', (e) => {
  console.log('Node selected:', e.detail.nodeId);
});

// Zoom changed
window.addEventListener('synapse:zoom-changed', (e) => {
  console.log('Zoom level:', e.detail.zoomLevel);
  console.log('Zoom tier:', e.detail.tier);
});

// User interacted
window.addEventListener('synapse:user-interacted', () => {
  console.log('User has interacted with synapse');
});
```

### Dispatch Events

```javascript
// Switch mode programmatically
window.dispatchEvent(new CustomEvent('synapse:switch-mode', {
  detail: { mode: 'focus' }
}));

// Focus on node
window.dispatchEvent(new CustomEvent('synapse:focus-node', {
  detail: { nodeId: 'user-123' }
}));

// Reset to dormant state
window.dispatchEvent(new CustomEvent('synapse:reset-state'));
```

## API Usage

### Programmatic Control

```javascript
// Get progressive disclosure instance
const pd = window.ProgressiveDisclosure || ProgressiveDisclosure;

// Apply states manually
pd.applyDormantState(synapseCore);
pd.applyAwareState(nodeEl, nodeData);
pd.applyActiveState(nodeEl, nodeData);

// Switch modes
pd.switchMode('myNetwork', synapseCore);
pd.switchMode('discovery', synapseCore);
pd.switchMode('focus', synapseCore);

// Handle zoom
pd.handleZoomChange(1.5, synapseCore);

// Access state
console.log('Current mode:', pd.state.currentMode);
console.log('Active node:', pd.state.activeNode);
console.log('Visible labels:', pd.state.visibleLabels);
console.log('Zoom level:', pd.state.currentZoomLevel);

// Access config
console.log('Modes:', pd.config.modes);
console.log('States:', pd.config.states);
console.log('Zoom tiers:', pd.config.zoom);
```

## Styling Customization

### Override CSS Variables

```css
/* Add to your custom CSS */
:root {
  --synapse-dormant-opacity: 0.2;
  --synapse-aware-opacity: 0.7;
  --synapse-active-opacity: 1.0;
  
  --synapse-glow-color: rgba(100, 200, 255, 0.6);
  --synapse-transition-duration: 300ms;
  
  --synapse-label-font-size: 12px;
  --synapse-label-font-size-mobile: 11px;
  
  --synapse-mode-switcher-bg: rgba(20, 20, 30, 0.95);
  --synapse-mode-button-bg: rgba(255, 255, 255, 0.05);
}
```

### Custom Node Styles

```css
/* Customize dormant state */
.node.dormant circle {
  opacity: 0.15;
  filter: grayscale(90%) brightness(0.6);
}

/* Customize active state */
.node.active circle {
  filter: grayscale(0%) brightness(1.3) drop-shadow(0 0 16px var(--synapse-glow-color));
}

/* Customize current user */
.node.current-user circle {
  stroke: #fff;
  stroke-width: 3px;
}
```

### Custom Mode Switcher

```css
/* Reposition mode switcher */
.synapse-mode-switcher {
  top: 100px;
  left: 20px;
  right: auto;
}

/* Custom button styles */
.mode-button {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.1), rgba(80, 150, 255, 0.1));
  border-radius: 12px;
}

.mode-button.active {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.3), rgba(80, 150, 255, 0.3));
}
```

## Testing Integration

### Manual Testing

```javascript
// Test in browser console

// 1. Check initialization
console.log('Progressive Disclosure:', window.ProgressiveDisclosure);

// 2. Test mode switching
window.ProgressiveDisclosure.switchMode('myNetwork', window.synapseCore);
window.ProgressiveDisclosure.switchMode('discovery', window.synapseCore);
window.ProgressiveDisclosure.switchMode('focus', window.synapseCore);

// 3. Test zoom handling
window.ProgressiveDisclosure.handleZoomChange(0.3, window.synapseCore); // Far
window.ProgressiveDisclosure.handleZoomChange(1.0, window.synapseCore); // Mid
window.ProgressiveDisclosure.handleZoomChange(2.0, window.synapseCore); // Close

// 4. Test state application
const testNode = d3.select('.node').filter(d => !d.isCurrentUser);
window.ProgressiveDisclosure.applyAwareState(testNode, testNode.datum());
window.ProgressiveDisclosure.applyActiveState(testNode, testNode.datum());
window.ProgressiveDisclosure.applyDormantState(window.synapseCore);

// 5. Check state
console.log('Current state:', window.ProgressiveDisclosure.state);
```

### Automated Testing

```javascript
// Test suite example
describe('Progressive Disclosure', () => {
  it('should initialize correctly', () => {
    expect(window.ProgressiveDisclosure).toBeDefined();
    expect(window.ProgressiveDisclosure.state.currentMode).toBe('myNetwork');
  });
  
  it('should switch modes', () => {
    window.ProgressiveDisclosure.switchMode('discovery', synapseCore);
    expect(window.ProgressiveDisclosure.state.currentMode).toBe('discovery');
  });
  
  it('should enforce label limit', () => {
    // Add more than 3 labels
    // Verify only 3 are visible
  });
  
  it('should handle zoom changes', () => {
    window.ProgressiveDisclosure.handleZoomChange(0.3, synapseCore);
    // Verify far zoom tier applied
  });
});
```

## Troubleshooting

### Issue: Progressive disclosure not initializing

**Check:**
1. CSS file is loaded
2. Module is imported correctly
3. `init()` is called after `buildGraph()`
4. No JavaScript errors in console

**Solution:**
```javascript
// Add error handling
try {
  ProgressiveDisclosure.init(synapseCore);
} catch (e) {
  console.error('Progressive Disclosure init failed:', e);
  console.error('Stack:', e.stack);
}
```

### Issue: Mode switcher not appearing

**Check:**
1. `#synapse-main-view` exists in DOM
2. CSS is loaded
3. No z-index conflicts

**Solution:**
```javascript
// Manually create mode switcher
const switcher = document.getElementById('synapse-mode-switcher');
if (!switcher) {
  console.warn('Mode switcher not found, creating manually');
  ProgressiveDisclosure.setupModeSwitcher();
}
```

### Issue: Touch interactions not working

**Check:**
1. Touch events are being attached
2. Touch targets are large enough (≥ 44px)
3. No event.preventDefault() blocking touches

**Solution:**
```javascript
// Debug touch events
document.addEventListener('touchstart', (e) => {
  console.log('Touch start:', e.target);
}, { passive: true });
```

### Issue: Labels not hiding

**Check:**
1. `enforceLabelLimit()` is being called
2. `maxVisibleLabels` config is correct
3. Label opacity transitions are working

**Solution:**
```javascript
// Force label limit enforcement
window.ProgressiveDisclosure.state.visibleLabels.clear();
window.ProgressiveDisclosure.applyDormantState(synapseCore);
```

### Issue: Zoom tiers not changing

**Check:**
1. Zoom event handler is attached
2. `handleZoomChange()` is being called
3. Zoom thresholds are correct

**Solution:**
```javascript
// Debug zoom events
svg.on('zoom', (event) => {
  console.log('Zoom:', event.transform.k);
  ProgressiveDisclosure.handleZoomChange(event.transform.k, synapseCore);
});
```

## Performance Optimization

### Debounce Zoom Handler

```javascript
// Debounce zoom updates for better performance
let zoomTimeout;
svg.on('zoom', (event) => {
  container.attr('transform', event.transform);
  
  clearTimeout(zoomTimeout);
  zoomTimeout = setTimeout(() => {
    ProgressiveDisclosure.handleZoomChange(event.transform.k, synapseCore);
  }, 100);
});
```

### Lazy Badge Rendering

```javascript
// Only render badges when needed
function showIconsAndBadges(nodeEl, nodeData) {
  // Check if badges already exist
  if (nodeEl.select('.xp-badge').empty()) {
    // Create badges on demand
    createBadges(nodeEl, nodeData);
  }
  
  // Show badges
  nodeEl.selectAll('.node-badge').attr('opacity', 1);
}
```

### Efficient Label Management

```javascript
// Use Set for O(1) lookups
const visibleLabels = new Set();

// Batch DOM updates
requestAnimationFrame(() => {
  nodeEls.each(function(d) {
    const shouldShow = visibleLabels.has(d.id);
    d3.select(this).select('text').attr('opacity', shouldShow ? 1 : 0);
  });
});
```

## Migration from Existing Synapse

### Before (Existing Code)

```javascript
// Old synapse initialization
await buildGraph();
markSynapseReady();
```

### After (With Progressive Disclosure)

```javascript
// New synapse initialization
await buildGraph();

// Add progressive disclosure
ProgressiveDisclosure.init(synapseCore);

markSynapseReady();
```

### Gradual Migration

1. **Phase 1**: Add CSS and module (no breaking changes)
2. **Phase 2**: Initialize progressive disclosure (opt-in)
3. **Phase 3**: Enable by default
4. **Phase 4**: Remove old visualization code

## Browser Compatibility

### Supported Browsers
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ iOS Safari 14+
- ✅ Chrome Android 90+

### Polyfills Needed
- None (uses modern JavaScript features available in all supported browsers)

### Fallbacks
- Reduced motion: Automatic detection
- Touch support: Automatic detection
- localStorage: Graceful degradation

## Resources

- **Documentation**: `SYNAPSE_PROGRESSIVE_DISCLOSURE.md`
- **Source Code**: `assets/js/synapse/progressive-disclosure.js`
- **Styles**: `assets/css/synapse-progressive-disclosure.css`
- **Examples**: See testing section above

---

**Version:** 1.0  
**Last Updated:** February 4, 2026  
**Status:** Ready for Integration
