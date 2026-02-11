// ================================================================
// NOTIFICATION BELL MODULE
// ================================================================
// Handles notification bell icon, unread count, and notification panel

(() => {
  'use strict';

  const GUARD = '__CH_NOTIFICATION_BELL_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Notification bell already loaded');
    return;
  }
  window[GUARD] = true;

  let currentUserProfile = null;
  let unreadCount = 0;
  let notifications = [];
  let realtimeSubscription = null;

  // ================================================================
  // INITIALIZATION
  // ================================================================

  function init(userProfile) {
    currentUserProfile = userProfile;
    console.log('🔔 Initializing notification bell for user:', userProfile.id);

    // Load initial notifications
    loadNotifications();

    // Setup realtime subscription
    setupRealtimeSubscription();

    // Refresh every 30 seconds
    setInterval(loadNotifications, 30000);
  }

  // ================================================================
  // LOAD NOTIFICATIONS
  // ================================================================

  async function loadNotifications() {
    if (!currentUserProfile) return;

    try {
      const { data, error } = await window.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserProfile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      notifications = data || [];
      // Get unread MESSAGE count from messaging system
      const { data: messageCount, error: countError } = await window.supabase.rpc('get_unread_count');
      unreadCount = (!countError && messageCount !== null) ? messageCount : 0;

      updateBellBadge();
      console.log(`📬 Loaded ${notifications.length} notifications (${unreadCount} unread messages)`);

    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }

  // ================================================================
  // UPDATE BELL BADGE
  // ================================================================

  function updateBellBadge() {
    const bell = document.getElementById('notification-bell');
    if (!bell) return;

    // Remove existing badge
    const existingBadge = bell.querySelector('.notification-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    // Add badge if there are unread notifications
    if (unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'notification-badge';
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ff3b30;
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 0.7rem;
        font-weight: bold;
        min-width: 18px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        z-index: 10;
      `;
      bell.appendChild(badge);
    }
  }

  // ================================================================
  // SHOW NOTIFICATION PANEL
  // ================================================================

  function showNotificationPanel() {
    const panel = createNotificationPanel();
    document.body.appendChild(panel);

    // Mark all as read after a delay
    setTimeout(() => {
      markAllAsRead();
    }, 2000);
  }

  function createNotificationPanel() {
    const panel = document.createElement('div');
    panel.id = 'notification-panel';
    panel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      width: 400px;
      max-width: calc(100vw - 40px);
      max-height: 600px;
      background: linear-gradient(135deg, rgba(20,20,40,0.98), rgba(10,10,30,0.98));
      border: 1px solid rgba(0,224,255,0.3);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 10000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <h3 style="margin: 0; color: #00e0ff; font-size: 1.1rem;">
        <i class="fas fa-bell"></i> Notifications
      </h3>
      <button id="close-notifications" style="
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.6);
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
      ">
        <i class="fas fa-times"></i>
      </button>
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    `;

    if (notifications.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: rgba(255,255,255,0.5);">
          <i class="fas fa-bell-slash" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <p>No notifications yet</p>
        </div>
      `;
    } else {
      notifications.forEach(notif => {
        const item = createNotificationItem(notif);
        content.appendChild(item);
      });
    }

    panel.appendChild(header);
    panel.appendChild(content);

    // Close button handler
    header.querySelector('#close-notifications').addEventListener('click', () => {
      panel.remove();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeOnOutside(e) {
        if (!panel.contains(e.target) && e.target.id !== 'notification-bell') {
          panel.remove();
          document.removeEventListener('click', closeOnOutside);
        }
      });
    }, 100);

    return panel;
  }

  function createNotificationItem(notif) {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 1rem;
      margin-bottom: 0.5rem;
      background: ${notif.read ? 'rgba(255,255,255,0.03)' : 'rgba(0,224,255,0.08)'};
      border: 1px solid ${notif.read ? 'rgba(255,255,255,0.1)' : 'rgba(0,224,255,0.2)'};
      border-radius: 8px;
      cursor: ${notif.link ? 'pointer' : 'default'};
      transition: all 0.2s;
    `;

    const icon = getNotificationIcon(notif.type);
    const timeAgo = getTimeAgo(new Date(notif.created_at));

    item.innerHTML = `
      <div style="display: flex; gap: 0.75rem; align-items: start;">
        <div style="font-size: 1.5rem; flex-shrink: 0;">
          ${icon}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: ${notif.read ? 'rgba(255,255,255,0.8)' : '#00e0ff'}; margin-bottom: 0.25rem;">
            ${notif.title}
          </div>
          ${notif.message ? `
            <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.5rem;">
              ${notif.message}
            </div>
          ` : ''}
          <div style="color: rgba(255,255,255,0.4); font-size: 0.75rem;">
            ${timeAgo}
          </div>
        </div>
        ${!notif.read ? `
          <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; flex-shrink: 0; margin-top: 0.5rem;"></div>
        ` : ''}
      </div>
    `;

    if (notif.link) {
      item.addEventListener('click', () => {
        window.location.href = notif.link;
      });
      item.style.cursor = 'pointer';
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(0,224,255,0.15)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = notif.read ? 'rgba(255,255,255,0.03)' : 'rgba(0,224,255,0.08)';
      });
    }

    return item;
  }

  function getNotificationIcon(type) {
    const icons = {
      'connection_request': '🤝',
      'project_invite': '📋',
      'org_join_request': '🏢',
      'message': '💬',
      'endorsement': '⭐',
      'project_accepted': '✅',
      'org_accepted': '🎉',
      'default': '🔔'
    };
    return icons[type] || icons.default;
  }

  function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  // ================================================================
  // MARK AS READ
  // ================================================================

  async function markAllAsRead() {
    if (!currentUserProfile || unreadCount === 0) return;

    try {
      const { error } = await window.supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', currentUserProfile.id)
        .eq('read', false);

      if (error) {
        console.error('Error marking notifications as read:', error);
        return;
      }

      // Update local state
      notifications.forEach(n => n.read = true);
      // unreadCount tracks messages, not notifications
      updateBellBadge();

    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  }

  // ================================================================
  // REALTIME SUBSCRIPTION
  // ================================================================

  function setupRealtimeSubscription() {
    if (!currentUserProfile) return;

    // Register subscription with realtimeManager (will start when realtime starts)
    realtimeSubscription = window.realtimeManager?.subscribeOnce('notifications', (supabase, context) => {
      return supabase.channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${context.communityUser.id}`
          },
          (payload) => {
            console.log('🔔 New notification received:', payload.new);
            notifications.unshift(payload.new);
            if (!payload.new.read) {
              unreadCount++;
            }
            updateBellBadge();
            showToast(payload.new.title);
          }
        )
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Notification real-time updates active');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('ℹ️ Notification real-time unavailable, using manual refresh');
            if (error) {
              console.debug('Real-time error details:', error);
            }
          }
        });
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, rgba(0,224,255,0.9), rgba(0,160,255,0.9));
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10001;
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <i class="fas fa-bell" style="font-size: 1.2rem;"></i>
        <div style="font-weight: 600;">${message}</div>
      </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ================================================================
  // CLEANUP
  // ================================================================

  window.addEventListener('user-logged-out', () => {
    if (realtimeSubscription) {
      realtimeSubscription.unsubscribe();
      realtimeSubscription = null;
    }
    currentUserProfile = null;
    unreadCount = 0;
    notifications = [];
  });

  // ================================================================
  // PUBLIC API
  // ================================================================

  window.NotificationBell = {
    init,
    showPanel: showNotificationPanel,
    refresh: loadNotifications,
    getUnreadCount: () => unreadCount
  };

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  console.log('✅ Notification bell module loaded');

})();
