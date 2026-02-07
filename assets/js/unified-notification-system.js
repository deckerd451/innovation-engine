// ================================================================
// UNIFIED NOTIFICATION SYSTEM
// ================================================================
// Combines START sequence updates with messages and notifications
// Replaces the green START button with an enhanced notification center
// ================================================================

console.log("%c🔔 Unified Notification System Loading...", "color:#0f8; font-weight:bold; font-size:16px;");

(() => {
  'use strict';

  const GUARD = '__CH_UNIFIED_NOTIFICATIONS_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Unified notifications already loaded');
    return;
  }
  window[GUARD] = true;

  let currentUserProfile = null;
  let unifiedData = {
    startSequence: null,
    messages: [],
    notifications: [],
    totalUnread: 0
  };
  let realtimeSubscriptions = [];

  // ================================================================
  // INITIALIZATION
  // ================================================================

  async function init(userProfile) {
    currentUserProfile = userProfile;
    console.log('🔔 Initializing unified notifications for user:', userProfile.id);

    // Replace the green START button with notification button
    replaceStartButton();

    // Load all data
    await loadAllData();

    // Setup realtime subscriptions
    setupRealtimeSubscriptions();

    // Refresh every 30 seconds
    setInterval(loadAllData, 30000);

    console.log('✅ Unified notification system initialized');
  }

  // ================================================================
  // REPLACE START BUTTON
  // ================================================================

  function replaceStartButton() {
    const startButton = document.getElementById('btn-start-nav');
    if (!startButton) {
      console.warn('⚠️ START button not found');
      return;
    }

    // Replace with notification button
    startButton.innerHTML = `
      <i class="fas fa-bell" style="font-size:1.2rem; color:#00e0ff;"></i>
    `;
    
    // Update styling
    startButton.style.background = 'rgba(0,224,255,0.1)';
    startButton.style.borderColor = 'rgba(0,224,255,0.3)';
    
    // Remove old click handler and add new one
    const newButton = startButton.cloneNode(true);
    startButton.parentNode.replaceChild(newButton, startButton);
    
    newButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showUnifiedNotificationPanel();
    });

    console.log('✅ START button replaced with notification button');
  }

  // ================================================================
  // LOAD ALL DATA
  // ================================================================

  async function loadAllData() {
    if (!currentUserProfile) return;

    try {
      // Load START sequence data
      if (window.getStartSequenceData) {
        unifiedData.startSequence = await window.getStartSequenceData(false);
      }

      // Load messages
      await loadMessages();

      // Load notifications
      await loadNotifications();

      // Calculate total unread
      calculateTotalUnread();

      // Update badge
      updateNotificationBadge();

    } catch (error) {
      console.error('Error loading unified data:', error);
    }
  }

  async function loadMessages() {
    if (!window.supabase) return;

    try {
      // Get unread message count from conversations
      const { data, error } = await window.supabase
        .from('conversations')
        .select('id, last_message_at, last_message_preview, participant_1_id, participant_2_id')
        .or(`participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${currentUserProfile.id}`)
        .order('last_message_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // For each conversation, check for unread messages
      const messagesWithUnread = [];
      for (const conv of data || []) {
        const { count, error: countError } = await window.supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('read', false)
          .neq('sender_id', currentUserProfile.id);

        if (!countError && count > 0) {
          messagesWithUnread.push({
            ...conv,
            unread_count: count
          });
        }
      }

      unifiedData.messages = messagesWithUnread;

    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function loadNotifications() {
    if (!window.supabase) return;

    try {
      const { data, error } = await window.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserProfile.id)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      unifiedData.notifications = data || [];

    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  function calculateTotalUnread() {
    let total = 0;

    // Count unread messages
    total += unifiedData.messages.reduce((sum, msg) => sum + (msg.unread_count || 0), 0);

    // Count unread notifications
    total += unifiedData.notifications.length;

    // Count START sequence immediate actions
    if (unifiedData.startSequence?.immediate_actions) {
      const actions = unifiedData.startSequence.immediate_actions;
      total += (actions.pending_requests?.count || 0);
      total += (actions.pending_bids?.count || 0);
      total += (actions.bids_to_review?.count || 0);
    }

    unifiedData.totalUnread = total;
  }

  // ================================================================
  // UPDATE BADGE
  // ================================================================

  function updateNotificationBadge() {
    const button = document.getElementById('btn-start-nav');
    if (!button) return;

    // Remove existing badge
    const existingBadge = button.querySelector('.notification-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    // Add badge if there are unread items
    if (unifiedData.totalUnread > 0) {
      const badge = document.createElement('span');
      badge.className = 'notification-badge';
      badge.textContent = unifiedData.totalUnread > 99 ? '99+' : unifiedData.totalUnread;
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
      button.appendChild(badge);
    }
  }

  // ================================================================
  // SHOW UNIFIED NOTIFICATION PANEL
  // ================================================================

  function showUnifiedNotificationPanel() {
    // Remove existing panel
    const existing = document.getElementById('unified-notification-panel');
    if (existing) {
      existing.remove();
      return; // Toggle behavior
    }

    const panel = createUnifiedPanel();
    document.body.appendChild(panel);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeOnOutside(e) {
        if (!panel.contains(e.target) && e.target.id !== 'btn-start-nav') {
          panel.remove();
          document.removeEventListener('click', closeOnOutside);
        }
      });
    }, 100);
  }

  function createUnifiedPanel() {
    const panel = document.createElement('div');
    panel.id = 'unified-notification-panel';
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 450px;
      max-width: calc(100vw - 40px);
      max-height: 80vh;
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
      border: 2px solid rgba(0,224,255,0.4);
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.7);
      backdrop-filter: blur(20px);
      z-index: 10000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.3s ease-out;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 1.5rem;
      border-bottom: 1px solid rgba(0,224,255,0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    `;
    header.innerHTML = `
      <div>
        <h3 style="margin: 0 0 0.25rem 0; color: #00e0ff; font-size: 1.3rem;">
          <i class="fas fa-bell"></i> Updates
        </h3>
        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 0.9rem;">
          ${unifiedData.totalUnread} ${unifiedData.totalUnread === 1 ? 'item' : 'items'} need your attention
        </p>
      </div>
      <button id="close-unified-panel" style="
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
      ">
        <i class="fas fa-times"></i>
      </button>
    `;

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    `;

    content.innerHTML = generatePanelContent();

    panel.appendChild(header);
    panel.appendChild(content);

    // Close button handler
    header.querySelector('#close-unified-panel').addEventListener('click', () => {
      panel.remove();
    });

    return panel;
  }

  function generatePanelContent() {
    let html = '';

    // START Sequence Immediate Actions
    if (unifiedData.startSequence?.immediate_actions) {
      const actions = unifiedData.startSequence.immediate_actions;
      
      if (actions.pending_requests?.count > 0) {
        html += createNotificationSection(
          'Connection Requests',
          'user-plus',
          '#00e0ff',
          actions.pending_requests.items.map(req => ({
            title: `${req.from_name || 'Someone'} wants to connect`,
            subtitle: req.created_at ? getTimeAgo(new Date(req.created_at)) : '',
            icon: '🤝',
            onClick: () => {
              window.location.href = '#connections';
              document.getElementById('unified-notification-panel')?.remove();
            }
          }))
        );
      }

      if (actions.bids_to_review?.count > 0) {
        html += createNotificationSection(
          'Project Bids to Review',
          'clipboard-check',
          '#00ff88',
          actions.bids_to_review.items.map(bid => ({
            title: `New bid on ${bid.project_title || 'your project'}`,
            subtitle: bid.created_at ? getTimeAgo(new Date(bid.created_at)) : '',
            icon: '📋',
            onClick: () => {
              // Open projects panel
              document.getElementById('unified-notification-panel')?.remove();
            }
          }))
        );
      }
    }

    // Unread Messages
    if (unifiedData.messages.length > 0) {
      html += createNotificationSection(
        'Unread Messages',
        'envelope',
        '#00e0ff',
        unifiedData.messages.map(msg => ({
          title: msg.last_message_preview || 'New message',
          subtitle: msg.last_message_at ? getTimeAgo(new Date(msg.last_message_at)) : '',
          icon: '💬',
          badge: msg.unread_count,
          onClick: () => {
            if (window.openMessagingInterface) {
              window.openMessagingInterface(msg.id);
            }
            document.getElementById('unified-notification-panel')?.remove();
          }
        }))
      );
    }

    // Other Notifications
    if (unifiedData.notifications.length > 0) {
      html += createNotificationSection(
        'Notifications',
        'bell',
        '#ffaa00',
        unifiedData.notifications.map(notif => ({
          title: notif.title,
          subtitle: notif.created_at ? getTimeAgo(new Date(notif.created_at)) : '',
          icon: getNotificationIcon(notif.type),
          onClick: () => {
            if (notif.link) {
              window.location.href = notif.link;
            }
            markNotificationAsRead(notif.id);
            document.getElementById('unified-notification-panel')?.remove();
          }
        }))
      );
    }

    // START Sequence Opportunities
    if (unifiedData.startSequence?.opportunities) {
      const opps = unifiedData.startSequence.opportunities;
      
      if (opps.skill_matched_projects?.count > 0) {
        html += createNotificationSection(
          'Opportunities',
          'lightbulb',
          '#00ff88',
          opps.skill_matched_projects.items.slice(0, 3).map(proj => ({
            title: proj.title || 'Project matches your skills',
            subtitle: proj.matched_skills ? `Skills: ${proj.matched_skills.slice(0, 2).join(', ')}` : '',
            icon: '💡',
            onClick: () => {
              // Open projects
              document.getElementById('unified-notification-panel')?.remove();
            }
          }))
        );
      }
    }

    // Empty state
    if (!html) {
      html = `
        <div style="text-align: center; padding: 3rem 1rem; color: rgba(255,255,255,0.5);">
          <i class="fas fa-check-circle" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem; color: #00ff88;"></i>
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">All caught up!</p>
          <p style="font-size: 0.9rem;">No new updates at the moment</p>
        </div>
      `;
    }

    return html;
  }

  function createNotificationSection(title, icon, color, items) {
    if (!items || items.length === 0) return '';

    return `
      <div style="margin-bottom: 1.5rem;">
        <h4 style="
          color: ${color};
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 0.75rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        ">
          <i class="fas fa-${icon}"></i>
          ${title}
        </h4>
        ${items.map(item => `
          <div onclick="${item.onClick ? `(${item.onClick.toString()})()` : ''}" style="
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            background: rgba(0,224,255,0.05);
            border: 1px solid rgba(0,224,255,0.15);
            border-radius: 8px;
            cursor: ${item.onClick ? 'pointer' : 'default'};
            transition: all 0.2s;
            display: flex;
            align-items: start;
            gap: 0.75rem;
          " onmouseover="this.style.background='rgba(0,224,255,0.1)'; this.style.borderColor='rgba(0,224,255,0.3)'"
             onmouseout="this.style.background='rgba(0,224,255,0.05)'; this.style.borderColor='rgba(0,224,255,0.15)'">
            <div style="font-size: 1.5rem; flex-shrink: 0;">
              ${item.icon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="
                color: white;
                font-weight: 500;
                margin-bottom: 0.25rem;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              ">
                ${item.title}
              </div>
              ${item.subtitle ? `
                <div style="
                  color: rgba(255,255,255,0.6);
                  font-size: 0.85rem;
                ">
                  ${item.subtitle}
                </div>
              ` : ''}
            </div>
            ${item.badge ? `
              <div style="
                background: #ff3b30;
                color: white;
                border-radius: 12px;
                padding: 2px 8px;
                font-size: 0.75rem;
                font-weight: bold;
                flex-shrink: 0;
              ">
                ${item.badge}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // ================================================================
  // HELPER FUNCTIONS
  // ================================================================

  function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
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

  async function markNotificationAsRead(notificationId) {
    if (!window.supabase) return;

    try {
      await window.supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      // Refresh data
      await loadAllData();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // ================================================================
  // REALTIME SUBSCRIPTIONS
  // ================================================================

  function setupRealtimeSubscriptions() {
    if (!window.supabase || !currentUserProfile) return;

    // Subscribe to notifications
    const notifChannel = window.supabase
      .channel('unified-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserProfile.id}`
        },
        () => {
          loadAllData();
        }
      )
      .subscribe();

    realtimeSubscriptions.push(notifChannel);

    // Subscribe to messages
    const msgChannel = window.supabase
      .channel('unified-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          loadAllData();
        }
      )
      .subscribe();

    realtimeSubscriptions.push(msgChannel);
  }

  // ================================================================
  // CLEANUP
  // ================================================================

  function cleanup() {
    realtimeSubscriptions.forEach(sub => {
      try {
        window.supabase.removeChannel(sub);
      } catch (e) {
        console.warn('Error removing subscription:', e);
      }
    });
    realtimeSubscriptions = [];
  }

  window.addEventListener('user-logged-out', cleanup);

  // ================================================================
  // PUBLIC API
  // ================================================================

  window.UnifiedNotifications = {
    init,
    refresh: loadAllData,
    show: showUnifiedNotificationPanel,
    cleanup
  };

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    #unified-notification-panel::-webkit-scrollbar {
      width: 8px;
    }

    #unified-notification-panel::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.2);
      border-radius: 4px;
    }

    #unified-notification-panel::-webkit-scrollbar-thumb {
      background: rgba(0,224,255,0.3);
      border-radius: 4px;
    }

    #unified-notification-panel::-webkit-scrollbar-thumb:hover {
      background: rgba(0,224,255,0.5);
    }

    @media (max-width: 768px) {
      #unified-notification-panel {
        top: 70px !important;
        right: 10px !important;
        left: 10px !important;
        width: auto !important;
        max-width: none !important;
      }
    }
  `;
  document.head.appendChild(style);

  console.log('✅ Unified notification system loaded');

})();
