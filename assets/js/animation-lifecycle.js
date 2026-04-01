// ================================================================
// GLOBAL ANIMATION LIFECYCLE CONTROLLER
// ================================================================
// Purpose: Single source of truth for all animation state
// Eliminates continuous main-thread work after initial render
// ================================================================

// Lightweight debug helper — mirrors window.log.isDebugMode() but works
// before the logger module has been evaluated.
function _isDebug() {
  try { return localStorage.getItem('DEBUG') === '1'; } catch { return false; }
}

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

  if (_isDebug()) console.log('🎬 Animation State: ACTIVE');
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

  if (_isDebug()) console.log('😴 Animation State: IDLE');
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

  if (_isDebug()) console.log('💤 Animation State: SLEEP');
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
  rafId = requestAnimationFrame(animationLoop);
}

function stopAnimationLoop() {
  if (rafId === null) return; // Already stopped
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ================================================================
// AUTH-AWARE ACTIVATION GATE
// ================================================================
// Animations should only enter ACTIVE when the authenticated UI
// (graph / synapse) is actually visible. Before auth resolves the
// user is staring at the login screen — no reason to spin up 60fps.
// ================================================================

let uiActive = false; // true once authenticated UI is shown

function activateUI() {
  if (uiActive) return;
  uiActive = true;
  console.log('🎬 Animation UI gate opened (authenticated UI visible)');
  attachInteractionListeners();
}

function deactivateUI() {
  if (!uiActive) return;
  uiActive = false;
  enterIdleState();
  detachInteractionListeners();
  console.log('🎬 Animation UI gate closed');
}

// Listen for app-ready (auth.js emits this when showAppUI runs)
window.addEventListener('app-ready', () => activateUI(), { once: false });

// Also accept boot-gate AUTH_READY for safety
window.addEventListener('auth-ready', () => {
  // Only activate if the main-content is actually visible
  const mc = document.getElementById('main-content');
  if (mc && !mc.classList.contains('hidden')) {
    activateUI();
  }
});

// Deactivate on logout
window.addEventListener('user-logged-out', () => deactivateUI());

// ================================================================
// INTERACTION TRACKING
// ================================================================

function recordInteraction() {
  // Gate: ignore interactions when authenticated UI is not visible
  if (!uiActive) return;

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
  if (_isDebug()) console.log('✅ Registered animation system:', system.name || 'unnamed');
  
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
  if (_isDebug()) console.log('❌ Unregistered animation system:', system.name || 'unnamed');
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
  if (!uiActive) return;
  if (document.hidden) {
    enterSleepState();
  } else {
    recordInteraction();
  }
});

// Window blur/focus
window.addEventListener('blur', () => {
  if (!uiActive) return;
  enterSleepState();
});

window.addEventListener('focus', () => {
  if (!uiActive) return;
  // Only wake from SLEEP (user returning to a backgrounded window).
  // Do NOT call recordInteraction() when the page is in its initial boot
  // state — the browser fires 'focus' immediately on page load, which
  // would otherwise cause a spurious IDLE→ACTIVE→IDLE cycle.
  if (animationState === 'SLEEP') {
    if (_isDebug()) console.log('👁️ Window focused - waking from SLEEP');
    recordInteraction();
  }
});

// ================================================================
// INTERACTION LISTENERS (attached only after auth)
// ================================================================

const interactionEvents = [
  'mousedown',
  'mousemove',
  'touchstart',
  'touchmove',
  'keydown',
  'wheel',
  'click'
];

const interactionHandler = () => recordInteraction();
let listenersAttached = false;

function attachInteractionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  interactionEvents.forEach(eventType => {
    document.addEventListener(eventType, interactionHandler, { passive: true });
  });
}

function detachInteractionListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;
  interactionEvents.forEach(eventType => {
    document.removeEventListener(eventType, interactionHandler);
  });
}

// ================================================================
// INITIALIZATION
// ================================================================

// Stay dormant until authenticated UI is visible.
// enterIdleState() is NOT called here — the controller starts silent
// and only activates once app-ready fires.

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
  recordInteraction,
  activateUI,
  deactivateUI
};
