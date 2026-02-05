// ================================================================
// GLOBAL ANIMATION LIFECYCLE CONTROLLER
// ================================================================
// Purpose: Single source of truth for all animation state
// Eliminates continuous main-thread work after initial render
// ================================================================

console.log('%c🎬 Animation Lifecycle Controller Loading...', 'color:#0ff; font-weight: bold; font-size: 16px');

// ================================================================
// STATE
// ================================================================

let animationState = 'IDLE'; // ACTIVE | IDLE | SLEEP
let isAnimating = false;
let rafId = null;
let idleTimeout = null;
let lastInteractionTime = Date.now();

const IDLE_DELAY = 5000; // 5 seconds of no interaction
const VELOCITY_THRESHOLD = 0.01; // Stop physics when below this

// Registered animation systems
const animationSystems = new Set();

// ================================================================
// ANIMATION STATES
// ================================================================

/**
 * ACTIVE: Full animations, 60fps, physics enabled
 * Triggered by: hover, drag, selection, search, view change
 */
function enterActiveState() {
  if (animationState === 'ACTIVE') return;
  
  console.log('🎬 Animation State: ACTIVE');
  animationState = 'ACTIVE';
  isAnimating = true;
  
  // Clear idle timeout
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  
  // Start animation loop
  startAnimationLoop();
  
  // Notify all systems
  animationSystems.forEach(system => {
    if (system.onActive) system.onActive();
  });
  
  // Emit event
  window.dispatchEvent(new CustomEvent('animation-state-changed', {
    detail: { state: 'ACTIVE' }
  }));
}

/**
 * IDLE: Physics stopped, no RAF, optional ultra-slow ambient (≤1fps)
 * Triggered after 3-5s of no interaction
 */
function enterIdleState() {
  if (animationState === 'IDLE') return;
  
  console.log('😴 Animation State: IDLE');
  animationState = 'IDLE';
  isAnimating = false;
  
  // Stop animation loop
  stopAnimationLoop();
  
  // Notify all systems
  animationSystems.forEach(system => {
    if (system.onIdle) system.onIdle();
  });
  
  // Emit event
  window.dispatchEvent(new CustomEvent('animation-state-changed', {
    detail: { state: 'IDLE' }
  }));
}

/**
 * SLEEP: All animations stopped, no timers, no rendering
 * Triggered when: tab hidden, window blurred, app backgrounded
 */
function enterSleepState() {
  if (animationState === 'SLEEP') return;
  
  console.log('💤 Animation State: SLEEP');
  animationState = 'SLEEP';
  isAnimating = false;
  
  // Stop animation loop
  stopAnimationLoop();
  
  // Clear idle timeout
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  
  // Notify all systems
  animationSystems.forEach(system => {
    if (system.onSleep) system.onSleep();
  });
  
  // Emit event
  window.dispatchEvent(new CustomEvent('animation-state-changed', {
    detail: { state: 'SLEEP' }
  }));
}

// ================================================================
// ANIMATION LOOP (Single RAF loop for entire app)
// ================================================================

function animationLoop(timestamp) {
  if (!isAnimating) {
    rafId = null;
    return;
  }
  
  // Render frame for all registered systems
  animationSystems.forEach(system => {
    if (system.onFrame) {
      try {
        system.onFrame(timestamp);
      } catch (err) {
        console.error('Animation system error:', err);
      }
    }
  });
  
  // Continue loop
  rafId = requestAnimationFrame(animationLoop);
}

function startAnimationLoop() {
  if (rafId !== null) return; // Already running
  
  console.log('▶️ Starting animation loop');
  rafId = requestAnimationFrame(animationLoop);
}

function stopAnimationLoop() {
  if (rafId === null) return; // Already stopped
  
  console.log('⏹️ Stopping animation loop');
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ================================================================
// INTERACTION TRACKING
// ================================================================

function recordInteraction() {
  lastInteractionTime = Date.now();
  
  // Enter active state
  enterActiveState();
  
  // Schedule idle transition
  if (idleTimeout) {
    clearTimeout(idleTimeout);
  }
  
  idleTimeout = setTimeout(() => {
    enterIdleState();
  }, IDLE_DELAY);
}

// ================================================================
// SYSTEM REGISTRATION
// ================================================================

/**
 * Register an animation system
 * @param {Object} system - Animation system with callbacks
 * @param {Function} system.onActive - Called when entering ACTIVE state
 * @param {Function} system.onIdle - Called when entering IDLE state
 * @param {Function} system.onSleep - Called when entering SLEEP state
 * @param {Function} system.onFrame - Called each animation frame (only in ACTIVE)
 */
export function registerAnimationSystem(system) {
  if (!system || typeof system !== 'object') {
    console.error('Invalid animation system');
    return;
  }
  
  animationSystems.add(system);
  console.log('✅ Registered animation system:', system.name || 'unnamed');
  
  // If currently active, notify the system
  if (animationState === 'ACTIVE' && system.onActive) {
    system.onActive();
  }
}

/**
 * Unregister an animation system
 */
export function unregisterAnimationSystem(system) {
  animationSystems.delete(system);
  console.log('❌ Unregistered animation system:', system.name || 'unnamed');
}

// ================================================================
// PUBLIC API
// ================================================================

export function startAnimations() {
  recordInteraction();
}

export function stopAnimations() {
  enterIdleState();
}

export function getAnimationState() {
  return animationState;
}

export function isActive() {
  return animationState === 'ACTIVE';
}

export function isIdle() {
  return animationState === 'IDLE';
}

export function isSleeping() {
  return animationState === 'SLEEP';
}

// ================================================================
// VISIBILITY CHANGE HANDLING
// ================================================================

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('👁️ Page hidden - entering SLEEP state');
    enterSleepState();
  } else {
    console.log('👁️ Page visible - entering ACTIVE state');
    recordInteraction();
  }
});

// Window blur/focus
window.addEventListener('blur', () => {
  console.log('👁️ Window blurred - entering SLEEP state');
  enterSleepState();
});

window.addEventListener('focus', () => {
  console.log('👁️ Window focused - entering ACTIVE state');
  recordInteraction();
});

// ================================================================
// INTERACTION LISTENERS
// ================================================================

// Track user interactions to trigger ACTIVE state
const interactionEvents = [
  'mousedown',
  'mousemove',
  'touchstart',
  'touchmove',
  'keydown',
  'wheel',
  'click'
];

interactionEvents.forEach(eventType => {
  document.addEventListener(eventType, () => {
    recordInteraction();
  }, { passive: true });
});

// ================================================================
// INITIALIZATION
// ================================================================

// Start in IDLE state (will transition to ACTIVE on first interaction)
enterIdleState();

// Export for global access
window.AnimationLifecycle = {
  registerSystem: registerAnimationSystem,
  unregisterSystem: unregisterAnimationSystem,
  startAnimations,
  stopAnimations,
  getState: getAnimationState,
  isActive,
  isIdle,
  isSleeping,
  recordInteraction
};

console.log('✅ Animation Lifecycle Controller ready');
console.log('   State:', animationState);
console.log('   Systems registered:', animationSystems.size);
