// ================================================================
// Enhanced Onboarding System
// ================================================================
// Comprehensive first-time user experience that builds on spatial discovery
// Focuses on profile completion and START flow introduction
// ================================================================

console.log("%c🌟 Enhanced Onboarding System - Loading", "color:#0f8; font-weight:bold;");

class EnhancedOnboarding {
  constructor() {
    this.state = {
      isNewUser: false,
      profileCompleteness: 0,
      currentStep: null,
      hasSeenStartFlow: false,
      completedActions: new Set()
    };
    
    this.steps = [
      'welcome',
      'profile-basics',
      'skills-interests', 
      'start-flow-intro',
      'spatial-discovery'
    ];
    
    this.initialized = false;
  }

  /**
   * Initialize the enhanced onboarding system
   */
  async initialize() {
    console.log('🎯 Initializing enhanced onboarding...');
    
    try {
      // Wait for dependencies
      await this.waitForDependencies();
      
      // Check user status
      await this.checkUserStatus();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Start onboarding if needed
      if (this.state.isNewUser) {
        await this.startOnboarding();
      } else {
        // Check for incomplete profile
        await this.checkProfileCompletion();
      }
      
      this.initialized = true;
      console.log('✅ Enhanced onboarding initialized');
      
    } catch (error) {
      console.error('❌ Enhanced onboarding initialization failed:', error);
    }
  }

