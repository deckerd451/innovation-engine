// ================================================================
// ENHANCED START UI
// ================================================================
// Replaces static START sequence with actionable, data-driven UI
// Integrates with START sequence report and synapse visualization
// ================================================================

// Import bootstrap session functions from window object
// (bootstrapSession.js uses IIFE pattern, not ES6 exports)
const { getAuthUser, getCommunityUser } = window.bootstrapSession || {};

console.log('%c🎨 Enhanced START UI - Loading', 'color:#0f8; font-weight:bold;');

// ================================================================
// ENHANCED START MODAL
// ================================================================

class EnhancedStartUI {
  constructor() {
    this.isOpen = false;
    this.currentData = null;
  }

  /**
   * Open the enhanced START modal
   */
  async open() {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;

    // Show loading state first
    this.showLoadingState();

    // Setup event listeners for ESC and backdrop click
    this.setupEventListeners();

    try {
      // Fetch fresh data
      const data = await window.getStartSequenceData(true);
      this.currentData = data;

      // Render the enhanced UI
      await this.render(data);

      // Apply synapse highlights
      if (window.applyStartHighlights) {
        await window.applyStartHighlights();
      }

    } catch (error) {
      console.error('Failed to load START data:', error);
      this.showErrorState(error);
    }
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    const modal = document.getElementById('start-modal');
    const backdrop = document.getElementById('start-modal-backdrop');
    const container = document.getElementById('start-options-container');

    if (!modal || !backdrop || !container) {
      console.error('START modal elements not found');
      return;
    }

    // Show modal
    modal.style.display = 'block';
    backdrop.style.display = 'block';
    
    setTimeout(() => {
      modal.style.opacity = '1';
      backdrop.style.opacity = '1';
    }, 10);

    // Show minimal loading content (no "Analyzing Your Network" screen)
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 2rem; color: rgba(255,255,255,0.6);">
        <div class="loading-dots" style="display: flex; justify-content: center; gap: 0.5rem;">
          <div style="width: 12px; height: 12px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out infinite both;"></div>
          <div style="width: 12px; height: 12px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out 0.16s infinite both;"></div>
          <div style="width: 12px; height: 12px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out 0.32s infinite both;"></div>
        </div>
      </div>
    `;
  }

  /**
   * Show error state
   */
  showErrorState(error) {
    const container = document.getElementById('start-options-container');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 2rem; color: rgba(255,107,107,0.8);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h3 style="margin-bottom: 0.5rem;">Unable to Load Data</h3>
        <p style="margin-bottom: 1.5rem; color: rgba(255,255,255,0.6);">
          ${error.message || 'Something went wrong'}
        </p>
        <button onclick="window.EnhancedStartUI.open()" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 8px;
          color: #000;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
        ">
          Try Again
        </button>
      </div>
    `;
  }

