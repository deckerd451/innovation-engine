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
        <div style="
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
        <div style="display: flex; align-items: start; gap: 1rem;">
          <div style="
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
          <div style="flex: 1;">
            <div style="color: #fff; font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">
              ${insight.message}
            </div>
            ${insight.detail ? `
              <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.75rem;">
                ${insight.detail}
              </div>
            ` : ''}
            ${insight.action ? `
              <div style="
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
    `;
  }

  /**
   * Render action buttons
   */
  renderActions(data) {
    return `
      <div style="margin-top: 2rem; text-align: center; display: flex; gap: 1rem; justify-content: center;">
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
        ">
          📥 Download Report
        </button>
      </div>
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

    // Execute handler
    const handlers = {
      openConnectionRequests: () => {
        // TODO: Implement connection requests modal
        console.log('Opening connection requests...');
      },
      openMessaging: () => {
        if (window.openMessagingModal) {
          window.openMessagingModal();
        }
      },
      openProjectBids: () => {
        // TODO: Implement project bids modal
        console.log('Opening project bids...');
      },
      openSkillMatchedProjects: () => {
        if (window.openProjectsModal) {
          window.openProjectsModal();
        }
      },
      openThemes: () => {
        // Switch to circles view
        if (window.toggleThemeStrategy) {
          window.toggleThemeStrategy();
        }
      }
    };

    const handlerFn = handlers[handler];
    if (handlerFn) {
      setTimeout(() => handlerFn(), 300);
    } else {
      console.warn('Handler not found:', handler);
    }
  }

  /**
   * Download report as JSON
   */
  downloadReport() {
    if (!this.currentData) {
      console.warn('No data to download');
      return;
    }

    const dataStr = JSON.stringify(this.currentData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `start-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    console.log('📥 Report downloaded');
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
