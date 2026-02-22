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

    // Update icon to bell
    const icon = startButton.querySelector('i');
    if (icon) {
      icon.className = 'fas fa-bell';
      icon.style.color = '#00e0ff';
    }

    // Update styling
    startButton.style.background = 'rgba(0,224,255,0.1)';
    startButton.style.borderColor = 'rgba(0,224,255,0.3)';
    startButton.title = 'View updates, notifications, and Daily Intelligence Brief';

    // Override onclick: open the notification panel which renders the
    // Daily Intelligence Brief inline plus any pending notification items.
    startButton.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      showUnifiedNotificationPanel();
    };

    console.log('✅ START button changed to notification bell → panel');
  }

  // ================================================================
  // LOAD ALL DATA
  // ================================================================

  async function loadAllData() {
    if (!currentUserProfile) return;

    try {
      // Load START sequence data (with error handling)
      if (window.getStartSequenceData) {
        try {
          unifiedData.startSequence = await window.getStartSequenceData(false);
        } catch (startError) {
          console.warn('⚠️ START sequence data unavailable, continuing without it:', startError.message);
          unifiedData.startSequence = null;
        }
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
  // CONNECTION REQUEST HANDLERS
  // ================================================================

  async function handleAcceptConnection(connectionId) {
    try {
      // Import the accept function
      const { acceptConnectionRequest } = await import('./connections.js');
      
      // Show loading state
      showToast('Accepting connection...', 'info');
      
      // Accept the connection
      const result = await acceptConnectionRequest(connectionId);
      
      if (result.success) {
        showToast('Connection accepted!', 'success');
        
        // Refresh data
        await loadAllData();
        
        // Close and reopen panel to show updated state
        const panel = document.getElementById('unified-notification-panel');
        if (panel) {
          panel.remove();
          setTimeout(() => showUnifiedNotificationPanel(), 300);
        }
      } else {
        showToast('Failed to accept connection', 'error');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      showToast('Error accepting connection', 'error');
    }
  }

  async function handleDeclineConnection(connectionId) {
    try {
      // Import the decline function
      const { declineConnectionRequest } = await import('./connections.js');
      
      // Show loading state
      showToast('Declining connection...', 'info');
      
      // Decline the connection
      const result = await declineConnectionRequest(connectionId);
      
      if (result.success) {
        showToast('Connection declined', 'info');
        
        // Refresh data
        await loadAllData();
        
        // Close and reopen panel to show updated state
        const panel = document.getElementById('unified-notification-panel');
        if (panel) {
          panel.remove();
          setTimeout(() => showUnifiedNotificationPanel(), 300);
        }
      } else {
        showToast('Failed to decline connection', 'error');
      }
    } catch (error) {
      console.error('Error declining connection:', error);
      showToast('Error declining connection', 'error');
    }
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#00e0ff'};
      color: #fff;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ================================================================
  // SHOW UNIFIED NOTIFICATION PANEL
  // ================================================================

  // On mobile the floating dropdown is replaced by a full-screen split view
  // (Synapse top / Intelligence bottom).  The helpers live in
  // start-daily-digest.js and are exposed on window.StartDailyDigest once
  // that script has loaded.
  function _isMobile() {
    if (typeof window.StartDailyDigest?.isMobileSplit === 'function') {
      return window.StartDailyDigest.isMobileSplit();
    }
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function _showMobileSplitView() {
    // Toggle: destroy if already open
    if (document.getElementById('ie-mobile-split')) {
      if (typeof window.StartDailyDigest?._destroySplit === 'function') {
        window.StartDailyDigest._destroySplit();
      }
      return;
    }

    // Build the split DOM (moves #synapse-main-view to top pane, leaves
    // #ie-split-intelligence empty for us to fill below).
    if (typeof window.StartDailyDigest?._buildSplit === 'function') {
      window.StartDailyDigest._buildSplit();
    }

    const botPane = document.getElementById('ie-split-intelligence');
    if (!botPane) return;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
    closeBtn.style.cssText = `
      display: block; width: 100%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
      padding: 0.5rem; border-radius: 8px;
      cursor: pointer; font-size: 0.85rem;
      margin-bottom: 0.75rem; text-align: center;
    `;
    closeBtn.onclick = () => {
      if (typeof window.StartDailyDigest?._destroySplit === 'function') {
        window.StartDailyDigest._destroySplit();
      }
    };
    botPane.appendChild(closeBtn);

    // Mini header
    const heading = document.createElement('div');
    heading.style.cssText = 'padding-bottom:0.5rem; border-bottom:1px solid rgba(0,224,255,0.15); margin-bottom:0.75rem;';
    const unreadMsg = unifiedData.totalUnread > 0
      ? unifiedData.totalUnread + ' item' + (unifiedData.totalUnread === 1 ? '' : 's') + ' need your attention'
      : 'Your personalised signals &amp; updates';
    heading.innerHTML = `
      <h3 style="margin:0;color:#00e0ff;font-size:1.1rem;">
        <i class="fas fa-brain"></i> Daily Intelligence Brief
      </h3>
      <p style="margin:0.25rem 0 0;color:rgba(255,255,255,0.55);font-size:0.82rem;">${unreadMsg}</p>
    `;
    botPane.appendChild(heading);

    // Brief block (async-filled)
    const briefRoot = document.createElement('div');
    briefRoot.id = 'ie-brief-root-panel';
    briefRoot.style.marginBottom = '0.5rem';
    botPane.appendChild(briefRoot);

    // Notification sections (opportunities, connections, download button, etc.)
    const notifSections = document.createElement('div');
    notifSections.innerHTML = generatePanelContent();
    botPane.appendChild(notifSections);

    setupActionButtonHandlers(botPane);

    // Kick off async brief generation
    if (window.StartDailyDigest && window.StartDailyDigest.generateBriefInto) {
      window.StartDailyDigest.generateBriefInto(briefRoot);
    }
  }

  function showUnifiedNotificationPanel() {
    // Mobile: full-screen split view
    if (_isMobile()) {
      _showMobileSplitView();
      return;
    }

    // Desktop: floating dropdown (existing behavior)
    const existing = document.getElementById('unified-notification-panel');
    if (existing) {
      existing.remove();
      return; // Toggle behavior
    }

    const panel = createUnifiedPanel();
    document.body.appendChild(panel);

    // Generate the brief directly into the panel's brief root element.
    // Must happen after appendChild so the element is in the DOM.
    const briefRoot = document.getElementById('ie-brief-root-panel');
    if (briefRoot && window.StartDailyDigest && window.StartDailyDigest.generateBriefInto) {
      window.StartDailyDigest.generateBriefInto(briefRoot);
    }

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
          <i class="fas fa-brain"></i> Daily Intelligence Brief
        </h3>
        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 0.9rem;">
          ${unifiedData.totalUnread > 0
            ? unifiedData.totalUnread + ' ' + (unifiedData.totalUnread === 1 ? 'item' : 'items') + ' need your attention'
            : 'Your personalised signals &amp; updates'}
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

    // Brief block sits above the notification sections.
    // generateBriefInto() is async and fills it after the panel is in the DOM.
    const briefRoot = document.createElement('div');
    briefRoot.id = 'ie-brief-root-panel';
    briefRoot.style.cssText = 'margin-bottom: 0.5rem;';

    content.appendChild(briefRoot);

    // Notification sections (messages, connections, etc.)
    const notifSections = document.createElement('div');
    notifSections.innerHTML = generatePanelContent();
    content.appendChild(notifSections);

    panel.appendChild(header);
    panel.appendChild(content);

    // Close button handler
    header.querySelector('#close-unified-panel').addEventListener('click', () => {
      panel.remove();
    });

    // Setup action button handlers
    setupActionButtonHandlers(panel);

    return panel;
  }

  function setupActionButtonHandlers(panel) {
    // Get all action buttons
    const actionButtons = panel.querySelectorAll('.notification-action-btn');
    
    actionButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent item click
        
        const itemIndex = parseInt(button.dataset.itemIndex);
        const actionIndex = parseInt(button.dataset.actionIndex);
        
        // Find the corresponding item and action
        const items = unifiedData.startSequence?.immediate_actions?.pending_requests?.items || [];
        const item = items[itemIndex];
        
        if (!item) return;
        
        // Get the action from the item's actions array
        const actions = [
          {
            onClick: async () => await handleAcceptConnection(item.id)
          },
          {
            onClick: async () => await handleDeclineConnection(item.id)
          }
        ];
        
        const action = actions[actionIndex];
        if (action && action.onClick) {
          // Disable button and show loading
          button.disabled = true;
          button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
          
          try {
            await action.onClick();
          } catch (error) {
            console.error('Action error:', error);
            button.disabled = false;
            button.innerHTML = button.dataset.originalHtml;
          }
        }
      });
    });
  }

  function generatePanelContent() {
    let html = '';
    let hasContent = false;

    // START Sequence Immediate Actions (only if data is available)
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
            connectionId: req.id,
            actions: [
              {
                label: 'Accept',
                icon: 'check',
                color: '#00ff88',
                onClick: async () => {
                  await handleAcceptConnection(req.id);
                }
              },
              {
                label: 'Decline',
                icon: 'times',
                color: '#ff3b30',
                onClick: async () => {
                  await handleDeclineConnection(req.id);
                }
              }
            ]
          }))
        );
        hasContent = true;
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
        hasContent = true;
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
      hasContent = true;
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
      hasContent = true;
    }

    // If no urgent items, show helpful suggestions
    if (!hasContent) {
      html += createWelcomeSection();
    }

    // Always show opportunities and network insights
    html += createOpportunitiesSection();
    html += createNetworkInsightsSection();

    // Download Report — always accessible at the bottom of the panel
    html += `
      <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem; margin-top: 0.5rem;">
        <button
          id="unified-download-report-btn"
          onclick="window.UnifiedNotifications.downloadReport()"
          style="
            width: 100%;
            background: rgba(255,170,0,0.08);
            border: 1px solid rgba(255,170,0,0.3);
            border-radius: 8px;
            color: #ffaa00;
            padding: 0.65rem 1rem;
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          "
          onmouseover="this.style.background='rgba(255,170,0,0.18)'"
          onmouseout="this.style.background='rgba(255,170,0,0.08)'"
        >
          <i class="fas fa-download"></i> Download Report
        </button>
      </div>
    `;

    return html;
  }

  function createWelcomeSection() {
    const profile = unifiedData.startSequence?.profile;
    const streak = unifiedData.startSequence?.momentum?.streak;
    
    return `
      <div style="text-align: center; padding: 2rem 1rem; border-bottom: 1px solid rgba(0,224,255,0.1);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">☀️</div>
        <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.2rem;">
          Welcome back${profile?.name ? ', ' + profile.name.split(' ')[0] : ''}!
        </h3>
        ${streak?.current > 0 ? `
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">
            🔥 ${streak.current}-day streak! Keep it going!
          </p>
        ` : ''}
      </div>
    `;
  }

  function createOpportunitiesSection() {
    if (!unifiedData.startSequence?.opportunities) return '';

    const opps = unifiedData.startSequence.opportunities;
    let html = '';

    // Skill-matched projects
    if (opps.skill_matched_projects?.count > 0) {
      html += createNotificationSection(
        'Opportunities For You',
        'lightbulb',
        '#00ff88',
        [{
          title: `${opps.skill_matched_projects.count} projects match your skills`,
          subtitle: 'Discover collaboration opportunities',
          icon: '💡',
          onClick: () => {
            // Open projects
            document.getElementById('unified-notification-panel')?.remove();
          }
        }]
      );
    }

    // Active themes
    if (opps.active_themes?.count > 0) {
      html += createNotificationSection(
        'Explore Themes',
        'palette',
        '#ffaa00',
        [{
          title: `${opps.active_themes.count} active theme circles`,
          subtitle: 'Join communities around topics you care about',
          icon: '🎨',
          onClick: () => {
            // Open themes
            document.getElementById('unified-notification-panel')?.remove();
          }
        }]
      );
    }

    return html;
  }

  function createNetworkInsightsSection() {
    if (!unifiedData.startSequence?.network_insights) return '';

    const network = unifiedData.startSequence.network_insights;
    const connections = network.connections?.total || 0;
    const projects = network.active_projects?.count || 0;
    const themes = network.participating_themes?.count || 0;

    return `
      <div style="margin: 1.5rem 0;">
        <h4 style="
          color: #00e0ff;
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 0.75rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        ">
          <i class="fas fa-chart-line"></i>
          Your Network
        </h4>
        <div style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
        ">
          <div style="
            background: rgba(0,224,255,0.05);
            border: 1px solid rgba(0,224,255,0.15);
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
          ">
            <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">👥</div>
            <div style="color: white; font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem;">
              ${connections}
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">
              Connections
            </div>
          </div>
          <div style="
            background: rgba(255,170,0,0.05);
            border: 1px solid rgba(255,170,0,0.15);
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
          ">
            <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🎯</div>
            <div style="color: white; font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem;">
              ${themes}
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">
              Themes
            </div>
          </div>
          <div style="
            background: rgba(0,255,136,0.05);
            border: 1px solid rgba(0,255,136,0.15);
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
          ">
            <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🚀</div>
            <div style="color: white; font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem;">
              ${projects}
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">
              Projects
            </div>
          </div>
        </div>
      </div>
    `;
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
        ${items.map((item, index) => `
          <div class="notification-item" data-index="${index}" style="
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            background: rgba(0,224,255,0.05);
            border: 1px solid rgba(0,224,255,0.15);
            border-radius: 8px;
            cursor: ${item.onClick && !item.actions ? 'pointer' : 'default'};
            transition: all 0.2s;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          " ${item.onClick && !item.actions ? `onclick="(${item.onClick.toString()})()"` : ''}
             onmouseover="if(!this.querySelector('.action-buttons')) { this.style.background='rgba(0,224,255,0.1)'; this.style.borderColor='rgba(0,224,255,0.3)'; }"
             onmouseout="if(!this.querySelector('.action-buttons')) { this.style.background='rgba(0,224,255,0.05)'; this.style.borderColor='rgba(0,224,255,0.15)'; }">
            <div style="display: flex; align-items: start; gap: 0.75rem;">
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
            ${item.actions ? `
              <div class="action-buttons" style="
                display: flex;
                gap: 0.5rem;
                margin-top: 0.25rem;
              ">
                ${item.actions.map((action, actionIndex) => `
                  <button 
                    class="notification-action-btn"
                    data-item-index="${index}"
                    data-action-index="${actionIndex}"
                    style="
                      flex: 1;
                      padding: 0.5rem 1rem;
                      background: ${action.color || '#00e0ff'};
                      color: white;
                      border: none;
                      border-radius: 6px;
                      font-weight: 600;
                      font-size: 0.85rem;
                      cursor: pointer;
                      transition: all 0.2s;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      gap: 0.5rem;
                    "
                    onmouseover="this.style.opacity='0.8'; this.style.transform='translateY(-1px)'"
                    onmouseout="this.style.opacity='1'; this.style.transform='translateY(0)'"
                  >
                    <i class="fas fa-${action.icon}"></i>
                    ${action.label}
                  </button>
                `).join('')}
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
  // DOWNLOAD REPORT
  // ================================================================

  // EnhancedStartUI.downloadReport() silently bails if this.currentData is
  // null, which it always is when the panel is used without opening the START
  // modal.  Load the data first, then fire the download.
  async function handleDownloadReport() {
    if (!window.EnhancedStartUI) return;

    const btn = document.getElementById('unified-download-report-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';
    }

    try {
      if (!window.EnhancedStartUI.currentData && window.getStartSequenceData) {
        window.EnhancedStartUI.currentData = await window.getStartSequenceData(true);
      }
      if (window.EnhancedStartUI.downloadReport) {
        await window.EnhancedStartUI.downloadReport();
      }
    } catch (err) {
      console.error('[UnifiedNotifications] downloadReport error:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Download Report';
      }
    }
  }

  // ================================================================
  // PUBLIC API
  // ================================================================

  window.UnifiedNotifications = {
    init,
    refresh: loadAllData,
    // showPanel — open the notification dropdown (bell panel)
    showPanel: showUnifiedNotificationPanel,
    // downloadReport — load data if needed then trigger the HTML export
    downloadReport: handleDownloadReport,
    // show — kept for back-compat; opens the full START/digest modal directly
    show: function () {
      if (window.EnhancedStartUI && window.EnhancedStartUI.open) {
        window.EnhancedStartUI.open();
      }
    },
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