  /**
   * Wait for a module to be ready and render
   */
  async waitForModuleAndRender(data, moduleName, maxWaitMs = 2000) {
    const startTime = Date.now();
    const pollInterval = 100;
    
    while (Date.now() - startTime < maxWaitMs) {
      if (window[moduleName] && typeof window[moduleName].render === 'function') {
        console.log(`✅ ${moduleName} ready after ${Date.now() - startTime}ms`);
        return await window[moduleName].render(data);
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.error(`❌ ${moduleName} not ready after ${maxWaitMs}ms`);
    return this.renderFallback(moduleName);
  }

  /**
   * Render fallback UI when module isn't ready
   */
  renderFallback(moduleName) {
    return `
      <div style="text-align: center; padding: 3rem 2rem; color: rgba(255,255,255,0.6);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⏳</div>
        <h3 style="color: #00e0ff; margin-bottom: 0.5rem;">Loading START...</h3>
        <p style="margin-bottom: 1.5rem;">
          ${moduleName} is initializing
        </p>
        <button onclick="window.EnhancedStartUI.open()" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 8px;
          color: #000;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
        ">
          Retry
        </button>
      </div>
    `;
  }

  /**
   * Render the enhanced START UI
   */
  async render(data) {
    const container = document.getElementById('start-options-container');
    if (!container) return;

    // Check if user is new (needs onboarding) or existing (gets daily digest)
    const isNewUser = data.is_new_user || !data.profile?.onboarding_completed;

    let contentHTML = '';

    if (isNewUser) {
      // Show onboarding flow with safety check
      if (window.StartOnboarding && typeof window.StartOnboarding.render === 'function') {
        contentHTML = await window.StartOnboarding.render(data);
      } else {
        console.warn('⚠️ StartOnboarding not ready');
        contentHTML = await this.renderFallback('onboarding');
      }
    } else {
      // Show daily digest with safety check and retry logic
      if (window.StartDailyDigest && typeof window.StartDailyDigest.render === 'function') {
        contentHTML = await window.StartDailyDigest.render(data);
      } else {
        console.warn('⚠️ StartDailyDigest not ready, attempting retry...');
        contentHTML = await this.waitForModuleAndRender(data, 'StartDailyDigest', 2000);
      }
    }

    container.innerHTML = `
      <style>
        /* Responsive START UI Styles */
        @media (max-width: 768px) {
          #start-modal {
            width: 95vw !important;
            max-width: 95vw !important;
            padding: 1rem !important;
            max-height: 90vh !important;
            overflow-y: auto !important;
          }

          #start-options-container {
            padding: 0.5rem !important;
          }

          #start-options-container h2 {
            font-size: 1.4rem !important;
          }

          #start-options-container h3 {
            font-size: 1.1rem !important;
          }

          #start-options-container p {
            font-size: 0.9rem !important;
          }

          .onboarding-progress {
            padding: 0 !important;
          }

          .progress-step span {
            font-size: 0.65rem !important;
          }
        }

        @media (max-width: 480px) {
          #start-modal {
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
            padding: 0.75rem !important;
          }

          .progress-step span {
            display: none; /* Hide labels on very small screens */
          }
        }
      </style>
      ${contentHTML}
      ${this.renderActions(data, isNewUser)}
    `;

    // Wire up event handlers
    this.wireEventHandlers();
  }

  /**
   * Render header section
   */
  renderHeader(data) {
    const profile = data.profile || {};
    const momentum = data.momentum || {};

    return `
      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">👋</div>
        <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.8rem;">
          Welcome back, ${profile.name || 'there'}!
        </h2>
        <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 1rem;">
          ${momentum.streak?.current > 0 
            ? `🔥 ${momentum.streak.current}-day streak! ` 
            : ''}
          Here's what's happening in your network
        </p>
      </div>
    `;
  }

  /**
   * Render report panel
   */
  renderReport(summary) {
    return `
      <div style="
        background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,128,255,0.05));
        border: 2px solid rgba(0,224,255,0.3);
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 2rem;
      ">
        <h3 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 1.2rem; text-align: center;">
          📊 Your Network Status
        </h3>
        <div class="start-report-grid" style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
        ">
          ${this.renderStatCard('People', summary.people, 'users', '#00e0ff')}
          ${this.renderStatCard('Themes', summary.themes_interested, 'bullseye', '#ffaa00')}
          ${this.renderStatCard('Organizations', summary.organizations_followed, 'building', '#a855f7')}
          ${this.renderStatCard('Connections', summary.connections_accepted, 'link', '#00ff88')}
        </div>
      </div>
      
      <style>
        @media (max-width: 768px) {
          .start-report-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .start-report-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    `;
  }

  /**
   * Render a stat card
   */
  renderStatCard(label, value, icon, color) {
    return `
      <div style="
        background: rgba(0,0,0,0.3);
        border: 1px solid ${color}40;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
      ">
        <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
        <div style="color: #fff; font-size: 1.8rem; font-weight: 700; margin-bottom: 0.25rem;">
          ${value}
        </div>
        <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">
          ${label}
        </div>
      </div>
    `;
  }

  /**
   * Render insights section
   */
  renderInsights(insights) {
    if (!insights || insights.length === 0) {
      return `
        <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
          <div style="font-size: 2rem; margin-bottom: 1rem;">✨</div>
          <p>You're all caught up! No urgent actions right now.</p>
          <p style="font-size: 0.9rem;">Check back later for new opportunities.</p>
        </div>
      `;
    }

    return `
      <div style="margin-bottom: 2rem;">
        <h3 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 1.2rem;">
          🎯 Recommended Actions
        </h3>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${insights.map(insight => this.renderInsightCard(insight)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single insight card
   */
  renderInsightCard(insight) {
    const priorityColors = {
      high: '#ff6b6b',
      medium: '#ffaa00',
      low: '#00e0ff'
    };

    const color = insight.color || priorityColors[insight.priority] || '#00e0ff';
    const dataAttr = insight.data ? `data-insight-data='${JSON.stringify(insight.data)}'` : '';

    return `
      <div class="insight-card" 
           data-handler="${insight.handler || ''}" 
           ${dataAttr}
           style="
        background: linear-gradient(135deg, ${color}15, rgba(0,0,0,0.1));
        border: 2px solid ${color}40;
        border-radius: 12px;
        padding: 1.25rem;
        cursor: ${insight.handler ? 'pointer' : 'default'};
        transition: all 0.3s ease;
      " ${insight.handler ? `onclick="event.stopPropagation(); window.EnhancedStartUI.handleAction('${insight.handler}', event)"` : ''}>
        <div class="insight-card-content" style="display: flex; align-items: start; gap: 1rem;">
          <div class="insight-icon" style="
            width: 48px;
            height: 48px;
            background: ${color}20;
            border: 2px solid ${color}60;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <i class="fas fa-${insight.icon}" style="color: ${color}; font-size: 1.5rem;"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="color: #fff; font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem; word-wrap: break-word;">
              ${insight.message}
            </div>
            ${insight.detail ? `
              <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.75rem; word-wrap: break-word;">
                ${insight.detail}
              </div>
            ` : ''}
            ${insight.action ? `
              <div class="insight-action-btn" style="
                display: inline-block;
                background: ${color};
                color: #000;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                font-size: 0.9rem;
                font-weight: 600;
              ">
                ${insight.action} →
              </div>
            ` : ''}
          </div>
        </div>
      </div>
      
      <style>
        @media (max-width: 768px) {
          .insight-card {
            padding: 1rem !important;
          }
          .insight-card-content {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .insight-icon {
            margin-bottom: 0.5rem;
          }
          .insight-action-btn {
            width: 100%;
            text-align: center;
          }
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }
      </style>
    `;
  }

  /**
   * Render action buttons
   */
  renderActions(data, isNewUser = false) {
    // Don't show actions for onboarding (onboarding has its own navigation)
    if (isNewUser) {
      return '';
    }

    return `
      <div class="start-actions-container" style="margin-top: 2rem; text-align: center; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <button onclick="window.EnhancedStartUI.downloadReport()" style="
          background: transparent;
          border: 2px solid rgba(0,224,255,0.4);
          border-radius: 12px;
          color: #00e0ff;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          flex: 1;
          max-width: 400px;
        ">
          📥 Download Report
        </button>
      </div>

      <style>
        @media (max-width: 768px) {
          .start-actions-container button {
            width: 100% !important;
            max-width: none !important;
          }
        }
      </style>
    `;
  }

  /**
   * Wire up event handlers
   */
  wireEventHandlers() {
    // Add hover effects to insight cards
    document.querySelectorAll('.insight-card[data-handler]').forEach(card => {
      card.addEventListener('mouseenter', (e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,224,255,0.3)';
      });

      card.addEventListener('mouseleave', (e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      });
    });
  }

  /**
   * Handle action button clicks
   */
  handleAction(handler, event) {
    // Stop event propagation to prevent triggering other clicks
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    // Get the insight data if available
    const insightCard = event?.currentTarget;
    const insightData = insightCard?.dataset?.insightData 
      ? JSON.parse(insightCard.dataset.insightData) 
      : {};
    
    // Close modal first
    this.close();

    // Execute handler after modal closes
    setTimeout(() => {
      const handlers = {
        openConnectionRequests: () => {
          // Open the connection requests panel
          if (typeof window.toggleConnectionsPanel === 'function') {
            window.toggleConnectionsPanel();
          } else {
            // Fallback: Filter synapse to show only people with pending requests
            if (window.filterByNodeType) {
              window.filterByNodeType('person');
            }
            this.showToast('Connection requests panel not available. Showing people in network.', 'info');
          }
        },
        openMessaging: () => {
          if (window.openMessagesModal) {
            window.openMessagesModal();
          } else if (window.openMessagingModal) {
            window.openMessagingModal();
          } else {
            this.showToast('Messaging feature coming soon!', 'info');
          }
        },
        openProjectBids: () => {
          // Open projects modal
          if (window.openProjectsModal) {
            window.openProjectsModal();
          } else {
            this.showToast('Projects feature coming soon!', 'info');
          }
        },
        openSkillMatchedProjects: () => {
          if (window.openProjectsModal) {
            window.openProjectsModal();
          } else {
            this.showToast('Projects feature coming soon!', 'info');
          }
        },
        openThemes: () => {
          const themeCount = insightData.themeCount || 0;
          
          // If no themes, show helpful message
          if (themeCount === 0) {
            this.showToast('No active themes yet. Themes will appear here when created by admins or community leaders.', 'info');
            return;
          }
          
          // Check if we're in cards mode and need to switch to circles
          const currentStrategy = window.currentStrategy || 'new';
          
          if (window.toggleThemeStrategy && typeof window.toggleThemeStrategy === 'function') {
            // If in cards mode, switch to circles to see themes
            if (currentStrategy === 'new') {
              window.toggleThemeStrategy();
            }
          } else {
            // Fallback: Click the Themes filter button
            const themesBtn = document.querySelector('[data-category="themes"]');
            if (themesBtn) {
              themesBtn.click();
              
              // Check if there are themes after a short delay
              setTimeout(() => {
                const themeNodes = document.querySelectorAll('[data-type="theme"]');
                if (themeNodes.length === 0) {
                  this.showToast('No active themes found. Check back later!', 'info');
                }
              }, 500);
            } else if (window.Synapse && window.Synapse.filterByType) {
              window.Synapse.filterByType('theme');
            } else if (window.filterByNodeType) {
              window.filterByNodeType('theme');
            } else {
              this.showToast('Please click the "Themes" button to view active themes', 'info');
            }
          }
        }
      };

      const handlerFn = handlers[handler];
      if (handlerFn) {
        try {
          handlerFn();
        } catch (error) {
          console.error('Error executing handler:', error);
          this.showToast('Something went wrong. Please try again.', 'error');
        }
      } else {
        console.warn('Unknown handler:', handler);
        this.showToast('This feature is not yet available', 'info');
      }
    }, 300);
  }

  /**
   * Show toast notification
   */
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
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, ${color}20, rgba(0,0,0,0.9));
      border: 2px solid ${color}60;
      border-radius: 12px;
      padding: 1rem 1.5rem;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 500;
      max-width: 400px;
      z-index: 100000;
      box-shadow: 0 8px 25px rgba(0,0,0,0.5);
      animation: slideInRight 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 4000);
  }

  /**
   * Download report as readable text/HTML
   */
  async downloadReport() {
    if (!this.currentData) {
      return;
    }

    const data = this.currentData;
    const profile = data.profile || {};
    const progress = data.progress || {};
    const immediate = data.immediate_actions || {};
    const opportunities = data.opportunities || {};
    const momentum = data.momentum || {};
    const network = data.network_insights || {};
    
    // Fetch comprehensive network data
    let allConnections = [];
    let allThemes = [];
    let allProjects = [];
    let allOrganizations = [];
    
    try {
      const user = await getAuthUser();
      if (user) {
        const userProfile = await getCommunityUser();
        
        if (userProfile) {
          console.log('📊 Fetching network data for profile:', userProfile.id);
          
          // Fetch all connections (using correct column names)
          const { data: connections, error: connError } = await window.supabase
            .from('connections')
            .select('*')
            .or(`from_user_id.eq.${userProfile.id},to_user_id.eq.${userProfile.id}`)
            .order('created_at', { ascending: false });
          
          if (connError) {
            console.error('Error fetching connections:', connError);
          } else {
            console.log('📊 Raw connections data:', connections);
            
            if (connections && connections.length > 0) {
              // Fetch all user profiles for connections
              const userIds = new Set();
              connections.forEach(conn => {
                if (conn.from_user_id !== userProfile.id) userIds.add(conn.from_user_id);
                if (conn.to_user_id !== userProfile.id) userIds.add(conn.to_user_id);
              });
              
              const { data: profiles } = await window.supabase
                .from('community')
                .select('id, name, email, bio, skills')
                .in('id', Array.from(userIds))
                .or('is_hidden.is.null,is_hidden.eq.false');
              
              const profileMap = {};
              if (profiles) {
                profiles.forEach(p => profileMap[p.id] = p);
              }
              
              allConnections = connections.map(conn => {
                const isFromUser = conn.from_user_id === userProfile.id;
                const otherUserId = isFromUser ? conn.to_user_id : conn.from_user_id;
                const otherProfile = profileMap[otherUserId];
                
                if (!otherProfile) {
                  console.warn('Skipping connection with missing profile:', conn);
                  return null;
                }
                
                return {
                  id: otherProfile.id,
                  name: otherProfile.name,
                  email: otherProfile.email,
                  bio: otherProfile.bio,
                  skills: otherProfile.skills,
                  status: conn.status,
                  created_at: conn.created_at,
                  direction: isFromUser ? 'outgoing' : 'incoming'
                };
              }).filter(c => c !== null);
              
              console.log('📊 Processed connections:', allConnections);
            }
          }
          
          // Fetch themes (try different column names)
          let themeParticipants = null;
          let themesError = null;
          
          // Try community_id first
          const result1 = await window.supabase
            .from('theme_participants')
            .select('theme_id')
            .eq('community_id', userProfile.id);
          
          if (result1.error) {
            // Try participant_id
            const result2 = await window.supabase
              .from('theme_participants')
              .select('theme_id')
              .eq('participant_id', userProfile.id);
            
            themeParticipants = result2.data;
            themesError = result2.error;
          } else {
            themeParticipants = result1.data;
          }
          
          if (themesError) {
            console.error('Error fetching theme participants:', themesError);
          } else if (themeParticipants && themeParticipants.length > 0) {
            const themeIds = themeParticipants.map(tp => tp.theme_id);
            const { data: themes } = await window.supabase
              .from('theme_circles')
              .select('*')
              .in('id', themeIds);
            
            if (themes) {
              allThemes = themes;
              console.log('📊 Themes:', allThemes.length);
            }
          }
          
          // Fetch projects
          const { data: projectMembers, error: projectsError } = await window.supabase
            .from('project_members')
            .select('project_id')
            .eq('user_id', userProfile.id);
          
          if (projectsError) {
            console.error('Error fetching project members:', projectsError);
          } else if (projectMembers && projectMembers.length > 0) {
            const projectIds = projectMembers.map(pm => pm.project_id);
            const { data: projects } = await window.supabase
              .from('projects')
              .select('*')
              .in('id', projectIds);
            
            if (projects) {
              allProjects = projects;
              console.log('📊 Projects:', allProjects.length);
            }
          }
          
          // Fetch organizations
          const { data: orgFollows, error: orgsError } = await window.supabase
            .from('organization_followers')
            .select('*')
            .eq('community_id', userProfile.id);
          
          if (orgsError) {
            console.error('Error fetching organizations:', orgsError);
          } else if (orgFollows && orgFollows.length > 0) {
            const orgIds = orgFollows.map(of => of.organization_id);
            const { data: orgs } = await window.supabase
              .from('organizations')
              .select('*')
              .in('id', orgIds);
            
            if (orgs) {
              allOrganizations = orgs;
              console.log('📊 Organizations:', allOrganizations.length);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching comprehensive network data:', error);
    }
    
    console.log('📊 Final counts:', {
      connections: allConnections.length,
      themes: allThemes.length,
      projects: allProjects.length,
      organizations: allOrganizations.length
    });
    
    const date = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const acceptedConnections = allConnections.filter(c => c.status === 'accepted');
    const pendingConnections = allConnections.filter(c => c.status === 'pending');

    // Create HTML report
    const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>START Report - ${date}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: linear-gradient(135deg, #0a0e27 0%, #101427 100%);
      color: #ffffff;
      line-height: 1.6;
    }
    h1 { color: #00e0ff; margin-bottom: 0.5rem; }
    h2 { color: #00ff88; margin-top: 2rem; border-bottom: 2px solid rgba(0,255,136,0.3); padding-bottom: 0.5rem; }
    h3 { color: #00e0ff; margin-top: 1.5rem; }
    .header { text-align: center; margin-bottom: 3rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .stat-card { background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; padding: 1rem; text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; color: #00ff88; }
    .stat-label { font-size: 0.9rem; color: rgba(255,255,255,0.7); margin-top: 0.25rem; }
    .insight { background: rgba(0,255,136,0.1); border-left: 4px solid #00ff88; padding: 1rem; margin: 0.5rem 0; border-radius: 4px; }
    .count { color: #00ff88; font-weight: bold; }
    .connection-item { background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); padding: 1rem; margin: 0.5rem 0; border-radius: 6px; }
    .connection-name { color: #00e0ff; font-weight: bold; font-size: 1.1rem; }
    .connection-email { color: #00ff88; font-size: 0.9rem; }
    .connection-bio { color: rgba(255,255,255,0.7); font-size: 0.9rem; margin-top: 0.5rem; }
    .connection-meta { color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 0.5rem; }
    .section-divider { border-top: 2px solid rgba(0,224,255,0.3); margin: 3rem 0; padding-top: 2rem; }
    .footer { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.2); text-align: center; color: rgba(255,255,255,0.5); font-size: 0.9rem; }
    @media print {
      body { background: white; color: black; }
      h1, h2, h3 { color: #0066cc; }
      .stat-card, .connection-item { border: 1px solid #ddd; }
    }
    @media (max-width: 600px) {
      body { padding: 1rem; }
      .stat-grid { grid-template-columns: 1fr 1fr; }
      .stat-value { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 START Report</h1>
    <p style="color: rgba(255,255,255,0.7);">${date}</p>
    <p style="font-size: 1.2rem; margin-top: 1rem;">Welcome back, <strong>${profile.name || 'User'}</strong>!</p>
  </div>

  <h2>📊 Your Progress</h2>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value">${progress.xp || 0}</div>
      <div class="stat-label">XP</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${progress.level || 1}</div>
      <div class="stat-label">Level</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${progress.login_streak || 0}</div>
      <div class="stat-label">Day Streak</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allConnections.length || progress.connection_count || 0}</div>
      <div class="stat-label">Connections</div>
    </div>
  </div>

  <h2>⚡ Immediate Actions</h2>
  ${immediate.pending_requests?.count > 0 ? `
    <div class="insight">
      <strong>👥 Connection Requests:</strong> <span class="count">${immediate.pending_requests.count}</span> ${immediate.pending_requests.count === 1 ? 'person wants' : 'people want'} to connect with you
    </div>
  ` : ''}
  ${immediate.unread_messages?.count > 0 ? `
    <div class="insight">
      <strong>💬 Unread Messages:</strong> <span class="count">${immediate.unread_messages.count}</span> unread ${immediate.unread_messages.count === 1 ? 'message' : 'messages'}
    </div>
  ` : ''}
  ${immediate.pending_bids?.count > 0 ? `
    <div class="insight">
      <strong>📋 Pending Bids:</strong> <span class="count">${immediate.pending_bids.count}</span> ${immediate.pending_bids.count === 1 ? 'bid' : 'bids'} awaiting review
    </div>
  ` : ''}
  ${immediate.bids_to_review?.count > 0 ? `
    <div class="insight">
      <strong>✅ Bids to Review:</strong> <span class="count">${immediate.bids_to_review.count}</span> ${immediate.bids_to_review.count === 1 ? 'bid' : 'bids'} on your projects
    </div>
  ` : ''}
  ${!immediate.pending_requests?.count && !immediate.unread_messages?.count && !immediate.pending_bids?.count && !immediate.bids_to_review?.count ? `
    <p style="color: rgba(255,255,255,0.6);">✨ You're all caught up! No immediate actions needed.</p>
  ` : ''}

  <h2>🎯 Opportunities</h2>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value">${opportunities.skill_matched_projects?.count || 0}</div>
      <div class="stat-label">Open Projects</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${opportunities.active_themes?.count || 0}</div>
      <div class="stat-label">Active Themes</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${opportunities.open_opportunities?.count || 0}</div>
      <div class="stat-label">Opportunities</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${opportunities.complementary_connections?.count || 0}</div>
      <div class="stat-label">Potential Connections</div>
    </div>
  </div>

  <h2>🔥 Momentum</h2>
  <div class="insight">
    <strong>Weekly Activity:</strong> <span class="count">${momentum.weekly_activity || 0}</span> actions in the last 7 days
  </div>
  ${momentum.streak?.current > 0 ? `
    <div class="insight">
      <strong>Login Streak:</strong> <span class="count">${momentum.streak.current}</span> days
      ${momentum.streak.is_at_risk ? ' ⚠️ <em>At risk! Log in today to maintain your streak.</em>' : ' 🎉'}
    </div>
  ` : ''}
  <div class="insight">
    <strong>XP Progress:</strong> ${momentum.xp_progress?.current_xp || 0} / ${momentum.xp_progress?.next_level_xp || 1000} 
    (${momentum.xp_progress?.progress_percentage || 0}% to Level ${(momentum.xp_progress?.current_level || 1) + 1})
  </div>

  <h2>🌐 Network Insights</h2>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value">${allConnections.length || network.connections?.total || 0}</div>
      <div class="stat-label">Total Connections</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allProjects.length || network.active_projects?.count || 0}</div>
      <div class="stat-label">Active Projects</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allThemes.length || network.participating_themes?.count || 0}</div>
      <div class="stat-label">Participating Themes</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allOrganizations.length || 0}</div>
      <div class="stat-label">Organizations</div>
    </div>
  </div>

  <h3>📈 Growth (Last 30 Days)</h3>
  <div class="insight">
    <strong>New Connections:</strong> <span class="count">${network.growth?.new_connections || 0}</span>
  </div>
  <div class="insight">
    <strong>New Projects:</strong> <span class="count">${network.growth?.new_projects || 0}</span>
  </div>
  <div class="insight">
    <strong>New Themes:</strong> <span class="count">${network.growth?.new_themes || 0}</span>
  </div>

  <div class="section-divider"></div>

  <h2>👥 Complete Network Overview</h2>
  
  ${acceptedConnections.length > 0 ? `
    <h3>✅ Accepted Connections (${acceptedConnections.length})</h3>
    ${acceptedConnections.map(conn => `
      <div class="connection-item">
        <div class="connection-name">${conn.name || 'Unknown'}</div>
        <div class="connection-email">${conn.email || 'No email'}</div>
        ${conn.bio ? `<div class="connection-bio">${conn.bio}</div>` : ''}
        ${conn.skills ? `<div class="connection-meta"><strong>Skills:</strong> ${conn.skills}</div>` : ''}
        <div class="connection-meta">Connected: ${new Date(conn.created_at).toLocaleDateString()}</div>
      </div>
    `).join('')}
  ` : ''}

  ${pendingConnections.length > 0 ? `
    <h3>⏳ Pending Connections (${pendingConnections.length})</h3>
    ${pendingConnections.map(conn => `
      <div class="connection-item">
        <div class="connection-name">${conn.name || 'Unknown'}</div>
        <div class="connection-meta">Status: ${conn.direction === 'outgoing' ? 'Request sent' : 'Request received'}</div>
        ${conn.bio ? `<div class="connection-bio">${conn.bio}</div>` : ''}
        <div class="connection-meta">Date: ${new Date(conn.created_at).toLocaleDateString()}</div>
      </div>
    `).join('')}
  ` : ''}

  ${allConnections.length === 0 ? `
    <p style="color: rgba(255,255,255,0.6);">No connections yet. Start building your network!</p>
  ` : ''}

  ${allThemes.length > 0 ? `
    <h3>🎨 Your Themes (${allThemes.length})</h3>
    ${allThemes.map(theme => `
      <div class="connection-item">
        <div class="connection-name">${theme.title || 'Untitled Theme'}</div>
        ${theme.description ? `<div class="connection-bio">${theme.description}</div>` : ''}
        ${theme.tags && theme.tags.length > 0 ? `<div class="connection-meta"><strong>Tags:</strong> ${theme.tags.join(', ')}</div>` : ''}
      </div>
    `).join('')}
  ` : ''}

  ${allProjects.length > 0 ? `
    <h3>💡 Your Projects (${allProjects.length})</h3>
    ${allProjects.map(project => `
      <div class="connection-item">
        <div class="connection-name">${project.title || 'Untitled Project'}</div>
        ${project.description ? `<div class="connection-bio">${project.description}</div>` : ''}
        ${project.status ? `<div class="connection-meta"><strong>Status:</strong> ${project.status}</div>` : ''}
      </div>
    `).join('')}
  ` : ''}

  ${allOrganizations.length > 0 ? `
    <h3>🏢 Organizations You Follow (${allOrganizations.length})</h3>
    ${allOrganizations.map(org => `
      <div class="connection-item">
        <div class="connection-name">${org.name || 'Unnamed Organization'}</div>
        ${org.description ? `<div class="connection-bio">${org.description}</div>` : ''}
        ${org.industry && org.industry.length > 0 ? `<div class="connection-meta"><strong>Industry:</strong> ${org.industry.join(', ')}</div>` : ''}
        ${org.website ? `<div class="connection-meta"><strong>Website:</strong> <a href="${org.website}" target="_blank" style="color: #00e0ff;">${org.website}</a></div>` : ''}
      </div>
    `).join('')}
  ` : ''}

  <div class="footer">
    <p>Generated by CharlestonHacks START Sequence</p>
    <p>${date}</p>
  </div>
</body>
</html>`;

    // Create and download
    const blob = new Blob([htmlReport], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `START-Report-${new Date().toISOString().split('T')[0]}.html`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Close the modal
   */
  close() {
    const modal = document.getElementById('start-modal');
    const backdrop = document.getElementById('start-modal-backdrop');

    if (modal) {
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }

    if (backdrop) {
      backdrop.style.opacity = '0';
      setTimeout(() => {
        backdrop.style.display = 'none';
      }, 300);
    }

    this.isOpen = false;
  }

  /**
   * Setup event listeners for modal
   */
  setupEventListeners() {
    // ESC key to close
    const escapeHandler = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };

    // Remove old listener if it exists
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
    }

    this.escapeHandler = escapeHandler;
    document.addEventListener('keydown', this.escapeHandler);

    // Backdrop click to close
    const backdrop = document.getElementById('start-modal-backdrop');
    if (backdrop) {
      // Remove old listener
      if (this.backdropClickHandler) {
        backdrop.removeEventListener('click', this.backdropClickHandler);
      }

      this.backdropClickHandler = (e) => {
        if (e.target === backdrop) {
          this.close();
        }
      };

      backdrop.addEventListener('click', this.backdropClickHandler);
    }
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.EnhancedStartUI = new EnhancedStartUI();

// ================================================================
// INTEGRATION WITH EXISTING START BUTTON
// ================================================================

// Override existing START button handler
document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('btn-start-center');
  
  if (startButton) {
    // Remove old handlers
    const newButton = startButton.cloneNode(true);
    startButton.parentNode.replaceChild(newButton, startButton);
    
    // Add new handler
    newButton.addEventListener('click', () => {
      console.log('🚀 START button clicked - opening enhanced UI');
      window.EnhancedStartUI.open();
    });
    
    console.log('✅ START button integrated with enhanced UI');
  }
});

console.log('✅ Enhanced START UI ready');
