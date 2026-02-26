/**
 * Realtime Manager - Single Source of Truth for Realtime Subscriptions
 * 
 * This module is the ONLY place that creates Supabase realtime channels.
 * All other modules MUST use this manager instead of calling supabase.channel() directly.
 * 
 * Rules:
 * - Dedupes subscriptions by key
 * - Maintains references for proper cleanup
 * - Delays realtime until after shell render
 * - Unsubscribes all channels on stop
 * 
 * @module realtimeManager
 */

(() => {
  'use strict';

  const GUARD = '__CH_REALTIME_MANAGER_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ realtimeManager already loaded');
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // STATE
  // ============================================================================

  let supabase = null;
  let isStarted = false;
  let sessionContext = null;
  
  // Map of subscription key -> channel instance
  const activeChannels = new Map();
  
  // Map of subscription key -> config for recreation
  const channelConfigs = new Map();

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize realtime manager
   * @param {object} supabaseClient - Supabase client instance
   */
  function initialize(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('realtimeManager.initialize() requires supabase client');
    }
    
    supabase = supabaseClient;
    console.log('✅ Realtime manager initialized');
  }

  // ============================================================================
  // START/STOP REALTIME
  // ============================================================================

  /**
   * Start all realtime subscriptions
   * Should be called AFTER shell UI is rendered
   * 
   * @param {object} context - Session context from bootstrapSession
   */
  async function startRealtime(context) {
    if (isStarted) {
      console.log('⏭️ Realtime already started, skipping');
      return;
    }

    if (!supabase) {
      // Auto-recover from the globally initialised client (set by supabaseClient.js)
      if (window.supabase) {
        supabase = window.supabase;
      } else {
        throw new Error('Realtime manager not initialized');
      }
    }

    if (!context?.communityUser) {
      console.warn('⚠️ No community user in context, skipping realtime');
      return;
    }

    sessionContext = context;
    isStarted = true;

    // Track when realtime started
    if (!window.__realtimeStartedAt) {
      window.__realtimeStartedAt = Date.now();
      console.log('[realtime] started', new Date(window.__realtimeStartedAt).toISOString());
    }

    console.log('🔌 Starting realtime subscriptions...');

    // Subscribe to all configured channels
    for (const [key, config] of channelConfigs.entries()) {
      try {
        await _createChannel(key, config);
      } catch (error) {
        console.error(`❌ Failed to create channel ${key}:`, error);
      }
    }

    console.log(`✅ Realtime started with ${activeChannels.size} channels`);
  }

  /**
   * Stop all realtime subscriptions
   */
  async function stopRealtime() {
    if (!isStarted) {
      console.log('⏭️ Realtime not started, nothing to stop');
      return;
    }

    console.log('🔌 Stopping realtime subscriptions...');

    // Unsubscribe all channels
    for (const [key, channel] of activeChannels.entries()) {
      try {
        await supabase.removeChannel(channel);
        console.log(`✅ Unsubscribed from ${key}`);
      } catch (error) {
        console.error(`❌ Failed to unsubscribe from ${key}:`, error);
      }
    }

    activeChannels.clear();
    isStarted = false;
    sessionContext = null;

    console.log('✅ Realtime stopped');
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Subscribe to a channel (dedupe by key)
   * 
   * @param {string} key - Unique key for this subscription
   * @param {function} builderFn - Function that builds the channel
   * @returns {object|null} Channel instance or null if already subscribed
   */
  function subscribeOnce(key, builderFn) {
    // Check if already subscribed
    if (activeChannels.has(key)) {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.warn(`⚠️ Duplicate subscription attempt for key: ${key}`);
        console.trace('Stack trace:');
      }
      return activeChannels.get(key);
    }

    // Store config for later recreation
    channelConfigs.set(key, builderFn);

    // If realtime is already started, create channel immediately
    if (isStarted && sessionContext) {
      return _createChannel(key, builderFn);
    }

    // Otherwise, channel will be created when startRealtime() is called
    console.log(`📝 Registered subscription: ${key} (will start when realtime starts)`);
    return null;
  }

  /**
   * Unsubscribe from a specific channel
   * 
   * @param {string} key - Subscription key
   */
  async function unsubscribe(key) {
    const channel = activeChannels.get(key);
    if (!channel) {
      console.warn(`⚠️ No active channel found for key: ${key}`);
      return;
    }

    try {
      await supabase.removeChannel(channel);
      activeChannels.delete(key);
      channelConfigs.delete(key);
      console.log(`✅ Unsubscribed from ${key}`);
    } catch (error) {
      console.error(`❌ Failed to unsubscribe from ${key}:`, error);
    }
  }

  /**
   * Internal: Create and subscribe to a channel
   * 
   * @param {string} key - Subscription key
   * @param {function} builderFn - Function that builds the channel
   * @returns {object} Channel instance
   */
  function _createChannel(key, builderFn) {
    if (!supabase) {
      throw new Error('Realtime manager not initialized');
    }

    if (!sessionContext) {
      throw new Error('No session context available');
    }

    try {
      // Call builder function to create channel
      const channel = builderFn(supabase, sessionContext);
      
      if (!channel) {
        throw new Error('Builder function returned null/undefined');
      }

      // Store channel reference
      activeChannels.set(key, channel);
      
      console.log(`✅ Subscribed to ${key}`);
      return channel;

    } catch (error) {
      console.error(`❌ Failed to create channel ${key}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get all active channel keys
   * @returns {string[]} Array of active channel keys
   */
  function getActiveChannels() {
    return Array.from(activeChannels.keys());
  }

  /**
   * Get channel count
   * @returns {number} Number of active channels
   */
  function getChannelCount() {
    return activeChannels.size;
  }

  /**
   * Check if a specific channel is active
   * @param {string} key - Subscription key
   * @returns {boolean} True if channel is active
   */
  function isChannelActive(key) {
    return activeChannels.has(key);
  }

  // ============================================================================
  // DEV-ONLY GUARDS
  // ============================================================================

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Intercept direct channel creation in dev mode
    const originalChannel = window.supabase?.channel;
    if (originalChannel && typeof Proxy !== 'undefined') {
      window.supabase.channel = function(...args) {
        console.error('🚨 BLOCKED: Direct supabase.channel() call detected!');
        console.error('Use realtimeManager.subscribeOnce() instead');
        console.trace('Stack trace:');
        throw new Error('Direct supabase.channel() is forbidden. Use realtimeManager.subscribeOnce()');
      };
      
      // Provide escape hatch for internal use
      window.supabase._internalChannel = originalChannel;
      
      console.log('🛡️ Dev guard enabled: Direct supabase.channel() calls will throw errors');
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  // Initialize realtime started timestamp
  window.__realtimeStartedAt = null;

  window.realtimeManager = {
    initialize,
    startRealtime,
    stopRealtime,
    subscribeOnce,
    unsubscribe,
    getActiveChannels,
    getChannelCount,
    isChannelActive,
    
    // Read-only state for debugging
    get isInitialized() {
      return !!supabase;
    },
    get isStarted() {
      return isStarted;
    },
    get channelCount() {
      return activeChannels.size;
    }
  };

  console.log('✅ Realtime manager module loaded');

})();
