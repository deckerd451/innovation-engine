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

  let currentSessionId = null;
  let heartbeatInterval = null;
  let supabase = null;
  let communityProfileId = null; // Community profile ID, not auth user ID

  // ✅ EGRESS OPTIMIZATION: Reduced heartbeat frequency (90% reduction in presence updates)
  const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes (was 30 seconds)
  const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes (2x heartbeat)
  const IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes of inactivity = idle

  // Track user activity for idle detection
  let lastActivity = Date.now();

  // Setup activity listeners (passive for performance)
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      lastActivity = Date.now();
    }, { passive: true, capture: true });
  });

  /**
   * Initialize presence tracking for current user
   * @param {object} supabaseClient - Supabase client instance
   * @param {string} profileId - Community profile ID (not auth user ID)
   */
  async function initialize(supabaseClient, profileId) {
    supabase = supabaseClient;
    communityProfileId = profileId;

    console.log('👋 Initializing presence session for community profile:', profileId);

    try {
      // Check if user exists in community table first
      console.log('🔍 Checking for user profile with user_id:', communityProfileId);
      
      const { data: userExists, error: checkError } = await supabase
        .from('community')
        .select('id, user_id, email, name')
        .eq('id', communityProfileId)
        .maybeSingle();

      console.log('📊 Profile check result:', { userExists, checkError });

      if (checkError) {
        console.error('❌ Error checking for profile:', checkError);
        console.warn('⚠️ User not found in community table, skipping presence session');
        console.log('💡 Presence will be initialized after profile is created');
        
        // Listen for profile creation
        window.addEventListener('profile-loaded', async (e) => {
          if (e.detail?.profile?.id === communityProfileId && !currentSessionId) {
            console.log('✅ Profile loaded, initializing presence session');
            await createPresenceSession();
            startHeartbeat();
          }
        });
        
        return;
      }

      if (!userExists) {
        console.warn('⚠️ User not found in community table, skipping presence session');
        console.log('💡 Presence will be initialized after profile is created');
        
        // Listen for profile creation
        window.addEventListener('profile-loaded', async (e) => {
          if (e.detail?.profile?.id === communityProfileId && !currentSessionId) {
            console.log('✅ Profile loaded, initializing presence session');
            await createPresenceSession();
            startHeartbeat();
          }
        });
        
        return;
      }

      console.log('✅ Found user profile:', userExists);

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
      // First, delete any existing active sessions for this user to prevent duplicates
      const { error: deleteError } = await supabase
        .from('presence_sessions')
        .delete()
        .eq('user_id', communityProfileId)
        .eq('is_active', true);
      
      if (deleteError) {
        console.warn('⚠️ Could not delete existing sessions:', deleteError);
      } else {
        console.log('🧹 Cleaned up any existing sessions');
      }
      
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + SESSION_TIMEOUT).toISOString();
      
      // Try with all columns (unified network schema + simple tracking)
      let { data, error } = await supabase
        .from('presence_sessions')
        .insert({
          user_id: communityProfileId,
          last_seen: now,
          is_active: true,
          context_type: 'general',
          context_id: '00000000-0000-0000-0000-000000000000',
          energy: 1.0,
          expires_at: expiresAt
        })
        .select()
        .single();

      // If is_active column doesn't exist, try without it
      if (error && error.message?.includes('is_active')) {
        console.warn('⚠️ is_active column not found, creating session without it');
        const result = await supabase
          .from('presence_sessions')
          .insert({
            user_id: communityProfileId,
            last_seen: now,
            context_type: 'general',
            context_id: '00000000-0000-0000-0000-000000000000',
            energy: 1.0,
            expires_at: expiresAt
          })
          .select()
          .single();
        
        data = result.data;
        error = result.error;
      }

      // If last_seen column doesn't exist, try with just unified network schema
      if (error && error.message?.includes('last_seen')) {
        console.warn('⚠️ last_seen column not found, using unified network schema only');
        const result = await supabase
          .from('presence_sessions')
          .insert({
            user_id: communityProfileId,
            context_type: 'general',
            context_id: '00000000-0000-0000-0000-000000000000',
            energy: 1.0,
            expires_at: expiresAt
          })
          .select()
          .single();
        
        data = result.data;
        error = result.error;
      }

      if (error) {
        // Check if it's a foreign key constraint error (user not in community table)
        if (error.code === '23503' && error.message?.includes('presence_sessions_user_id_fkey')) {
          console.warn('⚠️ Cannot create presence session: User profile not found in community table');
          console.log('💡 Waiting for profile to be created...');
          return;
        }
        
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

    // ✅ IDLE DETECTION: Skip update if user is idle
    const idleTime = Date.now() - lastActivity;
    if (idleTime > IDLE_THRESHOLD) {
      console.log(`⏸️ User idle (${Math.floor(idleTime / 1000)}s), skipping presence update`);
      return;
    }

    try {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + SESSION_TIMEOUT).toISOString();
      
      const { error } = await supabase
        .from('presence_sessions')
        .update({
          last_seen: now,
          is_active: true,
          expires_at: expiresAt,
          energy: 1.0
        })
        .eq('id', currentSessionId);

      if (error) {
        console.error('Error updating presence session:', error);
        // Session might have been deleted, create a new one
        currentSessionId = null;
        await createPresenceSession();
      } else {
        console.log('💓 Presence heartbeat sent');
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

    console.log(`💓 Presence heartbeat started (${HEARTBEAT_INTERVAL / 60000}min interval with idle detection)`);
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
      communityProfileId: communityProfileId,
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
