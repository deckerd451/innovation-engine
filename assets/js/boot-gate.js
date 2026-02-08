// ================================================================
// BOOT GATE - Auth-Aware Application Boot Coordinator
// ================================================================
// Prevents Synapse and START from initializing when unauthenticated
// Provides event-driven readiness system (no retry loops)
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_BOOT_GATE_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Boot gate already loaded');
    return;
  }
  window[GUARD] = true;

  console.log('🚪 Boot gate initializing...');

  // ============================================================================
  // READINESS STATE
  // ============================================================================

  window.appReady = {
    auth: false,
    user: null,
    synapse: false,
    start: false
  };

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  const listeners = {
    'AUTH_READY': [],
    'AUTH_NONE': [],
    'SYNAPSE_READY': [],
    'START_READY': []
  };

  function emit(eventName, detail = {}) {
    console.log(`🚪 [BOOT-GATE] Event: ${eventName}`, detail);
    
    // Call registered listeners
    if (listeners[eventName]) {
      listeners[eventName].forEach(fn => {
        try {
          fn(detail);
        } catch (e) {
          console.error(`Error in ${eventName} listener:`, e);
        }
      });
    }
    
    // Also dispatch as CustomEvent for compatibility
    window.dispatchEvent(new CustomEvent(eventName.toLowerCase().replace(/_/g, '-'), { detail }));
  }

  function on(eventName, callback) {
    if (!listeners[eventName]) {
      console.warn(`Unknown event: ${eventName}`);
      return;
    }
    listeners[eventName].push(callback);
  }

  function off(eventName, callback) {
    if (!listeners[eventName]) return;
    const index = listeners[eventName].indexOf(callback);
    if (index > -1) {
      listeners[eventName].splice(index, 1);
    }
  }

  // ============================================================================
  // AUTH READINESS
  // ============================================================================

  /**
   * Wait for authentication (does not retry if unauthenticated)
   * @param {number} timeoutMs - Max time to wait (default: 10000)
   * @returns {Promise<object|null>} User object or null if unauthenticated
   */
  async function waitForAuth(timeoutMs = 10000) {
    // If already authenticated, return immediately
    if (window.appReady.auth && window.appReady.user) {
      return window.appReady.user;
    }

    // Wait for auth-ready event
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⏱️ [BOOT-GATE] Auth wait timeout');
        resolve(null);
      }, timeoutMs);

      const handler = (detail) => {
        clearTimeout(timeout);
        off('AUTH_READY', handler);
        off('AUTH_NONE', handler);
        resolve(detail.user || null);
      };

      on('AUTH_READY', handler);
      on('AUTH_NONE', handler);
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
  // AUTH STATE MONITORING
  // ============================================================================

  // Listen for auth events from auth.js
  window.addEventListener('authenticated-user', (e) => {
    const user = e.detail?.user;
    if (!user) return;

    console.log('🚪 [BOOT-GATE] User authenticated:', user.email);
    window.appReady.auth = true;
    window.appReady.user = user;
    emit('AUTH_READY', { user });
  });

  window.addEventListener('auth-ready', () => {
    // Auth system is ready, but check if user is authenticated
    if (!window.currentAuthUser) {
      console.log('🚪 [BOOT-GATE] Auth ready, but no user (unauthenticated)');
      window.appReady.auth = false;
      window.appReady.user = null;
      emit('AUTH_NONE', {});
    }
  });

  window.addEventListener('user-logged-out', () => {
    console.log('🚪 [BOOT-GATE] User logged out');
    window.appReady.auth = false;
    window.appReady.user = null;
    window.appReady.synapse = false;
    window.appReady.start = false;
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
    // State
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
    }
  };

  console.log('✅ Boot gate loaded');

})();
