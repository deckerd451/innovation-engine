# Synapse Progressive Disclosure System

## Overview

A mobile-first, calm, guided network visualization system that reduces visual overwhelm through progressive disclosure, visual hierarchy, and responsive behavior.

## Core Principles

### 1. Single Visual Authority
- **Current user node** is the only fully saturated, high-contrast element on first load
- All other nodes start in **dormant state** (low opacity, desaturated, minimal motion)
- Details appear only through user intent (hover, tap, zoom, focus)

### 2. Progressive Disclosure
- Never show all information at once
- Information reveals through interaction:
  - **Tap/Hover** → Node becomes aware
  - **Select** → Node becomes active, connections wake
  - **Zoom** → Semantic density changes

### 3. Mobile-First Responsive
- All interactions work with tap, long-press, pinch, and drag
- Hover behaviors have tap equivalents
- Layout adapts from small screens upward
- Minimum 44px touch targets

## Node Visual States

### Dormant State (Default)
```javascript
{
  opacity: 0.25,
  scale: 0.8,
  saturation: 0.2,
  showLabel: false,
  showIcons: false,
  showBadges: false,
  glow: false
}
```

**Appearance:**
- Small dots or simplified avatars
- 25% opacity
- Grayscale (80%)
- No labels, icons, or badges
- Minimal or no motion

### Aware State (Tap/Hover/Proximity)
```javascript
{
  opacity: 0.7,
  scale: 1.0,
  saturation: 0.6,
  showLabel: true,
  showIcons: false,
  showBadges: false,
  glow: true,
  glowIntensity: 0.3
}
```

**Appearance:**
- Avatar fades in (80% opacity)
- Name label appears
- Single soft glow ring
- Subtle scale increase (no bounce)

### Active State (Selected/Focused)
```javascript
{
  opacity: 1.0,
  scale: 1.2,
  saturation: 1.0,
  showLabel: true,
  showIcons: true,
  showBadges: true,
  glow: true,
  glowIntensity: 0.6
}
```

**Appearance:**
- Full color and saturation
- Connected nodes partially wake
- Connection lines animate gently
- Icons and badges appear (only at close zoom)

## Text & Label Rules

### Maximum Visible Labels: 3
1. Current user (always visible)
2. Focused node
3. Optional strongest connection

### Label Behavior
- All other names appear:
  - On tap (mobile)
  - On hover (desktop)
- Labels scale and reposition responsively
- Automatic overflow prevention on small screens
- Font size: 11px (mobile), 12px (desktop)

### Label Management
```javascript
// Enforces 3-label limit
function enforceLabelLimit() {
  // Keeps current user + active node
  // Removes oldest labels beyond limit
}
```

## Icon & Badge Rules

### Hidden by Default
Icons (XP, streaks, rockets, lightning) are hidden until:
- Node is active
- A theme is explicitly filtered
- An achievement or action is triggered

### Display Conditions
- **Only at close zoom** (zoom level ≥ 1.5)
- **Only for active nodes**
- No stacked icon clusters on mobile

### Badge Types
- **XP Badge** - Top right
- **Streak Badge** - Bottom right
- **Theme Icons** - Top left (Discovery mode only)

## Zoom = Meaning (Semantic Density)

### Far Zoom (< 0.5x)
```javascript
{
  showAvatars: false,
  showLabels: false,
  clustering: true
}
```
- Abstract dots only
- No avatars or labels
- Density clustering allowed
- Overview of network structure

### Mid Zoom (0.5x - 1.5x)
```javascript
{
  showAvatars: true,
  showLabels: 'selective',
  clustering: false
}
```
- Avatars visible
- Selective labels (important nodes only)
- Limited connections shown
- Balanced detail level

### Close Zoom (≥ 1.5x)
```javascript
{
  showAvatars: true,
  showLabels: true,
  clustering: false
}
```
- Full node detail
- All labels visible
- Badges, themes, actions visible
- Clear interaction affordances

## Motion & Animation Rules

### Default Behavior
- Very slow or no ambient motion
- Respects `prefers-reduced-motion`

### Motion Allowed For
1. **Tap/selection feedback** - 300ms transitions
2. **Connection highlighting** - Gentle line animation
3. **Achievement moments** - Celebratory effects

