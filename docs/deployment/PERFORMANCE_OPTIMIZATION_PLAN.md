# Performance Optimization Implementation Plan

## Status: Step 1 Complete ✅

### Completed:
- ✅ Created Global Animation Lifecycle Controller (`assets/js/animation-lifecycle.js`)
- ✅ Added to dashboard.html
- ✅ Implements three-tier state system (ACTIVE/IDLE/SLEEP)
- ✅ Single RAF loop for entire app
- ✅ Visibility change handling
- ✅ Interaction tracking

## Remaining Steps

### Step 2: Integrate Physics Loop with Lifecycle Controller

**File:** `assets/js/unified-network/physics-loop.js`

**Changes needed:**
```javascript
import { registerAnimationSystem, isActive } from '../animation-lifecycle.js';

// Register with lifecycle controller
registerAnimationSystem({
  name: 'PhysicsLoop',
  
  onActive() {
    // Resume physics
    this.start();
  },
  
  onIdle() {
    // Stop physics completely
    this.stop();
  },
  
  onSleep() {
    // Stop physics completely
    this.stop();
  },
  
  onFrame(timestamp) {
    // Only tick if active
    if (isActive() && this.isRunning) {
      this.tick();
    }
  }
});

// In simulation tick: stop when velocity < threshold
if (simulation.alpha() < 0.01) {
  window.AnimationLifecycle.stopAnimations();
}
```

### Step 3: Update Neural Background Canvas

**File:** `assets/js/neuralBackground.js`

**Changes needed:**
```javascript
import { registerAnimationSystem, isActive } from './animation-lifecycle.js';

let animationId = null;

registerAnimationSystem({
  name: 'NeuralBackground',
  
  onActive() {
    // Start canvas animation
    if (!animationId) {
      animate();
    }
  },
  
  onIdle() {
    // Stop canvas animation
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  },
  
  onSleep() {
    // Stop canvas animation
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }
});

function animate() {
  if (!isActive()) {
    animationId = null;
    return;
  }
  
  // Render frame
  renderFrame();
  
  animationId = requestAnimationFrame(animate);
}
```

### Step 4: Convert Presence/Pulse to Timer-Based

**File:** `assets/js/presence-session-manager.js`

**Changes needed:**
```javascript
// REMOVE any RAF-based pulse animations
// REPLACE with setInterval

// Instead of:
// requestAnimationFrame(updatePulse);

// Use:
setInterval(() => {
  if (document.hidden) return; // Skip if hidden
  updatePresenceIndicators();
}, 2000); // Update every 2 seconds

// For visual pulses, use CSS animations instead:
// .presence-pulse {
//   animation: pulse 2s ease-in-out infinite;
// }
```

### Step 5: Update Node Renderer

**File:** `assets/js/unified-network/node-renderer.js`

**Changes needed:**
```javascript
import { isActive } from '../animation-lifecycle.js';

// In render() method:
render(nodes, state) {
  // Only render if active OR if this is a forced render
  if (!isActive() && !state.forceRender) {
    return;
  }
  
  // ... existing render logic
}

// Stop continuous rendering when idle
// Only render on state changes or interactions
```

### Step 6: Update Synapse Core

**File:** `assets/js/synapse/core.js`

**Changes needed:**
```javascript
import { registerAnimationSystem, recordInteraction } from '../animation-lifecycle.js';

// Register synapse with lifecycle
registerAnimationSystem({
  name: 'SynapseCore',
  
  onActive() {
    // Resume simulation if needed
    if (simulation) {
      simulation.restart();
    }
  },
  
  onIdle() {
    // Stop simulation
    if (simulation) {
      simulation.stop();
    }
  },
  
  onSleep() {
    // Stop simulation
    if (simulation) {
      simulation.stop();
    }
  }
});

// On user interactions (drag, click, hover):
function handleNodeDrag() {
  recordInteraction(); // Triggers ACTIVE state
  // ... existing drag logic
}
```

### Step 7: Kill Infinite Loops

**Files to check:**
- `assets/js/synapse/realtime.js`
- `assets/js/pathway-animations.js`
- `assets/js/comprehensive-fixes.js`
- Any file with `requestAnimationFrame` or continuous `setInterval`

**Pattern to find:**
```bash
grep -r "requestAnimationFrame" assets/js/
grep -r "setInterval" assets/js/ | grep -v "// "
```

**Fix pattern:**
```javascript
// BEFORE (infinite loop):
function animate() {
  requestAnimationFrame(animate);
  render();
}

// AFTER (lifecycle-controlled):
import { isActive } from './animation-lifecycle.js';

function animate() {
  if (!isActive()) return; // Stop when idle
  requestAnimationFrame(animate);
  render();
}
```

### Step 8: CSS-Based Pulses

**File:** `assets/css/base.css` or relevant CSS file

**Add:**
```css
/* Replace JS-based pulses with CSS */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}

.presence-indicator {
  animation: pulse 2s ease-in-out infinite;
}

/* Pause animations when page is hidden */
:root:not(:focus-within) .presence-indicator {
  animation-play-state: paused;
}
```

## Testing Checklist

After implementing all steps:

### Performance Profile Test
1. Open Chrome DevTools → Performance tab
2. Start recording
3. Load the page
4. Wait 10 seconds without interaction
5. Stop recording

**Expected result:**
- ✅ Initial burst of activity (1-2 seconds)
- ✅ Long idle gaps (green/white space)
- ✅ No continuous green/purple bars
- ✅ CPU near zero when idle

### Interaction Test
1. Hover over nodes → Should feel instant
2. Drag nodes → Should be smooth
3. Click search → Should respond immediately
4. Switch tabs → Should stop all activity
5. Return to tab → Should resume smoothly

### Visual Regression Test
- ✅ Animations still work when interacting
- ✅ No visual glitches
- ✅ Smooth transitions
- ✅ No "frozen" appearance

## Files Modified Summary

### Created:
- `assets/js/animation-lifecycle.js` ✅

### To Modify:
- `dashboard.html` ✅
- `assets/js/unified-network/physics-loop.js`
- `assets/js/neuralBackground.js`
- `assets/js/presence-session-manager.js`
- `assets/js/unified-network/node-renderer.js`
- `assets/js/synapse/core.js`
- `assets/js/synapse/realtime.js`
- `assets/js/pathway-animations.js`
- `assets/css/base.css` (or relevant CSS)

## Priority Order

1. **HIGH**: Physics loop integration (biggest CPU impact)
2. **HIGH**: Neural background (continuous canvas rendering)
3. **MEDIUM**: Presence/pulse conversion to timers
4. **MEDIUM**: Node renderer optimization
5. **LOW**: CSS-based animations (nice-to-have)

## Acceptance Criteria

- [ ] Performance trace shows idle time after 5 seconds
- [ ] No continuous RAF loops remain
- [ ] Scrolling and clicking feel instant
- [ ] No visual regression during interaction
- [ ] Tab switching stops all activity
- [ ] CPU usage near zero when idle

## Notes

- The Animation Lifecycle Controller is now the single source of truth
- All animation systems must register with it
- No system should run its own RAF loop
- Interactions automatically trigger ACTIVE state
- Idle timeout is 5 seconds (configurable in animation-lifecycle.js)

---

**Status:** Foundation complete, ready for integration
**Next Step:** Integrate physics loop with lifecycle controller
**Estimated Time:** 2-3 hours for full implementation
