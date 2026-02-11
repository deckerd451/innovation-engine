/**
 * Presence UI System
 * 
 * Displays online/offline status indicators throughout the UI:
 * - Green/gray dots next to avatars
 * - "available" status in profiles
 * - "Last seen X minutes ago" text
 * 
 * Uses PresenceRealtime for data (Realtime Presence + fallback polling)
 */

(() => {
  'use strict';

  const GUARD = '__CH_PRESENCE_UI_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Presence UI already loaded');
    return;
  }
  window[GUARD] = true;

  let updateInterval = null;
  const UPDATE_INTERVAL = 5 * 1000; // Update UI every 5 seconds

  /**
   * Initialize presence UI system
   */
  async function init(supabaseClient, currentUserId = null) {
    console.log('👁️ [PresenceUI] Initializing...');

    // Store current user ID globally for presence checks
    if (currentUserId) {
      window.__currentUserId = currentUserId;
    }

    // Wait for PresenceRealtime to be available
    if (!window.PresenceRealtime) {
      console.warn('⚠️ [PresenceUI] PresenceRealtime not loaded yet, waiting...');
      await waitForPresenceRealtime();
    }

    // Initial update
    updateAllIndicators();

    // Update periodically (UI refresh only, no network calls)
    updateInterval = setInterval(() => {
      updateAllIndicators();
    }, UPDATE_INTERVAL);

    // Listen for presence updates from PresenceRealtime
    window.addEventListener('presence-updated', () => {
      updateAllIndicators();
    });

    // Listen for profile panels opening
    document.addEventListener('profile-panel-opened', (e) => {
      if (e.detail?.userId) {
        updateIndicatorsForUser(e.detail.userId);
      }
    });

    console.log('✅ [PresenceUI] Initialized');
  }

  /**
   * Wait for PresenceRealtime to load
   */
  function waitForPresenceRealtime() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.PresenceRealtime) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
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
   * Update presence for a specific user (alias for backward compatibility)
   */
  function updatePresenceForUser(userId) {
    updateIndicatorsForUser(userId);
  }

  /**
   * Update a presence dot element
   */
  function updatePresenceDot(element, userId) {
    if (!window.PresenceRealtime) return;
    
    const isOnline = window.PresenceRealtime.isOnline(userId);

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
    if (!window.PresenceRealtime) return;
    
    const isOnline = window.PresenceRealtime.isOnline(userId);

    element.textContent = isOnline ? 'available' : 'offline';
    element.style.color = isOnline ? '#00ff88' : '#666';
  }

  /**
   * Update a "last seen" text element
   */
  function updateLastSeenText(element, userId) {
    if (!window.PresenceRealtime) return;
    
    const isOnline = window.PresenceRealtime.isOnline(userId);
    const lastSeen = window.PresenceRealtime.getLastSeen(userId);
    
    if (isOnline) {
      element.textContent = 'Active now';
      element.style.color = '#00ff88';
    } else if (lastSeen) {
      const timeAgo = getTimeAgo(lastSeen);
      element.textContent = `Last seen ${timeAgo}`;
      element.style.color = '#888';
    } else {
      element.textContent = 'Last seen: unknown';
      element.style.color = '#666';
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
    updateAllIndicators,
    updateIndicatorsForUser,
    updatePresenceForUser, // Backward compatibility
    createPresenceDot,
    addPresenceDotToAvatar,
    getTimeAgo,
    isOnline: (userId) => window.PresenceRealtime?.isOnline(userId) || false
  };

  console.log('✅ Presence UI module loaded');
})();
