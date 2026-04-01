/**
 * Presence Realtime System
 * 
 * Uses Supabase Realtime Presence (ephemeral) for online status
 * and minimal database writes for last_seen persistence.
 * 
 * Architecture:
 * - Realtime Presence: Ephemeral online/offline status (no DB writes)
 * - Database: Low-frequency last_seen updates (page hide + 30-60min throttle)
 * - Mobile fallback: Polling if Realtime fails to connect
 * 
 * Identity: Uses community.id consistently (matches graph nodes)
 */

(() => {
  'use strict';

  const GUARD = '__CH_PRESENCE_REALTIME_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ Presence realtime already loaded');
    return;
  }
  window[GUARD] = true;

  // Debug-gated logger: verbose logs only appear when DEBUG=1 or ?debug=1.
  // Errors and warnings always surface.
  const _log = window.log ?? {
    debug: (...a) => {},          // suppressed in production
    info:  (...a) => console.info(...a),
    warn:  (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
  };

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Realtime presence channel
    CHANNEL_NAME: 'presence:global',
    
    // Database persistence (LOW FREQUENCY)
    LAST_SEEN_UPDATE_INTERVAL: 30 * 60 * 1000, // 30 minutes
    
    // Mobile fallback polling
    POLLING_INTERVAL: 60 * 1000, // 60 seconds
    POLLING_TIMEOUT: 15 * 1000, // 15 seconds to wait for realtime
    
    // Online threshold for fallback mode
    ONLINE_THRESHOLD: 5 * 60 * 1000, // 5 minutes
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let supabase = null;
  let communityProfileId = null;
  let presenceChannel = null;
  let isRealtimeConnected = false;
  let pollingInterval = null;
  let lastSeenUpdateInterval = null;
  let lastSeenUpdateTimeout = null;
  // Debounce guard: prevents duplicate track() calls when the channel
  // reconnects and handleVisibilityChange fire in the same tick.
  let _pendingTrackTimer = null;
  
  // Online users from Realtime Presence
  const onlineUsers = new Map(); // profileId -> presence state
  
  // Fallback: last_seen data from database
  const lastSeenCache = new Map(); // profileId -> timestamp

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize presence system
   * @param {object} supabaseClient - Supabase client instance
   * @param {string} profileId - Community profile ID (community.id)
   */
  async function initialize(supabaseClient, profileId) {
    if (!supabaseClient || !profileId) {
      console.error('❌ Presence: Missing supabase client or profile ID');
      return;
    }

    supabase = supabaseClient;
    communityProfileId = profileId;

    _log.debug('🔌 [Presence] Initializing for profile:', profileId);

    // Register with realtimeManager
    if (window.realtimeManager) {
      window.realtimeManager.subscribeOnce(
        'presence:global',
        (supabase, context) => createPresenceChannel(supabase, context)
      );
      _log.debug('✅ [Presence] Registered with realtimeManager');
    } else {
      _log.warn('⚠️ [Presence] realtimeManager not available, creating channel directly');
      await createPresenceChannel(supabase, { communityUser: { id: profileId } });
    }

    // Setup mobile fallback timeout
    setupMobileFallback();

    // Setup low-frequency last_seen persistence
    setupLastSeenPersistence();

    // Cleanup on page hide/unload
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    _log.info('✅ [Presence] Initialization complete');
  }

  // ============================================================================
  // REALTIME PRESENCE CHANNEL
  // ============================================================================

  /**
   * Create Realtime Presence channel
   */
  function createPresenceChannel(supabaseClient, context) {
    const profileId = context?.communityUser?.id || communityProfileId;
    
    if (!profileId) {
      console.error('❌ [Presence] No profile ID available');
      return null;
    }

    _log.debug('🔌 [Presence] Creating Realtime Presence channel for profile:', profileId);

    // Use internal channel method if dev guard is active
    const channelFn = supabaseClient._internalChannel || supabaseClient.channel;
    
    // Create channel with presence config - key must be set here, not in track()
    presenceChannel = channelFn.call(supabaseClient, CONFIG.CHANNEL_NAME, {
      config: {
        presence: {
          key: profileId, // This is the correct way to set the key
        },
      },
    });

    // Track presence state
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        handlePresenceSync(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        handlePresenceJoin(key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        handlePresenceLeave(key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isRealtimeConnected = true;
          _log.debug('✅ [Presence] Realtime connected — mode: Realtime (ephemeral), profile:', profileId);

          // Debounce: cancel any pending track() from handleVisibilityChange
          // so the subscribe callback and visibility handler don't both fire
          // in the same reconnect cycle, causing a spurious leave+join.
          if (_pendingTrackTimer) {
            clearTimeout(_pendingTrackTimer);
            _pendingTrackTimer = null;
          }
          await presenceChannel.track({
            profile_id: profileId,
            online_at: new Date().toISOString(),
          });

          // Cancel mobile fallback
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isRealtimeConnected = false;
          console.warn('⚠️ [Presence] Realtime connection failed');
          // Mobile fallback will activate automatically
        }
      });

    return presenceChannel;
  }

  /**
   * Handle presence sync event
   */
  function handlePresenceSync(state) {
    onlineUsers.clear();
    
    let count = 0;
    for (const key in state) {
      const presences = state[key];
      if (presences && presences.length > 0) {
        // Use profile_id from the presence data, not the key
        const presence = presences[0];
        const profileId = presence.profile_id;
        if (profileId) {
          onlineUsers.set(profileId, presence);
          count++;
        }
      }
    }

    _log.debug(`📊 [Presence] Sync: ${count} users online`);
    
    // Notify UI to update
    notifyPresenceUpdate();
  }

  /**
   * Handle presence join event
   */
  function handlePresenceJoin(key, newPresences) {
    if (newPresences && newPresences.length > 0) {
      // Use profile_id from the presence data, not the key
      const presence = newPresences[0];
      const profileId = presence.profile_id;
      if (profileId) {
        onlineUsers.set(profileId, presence);
        _log.debug('👋 [Presence] User joined with profile ID:', profileId);
        notifyPresenceUpdate();
      }
    }
  }

  /**
   * Handle presence leave event
   */
  function handlePresenceLeave(key, leftPresences) {
    if (leftPresences && leftPresences.length > 0) {
      // Use profile_id from the presence data, not the key
      const presence = leftPresences[0];
      const profileId = presence.profile_id;
      if (profileId) {
        onlineUsers.delete(profileId);
        _log.debug('👋 [Presence] User left with profile ID:', profileId);
        notifyPresenceUpdate();
      }
    }
  }

  // ============================================================================
  // MOBILE FALLBACK (POLLING)
  // ============================================================================

  /**
   * Setup mobile fallback polling
   */
  function setupMobileFallback() {
    // Wait for realtime to connect
    setTimeout(() => {
      if (!isRealtimeConnected) {
        _log.debug('📱 [Presence] Realtime not connected, enabling polling fallback');
        enablePollingFallback();
      }
    }, CONFIG.POLLING_TIMEOUT);
  }

  /**
   * Enable polling fallback
   */
  function enablePollingFallback() {
    if (pollingInterval) return;

    _log.debug('🔄 [Presence] Mode: Polling (every 60s)');

    // Poll immediately
    pollLastSeen();

    // Then poll every 60 seconds (pauses when tab is hidden)
    const _vsi = window.visibilitySetInterval || setInterval;
    pollingInterval = _vsi(() => {
      pollLastSeen();
    }, CONFIG.POLLING_INTERVAL);
  }

  /**
   * Poll presence data from database
   */
  async function pollLastSeen() {
    if (!supabase) return;

    try {
      // community_with_last_seen joins community with the latest presence_session row
      const { data, error } = await supabase
        .from('community_with_last_seen')
        .select('id, presence_last_seen, presence_expires_at')
        .not('presence_last_seen', 'is', null)
        .order('presence_last_seen', { ascending: false })
        .limit(200);

      if (error) {
        console.error('❌ [Presence] Polling error:', error);
        return;
      }

      // Cache stores { lastSeen: ms, expiresAt: ms|null } per profileId
      lastSeenCache.clear();
      (data || []).forEach(user => {
        if (user.presence_last_seen) {
          lastSeenCache.set(user.id, {
            lastSeen: new Date(user.presence_last_seen).getTime(),
            expiresAt: user.presence_expires_at
              ? new Date(user.presence_expires_at).getTime()
              : null,
          });
        }
      });

      _log.debug(`🔄 [Presence] Polled: ${data?.length || 0} users with presence`);

      // Notify UI
      notifyPresenceUpdate();

    } catch (error) {
      console.error('❌ [Presence] Polling error:', error);
    }
  }

  // ============================================================================
  // DATABASE PERSISTENCE (LOW FREQUENCY)
  // ============================================================================

  /**
   * Setup low-frequency last_seen persistence
   */
  function setupLastSeenPersistence() {
    // Update last_seen every 30-60 minutes (pauses when tab is hidden)
    const _vsiLs = window.visibilitySetInterval || setInterval;
    lastSeenUpdateInterval = _vsiLs(() => {
      updateLastSeen();
    }, CONFIG.LAST_SEEN_UPDATE_INTERVAL);

    _log.debug(`💾 [Presence] Last seen persistence: every ${CONFIG.LAST_SEEN_UPDATE_INTERVAL / 60000}min`);
  }

  /**
   * Update last_seen in database (throttled)
   */
  async function updateLastSeen() {
    if (!supabase || !communityProfileId) return;

    try {
      const { error } = await supabase
        .from('community')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', communityProfileId);

      if (error) {
        console.error('❌ [Presence] Failed to update last_seen:', error);
      } else {
        _log.debug('💾 [Presence] Updated last_seen (throttled)');
      }
    } catch (error) {
      console.error('❌ [Presence] Error updating last_seen:', error);
    }
  }

  /**
   * Handle page hide (update last_seen immediately)
   */
  function handlePageHide() {
    _log.debug('👋 [Presence] Page hiding, updating last_seen');
    
    // Update last_seen immediately using Supabase client
    // Note: sendBeacon doesn't work with Supabase because it can't send auth headers
    if (supabase && communityProfileId) {
      // Use the Supabase client which handles authentication properly
      updateLastSeen();
    }

    // Untrack from presence
    if (presenceChannel && isRealtimeConnected) {
      presenceChannel.untrack();
    }
  }

  /**
   * Handle visibility change
   */
  function handleVisibilityChange() {
    if (document.hidden) {
      // Update last_seen when tab becomes hidden
      updateLastSeen();
    } else {
      // Re-track presence when tab becomes visible.
      // Debounce with a short delay: if the Supabase channel is in the middle
      // of reconnecting it will fire its own SUBSCRIBED callback (which also
      // calls track()).  Letting that settle first prevents the channel from
      // emitting a spurious leave+join pair for the local user.
      if (presenceChannel && isRealtimeConnected) {
        if (_pendingTrackTimer) clearTimeout(_pendingTrackTimer);
        _pendingTrackTimer = setTimeout(() => {
          _pendingTrackTimer = null;
          if (presenceChannel && isRealtimeConnected) {
            presenceChannel.track({
              profile_id: communityProfileId,
              online_at: new Date().toISOString(),
            });
          }
        }, 250);
      }
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Check if user is online
   * @param {string} profileId - Community profile ID
   * @returns {boolean} True if user is online
   */
  function isOnline(profileId) {
    // Current user is always online
    if (profileId === communityProfileId) {
      return true;
    }

    // Check Realtime presence first
    if (isRealtimeConnected && onlineUsers.has(profileId)) {
      return true;
    }

    // Fallback: check last_seen cache (presence_expires_at is authoritative)
    if (lastSeenCache.has(profileId)) {
      const entry = lastSeenCache.get(profileId);
      return !!(entry.expiresAt && entry.expiresAt > Date.now());
    }

    return false;
  }

  /**
   * Get last seen timestamp
   * @param {string} profileId - Community profile ID
   * @returns {number|null} Timestamp or null
   */
  function getLastSeen(profileId) {
    // Current user is active now
    if (profileId === communityProfileId) {
      return Date.now();
    }

    // Check Realtime presence first
    if (isRealtimeConnected && onlineUsers.has(profileId)) {
      const presence = onlineUsers.get(profileId);
      return presence.online_at ? new Date(presence.online_at).getTime() : Date.now();
    }

    // Fallback: check last_seen cache
    if (lastSeenCache.has(profileId)) {
      return lastSeenCache.get(profileId).lastSeen || null;
    }

    return null;
  }

  /**
   * Get all online users
   * @returns {string[]} Array of profile IDs
   */
  function getOnlineUsers() {
    if (isRealtimeConnected) {
      return Array.from(onlineUsers.keys());
    }

    // Fallback: use expiresAt (authoritative) to match isOnline() logic
    const now = Date.now();
    return Array.from(lastSeenCache.entries())
      .filter(([_, entry]) => entry.expiresAt && entry.expiresAt > now)
      .map(([profileId]) => profileId);
  }

  /**
   * Get online user count
   * @returns {number} Number of online users
   */
  function getOnlineCount() {
    return getOnlineUsers().length;
  }

  /**
   * Get presence mode
   * @returns {string} 'realtime' or 'polling'
   */
  function getMode() {
    return isRealtimeConnected ? 'realtime' : 'polling';
  }

  /**
   * Get debug info
   * @returns {object} Debug information
   */
  function getDebugInfo() {
    return {
      mode: getMode(),
      isRealtimeConnected,
      onlineCount: getOnlineCount(),
      onlineUsers: getOnlineUsers(),
      lastSeenCacheSize: lastSeenCache.size,
      channelName: CONFIG.CHANNEL_NAME,
      currentProfileId: communityProfileId,
    };
  }

  /**
   * Notify UI of presence updates
   */
  function notifyPresenceUpdate() {
    window.dispatchEvent(new CustomEvent('presence-updated', {
      detail: {
        onlineCount: getOnlineCount(),
        mode: getMode(),
      }
    }));
  }

  /**
   * Cleanup
   */
  function cleanup() {
    _log.debug('🧹 [Presence] Cleaning up');

    // Clear intervals
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    if (lastSeenUpdateInterval) {
      clearInterval(lastSeenUpdateInterval);
      lastSeenUpdateInterval = null;
    }

    if (lastSeenUpdateTimeout) {
      clearTimeout(lastSeenUpdateTimeout);
      lastSeenUpdateTimeout = null;
    }

    if (_pendingTrackTimer) {
      clearTimeout(_pendingTrackTimer);
      _pendingTrackTimer = null;
    }

    // Untrack presence
    if (presenceChannel && isRealtimeConnected) {
      presenceChannel.untrack();
    }

    // Update last_seen one final time
    updateLastSeen();

    _log.debug('✅ [Presence] Cleanup complete');
  }

  /**
   * Seed the lastSeenCache from a profile object that already has presence fields.
   * Call this after fetching from community_with_last_seen so the cache is
   * immediately populated and presence-ui.js won't overwrite with "unknown".
   * @param {object} profile - Object with id, presence_last_seen, presence_expires_at
   */
  function seedFromProfile(profile) {
    if (!profile?.id || !profile.presence_last_seen) return;
    lastSeenCache.set(profile.id, {
      lastSeen:  new Date(profile.presence_last_seen).getTime(),
      expiresAt: profile.presence_expires_at
        ? new Date(profile.presence_expires_at).getTime()
        : null,
    });
    _log.debug(`🌱 [Presence] Seeded cache for ${profile.id} from profile fetch`);
    // Notify UI so indicators update immediately with the correct data
    notifyPresenceUpdate();
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.PresenceRealtime = {
    initialize,
    isOnline,
    getLastSeen,
    getOnlineUsers,
    getOnlineCount,
    getMode,
    getDebugInfo,
    seedFromProfile,
    cleanup,
  };

  _log.info('✅ Presence realtime module loaded');

})();
