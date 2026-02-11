/**
 * Presence Session Manager (DEPRECATED)
 * 
 * ⚠️ DEPRECATED: This module is replaced by presence-realtime.js
 * 
 * The new system uses:
 * - Supabase Realtime Presence (ephemeral, no DB writes)
 * - Low-frequency last_seen_at updates (community table)
 * - Mobile-safe polling fallback
 * 
 * This file is kept for backward compatibility but should not be used.
 * Use PresenceRealtime.initialize() instead.
 */

(() => {
  'use strict';

  const GUARD = '__CH_PRESENCE_SESSION_MANAGER_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Presence session manager already loaded');
    return;
  }
  window[GUARD] = true;

  // Only log deprecation warning in debug mode
  const isDebug = window.log?.isDebugMode?.() || 
                  localStorage.getItem('DEBUG') === '1' || 
                  window.location.search.includes('debug=1');
  
  if (isDebug) {
    console.warn('⚠️ [DEPRECATED] presence-session-manager.js is deprecated. Use presence-realtime.js instead.');
  }

  // Stub API for backward compatibility - delegate to PresenceRealtime if available
  window.PresenceSessionManager = {
    initialize: () => {
      if (isDebug) {
        console.warn('⚠️ PresenceSessionManager.initialize() is deprecated. Use PresenceRealtime.initialize() instead.');
      }
      // Delegate to PresenceRealtime if available
      if (window.PresenceRealtime?.initialize) {
        return window.PresenceRealtime.initialize(...arguments);
      }
    },
    cleanup: () => {
      if (isDebug) {
        console.warn('⚠️ PresenceSessionManager.cleanup() is deprecated. Use PresenceRealtime.cleanup() instead.');
      }
      if (window.PresenceRealtime?.cleanup) {
        return window.PresenceRealtime.cleanup();
      }
    },
    getSessionInfo: () => {
      if (isDebug) {
        console.warn('⚠️ PresenceSessionManager.getSessionInfo() is deprecated. Use PresenceRealtime.getDebugInfo() instead.');
      }
      if (window.PresenceRealtime?.getDebugInfo) {
        return window.PresenceRealtime.getDebugInfo();
      }
      return { sessionId: null, communityProfileId: null, isActive: false };
    },
    markActive: () => {
      if (isDebug) {
        console.warn('⚠️ PresenceSessionManager.markActive() is deprecated.');
      }
    },
    markInactive: () => {
      if (isDebug) {
        console.warn('⚠️ PresenceSessionManager.markInactive() is deprecated.');
      }
    }
  };

  console.log('✅ Presence session manager (deprecated stub) loaded');

})();
