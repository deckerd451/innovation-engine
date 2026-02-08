// ================================================================
// BOOT GATE - Auth-Aware Application Boot Coordinator (HARDENED)
// ================================================================
// Prevents Synapse and START from initializing when unauthenticated
// Provides event-driven readiness system (no retry loops)
// 
// HARDENED FEATURES:
// - Idempotent event emission (each event fires once per lifecycle)
// - Sticky listeners (late subscribers get immediate callback if ready)
// - Auth decision tracking (authKnown prevents false "no user" logs)
// - Re-entrancy protection (no duplicate emits from handlers)
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_BOOT_GATE_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Boot gate already loaded');
    return;
  }
  window[GUARD] = true;

  console.log('🚪 Boot gate initializing (hardened)...');

  // ============================================================================
  // READINESS STATE (with authKnown tracking)
  // ============================================================================

  window.appReady = {
    auth: false,
    authKnown: false,  // NEW: true only after auth has determined user presence
    user: null,
    synapse: false,
    start: false
  };

  // ============================================================================
  // EVENT EMISSION GUARDS (idempotent - each event fires once)
  // ============================================================================

  const emitted = {
    'AUTH_READY': false,
    'AUTH_NONE': false,
    'SYNAPSE_READY': false,
    'START_READY': false
  };

  // ============================================================================
  // EVENT SYSTEM (with sticky listeners and re-entrancy protection)
  // ============================================================================

  const listeners = {
    'AUTH_READY': [],
    'AUTH_NONE': [],
    'SYNAPSE_READY': [],
    'START_READY': []
  };

  // Track if we're currently emitting to prevent re-entrancy
  let emitting = false;

  function emit(eventName, detail = {}) {
    // Idempotent guard: prevent duplicate emissions
    if (emitted[eventName]) {
      console.log(`🚪 [BOOT-GATE] Skipping duplicate emit: ${eventName}`);
      return;
    }

    // Re-entrancy guard: prevent emitting from inside a handler
    if (emitting) {
      console.warn(`🚪 [BOOT-GATE] Re-entrancy blocked: ${eventName}`);
      return;
    }

    emitted[eventName] = true;
    emitting = true;

    console.log(`🚪 [BOOT-GATE] Event: ${eventName}`, detail);
    
    try {
      // Call registered listeners
      if (listeners[eventName]) {
        // Clone array to prevent modification during iteration
        const callbacks = [...listeners[eventName]];
        callbacks.forEach(fn => {
          try {
            fn(detail);
          } catch (e) {
            console.error(`Error in ${eventName} listener:`, e);
          }
        });
      }
      
      // Also dispatch as CustomEvent for compatibility
      window.dispatchEvent(new CustomEvent(eventName.toLowerCase().replace(/_/g, '-'), { detail }));
    } finally {
      emitting = false;
    }
  }

  function on(eventName, callback) {
    if (!listeners[eventName]) {
      console.warn(`Unknown event: ${eventName}`);
      return;
    }

    // Add listener
    listeners[eventName].push(callback);

    // STICKY BEHAVIOR: If event already emitted, invoke callback immediately
    if (emitted[eventName]) {
      console.log(`🚪 [BOOT-GATE] Sticky callback for ${eventName} (already emitted)`);
      
      // Invoke asynchronously to avoid re-entrancy
      setTimeout(() => {
        try {
          // Provide appropriate detail based on event type
          let detail = {};
          if (eventName === 'AUTH_READY') {
            detail = { user: window.appReady.user };
          }
          callback(detail);
        } catch (e) {
          console.error(`Error in sticky ${eventName} callback:`, e);
        }
      }, 0);
    }
  }

  function off(eventName, callback) {
    if (!listeners[eventName]) return;
    const index = listeners[eventName].indexOf(callback);
    if (index > -1) {
      listeners[eventName].splice(index, 1);
    }
  }

  // ============================================================================
  // AUTH READINESS (with authKnown tracking)
  // ============================================================================

  /**
   * Wait for authentication (does not retry if unauthenticated)
   * @param {number} timeoutMs - Max time to wait (default: 10000)
   * @returns {Promise<object|null>} User object or null if unauthenticated
   */
  async function waitForAuth(timeoutMs = 10000) {
    // If auth decision already made
    if (window.appReady.authKnown) {
      if (window.appReady.auth && window.appReady.user) {
        return window.appReady.user;
      } else {
        // Auth checked, no user - this is valid, not a timeout
        console.log('🚪 [BOOT-GATE] Auth decision known: no user (unauthenticated)');
        return null;
      }
    }

    // Wait for auth decision
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Only log timeout if auth decision was never made (unexpected)
        if (!window.appReady.authKnown) {
          console.warn('⏱️ [BOOT-GATE] Auth decision timeout (auth system may not have initialized)');
        }
        resolve(null);
      }, timeoutMs);

      const handleAuthReady = (detail) => {
        clearTimeout(timeout);
        off('AUTH_READY', handleAuthReady);
        off('AUTH_NONE', handleAuthNone);
        resolve(detail.user || window.appReady.user);
      };

      const handleAuthNone = () => {
        clearTimeout(timeout);
        off('AUTH_READY', handleAuthReady);
        off('AUTH_NONE', handleAuthNone);
        resolve(null);
      };

      on('AUTH_READY', handleAuthReady);
      on('AUTH_NONE', handleAuthNone);
    });
  }

  /**
   * Execute callback only when authenticated
   * @param {Function} fn - Callback to execute
   * @returns {Promise<any>} Result of callback or null if unauthenticated
   */
  async function whenAuthenticated(fn) {
    const user = await waitForAuth();
    if (!user) {
      console.log('🚪 [BOOT-GATE] Not authenticated, skipping callback');
      return null;
    }
    return fn(user);
  }

  // ============================================================================
  // SYNAPSE READINESS
  // ============================================================================

  /**
   * Wait for Synapse to be ready
   * @param {number} timeoutMs - Max time to wait (default: 15000)
   * @returns {Promise<boolean>} True if Synapse ready, false if timeout
   */
  async function waitForSynapse(timeoutMs = 15000) {
    if (window.appReady.synapse) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⏱️ [BOOT-GATE] Synapse wait timeout');
        resolve(false);
      }, timeoutMs);

      const handler = () => {
        clearTimeout(timeout);
        off('SYNAPSE_READY', handler);
        resolve(true);
      };

      on('SYNAPSE_READY', handler);
    });
  }

  // ============================================================================
  // AUTH STATE MONITORING (with authKnown tracking)
  // ============================================================================

  // Listen for authenticated-user event from auth.js
  window.addEventListener('authenticated-user', (e) => {
    const user = e.detail?.user;
    if (!user) return;

    console.log('🚪 [BOOT-GATE] User authenticated:', user.email);
    window.appReady.auth = true;
    window.appReady.authKnown = true;
    window.appReady.user = user;
    emit('AUTH_READY', { user });
  });

  // Listen for auth-ready event from auth.js
  // This means auth system is ready, but does NOT mean "no user"
  window.addEventListener('auth-ready', () => {
    // Only treat as "no user" if we haven't already authenticated
    // and if currentAuthUser is explicitly null/undefined
    if (!window.appReady.auth && !window.currentAuthUser) {
      console.log('🚪 [BOOT-GATE] Auth system ready, no user (unauthenticated)');
      window.appReady.auth = false;
      window.appReady.authKnown = true;
      window.appReady.user = null;
      emit('AUTH_NONE', {});
    } else if (window.currentAuthUser && !window.appReady.auth) {
      // Edge case: auth-ready fired but we have a user (race condition)
      console.log('🚪 [BOOT-GATE] Auth system ready with user (late detection)');
      window.appReady.auth = true;
      window.appReady.authKnown = true;
      window.appReady.user = window.currentAuthUser;
      emit('AUTH_READY', { user: window.currentAuthUser });
    }
  });

  // Listen for user-logged-out event from auth.js
  window.addEventListener('user-logged-out', () => {
    console.log('🚪 [BOOT-GATE] User logged out');
    window.appReady.auth = false;
    window.appReady.authKnown = true;
    window.appReady.user = null;
    window.appReady.synapse = false;
    window.appReady.start = false;
    
    // Reset emission guards for next session
    emitted['AUTH_READY'] = false;
    emitted['AUTH_NONE'] = false;
    emitted['SYNAPSE_READY'] = false;
    emitted['START_READY'] = false;
    
    emit('AUTH_NONE', {});
  });

  // Listen for Synapse ready event
  window.addEventListener('synapse-ready', () => {
    console.log('🚪 [BOOT-GATE] Synapse ready');
    window.appReady.synapse = true;
    emit('SYNAPSE_READY', {});
  });

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.bootGate = {
    // State (read-only)
    get ready() {
      return window.appReady;
    },

    // Event system
    on,
    off,
    emit,

    // Helpers
    waitForAuth,
    whenAuthenticated,
    waitForSynapse,

    // Check current state
    isAuthenticated() {
      return window.appReady.auth && !!window.appReady.user;
    },

    isSynapseReady() {
      return window.appReady.synapse;
    },

    // Check if auth decision has been made
    isAuthKnown() {
      return window.appReady.authKnown;
    },

    // Debug helpers
    getEmittedEvents() {
      return { ...emitted };
    },

    resetForTesting() {
      // Only for testing - resets all state
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.warn('🚪 [BOOT-GATE] resetForTesting only available in development');
        return;
      }
      
      window.appReady.auth = false;
      window.appReady.authKnown = false;
      window.appReady.user = null;
      window.appReady.synapse = false;
      window.appReady.start = false;
      
      emitted['AUTH_READY'] = false;
      emitted['AUTH_NONE'] = false;
      emitted['SYNAPSE_READY'] = false;
      emitted['START_READY'] = false;
      
      console.log('🚪 [BOOT-GATE] State reset for testing');
    }
  };

  console.log('✅ Boot gate loaded (hardened)');

})();
