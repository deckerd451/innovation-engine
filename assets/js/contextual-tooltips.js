// ================================================================
// Contextual Tooltips System
// ================================================================
// Smart tooltips that appear for new users to explain key features
// ================================================================

console.log("%c💡 Contextual Tooltips System - Loading", "color:#0f8; font-weight:bold;");

class ContextualTooltips {
  constructor() {
    this.tooltips = {
      'btn-start': {
        text: 'Get personalized daily recommendations for themes, projects, and people to connect with',
        position: 'top',
        delay: 3000,
        condition: () => !localStorage.getItem('has_seen_start_flow')
      },
      
      'btn-quickconnect': {
        text: 'Discover and connect with people who share your interests and skills',
        position: 'top',
        delay: 8000,
        condition: () => this.isNewUser()
      },
      
      'btn-projects': {
        text: 'Browse active projects or create your own to collaborate with others',
        position: 'top',
        delay: 12000,
        condition: () => this.isNewUser()
      },
      
      'global-search': {
        text: 'Search for people, skills, projects, or themes across the entire network',
        position: 'bottom',
        delay: 15000,
        condition: () => this.isNewUser() && !this.hasUsedSearch()
      },
      
      'user-menu': {
        text: 'Complete your profile to get better recommendations and connections',
        position: 'bottom-left',
        delay: 5000,
        condition: () => this.needsProfileCompletion()
      }
    };
    
    this.shownTooltips = new Set();
    this.initialized = false;
  }

  /**
   * Initialize the tooltip system
   */
  initialize() {
    console.log('💡 Initializing contextual tooltips...');
    
    // Wait for page to be ready
    setTimeout(() => {
      this.startTooltipSequence();
      this.setupEventListeners();
      this.initialized = true;
    }, 2000);
  }

  /**
   * Check if user is new (profile completeness < 50%)
   */
  isNewUser() {
    const profile = window.currentUserProfile;
    if (!profile) return true;
    
    let completeness = 0;
    if (profile.name && profile.name !== profile.email?.split('@')[0]) completeness++;
    if (profile.bio) completeness++;
    if (profile.skills) completeness++;
    if (profile.interests?.length > 0) completeness++;
    
    return completeness < 2; // Less than 50% complete
  }

  /**
   * Check if user needs profile completion
   */
  needsProfileCompletion() {
    const profile = window.currentUserProfile;
    return !profile?.profile_completed || !profile?.skills || !profile?.bio;
  }

  /**
   * Check if user has used search
   */
  hasUsedSearch() {
    return localStorage.getItem('has_used_search') === 'true';
  }

  /**
   * Start the tooltip sequence
   */
  startTooltipSequence() {
    Object.entries(this.tooltips).forEach(([elementId, config]) => {
      if (config.condition()) {
        setTimeout(() => {
          this.showTooltip(elementId, config);
        }, config.delay);
      }
    });
  }

