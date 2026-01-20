// ================================================================
// START Flow - Complete Integration & Deployment
// ================================================================
// Integrates the redesigned START flow with existing systems
// Replaces old START flow with comprehensive new version
// ================================================================

console.log("%c🚀 START Flow Complete Integration - Loading", "color:#0f8; font-weight:bold; font-size:16px;");

// ================================================================
// INTEGRATION CONTROLLER
// ================================================================

class StartFlowIntegration {
  constructor() {
    this.initialized = false;
    this.fallbackMode = false;
    this.dependencies = {
      supabase: false,
      profile: false,
      redesigned: false,
      ui: false,
      organizations: false
    };
  }

  /**
   * Initialize the complete START flow system
   */
  async initialize() {
    console.log('🎯 Initializing complete START flow integration...');
    
    try {
      // Check dependencies
      await this.checkDependencies();
      
      // Initialize organizations if available
      await this.initializeOrganizations();
      
      // Initialize redesigned system
      await this.initializeRedesignedSystem();
      
      // Replace existing START button handlers
      this.replaceStartButtonHandlers();
      
      // Setup daily refresh system
      this.setupDailyRefresh();
      
      // Setup analytics tracking
      this.setupAnalytics();
      
      this.initialized = true;
      console.log('✅ START flow complete integration ready');
      
    } catch (error) {
      console.error('❌ START flow integration failed:', error);
      this.enableFallbackMode();
    }
  }