### Forbidden
- Constant pulsing or rotating elements
- Excessive bounce animations
- Distracting background motion

## Mode-Based Complexity Control

### My Network Mode
```javascript
{
  name: 'My Network',
  description: 'Your direct connections',
  maxDegree: 2,
  showThemes: false,
  motionLevel: 'minimal'
}
```
- Only first + second-degree connections
- Minimal motion
- No themes by default
- **Default on mobile**

### Discovery Mode
```javascript
{
  name: 'Discovery',
  description: 'Explore the full network',
  maxDegree: Infinity,
  showThemes: true,
  motionLevel: 'moderate'
}
```
- Expanded network
- Themes available
- Slightly higher motion (still controlled)
- **Default on desktop**

### Focus Mode
```javascript
{
  name: 'Focus',
  description: 'Clear path to your goal',
  maxDegree: 1,
  showThemes: false,
  motionLevel: 'none',
  dimUnrelated: true
}
```
- Everything dims except selected path
- Clear "next action" affordance
- Designed for task completion
- No distractions

### Mode Persistence
- Modes are saved to `localStorage`
- Persist across sessions
- User preference respected

## Mobile-Specific Requirements

### Touch Interactions
- **Tap** = hover equivalent
- **Long-press** (500ms) = open node details
- **Pinch zoom** = adjust semantic layer
- **Drag canvas** = smooth at 60fps

### Touch Targets
- Minimum 44px safe touch targets
- Invisible larger hit areas for small nodes
- No accidental taps

### Layout Adaptations
- Labels never overflow screen edges
- Mode switcher moves to bottom on mobile
- Responsive font sizes
- Optimized spacing

## First-Time Experience

### No Modals or Tutorials
Instead:
1. User node pulses once (600ms)
2. Helper text appears: "This is your network. Start here."
3. Helper text fades after first interaction
4. Auto-dismisses after 10 seconds

### Helper Positioning
- **Mobile**: Bottom center, above mode switcher
- **Desktop**: Near current user node

### Dismissal
- Click "Got it" button
- Any user interaction
- Auto-dismiss after 10s

## Implementation

### Files Created
1. **assets/js/synapse/progressive-disclosure.js** - Core logic
2. **assets/css/synapse-progressive-disclosure.css** - Styles

### Integration
```javascript
// In synapse/core.js
import ProgressiveDisclosure from './progressive-disclosure.js';

// After graph is built
ProgressiveDisclosure.init(synapseCore);
```

### CSS Integration
```html
<!-- In dashboard.html -->
<link rel="stylesheet" href="assets/css/synapse-progressive-disclosure.css">
```

## API

### Initialize
```javascript
ProgressiveDisclosure.init(synapseCore);
```

### Apply States
```javascript
// Dormant (default)
ProgressiveDisclosure.applyDormantState(synapseCore);

// Aware (hover/proximity)
ProgressiveDisclosure.applyAwareState(nodeEl, nodeData);

// Active (selected)
ProgressiveDisclosure.applyActiveState(nodeEl, nodeData);
```

### Handle Zoom
```javascript
ProgressiveDisclosure.handleZoomChange(zoomLevel, synapseCore);
```

### Switch Modes
```javascript
ProgressiveDisclosure.switchMode('myNetwork', synapseCore);
ProgressiveDisclosure.switchMode('discovery', synapseCore);
ProgressiveDisclosure.switchMode('focus', synapseCore);
```

### Events
```javascript
// Mode switching
window.dispatchEvent(new CustomEvent('synapse:switch-mode', {
  detail: { mode: 'discovery' }
}));

// User interaction
window.dispatchEvent(new CustomEvent('synapse:user-interacted'));

// Nodes rendered
window.dispatchEvent(new CustomEvent('synapse:nodes-rendered'));
```

## Success Criteria

A new user should understand:
1. **Where they are** - Current user node is visually dominant
2. **What matters now** - Only relevant information is visible
3. **What they can safely ignore** - Dormant nodes fade into background

The UI should feel:
- **Calm on phones** - Not overwhelming, clear hierarchy
- **Powerful on desktop** - More details available on demand
- **Never overwhelming** - Progressive disclosure prevents information overload

## Responsive Breakpoints

