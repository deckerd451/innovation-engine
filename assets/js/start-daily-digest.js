// ================================================================
// START SEQUENCE - DAILY DIGEST
// ================================================================
// Shows "what's new" for returning users
// Highlights changes since last login
// ================================================================

console.log('%c📰 START Daily Digest - Loading', 'color:#0f8; font-weight:bold;');

class StartDailyDigest {
  constructor() {
    this.userData = null;
  }

  /**
   * Render the daily digest
   */
  async render(data) {
    this.userData = data;
    const whatsNew = data.whats_new || {};
    const hasUpdates = this.hasAnyUpdates(whatsNew);
    
    // Await the network snapshot since it's async
    const networkSnapshotHTML = await this.renderNetworkSnapshot(data);

    return `
      <div class="daily-digest-container">
        ${this.renderWelcomeHeader(data)}
        ${hasUpdates ? this.renderWhatsNew(whatsNew) : this.renderNoUpdates()}
        ${this.renderQuickActions(data)}
        ${networkSnapshotHTML}
      </div>
    `;
  }

  /**
   * Check if there are any updates
   */
  hasAnyUpdates(whatsNew) {
    return (
      (whatsNew.new_connection_requests || 0) > 0 ||
      (whatsNew.new_messages || 0) > 0 ||
      (whatsNew.new_connections || 0) > 0 ||
      (whatsNew.new_projects_in_themes || 0) > 0 ||
      (whatsNew.new_theme_members || 0) > 0
    );
  }

  /**
   * Render welcome header
   */
  renderWelcomeHeader(data) {
    const profile = data.profile || {};
    const momentum = data.momentum || {};
    const streak = momentum.streak || {};
    const lastLogin = data.previous_login ? new Date(data.previous_login) : null;

    const timeAgo = lastLogin ? this.getTimeAgo(lastLogin) : 'a while';

    return `
      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">
          ${this.getGreetingEmoji()}
        </div>
        <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.8rem;">
          Welcome back, ${profile.name || 'there'}!
        </h2>
        <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 1rem;">
          ${streak.current > 0
            ? `🔥 ${streak.current}-day streak! `
            : ''}
          Last seen ${timeAgo}
        </p>
      </div>
    `;
  }

  /**
   * Get greeting emoji based on time of day
   */
  getGreetingEmoji() {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅';
    if (hour < 18) return '☀️';
    return '🌙';
  }

