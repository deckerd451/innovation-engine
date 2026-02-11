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

    console.log('🔌 [Presence] Initializing for profile:', profileId);

    // Register with realtimeManager
    if (window.realtimeManager) {
      window.realtimeManager.subscribeOnce(
        'presence:global',
        (supabase, context) => createPresenceChannel(supabase, context)
      );
      console.log('✅ [Presence] Registered with realtimeManager');
    } else {
      console.warn('⚠️ [Presence] realtimeManager not available, creating channel directly');
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

    console.log('✅ [Presence] Initialization complete');
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

    console.log('🔌 [Presence] Creating Realtime Presence channel');

    // Use internal channel method if dev guard is active
    const channelFn = supabaseClient._internalChannel || supabaseClient.channel;
    
    presenceChannel = channelFn.call(supabaseClient, CONFIG.CHANNEL_NAME, {
      config: {
        presence: {
          key: profileId, // Use community.id as identity key
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
        console.log('👋 [Presence] User joined:', key);
        handlePresenceJoin(key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👋 [Presence] User left:', key);
        handlePresenceLeave(key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isRealtimeConnected = true;
          console.log('✅ [Presence] Realtime connected');
          console.log('📊 [Presence] Mode: Realtime (ephemeral)');
          
          // Track current user as online
          await presenceChannel.track({
            profile_id: profileId,
            online_at: new Date().toISOString(),
          });
          
          // Cancel mobile fallback
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('✅ [Presence] Polling fallback cancelled');
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
    for (const profileId in state) {
      const presences = state[profileId];
      if (presences && presences.length > 0) {
        onlineUsers.set(profileId, presences[0]);
        count++;
      }
    }

    console.log(`📊 [Presence] Sync: ${count} users online`);
    
    // Notify UI to update
    notifyPresenceUpdate();
  }

  /**
   * Handle presence join event
   */
  function handlePresenceJoin(key, newPresences) {
    if (newPresences && newPresences.length > 0) {
      onlineUsers.set(key, newPresences[0]);
      notifyPresenceUpdate();
    }
  }

  /**
   * Handle presence leave event
   */
  function handlePresenceLeave(key, leftPresences) {
    onlineUsers.delete(key);
    notifyPresenceUpdate();
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
        console.log('📱 [Presence] Realtime not connected, enabling polling fallback');
        enablePollingFallback();
      }
    }, CONFIG.POLLING_TIMEOUT);
  }

  /**
   * Enable polling fallback
   */
  function enablePollingFallback() {
    if (pollingInterval) return;

    console.log('🔄 [Presence] Mode: Polling (every 60s)');

    // Poll immediately
    pollLastSeen();

    // Then poll every 60 seconds
    pollingInterval = setInterval(() => {
      pollLastSeen();
    }, CONFIG.POLLING_INTERVAL);
  }

  /**
   * Poll last_seen from database
   */
  async function pollLastSeen() {
    if (!supabase) return;

    try {
      // Query minimal data: only active users' last_seen
      const threshold = new Date(Date.now() - CONFIG.ONLINE_THRESHOLD).toISOString();
      
      const { data, error } = await supabase
        .from('community')
        .select('id, last_seen_at')
        .gte('last_seen_at', threshold)
        .order('last_seen_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('❌ [Presence] Polling error:', error);
        return;
      }

      // Update cache
      lastSeenCache.clear();
      (data || []).forEach(user => {
        if (user.last_seen_at) {
          lastSeenCache.set(user.id, new Date(user.last_seen_at).getTime());
        }
      });

      console.log(`🔄 [Presence] Polled: ${data?.length || 0} active users`);
      
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
    // Update last_seen every 30-60 minutes (throttled)
    lastSeenUpdateInterval = setInterval(() => {
      updateLastSeen();
    }, CONFIG.LAST_SEEN_UPDATE_INTERVAL);

    console.log(`💾 [Presence] Last seen persistence: every ${CONFIG.LAST_SEEN_UPDATE_INTERVAL / 60000}min`);
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
        console.log('💾 [Presence] Updated last_seen (throttled)');
      }
    } catch (error) {
      console.error('❌ [Presence] Error updating last_seen:', error);
    }
  }

  /**
   * Handle page hide (update last_seen immediately)
   */
  function handlePageHide() {
    console.log('👋 [Presence] Page hiding, updating last_seen');
    
    // Update last_seen immediately (synchronous)
    if (supabase && communityProfileId) {
      // Use sendBeacon for reliable delivery during page unload
      const url = `${supabase.supabaseUrl}/rest/v1/community?id=eq.${communityProfileId}`;
      const data = JSON.stringify({ last_seen_at: new Date().toISOString() });
      
      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        // Fallback: synchronous XHR (not recommended but works)
        updateLastSeen();
      }
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
      console.log('😴 [Presence] Tab hidden');
      // Update last_seen when tab becomes hidden
      updateLastSeen();
    } else {
      console.log('👀 [Presence] Tab visible');
      // Re-track presence when tab becomes visible
      if (presenceChannel && isRealtimeConnected) {
        presenceChannel.track({
          profile_id: communityProfileId,
          online_at: new Date().toISOString(),
        });
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

    // Fallback: check last_seen cache
    if (lastSeenCache.has(profileId)) {
      const lastSeen = lastSeenCache.get(profileId);
      const threshold = Date.now() - CONFIG.ONLINE_THRESHOLD;
      return lastSeen > threshold;
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
      return lastSeenCache.get(profileId);
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

    // Fallback: filter last_seen cache
    const threshold = Date.now() - CONFIG.ONLINE_THRESHOLD;
    return Array.from(lastSeenCache.entries())
      .filter(([_, lastSeen]) => lastSeen > threshold)
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
    console.log('🧹 [Presence] Cleaning up');

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

    // Untrack presence
    if (presenceChannel && isRealtimeConnected) {
      presenceChannel.untrack();
    }

    // Update last_seen one final time
    updateLastSeen();

    console.log('✅ [Presence] Cleanup complete');
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
    cleanup,
  };

  console.log('✅ Presence realtime module loaded');

})();
