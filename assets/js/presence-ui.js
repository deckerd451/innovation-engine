/**
 * Presence UI System
 * 
 * Displays online/offline status indicators throughout the UI:
 * - Green/gray dots next to avatars
 * - "available" status in profiles
 * - "Last seen X minutes ago" text
 */

(() => {
  'use strict';

  const GUARD = '__CH_PRESENCE_UI_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Presence UI already loaded');
    return;
  }
  window[GUARD] = true;

  let supabase = null;
  let presenceCache = new Map(); // userId -> { isOnline, lastSeen }
  let updateInterval = null;

  const ONLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
  const UPDATE_INTERVAL = 30 * 1000; // Update UI every 30 seconds

  /**
   * Initialize presence UI system
   */
  async function init(supabaseClient, currentUserId = null) {
    supabase = supabaseClient;
    console.log('👁️ Initializing presence UI system...');

    // Store current user ID globally for presence checks
    if (currentUserId) {
      window.__currentUserId = currentUserId;
    }

    // Initial load
    await updateAllPresence();

    // Update periodically
    updateInterval = setInterval(updateAllPresence, UPDATE_INTERVAL);

    // Listen for profile panels opening
    document.addEventListener('profile-panel-opened', (e) => {
      if (e.detail?.userId) {
        updatePresenceForUser(e.detail.userId);
      }
    });

    console.log('✅ Presence UI system initialized');
  }

  /**
   * Fetch presence data for all users
   */
  async function updateAllPresence() {
    if (!supabase) return;

    try {
      const { data: sessions, error } = await supabase
        .from('presence_sessions')
        .select('user_id, is_active, last_seen, expires_at')
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching presence:', error);
        return;
      }

      // Update cache
      presenceCache.clear();
      (sessions || []).forEach(session => {
        const lastSeenTime = new Date(session.last_seen).getTime();
        const expiresAt = new Date(session.expires_at).getTime();
        
        // User is online if session hasn't expired yet
        const isOnline = Date.now() < expiresAt;
        
        presenceCache.set(session.user_id, {
          isOnline,
          lastSeen: lastSeenTime
        });
      });

      // Update all visible presence indicators
      updateAllIndicators();

    } catch (error) {
      console.error('Error updating presence:', error);
    }
  }

  /**
   * Update presence for a specific user
   */
  async function updatePresenceForUser(userId) {
    if (!supabase || !userId) return;

    try {
      // Use order + limit instead of maybeSingle to handle duplicate sessions
      const { data: sessions, error } = await supabase
        .from('presence_sessions')
        .select('user_id, is_active, last_seen, expires_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_seen', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching user presence:', error);
        return;
      }

      const session = sessions && sessions.length > 0 ? sessions[0] : null;

      if (session) {
        const lastSeenTime = new Date(session.last_seen).getTime();
        const expiresAt = new Date(session.expires_at).getTime();
        
        // User is online if session hasn't expired yet
        const isOnline = Date.now() < expiresAt;
        
        presenceCache.set(userId, {
          isOnline,
          lastSeen: lastSeenTime
        });
      } else {
        presenceCache.delete(userId);
      }

      // Update indicators for this user
      updateIndicatorsForUser(userId);

    } catch (error) {
      console.error('Error updating user presence:', error);
    }
  }

  /**
   * Update all presence indicators in the DOM
   */
  function updateAllIndicators() {
    // Update all presence dots
    document.querySelectorAll('[data-presence-user-id]').forEach(el => {
      const userId = el.getAttribute('data-presence-user-id');
      updatePresenceDot(el, userId);
    });

    // Update all status texts
    document.querySelectorAll('[data-presence-status-user-id]').forEach(el => {
      const userId = el.getAttribute('data-presence-status-user-id');
      updatePresenceStatus(el, userId);
    });

    // Update all last seen texts
    document.querySelectorAll('[data-presence-lastseen-user-id]').forEach(el => {
      const userId = el.getAttribute('data-presence-lastseen-user-id');
      updateLastSeenText(el, userId);
    });
  }

  /**
   * Update indicators for a specific user
   */
  function updateIndicatorsForUser(userId) {
    // Update presence dots for this user
    document.querySelectorAll(`[data-presence-user-id="${userId}"]`).forEach(el => {
      updatePresenceDot(el, userId);
    });

    // Update status texts for this user
    document.querySelectorAll(`[data-presence-status-user-id="${userId}"]`).forEach(el => {
      updatePresenceStatus(el, userId);
    });

    // Update last seen texts for this user
    document.querySelectorAll(`[data-presence-lastseen-user-id="${userId}"]`).forEach(el => {
      updateLastSeenText(el, userId);
    });
  }

  /**
   * Update a presence dot element
   */
  function updatePresenceDot(element, userId) {
    // Get current user ID
    const currentUserId = window.supabase?.auth?.getUser?.()?.then(u => u.data?.user?.id);
    
    // Check if this is the current user's dot
    const isCurrentUser = userId && window.__currentUserId && userId === window.__currentUserId;
    
    const presence = presenceCache.get(userId);
    const isOnline = isCurrentUser || presence?.isOnline || false; // Current user is always online

    // Update dot color
    element.style.backgroundColor = isOnline ? '#00ff88' : '#666';
    element.style.boxShadow = isOnline ? '0 0 8px rgba(0,255,136,0.6)' : 'none';
    
    // Update title
    element.title = isOnline ? 'Online' : 'Offline';
  }

  /**
   * Update a presence status text element
   */
  function updatePresenceStatus(element, userId) {
    // Check if this is the current user
    const isCurrentUser = userId && window.__currentUserId && userId === window.__currentUserId;
    
    const presence = presenceCache.get(userId);
    const isOnline = isCurrentUser || presence?.isOnline || false; // Current user is always online

    element.textContent = isOnline ? 'available' : 'offline';
    element.style.color = isOnline ? '#00ff88' : '#666';
  }

  /**
   * Update a "last seen" text element
   */
  function updateLastSeenText(element, userId) {
    // Check if this is the current user
    const isCurrentUser = userId && window.__currentUserId && userId === window.__currentUserId;
    
    // Current user is always "Active now"
    if (isCurrentUser) {
      element.textContent = 'Active now';
      element.style.color = '#00ff88';
      return;
    }
    
    const presence = presenceCache.get(userId);
    
    if (!presence) {
      element.textContent = 'Last seen: unknown';
      element.style.color = '#666';
      return;
    }

    if (presence.isOnline) {
      element.textContent = 'Active now';
      element.style.color = '#00ff88';
    } else {
      const timeAgo = getTimeAgo(presence.lastSeen);
      element.textContent = `Last seen ${timeAgo}`;
      element.style.color = '#888';
    }
  }

  /**
   * Get human-readable time ago
   */
  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  }

  /**
   * Create a presence dot element
   */
  function createPresenceDot(userId, size = 10) {
    const dot = document.createElement('div');
    dot.setAttribute('data-presence-user-id', userId);
    dot.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background-color: #666;
      border: 2px solid #000;
      position: absolute;
      bottom: 0;
      right: 0;
      z-index: 10;
      transition: all 0.3s ease;
    `;
    
    updatePresenceDot(dot, userId);
    return dot;
  }

  /**
   * Add presence dot to an avatar element
   */
  function addPresenceDotToAvatar(avatarElement, userId) {
    // Check if dot already exists
    if (avatarElement.querySelector('[data-presence-user-id]')) {
      return;
    }

    // Make avatar container relative
    avatarElement.style.position = 'relative';

    // Create and add dot
    const dot = createPresenceDot(userId);
    avatarElement.appendChild(dot);
  }

  /**
   * Cleanup on page unload
   */
  window.addEventListener('beforeunload', () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });

  // Expose public API
  window.PresenceUI = {
    init,
    updateAllPresence,
    updatePresenceForUser,
    createPresenceDot,
    addPresenceDotToAvatar,
    getTimeAgo,
    isOnline: (userId) => presenceCache.get(userId)?.isOnline || false
  };

  console.log('✅ Presence UI module loaded');
})();
