// ================================================================
// ENHANCED START UI
// ================================================================
// Replaces static START sequence with actionable, data-driven UI
// Integrates with START sequence report and synapse visualization
// ================================================================

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
      console.warn('START modal already open');
      return;
    }

    console.log('🚀 Opening enhanced START modal');
    this.isOpen = true;

    // Show loading state first
    this.showLoadingState();

    try {
      // Fetch fresh data
      const data = await window.getStartSequenceData(true);
      this.currentData = data;

      // Render the enhanced UI
      this.render(data);

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

    // Show loading content
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 2rem; color: rgba(255,255,255,0.6);">
        <div style="font-size: 3rem; margin-bottom: 1rem; animation: pulse 2s ease-in-out infinite;">
          🧠
        </div>
        <h3 style="color: #00e0ff; margin-bottom: 0.5rem;">Analyzing Your Network</h3>
        <p style="margin-bottom: 1.5rem;">Gathering actionable insights...</p>
        <div class="loading-dots" style="display: flex; justify-content: center; gap: 0.5rem;">
          <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out infinite both;"></div>
          <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out 0.16s infinite both;"></div>
          <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out 0.32s infinite both;"></div>
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
   * Render the enhanced START UI
   */
  render(data) {
    const container = document.getElementById('start-options-container');
    if (!container) return;

    // Generate insights
    const insights = window.StartSequenceFormatter.generateInsights(data);
    const summary = window.StartSequenceFormatter.generateSummary(data);

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
        }
      </style>
      ${this.renderHeader(data)}
      ${this.renderReport(summary)}
      ${this.renderInsights(insights)}
      ${this.renderActions(data)}
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

    return `
      <div class="insight-card" data-handler="${insight.handler || ''}" style="
        background: linear-gradient(135deg, ${color}15, rgba(0,0,0,0.1));
        border: 2px solid ${color}40;
        border-radius: 12px;
        padding: 1.25rem;
        cursor: ${insight.handler ? 'pointer' : 'default'};
        transition: all 0.3s ease;
      " ${insight.handler ? `onclick="window.EnhancedStartUI.handleAction('${insight.handler}')"` : ''}>
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
      </style>
    `;
  }

  /**
   * Render action buttons
   */
  renderActions(data) {
    return `
      <div class="start-actions-container" style="margin-top: 2rem; text-align: center; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <button onclick="window.EnhancedStartUI.close()" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 12px;
          color: #000;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          flex: 1;
          min-width: 200px;
        ">
          🚀 Start Exploring
        </button>
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
          min-width: 200px;
        ">
          📥 Download Report
        </button>
      </div>
      
      <style>
        @media (max-width: 768px) {
          .start-actions-container {
            flex-direction: column !important;
          }
          .start-actions-container button {
            width: 100% !important;
            min-width: auto !important;
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
  handleAction(handler) {
    console.log('🎯 Action clicked:', handler);

    // Close modal first
    this.close();

    // Execute handler after modal closes
    setTimeout(() => {
      const handlers = {
        openConnectionRequests: () => {
          console.log('📋 Opening connection requests...');
          // Filter synapse to show only people with pending requests
          if (window.filterByNodeType) {
            window.filterByNodeType('person');
          }
        },
        openMessaging: () => {
          console.log('💬 Opening messaging...');
          if (window.openMessagesModal) {
            window.openMessagesModal();
          } else if (window.openMessagingModal) {
            window.openMessagingModal();
          } else {
            console.warn('⚠️ Messaging modal not available');
          }
        },
        openProjectBids: () => {
          console.log('📋 Opening project bids...');
          // Open projects modal
          if (window.openProjectsModal) {
            window.openProjectsModal();
          } else {
            console.warn('⚠️ Projects modal not available');
          }
        },
        openSkillMatchedProjects: () => {
          console.log('💡 Opening skill-matched projects...');
          if (window.openProjectsModal) {
            window.openProjectsModal();
          } else {
            console.warn('⚠️ Projects modal not available');
          }
        },
        openThemes: () => {
          console.log('🎯 Switching to themes view...');
          // Check if we're in cards mode and need to switch to circles
          const currentStrategy = window.currentStrategy || 'new';
          console.log('Current strategy:', currentStrategy);
          
          if (window.toggleThemeStrategy && typeof window.toggleThemeStrategy === 'function') {
            // If in cards mode, switch to circles to see themes
            if (currentStrategy === 'new') {
              console.log('🔄 Switching from cards to circles to show themes');
              window.toggleThemeStrategy();
            } else {
              console.log('✅ Already in circles mode, themes visible');
            }
          } else {
            console.warn('⚠️ Theme toggle not available, using fallback');
            // Fallback: Click the Themes filter button
            const themesBtn = document.getElementById('btn-themes');
            if (themesBtn) {
              console.log('✅ Clicking Themes filter button');
              themesBtn.click();
            } else if (window.filterByNodeType) {
              console.log('✅ Using filterByNodeType');
              window.filterByNodeType('theme');
            } else {
              console.error('❌ No way to show themes found');
            }
          }
        }
      };

      const handlerFn = handlers[handler];
      if (handlerFn) {
        handlerFn();
      } else {
        console.warn('⚠️ Handler not found:', handler);
      }
    }, 300);
  }

  /**
   * Download report as readable text/HTML
   */
  downloadReport() {
    if (!this.currentData) {
      console.warn('No data to download');
      return;
    }

    const data = this.currentData;
    const profile = data.profile || {};
    const progress = data.progress || {};
    const immediate = data.immediate_actions || {};
    const opportunities = data.opportunities || {};
    const momentum = data.momentum || {};
    const network = data.network_insights || {};
    
    const date = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

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
    .footer { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.2); text-align: center; color: rgba(255,255,255,0.5); font-size: 0.9rem; }
    @media print {
      body { background: white; color: black; }
      h1, h2, h3 { color: #0066cc; }
      .stat-card { border: 1px solid #ddd; }
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
      <div class="stat-value">${progress.connection_count || 0}</div>
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
      <div class="stat-value">${network.connections?.total || 0}</div>
      <div class="stat-label">Total Connections</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${network.active_projects?.count || 0}</div>
      <div class="stat-label">Active Projects</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${network.participating_themes?.count || 0}</div>
      <div class="stat-label">Participating Themes</div>
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
    
    console.log('📥 Report downloaded as HTML');
  }

  /**
   * Close the modal
   */
  close() {
    console.log('🚪 Closing enhanced START modal');

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

// Also handle the "I just want to explore" button
document.addEventListener('DOMContentLoaded', () => {
  const exploreButton = document.getElementById('btn-explore-cancel');
  
  if (exploreButton) {
    exploreButton.addEventListener('click', () => {
      // Hide the START button container
      const container = document.getElementById('start-button-container');
      if (container) {
        container.style.display = 'none';
      }
    });
  }
});

console.log('✅ Enhanced START UI ready');
