/**
 * Web Event Presence Client
 * 
 * Allows the web app to join beacon event contexts and appear as an active attendee
 * in the iOS Beacon app. Uses the same Supabase presence_sessions table.
 * 
 * IMPORTANT: This module is the SINGLE SOURCE OF TRUTH for web event presence.
 * 
 * UI Integration:
 * 1. LEFT PANEL: "Join Event" / "Leave Event" buttons (Command Dashboard)
 *    - Located in #cd-event-presence section
 *    - Wired in index.html inline script
 *    - Calls: WebEventPresence.joinEvent() / leaveEvent()
 *    - Status: #event-presence-status
 * 
 * 2. MAIN VIEW: "Event Mode Active" card (BLE UI status indicator)
 *    - Created by assets/js/ble-ui.js createStatusIndicator()
 *    - Shows when BLE scanning is active
 *    - VISUAL ONLY - does NOT write presence_sessions
 *    - Controlled by BLEPassiveNetworking module (iOS-style BLE scanning)
 * 
 * 3. DESKTOP: Event Mode Gravity button (Synapse overlay)
 *    - Created by assets/js/ble-ui.js createEventModeGravityButton()
 *    - Toggles eventModeGravity.js visualization
 *    - VISUAL ONLY - does NOT write presence_sessions
 *    - Shows attendees from presence_sessions but doesn't write
 * 
 * ONLY the "Join Event" button in the left panel writes presence_sessions.
 * The other UI elements are for visualization/BLE scanning only.
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

    // Get auth user ID for diagnostics
    supabase.auth.getSession().then(({ data: { session } }) => {
      const authUserId = session?.user?.id;
      console.log('✅ [WEB PRESENCE] Initialized');
      console.log('  🔐 Auth User ID:', authUserId || 'none');
      console.log('  👤 Resolved Community ID:', currentUserCommunityId);
      console.log('  🎯 Test Beacon ID:', CONFIG.TEST_BEACON_ID);
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

    console.log('🚀 [WEB PRESENCE] ========================================');
    console.log('🚀 [WEB PRESENCE] JOIN EVENT INITIATED');
    console.log('🚀 [WEB PRESENCE] ========================================');
    
    // Get auth user ID for diagnostics
    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id;
    
    console.log('  🔐 Auth User ID:', authUserId || 'none');
    console.log('  👤 Resolved Community ID:', currentUserCommunityId);
    console.log('  📍 Context ID (Beacon):', beaconId);
    console.log('  🔄 Context Type:', 'beacon');

    currentBeaconId = beaconId;
    isActive = true;

    // Write initial presence
    const success = await writePresence();
    if (!success) {
      console.error('❌ [WEB PRESENCE] Failed to write initial presence');
      isActive = false;
      currentBeaconId = null;
      return false;
    }

    // Start heartbeat
    startHeartbeat();

    console.log('✅ [WEB PRESENCE] joined event');
    console.log('📊 [WEB PRESENCE] ========================================');
    console.log('📊 [WEB PRESENCE] DIAGNOSTIC SUMMARY');
    console.log('📊 [WEB PRESENCE] ========================================');
    console.log('  ✓ Web attendee row written to presence_sessions');
    console.log('  ✓ Community ID:', currentUserCommunityId);
    console.log('  ✓ Context ID:', currentBeaconId);
    console.log('  ✓ Heartbeat active (25s interval)');
    console.log('  ℹ️  This row should now be visible to iOS attendee query');
    console.log('  ℹ️  iOS should query with same context_id:', currentBeaconId);
    console.log('  ℹ️  iOS should see user_id:', currentUserCommunityId);
    console.log('📊 [WEB PRESENCE] ========================================');

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

    console.log('[WEB PRESENCE] Leaving event...', {
      beaconId: currentBeaconId,
      communityId: currentUserCommunityId
    });

    // Stop heartbeat
    stopHeartbeat();

    // Delete presence session
    await deletePresence();

    isActive = false;
    currentBeaconId = null;

    console.log('✅ [WEB PRESENCE] stopped');

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
      console.error('❌ [WEB PRESENCE] Missing required data for writePresence');
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

      console.log('📝 [WEB PRESENCE] Writing presence to database...');
      console.log('  📦 Payload:');
      console.log('     user_id:', payload.user_id);
      console.log('     context_type:', payload.context_type);
      console.log('     context_id:', payload.context_id);
      console.log('     energy:', payload.energy);
      console.log('     is_active:', payload.is_active);
      console.log('     last_seen:', payload.last_seen);
      console.log('     expires_at:', payload.expires_at);
      console.log('  🕐 TTL:', CONFIG.PRESENCE_TTL, 'seconds');

      const { data, error } = await supabase
        .from('presence_sessions')
        .insert(payload);

      if (error) {
        console.error('❌ [WEB PRESENCE] Database insert failed');
        console.error('  📋 Error Code:', error.code);
        console.error('  📋 Error Message:', error.message);
        console.error('  📋 Error Details:', error.details);
        console.error('  📋 Error Hint:', error.hint);
        return false;
      }

      console.log('✅ [WEB PRESENCE] Presence row written successfully');
      if (data) {
        console.log('  📊 Response data:', data);
      }
      
      return true;
    } catch (error) {
      console.error('❌ [WEB PRESENCE] Exception during write:', error);
      console.error('  📋 Error:', error.message);
      return false;
    }
  }

  /**
   * Delete presence session from database
   */
  async function deletePresence() {
    if (!supabase || !currentUserCommunityId || !currentBeaconId) {
      console.error('❌ [WEB PRESENCE] Missing required data for deletePresence');
      return false;
    }

    try {
      console.log('[WEB PRESENCE] Deleting presence...', {
        user_id: currentUserCommunityId,
        context_type: 'beacon',
        context_id: currentBeaconId
      });

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

      console.log('✅ [WEB PRESENCE] Presence deleted successfully');
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