### Mobile (< 768px)
- Mode switcher at bottom
- Smaller fonts (11px)
- Simplified badges
- Touch-optimized interactions

### Tablet (768px - 1024px)
- Mode switcher at top right
- Medium fonts (12px)
- Balanced detail level
- Hybrid touch/mouse support

### Desktop (≥ 1025px)
- Mode switcher at top right
- Full fonts (12px)
- All details available
- Hover enhancements

## Accessibility

### Keyboard Navigation
- All nodes focusable
- Focus indicators visible
- Tab order logical

### Screen Readers
- Semantic HTML
- ARIA labels on interactive elements
- Status announcements for mode changes

### High Contrast Mode
- Increased stroke widths
- Higher opacity values
- Clear visual boundaries

### Reduced Motion
- All animations disabled
- Instant state transitions
- No filter effects

## Performance

### Optimization Strategies
1. **CSS transitions** instead of JavaScript animations
2. **Debounced zoom handlers** (prevent excessive updates)
3. **Lazy badge rendering** (only at close zoom)
4. **Efficient label management** (max 3 visible)
5. **GPU acceleration** (transform, opacity)

### Target Performance
- **60fps** canvas dragging
- **< 100ms** state transitions
- **< 50ms** tap response
- **Smooth** on iPhone 8+ and equivalent Android

## Testing Checklist

### Visual States
- [ ] Dormant state renders correctly
- [ ] Aware state on hover (desktop)
- [ ] Aware state on tap (mobile)
- [ ] Active state on selection
- [ ] Current user always visible

### Labels
- [ ] Max 3 labels enforced
- [ ] Labels don't overflow screen
- [ ] Labels scale responsively
- [ ] Labels hide/show smoothly

### Icons & Badges
- [ ] Hidden by default
- [ ] Show only at close zoom
- [ ] Show only for active nodes
- [ ] No stacking on mobile

### Zoom
- [ ] Far zoom shows dots only
- [ ] Mid zoom shows selective labels
- [ ] Close zoom shows all details
- [ ] Smooth transitions between tiers

### Modes
- [ ] My Network filters correctly
- [ ] Discovery shows full network
- [ ] Focus dims unrelated nodes
- [ ] Mode persists across sessions

### Mobile
- [ ] Tap works like hover
- [ ] Long-press opens details
- [ ] Pinch zoom adjusts density
- [ ] Drag is smooth (60fps)
- [ ] Touch targets ≥ 44px

### First-Time Experience
- [ ] User node pulses once
- [ ] Helper text appears
- [ ] Helper dismisses on interaction
- [ ] Helper auto-dismisses after 10s
- [ ] Doesn't show again after dismissed

### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Screen reader friendly
- [ ] High contrast mode supported
- [ ] Reduced motion respected

## Troubleshooting

### Issue: Labels not hiding
**Solution:** Check `enforceLabelLimit()` is being called

### Issue: Icons always visible
**Solution:** Verify zoom level check in `showIconsAndBadges()`

### Issue: Touch targets too small
**Solution:** Check invisible hit area is being added

### Issue: Mode not persisting
**Solution:** Verify localStorage is working

### Issue: First-time helper not showing
**Solution:** Clear `synapse-intro-seen` from localStorage

## Future Enhancements

### Planned Features
1. **Adaptive complexity** - Auto-adjust based on device performance
2. **Gesture shortcuts** - Swipe to switch modes
3. **Voice control** - "Show my network"
4. **Haptic feedback** - Vibration on mobile interactions
5. **Smart clustering** - Automatic grouping at far zoom
6. **Path highlighting** - Show connection paths between nodes
7. **Mini-map** - Overview navigation on mobile

### Experimental
- **AR mode** - View network in augmented reality
- **VR mode** - Immersive network exploration
- **AI suggestions** - "You might want to connect with..."

## Resources

- **Design System**: Follows CharlestonHacks visual language
- **Icons**: Font Awesome 6
- **Animations**: CSS transitions + D3 transitions
- **Touch**: Native touch events + D3 drag
- **Storage**: localStorage for preferences

---

**Version:** 1.0  
**Last Updated:** February 4, 2026  
**Status:** Ready for Implementation  
**Mobile-First:** ✅  
**Accessibility:** ✅  
**Performance:** ✅