  /**
   * Show a tooltip for an element
   */
  showTooltip(elementId, config) {
    const element = document.getElementById(elementId);
    if (!element || this.shownTooltips.has(elementId)) return;
    
    console.log('💡 Showing tooltip for:', elementId);
    
    const tooltip = document.createElement('div');
    tooltip.className = 'contextual-tooltip';
    tooltip.id = `tooltip-${elementId}`;
    
    // Position tooltip
    const rect = element.getBoundingClientRect();
    const tooltipStyle = this.getTooltipStyle(rect, config.position);
    
    tooltip.style.cssText = `
      position: fixed;
      ${tooltipStyle}
      background: linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,128,255,0.95));
      color: #000;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      max-width: 250px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,224,255,0.4);
      animation: tooltipFadeIn 0.3s ease-out;
      pointer-events: none;
    `;
    
    tooltip.innerHTML = `
      <div style="position: relative;">
        ${config.text}
        <div class="tooltip-arrow" style="
          position: absolute;
          ${this.getArrowStyle(config.position)}
          width: 0;
          height: 0;
          border: 6px solid transparent;
          ${this.getArrowBorder(config.position)}
        "></div>
      </div>
    `;
    
    // Add CSS animations if not exists
    if (!document.getElementById('tooltip-animations')) {
      const style = document.createElement('style');
      style.id = 'tooltip-animations';
      style.textContent = `
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes tooltipFadeOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-10px);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(tooltip);
    this.shownTooltips.add(elementId);
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
      this.hideTooltip(elementId);
    }, 8000);
    
    // Hide on element interaction
    const hideOnInteraction = () => {
      this.hideTooltip(elementId);
      element.removeEventListener('click', hideOnInteraction);
      element.removeEventListener('focus', hideOnInteraction);
    };
    
    element.addEventListener('click', hideOnInteraction);
    element.addEventListener('focus', hideOnInteraction);
  }

  /**
   * Get tooltip positioning style
   */
  getTooltipStyle(rect, position) {
    const offset = 10;
    
    switch (position) {
      case 'top':
        return `
          left: ${rect.left + rect.width / 2}px;
          bottom: ${window.innerHeight - rect.top + offset}px;
          transform: translateX(-50%);
        `;
      
      case 'bottom':
        return `
          left: ${rect.left + rect.width / 2}px;
          top: ${rect.bottom + offset}px;
          transform: translateX(-50%);
        `;
      
      case 'left':
        return `
          right: ${window.innerWidth - rect.left + offset}px;
          top: ${rect.top + rect.height / 2}px;
          transform: translateY(-50%);
        `;
      
      case 'right':
        return `
          left: ${rect.right + offset}px;
          top: ${rect.top + rect.height / 2}px;
          transform: translateY(-50%);
        `;
      
      case 'bottom-left':
        return `
          right: ${window.innerWidth - rect.right}px;
          top: ${rect.bottom + offset}px;
        `;
      
      default:
        return `
          left: ${rect.left + rect.width / 2}px;
          top: ${rect.bottom + offset}px;
          transform: translateX(-50%);
        `;
    }
  }

  /**
   * Get arrow positioning style
   */
  getArrowStyle(position) {
    switch (position) {
      case 'top':
        return 'bottom: -12px; left: 50%; transform: translateX(-50%);';
      case 'bottom':
        return 'top: -12px; left: 50%; transform: translateX(-50%);';
      case 'left':
        return 'right: -12px; top: 50%; transform: translateY(-50%);';
      case 'right':
        return 'left: -12px; top: 50%; transform: translateY(-50%);';
      case 'bottom-left':
        return 'top: -12px; right: 20px;';
      default:
        return 'top: -12px; left: 50%; transform: translateX(-50%);';
    }
  }

  /**
   * Get arrow border style
   */
  getArrowBorder(position) {
    const color = 'rgba(0,224,255,0.95)';
    
    switch (position) {
      case 'top':
        return `border-top-color: ${color};`;
      case 'bottom':
        return `border-bottom-color: ${color};`;
      case 'left':
        return `border-left-color: ${color};`;
      case 'right':
        return `border-right-color: ${color};`;
      case 'bottom-left':
        return `border-bottom-color: ${color};`;
      default:
        return `border-bottom-color: ${color};`;
    }
  }

  /**
   * Hide a tooltip
   */
  hideTooltip(elementId) {
    const tooltip = document.getElementById(`tooltip-${elementId}`);
    if (!tooltip) return;
    
    tooltip.style.animation = 'tooltipFadeOut 0.3s ease-out';
    setTimeout(() => {
      tooltip.remove();
    }, 300);
  }

  /**
   * Setup event listeners for user interactions
   */
  setupEventListeners() {
    // Track search usage
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        localStorage.setItem('has_used_search', 'true');
        this.hideTooltip('global-search');
      });
    }
    
    // Track START flow usage
    window.addEventListener('start-modal-opened', () => {
      this.hideTooltip('btn-start');
    });
    
    // Track profile updates
    window.addEventListener('profile-updated', () => {
      this.hideTooltip('user-menu');
    });
    
    // Hide tooltips on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.hideAllTooltips();
      }, 100);
    });
    
    // Hide tooltips on window resize
    window.addEventListener('resize', () => {
      this.hideAllTooltips();
    });
  }

  /**
   * Hide all visible tooltips
   */
  hideAllTooltips() {
    document.querySelectorAll('.contextual-tooltip').forEach(tooltip => {
      tooltip.style.animation = 'tooltipFadeOut 0.3s ease-out';
      setTimeout(() => {
        tooltip.remove();
      }, 300);
    });
  }

  /**
   * Manually show a tooltip
   */
  showManualTooltip(elementId, text, position = 'top') {
    const config = { text, position, condition: () => true };
    this.showTooltip(elementId, config);
  }

  /**
   * Reset tooltip system (for testing)
   */
  reset() {
    this.shownTooltips.clear();
    this.hideAllTooltips();
    localStorage.removeItem('has_used_search');
  }
}

// ================================================================
// GLOBAL INSTANCE AND INITIALIZATION
// ================================================================

const contextualTooltips = new ContextualTooltips();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait for other systems to load
  setTimeout(() => {
    contextualTooltips.initialize();
  }, 4000);
});

// Export for global access
window.ContextualTooltips = contextualTooltips;

console.log('✅ Contextual Tooltips System ready');