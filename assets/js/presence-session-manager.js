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

  console.warn('⚠️ [DEPRECATED] presence-session-manager.js is deprecated. Use presence-realtime.js instead.');

  // Stub API for backward compatibility
  window.PresenceSessionManager = {
    initialize: () => {
      console.warn('⚠️ PresenceSessionManager.initialize() is deprecated. Use PresenceRealtime.initialize() instead.');
    },
    cleanup: () => {
      console.warn('⚠️ PresenceSessionManager.cleanup() is deprecated. Use PresenceRealtime.cleanup() instead.');
    },
    getSessionInfo: () => {
      console.warn('⚠️ PresenceSessionManager.getSessionInfo() is deprecated. Use PresenceRealtime.getDebugInfo() instead.');
      return { sessionId: null, communityProfileId: null, isActive: false };
    },
    markActive: () => {
      console.warn('⚠️ PresenceSessionManager.markActive() is deprecated.');
    },
    markInactive: () => {
      console.warn('⚠️ PresenceSessionManager.markInactive() is deprecated.');
    }
  };

  console.log('✅ Presence session manager (deprecated stub) loaded');

})();
