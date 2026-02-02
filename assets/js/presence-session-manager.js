/**
 * Presence Session Manager
 * 
 * Creates and maintains presence sessions for active users.
 * This tracks when users are online and actively using the dashboard.
 */

(() => {
  'use strict';

  const GUARD = '__CH_PRESENCE_SESSION_MANAGER_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Presence session manager already loaded');
    return;
  }
  window[GUARD] = true;

  let currentSessionId = null;
  let heartbeatInterval = null;
  let supabase = null;
  let userId = null;

  const HEARTBEAT_INTERVAL = 30000; // 30 seconds
  const SESSION_TIMEOUT = 60000; // 1 minute (2x heartbeat)

  /**
   * Initialize presence tracking for current user
   */
  async function initialize(supabaseClient, currentUserId) {
    supabase = supabaseClient;
    userId = currentUserId;

    console.log('👋 Initializing presence session for user:', userId);

    try {
      // Create initial presence session
      await createPresenceSession();

      // Start heartbeat to keep session alive
      startHeartbeat();

      // Cleanup on page unload
      window.addEventListener('beforeunload', cleanup);
      window.addEventListener('pagehide', cleanup);

      // Handle visibility changes (tab switching)
      document.addEventListener('visibilitychange', handleVisibilityChange);

      console.log('✅ Presence session initialized');
    } catch (error) {
      console.error('❌ Failed to initialize presence session:', error);
    }
  }

  /**
   * Create a new presence session
   */
  async function createPresenceSession() {
    try {
      // Try with is_active column first
      let { data, error } = await supabase
        .from('presence_sessions')
        .insert({
          user_id: userId,
          last_seen: new Date().toISOString(),
          is_active: true
        })
        .select()
        .single();

      // If is_active column doesn't exist, try without it
      if (error && error.message?.includes('is_active')) {
        console.warn('⚠️ is_active column not found, creating session without it');
        const result = await supabase
          .from('presence_sessions')
          .insert({
            user_id: userId,
            last_seen: new Date().toISOString()
          })
          .select()
          .single();
        
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('Error creating presence session:', error);
        return;
      }

      currentSessionId = data.id;
      console.log('✅ Presence session created:', currentSessionId);
    } catch (error) {
      console.error('Error creating presence session:', error);
    }
  }

  /**
   * Update presence session (heartbeat)
   */
  async function updatePresenceSession() {
    if (!currentSessionId) {
      // Session doesn't exist, create it
      await createPresenceSession();
      return;
    }

    try {
      const { error } = await supabase
        .from('presence_sessions')
        .update({
          last_seen: new Date().toISOString(),
          is_active: true
        })
        .eq('id', currentSessionId);

      if (error) {
        console.error('Error updating presence session:', error);
        // Session might have been deleted, create a new one
        currentSessionId = null;
        await createPresenceSession();
      }
    } catch (error) {
      console.error('Error updating presence session:', error);
    }
  }

  /**
   * Start heartbeat interval
   */
  function startHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(() => {
      updatePresenceSession();
    }, HEARTBEAT_INTERVAL);

    console.log('💓 Presence heartbeat started');
  }

  /**
   * Stop heartbeat interval
   */
  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
      console.log('💔 Presence heartbeat stopped');
    }
  }

  /**
   * Handle visibility change (tab switching)
   */
  function handleVisibilityChange() {
    if (document.hidden) {
      // Tab is hidden - mark as inactive but keep session
      markInactive();
    } else {
      // Tab is visible again - mark as active and resume heartbeat
      markActive();
    }
  }

  /**
   * Mark session as inactive (tab hidden)
   */
  async function markInactive() {
    if (!currentSessionId) return;

    try {
      await supabase
        .from('presence_sessions')
        .update({
          is_active: false,
          last_seen: new Date().toISOString()
        })
        .eq('id', currentSessionId);

      stopHeartbeat();
      console.log('😴 Presence marked as inactive');
    } catch (error) {
      console.error('Error marking presence inactive:', error);
    }
  }

  /**
   * Mark session as active (tab visible)
   */
  async function markActive() {
    if (!currentSessionId) {
      await createPresenceSession();
    } else {
      try {
        await supabase
          .from('presence_sessions')
          .update({
            is_active: true,
            last_seen: new Date().toISOString()
          })
          .eq('id', currentSessionId);

        console.log('👀 Presence marked as active');
      } catch (error) {
        console.error('Error marking presence active:', error);
      }
    }

    startHeartbeat();
  }

  /**
   * Cleanup presence session
   */
  async function cleanup() {
    console.log('🧹 Cleaning up presence session');

    stopHeartbeat();

    if (currentSessionId) {
      try {
        // Delete the session (user is leaving)
        await supabase
          .from('presence_sessions')
          .delete()
          .eq('id', currentSessionId);

        console.log('✅ Presence session cleaned up');
      } catch (error) {
        console.error('Error cleaning up presence session:', error);
      }
    }
  }

  /**
   * Get current session info
   */
  function getSessionInfo() {
    return {
      sessionId: currentSessionId,
      userId: userId,
      isActive: !document.hidden && !!heartbeatInterval
    };
  }

  // Export public API
  window.PresenceSessionManager = {
    initialize,
    cleanup,
    getSessionInfo,
    markActive,
    markInactive
  };

  console.log('✅ Presence session manager loaded');

})();
