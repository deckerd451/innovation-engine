# Synapse Progressive Disclosure - Quick Reference

## 🎯 Core Concept

**Progressive Disclosure** = Show only what matters, reveal details on demand

## 📊 Visual States

| State | Opacity | Saturation | Label | Icons | Glow |
|-------|---------|------------|-------|-------|------|
| **Dormant** | 25% | 20% | ❌ | ❌ | ❌ |
| **Aware** | 70% | 60% | ✅ | ❌ | ✅ |
| **Active** | 100% | 100% | ✅ | ✅ | ✅ |

## 🔍 Zoom Tiers

| Zoom | Range | Avatars | Labels | Icons | Purpose |
|------|-------|---------|--------|-------|---------|
| **Far** | < 0.5x | ❌ | ❌ | ❌ | Overview |
| **Mid** | 0.5-1.5x | ✅ | Selective | ❌ | Navigation |
| **Close** | ≥ 1.5x | ✅ | ✅ | ✅ | Details |

## 🎮 Modes

### My Network (Default Mobile)
- First + second-degree connections only
- Minimal motion
- No themes
- **Best for**: Focused work

### Discovery (Default Desktop)
- Full network visible
- Themes available
- Moderate motion
- **Best for**: Exploration

### Focus
- Dims everything except selected path
- No motion
- Clear next action
- **Best for**: Task completion

## 📱 Mobile Interactions

| Action | Gesture | Result |
|--------|---------|--------|
| **Hover** | Tap | Node becomes aware |
| **Select** | Tap (active node) | Node becomes active |
| **Details** | Long-press (500ms) | Opens node panel |
| **Zoom** | Pinch | Changes semantic density |
| **Pan** | Drag | Moves canvas |

## 📏 Label Rules

- **Maximum**: 3 labels visible at once
- **Priority**: Current user → Active node → Strongest connection
- **Mobile**: 11px font size
- **Desktop**: 12px font size
- **Overflow**: Automatic prevention

## 🎨 Icon & Badge Rules

- **Hidden by default**
- **Show when**: Node is active AND zoom ≥ 1.5x
- **Types**: XP badge, Streak badge, Theme icons
- **Mobile**: No stacking

## ⚡ Quick Integration

### 1. Add CSS
```html
<link rel="stylesheet" href="assets/css/synapse-progressive-disclosure.css">
```

### 2. Import & Initialize
```javascript
import ProgressiveDisclosure from './progressive-disclosure.js';

// After buildGraph()
ProgressiveDisclosure.init(synapseCore);
```

### 3. Done!
The system handles everything automatically.

## 🔧 API Cheat Sheet

```javascript
const pd = window.ProgressiveDisclosure;

// Switch modes
pd.switchMode('myNetwork', synapseCore);
pd.switchMode('discovery', synapseCore);
pd.switchMode('focus', synapseCore);

// Apply states
pd.applyDormantState(synapseCore);
pd.applyAwareState(nodeEl, nodeData);
pd.applyActiveState(nodeEl, nodeData);

// Handle zoom
pd.handleZoomChange(zoomLevel, synapseCore);

// Check state
console.log(pd.state.currentMode);
console.log(pd.state.activeNode);
console.log(pd.state.visibleLabels);
```

## 🎯 Events

```javascript
// Listen
window.addEventListener('synapse:mode-changed', (e) => {
  console.log('Mode:', e.detail.mode);
});

// Dispatch
window.dispatchEvent(new CustomEvent('synapse:switch-mode', {
  detail: { mode: 'focus' }
}));
```

## 🎨 CSS Customization

```css
/* Override defaults */
:root {
  --synapse-dormant-opacity: 0.2;
  --synapse-aware-opacity: 0.7;
  --synapse-active-opacity: 1.0;
  --synapse-glow-color: rgba(100, 200, 255, 0.6);
  --synapse-transition-duration: 300ms;
}

/* Custom node styles */
.node.dormant circle {
  opacity: 0.15;
}

.node.active circle {
  filter: drop-shadow(0 0 16px var(--synapse-glow-color));
}
```

## 🧪 Testing

```javascript
// Test in console
window.ProgressiveDisclosure.switchMode('discovery', window.synapseCore);
window.ProgressiveDisclosure.handleZoomChange(2.0, window.synapseCore);
console.log(window.ProgressiveDisclosure.state);
```

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Not initializing | Check CSS loaded, module imported, init() called |
| Mode switcher missing | Check #synapse-main-view exists |
| Touch not working | Check touch targets ≥ 44px |
| Labels not hiding | Check enforceLabelLimit() called |
| Zoom not changing | Check zoom handler attached |

## 📊 Performance Targets

- **60fps** canvas dragging
- **< 100ms** state transitions
- **< 50ms** tap response
- **Smooth** on iPhone 8+

## ♿ Accessibility

- ✅ Keyboard navigation
- ✅ Focus indicators
- ✅ Screen reader support
- ✅ High contrast mode
- ✅ Reduced motion

## 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: ≥ 1025px

## 🎓 First-Time Experience

1. User node pulses once (600ms)
2. Helper text: "This is your network. Start here."
3. Auto-dismisses on interaction or after 10s
4. Never shows again

## 📚 Documentation

- **Full Docs**: `SYNAPSE_PROGRESSIVE_DISCLOSURE.md`
- **Integration**: `SYNAPSE_PROGRESSIVE_DISCLOSURE_INTEGRATION.md`
- **Source**: `assets/js/synapse/progressive-disclosure.js`
- **Styles**: `assets/css/synapse-progressive-disclosure.css`

## ✅ Success Criteria

User should understand:
- ✅ Where they are (current user is visually dominant)
- ✅ What matters now (only relevant info visible)
- ✅ What to ignore (dormant nodes fade away)

UI should feel:
- ✅ Calm on phones
- ✅ Powerful on desktop
- ✅ Never overwhelming

---

**Version:** 1.0  
**Status:** Ready for Production  
**Mobile-First:** ✅  
**Accessibility:** ✅  
**Performance:** ✅