  /**
   * Wait for required dependencies
   */
  async waitForDependencies() {
    const maxWait = 15000; // 15 seconds
    const checkInterval = 500;
    let waited = 0;
    
    while (waited < maxWait) {
      if (window.supabase && window.currentUserProfile !== undefined) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    throw new Error('Required dependencies not available');
  }

  /**
   * Check if user is new and needs onboarding
   */
  async checkUserStatus() {
    console.log('🔍 Checking user status...');
    
    if (!window.currentUserProfile) {
      console.log('🆕 New user detected - no profile');
      this.state.isNewUser = true;
      this.state.profileCompleteness = 0;
      return;
    }
    
    // Calculate profile completeness
    const profile = window.currentUserProfile;
    let completeness = 0;
    let totalFields = 5;
    
    if (profile.name && profile.name !== profile.email?.split('@')[0]) completeness++;
    if (profile.bio && profile.bio.trim()) completeness++;
    if (profile.skills && this.hasContent(profile.skills)) completeness++;
    if (profile.interests && Array.isArray(profile.interests) && profile.interests.length > 0) completeness++;
    if (profile.image_url) completeness++;
    
    this.state.profileCompleteness = Math.round((completeness / totalFields) * 100);
    
    // Consider user "new" if profile is less than 40% complete
    this.state.isNewUser = this.state.profileCompleteness < 40;
    
    // Check if they've seen START flow
    this.state.hasSeenStartFlow = localStorage.getItem('has_seen_start_flow') === 'true';
    
    console.log('📊 User status:', {
      isNew: this.state.isNewUser,
      completeness: this.state.profileCompleteness,
      hasSeenStart: this.state.hasSeenStartFlow
    });
  }

  /**
   * Check if field has meaningful content
   */
  hasContent(field) {
    if (Array.isArray(field)) return field.length > 0;
    if (typeof field === 'string') return field.trim().length > 0;
    return !!field;
  }

  /**
   * Setup event listeners for profile updates
   */
  setupEventListeners() {
    // Listen for profile updates
    window.addEventListener('profile-updated', () => {
      this.checkUserStatus();
    });
    
    // Listen for START flow usage
    window.addEventListener('start-modal-opened', () => {
      this.state.hasSeenStartFlow = true;
      localStorage.setItem('has_seen_start_flow', 'true');
    });
    
    // Listen for meaningful actions
    window.addEventListener('recommendation-action', () => {
      this.state.completedActions.add('used_recommendations');
    });
    
    window.addEventListener('session-focus-set', () => {
      this.state.completedActions.add('set_focus');
    });
  }

  /**
   * Start the onboarding process
   */
  async startOnboarding() {
    console.log('🚀 Starting enhanced onboarding...');

    // Show welcome message first
    await this.showWelcomeMessage();

    // Then guide through profile completion
    if (this.state.profileCompleteness < 60) {
      await this.guideProfileCompletion();
    }

    // Auto-open START flow on every login
    setTimeout(() => this.autoOpenStartModal(), 2000);

    // Enable spatial discovery
    this.enableSpatialDiscovery();
  }

  /**
   * Show welcome message for new users
   */
  async showWelcomeMessage() {
    return new Promise((resolve) => {
      const welcome = document.createElement('div');
      welcome.id = 'onboarding-welcome';
      welcome.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,128,255,0.95));
        border-radius: 16px;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        color: #000;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 20px 60px rgba(0,224,255,0.4);
        animation: welcomeSlideIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      `;
      
      welcome.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🌟</div>
          <h2 style="margin: 0 0 1rem 0; font-size: 1.8rem;">Welcome to CharlestonHacks!</h2>
          <p style="margin: 0 0 1.5rem 0; line-height: 1.5; font-size: 1.1rem;">
            You've joined Charleston's innovation network. Let's get you connected with the right people, projects, and opportunities.
          </p>
          <button id="start-onboarding-btn" style="
            background: rgba(0,0,0,0.2);
            border: 2px solid rgba(0,0,0,0.3);
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
          ">
            Let's Get Started! 🚀
          </button>
        </div>
      `;
      
      // Add CSS animation
      if (!document.getElementById('onboarding-animations')) {
        const style = document.createElement('style');
        style.id = 'onboarding-animations';
        style.textContent = `
          @keyframes welcomeSlideIn {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.8);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
          @keyframes profilePulse {
            0%, 100% { 
              box-shadow: 0 0 20px rgba(0,255,136,0.4);
            }
            50% { 
              box-shadow: 0 0 30px rgba(0,255,136,0.7);
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      welcome.querySelector('#start-onboarding-btn').addEventListener('click', () => {
        welcome.style.animation = 'welcomeSlideIn 0.3s ease-out reverse';
        setTimeout(() => {
          welcome.remove();
          resolve();
        }, 300);
      });
      
      document.body.appendChild(welcome);
    });
  }

  /**
   * Guide user through profile completion
   */
  async guideProfileCompletion() {
    console.log('📝 Guiding profile completion...');
    
    // Show profile completion prompt
    this.showProfileCompletionPrompt();
    
    // Pulse the user menu to draw attention
    this.pulseUserMenu();
  }

  /**
   * Show profile completion prompt
   */
  showProfileCompletionPrompt() {
    const prompt = document.createElement('div');
    prompt.id = 'profile-completion-prompt';
    prompt.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, rgba(0,255,136,0.95), rgba(0,224,255,0.95));
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 350px;
      color: #000;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 8px 25px rgba(0,255,136,0.4);
      animation: slideInRight 0.5s ease-out;
    `;
    
    prompt.innerHTML = `
      <div style="display: flex; align-items: start; gap: 1rem;">
        <div style="font-size: 2rem;">📝</div>
        <div style="flex: 1;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">Complete Your Profile</h3>
          <p style="margin: 0 0 1rem 0; line-height: 1.4; font-size: 0.9rem;">
            Your profile is ${this.state.profileCompleteness}% complete. Add your skills and interests to get better recommendations!
          </p>
          <div style="display: flex; gap: 0.5rem;">
            <button onclick="document.getElementById('user-menu')?.click(); this.closest('#profile-completion-prompt').remove();" style="
              background: rgba(0,0,0,0.2);
              border: 1px solid rgba(0,0,0,0.3);
              border-radius: 6px;
              color: #000;
              padding: 0.5rem 1rem;
              cursor: pointer;
              font-weight: 600;
              font-size: 0.8rem;
            ">
              Edit Profile
            </button>
            <button onclick="this.closest('#profile-completion-prompt').remove();" style="
              background: transparent;
              border: 1px solid rgba(0,0,0,0.2);
              border-radius: 6px;
              color: rgba(0,0,0,0.7);
              padding: 0.5rem 1rem;
              cursor: pointer;
              font-size: 0.8rem;
            ">
              Later
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Add CSS animation
    if (!document.getElementById('onboarding-slide-animations')) {
      const style = document.createElement('style');
      style.id = 'onboarding-slide-animations';
      style.textContent = `
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(prompt);
    
    // Auto-remove after 15 seconds
    setTimeout(() => {
      if (prompt.parentNode) {
        prompt.remove();
      }
    }, 15000);
  }

  /**
   * Pulse the user menu to draw attention
   */
  pulseUserMenu() {
    const userMenu = document.getElementById('user-menu');
    if (!userMenu) return;
    
    userMenu.style.animation = 'profilePulse 2s ease-in-out infinite';
    
    // Remove pulse after profile is clicked or 20 seconds
    const removePulse = () => {
      userMenu.style.animation = '';
    };
    
    userMenu.addEventListener('click', removePulse, { once: true });
    setTimeout(removePulse, 20000);
  }

  /**
   * Introduce the START flow to new users
   */
  introduceStartFlow() {
    console.log('🎯 Introducing START flow...');
    
    const intro = document.createElement('div');
    intro.id = 'start-flow-intro';
    intro.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,128,255,0.95));
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 400px;
      width: 90%;
      color: #000;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 8px 25px rgba(0,224,255,0.4);
      animation: slideInUp 0.5s ease-out;
    `;
    
    intro.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 1rem;">🎯</div>
        <h3 style="margin: 0 0 0.5rem 0; font-size: 1.2rem;">Ready for Your Daily Recommendations?</h3>
        <p style="margin: 0 0 1.5rem 0; line-height: 1.4; font-size: 0.9rem;">
          Click START to get personalized recommendations for themes, projects, and people based on your interests.
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center;">
          <button onclick="document.getElementById('btn-start')?.click(); this.closest('#start-flow-intro').remove();" style="
            background: rgba(0,0,0,0.2);
            border: 2px solid rgba(0,0,0,0.3);
            border-radius: 8px;
            color: #000;
            padding: 0.75rem 1.5rem;
            font-weight: 700;
            cursor: pointer;
          ">
            Try START Now!
          </button>
          <button onclick="this.closest('#start-flow-intro').remove();" style="
            background: transparent;
            border: 1px solid rgba(0,0,0,0.2);
            border-radius: 8px;
            color: rgba(0,0,0,0.7);
            padding: 0.75rem 1rem;
            cursor: pointer;
          ">
            Maybe Later
          </button>
        </div>
      </div>
    `;
    
    // Add slide up animation
    if (!document.getElementById('slide-up-animation')) {
      const style = document.createElement('style');
      style.id = 'slide-up-animation';
      style.textContent = `
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(100px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(intro);
    
    // Pulse the START button
    this.pulseStartButton();
    
    // Auto-remove after 20 seconds
    setTimeout(() => {
      if (intro.parentNode) {
        intro.remove();
      }
    }, 20000);
  }

  /**
   * Pulse the START button to draw attention
   */
  pulseStartButton() {
    const startBtn = document.getElementById('btn-start');
    if (!startBtn) return;
    
    startBtn.style.animation = 'profilePulse 2s ease-in-out infinite';
    startBtn.style.boxShadow = '0 0 20px rgba(0,255,136,0.6)';
    
    // Remove pulse after START is clicked or 25 seconds
    const removePulse = () => {
      startBtn.style.animation = '';
      startBtn.style.boxShadow = '';
    };
    
    startBtn.addEventListener('click', removePulse, { once: true });
    setTimeout(removePulse, 25000);
  }

  /**
   * Enable spatial discovery for exploration
   */
  enableSpatialDiscovery() {
    console.log('🌐 Enabling spatial discovery...');
    
    // Use existing spatial discovery system
    if (window.SpatialDiscovery) {
      // Trigger spatial discovery after a delay
      setTimeout(() => {
        if (window.SpatialDiscovery.pulseConnectButton) {
          window.SpatialDiscovery.pulseConnectButton(10000);
        }
      }, 5000);
    }
  }

  /**
   * Check profile completion and show prompts if needed
   */
  async checkProfileCompletion() {
    if (this.state.profileCompleteness < 60 && !this.hasShownProfilePrompt()) {
      this.showProfileCompletionPrompt();
      this.markProfilePromptShown();
    }

    // Auto-open START modal on every login
    setTimeout(() => {
      this.autoOpenStartModal();
    }, 2000);
  }

  /**
   * Check if profile prompt has been shown recently
   */
  hasShownProfilePrompt() {
    const lastShown = localStorage.getItem('profile_prompt_last_shown');
    if (!lastShown) return false;
    
    const daysSince = (Date.now() - parseInt(lastShown)) / (1000 * 60 * 60 * 24);
    return daysSince < 1; // Don't show more than once per day
  }

  /**
   * Mark profile prompt as shown
   */
  markProfilePromptShown() {
    localStorage.setItem('profile_prompt_last_shown', Date.now().toString());
  }

  /**
   * Check if START prompt has been shown
   */
  hasShownStartPrompt() {
    return localStorage.getItem('start_prompt_shown') === 'true';
  }

  /**
   * Mark START prompt as shown
   */
  markStartPromptShown() {
    localStorage.setItem('start_prompt_shown', 'true');
  }

  /**
   * Auto-open START modal on login
   */
  autoOpenStartModal() {
    console.log('🎯 Auto-opening START modal...');

    // Try to open the redesigned START modal first
    if (typeof window.openRedesignedStartModal === 'function') {
      console.log('✅ Opening redesigned START modal');
      window.openRedesignedStartModal();
      return;
    }

    // Fallback to clicking the START button
    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
      console.log('✅ Clicking START button');
      startBtn.click();
      return;
    }

    // Final fallback to legacy START modal
    if (typeof window.openStartModal === 'function') {
      console.log('✅ Opening legacy START modal');
      window.openStartModal();
      return;
    }

    console.warn('⚠️ No START modal function available');
  }

  /**
   * Get onboarding status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      isNewUser: this.state.isNewUser,
      profileCompleteness: this.state.profileCompleteness,
      hasSeenStartFlow: this.state.hasSeenStartFlow,
      completedActions: Array.from(this.state.completedActions)
    };
  }
}

// ================================================================
// GLOBAL INSTANCE AND INITIALIZATION
// ================================================================

const enhancedOnboarding = new EnhancedOnboarding();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait for other systems to load
  setTimeout(() => {
    enhancedOnboarding.initialize();
  }, 2000);
});

// Export for global access
window.EnhancedOnboarding = enhancedOnboarding;

// Integration with existing systems
window.addEventListener('profile-loaded', () => {
  if (enhancedOnboarding.initialized) {
    enhancedOnboarding.checkUserStatus();
  }
});

console.log('✅ Enhanced Onboarding System ready for initialization');