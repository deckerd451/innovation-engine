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
  // _authUserId is retained for backward compatibility with callers that pass it,
  // but is NOT used in any query. All data queries use communityUserId.
  let _authUserId = null;
  let unifiedData = {
    startSequence: null,
    messages: [],
    notifications: [],
    totalUnread: 0,
    msgUnread: 0,
    notifUnread: 0,
    actionsCount: 0
  };
  let realtimeSubscriptions = [];
  // Tracks where #command-dashboard lived before being moved into the split pane
  let _mobileDashOrigParent = null;
  let _mobileDashOrigSibling = null;

  // ================================================================
  // INITIALIZATION
  // ================================================================

  async function init(userProfile, authUserId) {
    currentUserProfile = userProfile;
    _authUserId = authUserId || null;
    console.log('🔔 Initializing unified notifications for user:', userProfile.id);
    if (window.Identity) window.Identity.audit('unified-notification-system');

    // Replace the green START button with notification button
    replaceStartButton();

    // Load all data
    await loadAllData();

    // Setup realtime subscriptions
    setupRealtimeSubscriptions();

    // Refresh every 30 seconds
    setInterval(loadAllData, 30000);

    // Refresh immediately when messaging.js marks messages as read
    window.addEventListener('messages-updated', loadAllData);

    console.log('✅ Unified notification system initialized');
  }

  // ================================================================
  // REPLACE START BUTTON
  // ================================================================

  function replaceStartButton() {
    // No-op: btn-start-nav was removed; bell is now in command dashboard
    // and mobile header. Kept as stub for back-compat with init() call.
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

    // Use Identity module for consistent community ID
    const communityId = window.Identity?.getCommunityUserId() || currentUserProfile?.id;
    if (!communityId) return;

    try {
      // Get conversations for this user
      const { data, error } = await window.supabase
        .from('conversations')
        .select('*')
        .or(`participant_1_id.eq.${communityId},participant_2_id.eq.${communityId}`)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const messagesWithUnread = [];
      for (const conv of data || []) {
        const { data: msgs, error: msgErr } = await window.supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conv.id)
          .neq('sender_id', communityId)
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!msgErr && msgs && msgs.length > 0) {
          messagesWithUnread.push({
            ...conv,
            unread_count: msgs.length,
            last_message_preview: msgs[0].content || 'New message',
            last_message_at: msgs[0].created_at || conv.updated_at
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
    const msgUnread = unifiedData.messages.reduce((sum, msg) => sum + (msg.unread_count || 0), 0);
    total += msgUnread;

    // Count unread notifications
    const notifUnread = unifiedData.notifications.length;
    total += notifUnread;

    // Count START sequence immediate actions
    let actionsCount = 0;
    if (unifiedData.startSequence?.immediate_actions) {
      const actions = unifiedData.startSequence.immediate_actions;
      actionsCount += (actions.pending_requests?.count || 0);
      actionsCount += (actions.pending_bids?.count || 0);
      actionsCount += (actions.bids_to_review?.count || 0);
    }
    total += actionsCount;

    unifiedData.totalUnread = total;
    unifiedData.msgUnread = msgUnread;
    unifiedData.notifUnread = notifUnread;
    unifiedData.actionsCount = actionsCount;

    console.log(`[Badge] messages=${msgUnread}, notifications=${notifUnread}, actions=${actionsCount}, total=${total}`);
  }

  // ================================================================
  // UPDATE BADGES (split: messages / notifications / actions)
  // ================================================================

  function _setBadge(el, count, showStyle) {
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : count;
      el.style.display = showStyle;
    } else {
      el.style.display = 'none';
    }
  }

  function updateNotificationBadge() {
    const { msgUnread, notifUnread, actionsCount } = unifiedData;

    // ── Desktop command-dashboard badges ──
    _setBadge(document.getElementById('cd-messages-badge'), msgUnread, '');
    _setBadge(document.getElementById('cd-notif-badge'), notifUnread, '');
    _setBadge(document.getElementById('cd-actions-badge'), actionsCount, '');

    // Show/hide the actions button itself (only visible when there are actions)
    const actionsBtn = document.getElementById('cd-actions-btn');
    if (actionsBtn) {
      actionsBtn.style.display = actionsCount > 0 ? '' : 'none';
    }

    // ── Mobile header badges ──
    _setBadge(document.getElementById('mobile-messages-badge'), msgUnread, 'flex');
    _setBadge(document.getElementById('mobile-notif-badge'), notifUnread, 'flex');
    _setBadge(document.getElementById('mobile-actions-badge'), actionsCount, 'flex');

    // Show/hide mobile actions button
    const mobileActionsBtn = document.getElementById('btn-actions-mobile');
    if (mobileActionsBtn) {
      mobileActionsBtn.setAttribute('data-empty', actionsCount > 0 ? 'false' : 'true');
    }
  }

  // ================================================================
  // IN-APP NOTIFICATION NAVIGATION
  // ================================================================
  // Instead of navigating to potentially broken URLs, parse the link
  // and open the relevant panel in-app.

  function _navigateNotification(link, type, notifId) {
    console.log(`[Notifications] View clicked: type=${type}, link=${link}, id=${notifId}`);

    // Close the notification panel first
    document.getElementById('unified-notification-panel')?.remove();

    // Parse project ID from link patterns like /?project=<id> or /anything?project=<id>
    const projectMatch = link.match(/[?&]project=([^&]+)/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      console.log(`[Notifications] Opening project in-app: ${projectId}`);
      if (typeof window.openNodePanel === 'function') {
        window.openNodePanel({ id: projectId, type: 'project' });
      } else if (typeof window.openProjectsModal === 'function') {
        window.openProjectsModal();
      }
      return;
    }

    // Parse org ID from link patterns like /anything?org=<id>
    const orgMatch = link.match(/[?&]org=([^&]+)/);
    if (orgMatch) {
      const orgId = orgMatch[1];
      console.log(`[Notifications] Opening organization in-app: ${orgId}`);
      if (typeof window.openNodePanel === 'function') {
        window.openNodePanel({ id: orgId, type: 'organization' });
      }
      return;
    }

    // Route by notification type when link doesn't contain parseable IDs
    if (type === 'project_invite' || type === 'project_accepted' || type === 'project_request') {
      console.log('[Notifications] Opening projects modal for project notification');
      if (typeof window.openProjectsModal === 'function') {
        window.openProjectsModal();
      }
      return;
    }

    if (type === 'org_join_request' || type === 'org_accepted') {
      console.log('[Notifications] Opening org panel for org notification');
      return;
    }

    if (type === 'message') {
      console.log('[Notifications] Opening messaging for message notification');
      if (typeof window.openMessagingInterface === 'function') {
        window.openMessagingInterface();
      }
      return;
    }

    // Fallback: if the link is a full absolute URL on the same origin, navigate
    // but rewrite root-domain GitHub Pages URLs to include the repo path.
    if (link) {
      const basePath = window.location.pathname.replace(/\/[^/]*$/, '/');
      let safeUrl = link;
      // Relative paths like /dashboard.html → prepend base path
      if (link.startsWith('/') && !link.startsWith(basePath)) {
        safeUrl = basePath + link.replace(/^\//, '');
      }
      console.log(`[Notifications] Navigating to: ${safeUrl}`);
      window.location.href = safeUrl;
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
    // Toggle: close if the Command Dashboard is already shown in the split.
    if (document.querySelector('#command-dashboard.cd-mobile-panel')) {
      _restoreMobileDashboard();
      if (typeof window.StartDailyDigest?._destroySplit === 'function') {
        window.StartDailyDigest._destroySplit();
      }
      return;
    }

    // Build the split DOM (moves #synapse-main-view to the top pane).
    if (!document.getElementById('ie-mobile-split')) {
      if (typeof window.StartDailyDigest?._buildSplit === 'function') {
        window.StartDailyDigest._buildSplit();
      }
    }

    const botPane = document.getElementById('ie-split-intelligence');
    if (!botPane) return;
    botPane.innerHTML = '';

    // ── Close button ──────────────────────────────────────────────────
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
    closeBtn.style.cssText = `
      display: block; width: 100%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
      padding: 0.5rem; border-radius: 8px;
      cursor: pointer; font-size: 0.85rem;
      margin-bottom: 0.6rem; text-align: center;
    `;
    closeBtn.onclick = () => {
      _restoreMobileDashboard();
      if (typeof window.StartDailyDigest?._destroySplit === 'function') {
        window.StartDailyDigest._destroySplit();
      }
    };
    botPane.appendChild(closeBtn);

    // ── Urgent-items strip (connection requests + unread messages only) ─
    const urgentHtml = _generateUrgentHtml();
    if (urgentHtml) {
      const urgentEl = document.createElement('div');
      urgentEl.style.marginBottom = '0.6rem';
      urgentEl.innerHTML = urgentHtml;
      botPane.appendChild(urgentEl);
      setupActionButtonHandlers(urgentEl);
    }

    // ── Command Dashboard (main panel content) ────────────────────────
    const dashboard = document.getElementById('command-dashboard');
    if (dashboard) {
      _mobileDashOrigParent  = dashboard.parentNode;
      _mobileDashOrigSibling = dashboard.nextSibling;
      dashboard.classList.add('cd-mobile-panel');
      botPane.appendChild(dashboard);
    }

    // Listen for viewport resize back to desktop so we restore before destroy
    const _onResizeCheck = () => {
      if (!window.matchMedia('(max-width: 1023px)').matches) {
        _restoreMobileDashboard();
        window.removeEventListener('resize', _onResizeCheck);
      }
    };
    window.addEventListener('resize', _onResizeCheck);
  }

  /**
   * Restore #command-dashboard to its original DOM position
   * and remove the .cd-mobile-panel class.
   * Safe to call multiple times.
   */
  function _restoreMobileDashboard() {
    const dashboard = document.getElementById('command-dashboard');
    if (!dashboard || !dashboard.classList.contains('cd-mobile-panel')) return;
    dashboard.classList.remove('cd-mobile-panel');
    if (_mobileDashOrigParent) {
      if (_mobileDashOrigSibling) {
        _mobileDashOrigParent.insertBefore(dashboard, _mobileDashOrigSibling);
      } else {
        _mobileDashOrigParent.appendChild(dashboard);
      }
    }
    _mobileDashOrigParent  = null;
    _mobileDashOrigSibling = null;
  }

  /**
   * Generate HTML for urgent action items only
   * (connection requests + unread messages).
   * Used in the mobile split view above the Command Dashboard.
   */
  function _generateUrgentHtml() {
    let html = '';

    const actions = unifiedData.startSequence?.immediate_actions;
    if (actions?.pending_requests?.count > 0) {
      html += createNotificationSection(
        'Connection Requests',
        'user-plus',
        '#00e0ff',
        actions.pending_requests.items.map((req, index) => ({
          title: `${req.from_name || 'Someone'} wants to connect`,
          subtitle: req.created_at ? getTimeAgo(new Date(req.created_at)) : '',
          icon: '🤝',
          actions: [
            { label: 'Accept',  icon: 'check', color: '#00ff88' },
            { label: 'Decline', icon: 'times', color: '#ff3b30' },
          ],
        }))
      );
    }

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
            if (window.openMessagingInterface) window.openMessagingInterface(msg.id);
          },
        }))
      );
    }

    return html;
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

    // Load focus content (async — fires after panel is in DOM).
    const focusContentEl = document.getElementById('ie-focus-content-panel');
    if (focusContentEl && window.MentorGuide && window.MentorGuide.renderFocusInto) {
      window.MentorGuide.renderFocusInto(focusContentEl);
    } else if (focusContentEl) {
      focusContentEl.innerHTML = '<p style="color:rgba(255,255,255,0.4); font-size:0.85rem; margin:0;">Explore the network to discover your focus areas.</p>';
    }

    // Generate the intelligence brief into the panel's brief root element.
    // Must happen after appendChild so the element is in the DOM.
    const briefRoot = document.getElementById('ie-brief-root-panel');
    if (briefRoot && window.StartDailyDigest && window.StartDailyDigest.generateBriefInto) {
      window.StartDailyDigest.generateBriefInto(briefRoot);
    }

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeOnOutside(e) {
        // If panel was already removed (e.g. by message click), just clean up
        if (!document.body.contains(panel)) {
          document.removeEventListener('click', closeOnOutside);
          return;
        }
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
          <i class="fas fa-bell"></i> Network Reflection
        </h3>
        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 0.9rem;">
          ${unifiedData.totalUnread > 0
            ? unifiedData.totalUnread + ' ' + (unifiedData.totalUnread === 1 ? 'item' : 'items') + ' need your attention'
            : 'Your focus, signals &amp; updates'}
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

    // ── Action items (connection requests, messages, notifications) ──
    // Moved to top so urgent items are immediately visible.
    const notifSections = document.createElement('div');
    notifSections.innerHTML = generatePanelContent();
    content.appendChild(notifSections);

    // ── Your Focus Today ─────────────────────────────────────────────
    // The most relevant theme and interests overlap.
    // Loaded async via MentorGuide after the panel is in DOM.
    const focusSection = document.createElement('div');
    focusSection.id = 'ie-focus-root-panel';
    focusSection.style.cssText = 'padding-bottom: 0.75rem; border-bottom: 1px solid rgba(0,224,255,0.15); margin-bottom: 0.75rem;';
    focusSection.innerHTML = `
      <h4 style="color:#00e0ff; font-size:0.9rem; font-weight:600; text-transform:uppercase;
        letter-spacing:0.5px; margin:0 0 0.5rem 0; display:flex; align-items:center; gap:0.5rem;">
        <i class="fas fa-compass"></i> Your Focus Today
      </h4>
      <p style="color:rgba(255,255,255,0.4); font-size:0.8rem; margin:0 0 0.5rem 0;">
        Where your interests and activity currently overlap
      </p>
      <div id="ie-focus-content-panel" style="color:rgba(255,255,255,0.5); font-size:0.85rem; text-align:center; padding:0.75rem 0;">
        <i class="fas fa-spinner fa-spin" style="margin-right:0.5rem;"></i>Loading your focus…
      </div>
    `;
    content.appendChild(focusSection);

    // ── Intelligence Signals ─────────────────────────────────────────
    // Full personal-signal brief from the daily brief engine.
    // Distinct from the Network Command's tier-filtered intelligence cards.
    const briefRoot = document.createElement('div');
    briefRoot.id = 'ie-brief-root-panel';
    briefRoot.style.cssText = 'margin-top: 0.5rem; border-top: 1px solid rgba(0,224,255,0.15); padding-top: 0.75rem;';

    content.appendChild(briefRoot);

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
        const actionLabel = button.dataset.actionLabel || '';

        // Find the parent notification item for data attributes
        const itemEl = button.closest('.notification-item');

        // Handle general notification actions (View / Dismiss)
        if (itemEl && (itemEl.dataset.itemId || itemEl.dataset.itemLink)) {
          const notifId = itemEl.dataset.itemId;
          const notifLink = itemEl.dataset.itemLink;
          const notifType = itemEl.dataset.itemType || '';

          if (actionLabel === 'View' && notifLink) {
            _navigateNotification(notifLink, notifType, notifId);
            return;
          }
          if (actionLabel === 'Dismiss') {
            if (notifId) {
              try { markNotificationAsRead(notifId); } catch (_) {}
            }
            itemEl.remove();
            return;
          }
        }

        // Handle connection-request actions (Accept / Decline)
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

    // Wire up message item clicks (items with data-conversation-id)
    const msgItems = panel.querySelectorAll('.notification-item[data-conversation-id]');
    msgItems.forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', (e) => {
        if (e.target.closest('.notification-action-btn')) return; // don't fire on action buttons
        e.stopPropagation(); // Prevent closeOnOutside from interfering
        const convId = item.dataset.conversationId;
        console.log('💬 Message item clicked, conversation:', convId);
        // Remove panel first, then open messaging to avoid z-index conflicts
        document.getElementById('unified-notification-panel')?.remove();
        if (typeof window.openMessagingInterface === 'function') {
          window.openMessagingInterface(convId);
        } else {
          console.error('❌ openMessagingInterface not available — realtime-collaboration.js may not be loaded');
          showToast('Messaging is loading, please try again', 'info');
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
          conversationId: msg.id
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
          id: notif.id,
          link: notif.link || '',
          type: notif.type || '',
          title: notif.title,
          subtitle: notif.created_at ? getTimeAgo(new Date(notif.created_at)) : '',
          icon: getNotificationIcon(notif.type),
          actions: [
            ...(notif.link ? [{
              label: 'View',
              icon: 'external-link-alt',
              color: '#ffaa00'
            }] : []),
            {
              label: 'Dismiss',
              icon: 'check',
              color: 'rgba(100,100,120,0.6)'
            }
          ]
        }))
      );
      hasContent = true;
    }

    // If no action items, show a welcome/streak message
    if (!hasContent) {
      html += createWelcomeSection();
    }

    // NOTE: Network stats (connections/nearby/projects) and opportunities are
    // intentionally omitted here — they live in "Your Network Command" sidebar.
    // This panel shows only what is unique: focus today, action items, and
    // full personal intelligence signals.

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
        'Explore Skills',
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
          <div class="notification-item" data-index="${index}" data-item-id="${item.id || ''}" data-item-link="${item.link || ''}" data-item-type="${item.type || ''}" ${item.conversationId ? `data-conversation-id="${item.conversationId}"` : ''} style="
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            background: rgba(0,224,255,0.05);
            border: 1px solid rgba(0,224,255,0.15);
            border-radius: 8px;
            cursor: ${(item.onClick || item.conversationId) && !item.actions ? 'pointer' : 'default'};
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
                    data-action-label="${action.label}"
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
    // navigateNotification — smart in-app routing for notification links
    navigateNotification: _navigateNotification,
    // downloadReport — load data if needed then trigger the HTML export
    downloadReport: handleDownloadReport,
    // _restoreMobileDashboard — called by start-daily-digest._destroySplit
    // to ensure #command-dashboard is re-parented before the split DOM is removed.
    _restoreMobileDashboard: _restoreMobileDashboard,
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