  /**
   * Check for required dependencies
   */
  async checkDependencies() {
    console.log('🔍 Checking START flow dependencies...');
    
    // Wait for core dependencies
    const maxWait = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    let waited = 0;
    
    while (waited < maxWait) {
      // Check Supabase
      if (window.supabase) {
        this.dependencies.supabase = true;
      }
      
      // Check user profile
      if (window.currentUserProfile) {
        this.dependencies.profile = true;
      }
      
      // Check redesigned system
      if (window.StartFlowRedesigned) {
        this.dependencies.redesigned = true;
      }
      
      // Check UI system
      if (window.openRedesignedStartModal) {
        this.dependencies.ui = true;
      }
      
      // Check organizations (optional)
      if (window.OrganizationsManager) {
        this.dependencies.organizations = true;
      }
      
      // Check if we have minimum requirements
      if (this.dependencies.supabase && this.dependencies.profile && 
          this.dependencies.redesigned && this.dependencies.ui) {
        console.log('✅ All required dependencies available');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    console.warn('⚠️ Some dependencies missing:', this.dependencies);
    throw new Error('Required dependencies not available');
  }

  /**
   * Initialize organizations system
   */
  async initializeOrganizations() {
    if (!this.dependencies.organizations) {
      console.log('📋 Organizations system not available, continuing without it');
      return;
    }
    
    try {
      await window.OrganizationsManager.initialize();
      console.log('✅ Organizations system integrated');
    } catch (error) {
      console.warn('⚠️ Organizations initialization failed:', error);
      // Continue without organizations
    }
  }

  /**
   * Initialize the redesigned START system
   */
  async initializeRedesignedSystem() {
    if (!this.dependencies.redesigned) {
      throw new Error('Redesigned START system not available');
    }
    
    try {
      await window.StartFlowRedesigned.initialize();
      console.log('✅ Redesigned START system initialized');
    } catch (error) {
      console.error('❌ Redesigned system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Replace existing START button handlers with new system
   */
  replaceStartButtonHandlers() {
    console.log('🔄 Replacing START button handlers...');
    
    // Find START button
    const startBtn = document.getElementById('btn-start');
    if (!startBtn) {
      console.warn('⚠️ START button not found');
      return;
    }
    
    // Remove existing event listeners by cloning the node
    const newStartBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStartBtn, startBtn);
    
    // Add new event listener
    newStartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (this.fallbackMode) {
        this.openFallbackStartModal();
      } else {
        window.openRedesignedStartModal();
      }
    });
    
    // Update button appearance to indicate new functionality
    this.updateStartButtonAppearance(newStartBtn);
    
    console.log('✅ START button handlers replaced');
  }

  /**
   * Update START button appearance
   */
  updateStartButtonAppearance(button) {
    // Add subtle glow to indicate enhanced functionality
    button.style.boxShadow = '0 0 20px rgba(0,255,136,0.3)';
    button.style.animation = 'startButtonPulse 3s ease-in-out infinite';
    
    // Add CSS animation if not exists
    if (!document.getElementById('start-integration-animations')) {
      const style = document.createElement('style');
      style.id = 'start-integration-animations';
      style.textContent = `
        @keyframes startButtonPulse {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(0,255,136,0.3);
          }
          50% { 
            box-shadow: 0 0 30px rgba(0,255,136,0.5);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Add tooltip
    button.title = 'Your personalized daily recommendations - Updated!';
  }

  /**
   * Setup daily refresh system
   */
  setupDailyRefresh() {
    console.log('📅 Setting up daily refresh system...');
    
    // Check for new day every hour
    setInterval(() => {
      const today = new Date().toISOString().split('T')[0];
      const stored = localStorage.getItem('start_daily_recommendations');
      
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.date !== today) {
            console.log('🌅 New day detected, clearing cached recommendations');
            localStorage.removeItem('start_daily_recommendations');
            
            // Pre-calculate new recommendations in background
            if (window.StartFlowRedesigned?.calculateDailyRecommendations) {
              window.StartFlowRedesigned.calculateDailyRecommendations()
                .then(() => console.log('✅ New daily recommendations pre-calculated'))
                .catch(err => console.warn('⚠️ Failed to pre-calculate recommendations:', err));
            }
          }
        } catch (e) {
          console.warn('Failed to parse stored recommendations');
        }
      }
    }, 60 * 60 * 1000); // Every hour
    
    console.log('✅ Daily refresh system active');
  }

  /**
   * Setup analytics tracking
   */
  setupAnalytics() {
    console.log('📊 Setting up START flow analytics...');
    
    // Track START button clicks
    window.addEventListener('start-modal-opened', () => {
      this.trackEvent('start_modal_opened');
    });
    
    // Track recommendation actions
    window.addEventListener('recommendation-action', (e) => {
      this.trackEvent('recommendation_action', {
        type: e.detail?.type,
        action: e.detail?.action
      });
    });
    
    // Track session focus changes
    window.addEventListener('session-focus-set', (e) => {
      this.trackEvent('session_focus_set', {
        focusType: e.detail?.type
      });
    });
    
    console.log('✅ Analytics tracking active');
  }

  /**
   * Track analytics events
   */
  trackEvent(eventName, properties = {}) {
    // Store in localStorage for now (could integrate with analytics service)
    const events = JSON.parse(localStorage.getItem('start_flow_analytics') || '[]');
    events.push({
      event: eventName,
      properties,
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0]
    });
    
    // Keep only last 100 events
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
    
    localStorage.setItem('start_flow_analytics', JSON.stringify(events));
    
    console.log('📊 Event tracked:', eventName, properties);
  }

  /**
   * Enable fallback mode if integration fails
   */
  enableFallbackMode() {
    console.log('🔄 Enabling START flow fallback mode...');
    
    this.fallbackMode = true;
    
    // Use existing START flow as fallback
    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.openFallbackStartModal();
      });
      
      // Update button to indicate fallback mode
      startBtn.style.opacity = '0.8';
      startBtn.title = 'START (Basic Mode)';
    }
    
    console.log('✅ Fallback mode enabled');
  }

  /**
   * Open fallback START modal
   */
  openFallbackStartModal() {
    console.log('🔄 Opening fallback START modal...');
    
    // Use existing START modal if available
    if (window.openEnhancedStartModal) {
      window.openEnhancedStartModal();
    } else if (window.openStartModal) {
      window.openStartModal();
    } else {
      // Show basic modal
      this.showBasicStartModal();
    }
  }

  /**
   * Show basic START modal as last resort
   */
  showBasicStartModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
        border: 2px solid rgba(0,224,255,0.4);
        border-radius: 16px;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        text-align: center;
      ">
        <h2 style="color: #00e0ff; margin-bottom: 1rem;">START</h2>
        <p style="color: rgba(255,255,255,0.8); margin-bottom: 2rem;">
          The enhanced START flow is temporarily unavailable. 
          Please use the navigation buttons below to explore the network.
        </p>
        <div style="display: flex; gap: 1rem; justify-content: center;">
          <button onclick="this.closest('div[style*=fixed]').remove(); document.getElementById('btn-quickconnect')?.click();" style="
            background: linear-gradient(135deg, #00e0ff, #0080ff);
            border: none;
            border-radius: 8px;
            color: #000;
            padding: 0.75rem 1.5rem;
            font-weight: 600;
            cursor: pointer;
          ">
            Connect
          </button>
          <button onclick="this.closest('div[style*=fixed]').remove(); document.getElementById('btn-projects')?.click();" style="
            background: linear-gradient(135deg, #00ff88, #00e0ff);
            border: none;
            border-radius: 8px;
            color: #000;
            padding: 0.75rem 1.5rem;
            font-weight: 600;
            cursor: pointer;
          ">
            Projects
          </button>
          <button onclick="this.closest('div[style*=fixed]').remove();" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            color: #fff;
            padding: 0.75rem 1.5rem;
            cursor: pointer;
          ">
            Close
          </button>
        </div>
      </div>
    `;
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    
    document.body.appendChild(modal);
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      fallbackMode: this.fallbackMode,
      dependencies: this.dependencies,
      hasRecommendations: !!localStorage.getItem('start_daily_recommendations')
    };
  }
}

// ================================================================
// GLOBAL INTEGRATION INSTANCE
// ================================================================

const startFlowIntegration = new StartFlowIntegration();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait for other systems to load
  setTimeout(() => {
    startFlowIntegration.initialize();
  }, 3000);
});