  /**
   * Get human-readable time ago
   */
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  /**
   * Render what's new section
   */
  renderWhatsNew(whatsNew) {
    const updates = [];

    if (whatsNew.new_connection_requests > 0) {
      updates.push({
        icon: 'user-plus',
        color: '#00e0ff',
        title: 'New Connection Requests',
        count: whatsNew.new_connection_requests,
        message: `${whatsNew.new_connection_requests} ${whatsNew.new_connection_requests === 1 ? 'person wants' : 'people want'} to connect`,
        action: 'View Requests',
        handler: 'openConnectionRequests',
        priority: 1
      });
    }

    if (whatsNew.new_messages > 0) {
      updates.push({
        icon: 'envelope',
        color: '#ffaa00',
        title: 'New Messages',
        count: whatsNew.new_messages,
        message: `${whatsNew.new_messages} new ${whatsNew.new_messages === 1 ? 'message' : 'messages'}`,
        action: 'Read Messages',
        handler: 'openMessaging',
        priority: 2
      });
    }

    if (whatsNew.new_connections > 0) {
      updates.push({
        icon: 'users',
        color: '#00ff88',
        title: 'New Connections',
        count: whatsNew.new_connections,
        message: `${whatsNew.new_connections} new ${whatsNew.new_connections === 1 ? 'connection' : 'connections'} accepted`,
        action: 'View Network',
        handler: 'viewConnections',
        priority: 3
      });
    }

    if (whatsNew.new_projects_in_themes > 0) {
      updates.push({
        icon: 'rocket',
        color: '#a855f7',
        title: 'New Projects',
        count: whatsNew.new_projects_in_themes,
        message: `${whatsNew.new_projects_in_themes} new ${whatsNew.new_projects_in_themes === 1 ? 'project' : 'projects'} in your themes`,
        action: 'Browse Projects',
        handler: 'openSkillMatchedProjects',
        priority: 4
      });
    }

    if (whatsNew.new_theme_members > 0) {
      updates.push({
        icon: 'user-friends',
        color: '#ff6b6b',
        title: 'New Theme Members',
        count: whatsNew.new_theme_members,
        message: `${whatsNew.new_theme_members} ${whatsNew.new_theme_members === 1 ? 'person joined' : 'people joined'} your themes`,
        action: 'View Themes',
        handler: 'openThemes',
        priority: 5
      });
    }

    // Sort by priority
    updates.sort((a, b) => a.priority - b.priority);

    return `
      <div style="margin-bottom: 2rem;">
        <h3 style="
          color: #00e0ff;
          margin: 0 0 1rem 0;
          font-size: 1.2rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        ">
          <i class="fas fa-bell"></i> What's New
        </h3>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${updates.map(update => this.renderUpdateCard(update)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single update card
   */
  renderUpdateCard(update) {
    return `
      <div class="update-card"
           onclick="window.StartDailyDigest.handleAction('${update.handler}')"
           style="
        background: linear-gradient(135deg, ${update.color}15, rgba(0,0,0,0.1));
        border: 2px solid ${update.color}40;
        border-radius: 12px;
        padding: 1.25rem;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 1rem;
      "
      onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 25px ${update.color}40';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='none';">

        <div style="
          width: 48px;
          height: 48px;
          background: ${update.color}20;
          border: 2px solid ${update.color}60;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <i class="fas fa-${update.icon}" style="color: ${update.color}; font-size: 1.5rem;"></i>
        </div>

        <div style="flex: 1; min-width: 0;">
          <div style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.25rem;
          ">
            <div style="color: #fff; font-size: 1.1rem; font-weight: 600;">
              ${update.title}
            </div>
            <div style="
              background: ${update.color};
              color: #000;
              padding: 0.125rem 0.5rem;
              border-radius: 12px;
              font-size: 0.75rem;
              font-weight: 700;
            ">
              ${update.count}
            </div>
          </div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.5rem;">
            ${update.message}
          </div>
          <div style="
            color: ${update.color};
            font-size: 0.9rem;
            font-weight: 600;
          ">
            ${update.action} →
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render no updates message
   */
  renderNoUpdates() {
    return `
      <div style="
        text-align: center;
        padding: 3rem 2rem;
        background: rgba(0,224,255,0.05);
        border: 2px dashed rgba(0,224,255,0.2);
        border-radius: 16px;
        margin-bottom: 2rem;
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">✨</div>
        <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0;">You're All Caught Up!</h3>
        <p style="color: rgba(255,255,255,0.6); margin: 0;">
          No new updates since your last visit. Check back later!
        </p>
      </div>
    `;
  }

  /**
   * Render quick actions
   */
  async renderQuickActions(data) {
    const immediate = data.immediate_actions || {};
    let html = '';

    // Render detailed connection requests with Accept/Decline buttons
    if (immediate.pending_requests?.count > 0 && immediate.pending_requests?.items) {
      html += await this.renderConnectionRequests(immediate.pending_requests);
    }

    // Render other quick actions
    const actions = [];

    if (immediate.unread_messages?.count > 0) {
      actions.push({
        icon: 'comments',
        label: 'Unread Messages',
        count: immediate.unread_messages.count,
        color: '#ffaa00',
        handler: 'openMessaging'
      });
    }

    if (immediate.pending_bids?.count > 0) {
      actions.push({
        icon: 'clipboard-list',
        label: 'Pending Bids',
        count: immediate.pending_bids.count,
        color: '#a855f7',
        handler: 'openProjectBids'
      });
    }

    if (actions.length > 0) {
      html += `
        <div style="margin-bottom: 2rem;">
          <h3 style="
            color: #00ff88;
            margin: 0 0 1rem 0;
            font-size: 1.1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          ">
            <i class="fas fa-bolt"></i> Quick Actions
          </h3>

          <div style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
          ">
            ${actions.map(action => `
              <button onclick="window.StartDailyDigest.handleAction('${action.handler}')" style="
                background: linear-gradient(135deg, ${action.color}20, rgba(0,0,0,0.1));
                border: 2px solid ${action.color}40;
                border-radius: 12px;
                padding: 1rem;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
              "
              onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${action.color}';"
              onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${action.color}40';">
                <i class="fas fa-${action.icon}" style="
                  color: ${action.color};
                  font-size: 1.5rem;
                  margin-bottom: 0.5rem;
                  display: block;
                "></i>
                <div style="color: #fff; font-weight: 600; margin-bottom: 0.25rem; font-size: 0.9rem;">
                  ${action.label}
                </div>
                <div style="
                  background: ${action.color};
                  color: #000;
                  padding: 0.25rem 0.5rem;
                  border-radius: 8px;
                  font-size: 0.75rem;
                  font-weight: 700;
                  display: inline-block;
                ">
                  ${action.count}
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Render connection requests with Accept/Decline buttons
   */
  async renderConnectionRequests(pendingRequests) {
    const items = pendingRequests.items || [];
    
    if (items.length === 0) {
      return '';
    }

    return `
      <div style="margin-bottom: 2rem;">
        <h3 style="
          color: #00e0ff;
          margin: 0 0 1rem 0;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        ">
          <i class="fas fa-user-plus"></i> Connection Requests
          <span style="
            background: #00e0ff;
            color: #000;
            padding: 0.25rem 0.5rem;
            border-radius: 8px;
            font-size: 0.75rem;
            font-weight: 700;
          ">${items.length}</span>
        </h3>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${items.map(req => `
            <div class="connection-request-item" data-request-id="${req.id}" style="
              background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,0,0,0.1));
              border: 2px solid rgba(0,224,255,0.3);
              border-radius: 12px;
              padding: 1rem;
              display: flex;
              align-items: center;
              gap: 1rem;
            ">
              <div style="
                width: 48px;
                height: 48px;
                background: linear-gradient(135deg, #00e0ff, #0080ff);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                flex-shrink: 0;
              ">
                👤
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">
                  ${req.from_name || 'Someone'}
                </div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">
                  ${req.created_at ? this.getTimeAgo(new Date(req.created_at)) : 'Recently'}
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                <button 
                  class="accept-connection-btn"
                  data-request-id="${req.id}"
                  onclick="window.StartDailyDigest.acceptConnection('${req.id}')"
                  style="
                    background: #00ff88;
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    padding: 0.5rem 1rem;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                  "
                  onmouseenter="this.style.opacity='0.8'; this.style.transform='translateY(-1px)'"
                  onmouseout="this.style.opacity='1'; this.style.transform='translateY(0)'"
                >
                  <i class="fas fa-check"></i>
                  Accept
                </button>
                <button 
                  class="decline-connection-btn"
                  data-request-id="${req.id}"
                  onclick="window.StartDailyDigest.declineConnection('${req.id}')"
                  style="
                    background: #ff3b30;
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    padding: 0.5rem 1rem;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                  "
                  onmouseenter="this.style.opacity='0.8'; this.style.transform='translateY(-1px)'"
                  onmouseout="this.style.opacity='1'; this.style.transform='translateY(0)'"
                >
                  <i class="fas fa-times"></i>
                  Decline
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render network snapshot
   */
  async renderNetworkSnapshot(data) {
    const network = data.network_insights || {};
    const opportunities = data.opportunities || {};
    
    // Fetch actual counts from database if not provided
    let connectionsCount = network.connections?.total || 0;
    let themesCount = opportunities.active_themes?.count || 0;
    let projectsCount = network.active_projects?.count || 0;
    let opportunitiesCount = opportunities.skill_matched_projects?.count || 0;
    
    // If counts are 0, try to fetch them directly
    if (connectionsCount === 0 || themesCount === 0 || projectsCount === 0) {
      try {
        const counts = await this.fetchActualCounts();
        connectionsCount = counts.connections;
        themesCount = counts.themes;
        projectsCount = counts.projects;
        opportunitiesCount = counts.opportunities;
      } catch (err) {
        console.warn('Failed to fetch actual counts:', err);
      }
    }

    return `
      <div style="
        background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,128,255,0.05));
        border: 2px solid rgba(0,224,255,0.3);
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 2rem;
      ">
        <h3 style="
          color: #00e0ff;
          margin: 0 0 1rem 0;
          font-size: 1.1rem;
          text-align: center;
        ">
          📊 Your Network
        </h3>

        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
        ">
          ${this.renderStatCard('Connections', connectionsCount, 'users', '#00e0ff', 'viewConnections')}
          ${this.renderStatCard('Themes', themesCount, 'bullseye', '#ffaa00', 'viewThemes')}
          ${this.renderStatCard('Projects', projectsCount, 'rocket', '#a855f7', 'viewProjects')}
          ${this.renderStatCard('Opportunities', opportunitiesCount, 'briefcase', '#00ff88', 'viewOpportunities')}
        </div>
      </div>
    `;
  }
  
  /**
   * Fetch actual counts from database
   */
  async fetchActualCounts() {
    if (!window.supabase) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    // Get community profile
    const { data: profile } = await window.supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!profile) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const communityId = profile.id;
    
    // Fetch counts in parallel
    const [connectionsResult, themesResult, projectsResult, opportunitiesResult] = await Promise.all([
      // Count accepted connections
      window.supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`),
      
      // Count theme participations
      window.supabase
        .from('theme_participants')
        .select('theme_id', { count: 'exact', head: true })
        .eq('community_id', communityId),
      
      // Count project memberships
      window.supabase
        .from('project_members')
        .select('project_id', { count: 'exact', head: true })
        .eq('user_id', communityId),
      
      // Count open projects (opportunities)
      window.supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
    ]);
    
    return {
      connections: connectionsResult.count || 0,
      themes: themesResult.count || 0,
      projects: projectsResult.count || 0,
      opportunities: opportunitiesResult.count || 0
    };
  }

  /**
   * Render stat card with helpful tooltip
   */
  renderStatCard(label, value, icon, color, handler) {
    const clickHandler = handler ? `onclick="window.StartDailyDigest.${handler}()" style="cursor: pointer;"` : '';
    const hoverStyle = handler ? `
      onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${color}';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${color}40';"
    ` : '';
    
    // Add helpful descriptions for each stat
    const descriptions = {
      'Connections': 'People you\'re connected with',
      'Themes': 'Theme circles you\'ve joined',
      'Projects': 'Projects you\'re involved in',
      'Opportunities': 'Open projects seeking collaborators'
    };
    
    const description = descriptions[label] || '';
    
    return `
      <div ${clickHandler} ${hoverStyle} style="
        background: rgba(0,0,0,0.3);
        border: 1px solid ${color}40;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
        transition: all 0.2s;
        position: relative;
      " title="${description}">
        <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
        <div style="color: #fff; font-size: 1.8rem; font-weight: 700; margin-bottom: 0.25rem;">
          ${value}
        </div>
        <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.25rem;">
          ${label}
        </div>
        <div style="color: rgba(255,255,255,0.4); font-size: 0.7rem; line-height: 1.2;">
          ${description}
        </div>
      </div>
    `;
  }

  // ================================================================
  // ACTION HANDLERS
  // ================================================================

  handleAction(handler) {
    // Use the existing EnhancedStartUI handler
    if (window.EnhancedStartUI && window.EnhancedStartUI.handleAction) {
      window.EnhancedStartUI.handleAction(handler, { preventDefault: () => {}, stopPropagation: () => {} });
    }
  }

  viewConnections() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('person');
      }
    }, 300);
  }
  
  viewThemes() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) {
        window.showView('synapse');
      }
      // Filter to show only themes
      setTimeout(() => {
        if (window.filterSynapseByCategory) {
          window.filterSynapseByCategory('themes');
        }
      }, 500);
    }, 300);
  }
  
  viewProjects() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }
  
  viewOpportunities() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      // Show opportunities page or open projects list
      if (window.showView) {
        window.showView('opportunities');
      } else if (window.filterByNodeType) {
        // Fallback: show open projects
        window.filterByNodeType('project');
      }
    }, 300);
  }

  async acceptConnection(connectionId) {
    try {
      // Import the accept function
      const { acceptConnectionRequest } = await import('./connections.js');
      
      // Find the button and show loading state
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }
      
      // Accept the connection
      const result = await acceptConnectionRequest(connectionId);
      
      if (result.success) {
        // Remove the request item from the UI
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => item.remove(), 300);
        }
        
        // Show success message
        this.showToast('Connection accepted!', 'success');
        
        // Refresh the START modal after a short delay
        setTimeout(() => {
          if (window.EnhancedStartUI) {
            window.EnhancedStartUI.open();
          }
        }, 1000);
      } else {
        throw new Error('Failed to accept connection');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      this.showToast('Failed to accept connection', 'error');
      
      // Reset button
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-check"></i> Accept';
      }
    }
  }

  async declineConnection(connectionId) {
    try {
      // Import the decline function
      const { declineConnectionRequest } = await import('./connections.js');
      
      // Find the button and show loading state
      const button = document.querySelector(`.decline-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Declining...';
      }
      
      // Decline the connection
      const result = await declineConnectionRequest(connectionId);
      
      if (result.success) {
        // Remove the request item from the UI
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => item.remove(), 300);
        }
        
        // Show success message
        this.showToast('Connection declined', 'info');
        
        // Refresh the START modal after a short delay
        setTimeout(() => {
          if (window.EnhancedStartUI) {
            window.EnhancedStartUI.open();
          }
        }, 1000);
      } else {
        throw new Error('Failed to decline connection');
      }
    } catch (error) {
      console.error('Error declining connection:', error);
      this.showToast('Failed to decline connection', 'error');
      
      // Reset button
      const button = document.querySelector(`.decline-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-times"></i> Decline';
      }
    }
  }

  showToast(message, type = 'info') {
    const colors = {
      info: '#00e0ff',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff6b6b'
    };

    const color = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${color};
      color: ${type === 'info' ? '#000' : '#fff'};
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: 600;
      z-index: 100001;
      box-shadow: 0 8px 25px rgba(0,0,0,0.5);
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.StartDailyDigest = new StartDailyDigest();

console.log('✅ START Daily Digest ready');
