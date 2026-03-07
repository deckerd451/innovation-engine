/**
 * Web Event Presence Client
 * 
 * Allows the web app to join beacon event contexts and appear as an active attendee
 * in the iOS Beacon app. Uses the same Supabase presence_sessions table.
 * 
 * Features:
 * - Resolves current user's community.id
 * - Joins beacon event contexts
 * - Writes presence_sessions rows
 * - Refreshes presence every 25 seconds
 * - Stops heartbeat when leaving event
 * 
 * Test beacon context: 3a4f2cfe-eb2e-4d17-abc3-a075f38b713b
 */

(() => {
  'use strict';

  const GUARD = '__WEB_EVENT_PRESENCE_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ Web Event Presence already loaded');
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    HEARTBEAT_INTERVAL: 25000,  // 25 seconds
    PRESENCE_TTL: 300,           // 5 minutes (in seconds)
    DEFAULT_ENERGY: 1.0,
    TEST_BEACON_ID: '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b',
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let supabase = null;
  let currentUserCommunityId = null;
  let isActive = false;
  let currentBeaconId = null;
  let heartbeatInterval = null;

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize the web event presence system
   * @param {object} supabaseClient - Supabase client instance
   * @param {string} communityId - Current user's community.id
   */
  function initialize(supabaseClient, communityId) {
    if (!supabaseClient) {
      console.error('❌ [WEB PRESENCE] Supabase client required');
      return false;
    }

    if (!communityId) {
      console.error('❌ [WEB PRESENCE] Community ID required');
      return false;
    }

    supabase = supabaseClient;
    currentUserCommunityId = communityId;

    console.log('[WEB PRESENCE] Initialized', {
      communityId: currentUserCommunityId,
      testBeaconId: CONFIG.TEST_BEACON_ID
    });

    return true;
  }

  /**
   * Join a beacon event context
   * @param {string} beaconId - Beacon context ID (defaults to test beacon)
   */
  async function joinEvent(beaconId = CONFIG.TEST_BEACON_ID) {
    if (!supabase || !currentUserCommunityId) {
      console.error('❌ [WEB PRESENCE] Not initialized');
      return false;
    }

    if (isActive) {
      console.warn('⚠️ [WEB PRESENCE] Already in an event');
      return false;
    }

    currentBeaconId = beaconId;
    isActive = true;

    // Write initial presence
    const success = await writePresence();
    if (!success) {
      isActive = false;
      currentBeaconId = null;
      return false;
    }

    // Start heartbeat
    startHeartbeat();

    console.log('[WEB PRESENCE] joined event', {
      beaconId: currentBeaconId,
      communityId: currentUserCommunityId
    });

    return true;
  }

  /**
   * Leave the current beacon event context
   */
  async function leaveEvent() {
    if (!isActive) {
      console.warn('⚠️ [WEB PRESENCE] Not in an event');
      return false;
    }

    // Stop heartbeat
    stopHeartbeat();

    // Delete presence session
    await deletePresence();

    isActive = false;
    currentBeaconId = null;

    console.log('[WEB PRESENCE] stopped');

    return true;
  }

  /**
   * Get current presence status
   */
  function getStatus() {
    return {
      isActive,
      beaconId: currentBeaconId,
      communityId: currentUserCommunityId,
    };
  }

  // ============================================================================
  // PRESENCE MANAGEMENT
  // ============================================================================

  /**
   * Write presence session to database
   */
  async function writePresence() {
    if (!supabase || !currentUserCommunityId || !currentBeaconId) {
      return false;
    }

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CONFIG.PRESENCE_TTL * 1000);

      const payload = {
        user_id: currentUserCommunityId,
        context_type: 'beacon',
        context_id: currentBeaconId,
        energy: CONFIG.DEFAULT_ENERGY,
        is_active: true,
        last_seen: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      const { error } = await supabase
        .from('presence_sessions')
        .upsert(payload, {
          onConflict: 'user_id,context_type,context_id',
        });

      if (error) {
        console.error('❌ [WEB PRESENCE] Failed to write presence:', error);
        return false;
      }

      console.log('[WEB PRESENCE] heartbeat refresh');
      return true;
    } catch (error) {
      console.error('❌ [WEB PRESENCE] Error writing presence:', error);
      return false;
    }
  }

  /**
   * Delete presence session from database
   */
  async function deletePresence() {
    if (!supabase || !currentUserCommunityId || !currentBeaconId) {
      return false;
    }

    try {
      const { error } = await supabase
        .from('presence_sessions')
        .delete()
        .eq('user_id', currentUserCommunityId)
        .eq('context_type', 'beacon')
        .eq('context_id', currentBeaconId);

      if (error) {
        console.error('❌ [WEB PRESENCE] Failed to delete presence:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ [WEB PRESENCE] Error deleting presence:', error);
      return false;
    }
  }

  // ============================================================================
  // HEARTBEAT
  // ============================================================================

  /**
   * Start presence heartbeat
   */
  function startHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(async () => {
      if (isActive) {
        await writePresence();
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop presence heartbeat
   */
  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (isActive) {
      // Use sendBeacon for reliable cleanup
      const payload = {
        user_id: currentUserCommunityId,
        context_type: 'beacon',
        context_id: currentBeaconId,
      };

      // Note: This is a best-effort cleanup. The expires_at timestamp
      // ensures stale sessions are automatically cleaned up.
      navigator.sendBeacon?.(
        `${supabase?.supabaseUrl}/rest/v1/presence_sessions?user_id=eq.${currentUserCommunityId}&context_type=eq.beacon&context_id=eq.${currentBeaconId}`,
        JSON.stringify(payload)
      );
    }
  });

  // ============================================================================
  // EXPORT
  // ============================================================================

  window.WebEventPresence = {
    initialize,
    joinEvent,
    leaveEvent,
    getStatus,
  };

  console.log('✅ [WEB PRESENCE] Module loaded');
})();