// ================================================================
// ENHANCED FUNCTIONS FOR EXISTING SYSTEMS
// ================================================================

/**
 * Enhanced session focus with organizations support
 */
function setEnhancedSessionFocus(focusType, focusData) {
  console.log('🎯 Setting enhanced session focus:', focusType);
  
  // Call original function if available
  if (window.setSessionFocus) {
    window.setSessionFocus(focusType, focusData);
  }
  
  // Enhanced functionality for organizations
  if (focusType === 'organization' && focusData) {
    // Show organization-specific UI enhancements
    highlightOrganizationOpportunities(focusData.id);
    
    // Update navigation context
    contextualizeForOrganization(focusData);
  }
  
  // Dispatch event for analytics
  window.dispatchEvent(new CustomEvent('session-focus-set', {
    detail: { type: focusType, data: focusData }
  }));
}

/**
 * Highlight organization opportunities in the network
 */
function highlightOrganizationOpportunities(organizationId) {
  // TODO: Implement network highlighting for organization opportunities
  console.log('🏢 Highlighting opportunities for organization:', organizationId);
}

/**
 * Contextualize navigation for organization focus
 */
function contextualizeForOrganization(orgData) {
  // Update quick action labels for organization context
  const connectBtn = document.getElementById('btn-quickconnect');
  if (connectBtn) {
    const label = connectBtn.querySelector('.label');
    if (label) label.textContent = 'Connect with ' + orgData.name;
  }
  
  const projectsBtn = document.getElementById('btn-projects');
  if (projectsBtn) {
    const label = projectsBtn.querySelector('.label');
    if (label) label.textContent = 'View Opportunities';
  }
}

/**
 * Enhanced recommendation tracking
 */
function trackRecommendationAction(type, action, itemId) {
  console.log('📊 Tracking recommendation action:', { type, action, itemId });
  
  // Store action for learning
  const actions = JSON.parse(localStorage.getItem('start_recommendation_actions') || '[]');
  actions.push({
    type,
    action,
    itemId,
    timestamp: Date.now(),
    date: new Date().toISOString().split('T')[0]
  });
  
  // Keep only last 50 actions
  if (actions.length > 50) {
    actions.splice(0, actions.length - 50);
  }
  
  localStorage.setItem('start_recommendation_actions', JSON.stringify(actions));
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('recommendation-action', {
    detail: { type, action, itemId }
  }));
}

// ================================================================
// EXPORTS AND GLOBAL ACCESS
// ================================================================

// Export integration instance
window.StartFlowIntegration = startFlowIntegration;

// Enhanced functions
window.setEnhancedSessionFocus = setEnhancedSessionFocus;
window.trackRecommendationAction = trackRecommendationAction;

// Backward compatibility
window.openStartModal = () => {
  if (startFlowIntegration.initialized && !startFlowIntegration.fallbackMode) {
    window.openRedesignedStartModal();
  } else {
    startFlowIntegration.openFallbackStartModal();
  }
};

console.log('✅ START Flow Complete Integration ready for initialization');

// ================================================================
// DEPLOYMENT VERIFICATION
// ================================================================

// Add deployment verification
setTimeout(() => {
  const status = startFlowIntegration.getStatus();
  console.log('%c🚀 START Flow Deployment Status:', 'color:#0f8; font-weight:bold; font-size:14px;');
  console.table(status);
  
  if (status.initialized && !status.fallbackMode) {
    console.log('%c✅ START Flow successfully deployed with full functionality', 'color:#0f8; font-weight:bold;');
  } else if (status.initialized && status.fallbackMode) {
    console.log('%c⚠️ START Flow deployed in fallback mode', 'color:#fa0; font-weight:bold;');
  } else {
    console.log('%c❌ START Flow deployment failed', 'color:#f44; font-weight:bold;');
  }
}, 5000);