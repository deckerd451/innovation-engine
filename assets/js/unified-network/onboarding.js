/**
 * Onboarding Module
 * 
 * Provides onboarding and discovery accessibility features:
 * - First-time tooltip (one-time only)
 * - No admin-only restrictions
 *
 * Discovery on/off is in Settings ("Suggest people and projects on the
 * map"), not here.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */

import { logger } from '../logger.js';

export class OnboardingManager {
  constructor() {
    this.hasShownTooltip = false;
    this.tooltipElement = null;
    
    logger.info('OnboardingManager', 'Initialized');
  }
  
  /**
   * Initialize onboarding
   */
  initialize(container, api) {
    this.container = container;
    this.api = api;
    
    // Check if user has seen tooltip
    this.checkTooltipStatus();
    
    logger.info('OnboardingManager', 'Onboarding initialized');
  }
  
  /**
   * Check if user has seen the tooltip
   */
  checkTooltipStatus() {
    const seen = localStorage.getItem('unified-network-tooltip-seen');
    this.hasShownTooltip = seen === 'true';
    
    if (!this.hasShownTooltip) {
      logger.debug('OnboardingManager', 'First-time user, will show tooltip');
    }
  }
  
  /**
   * Show first-time tooltip
   */
  showFirstTimeTooltip() {
    if (this.hasShownTooltip) {
      logger.debug('OnboardingManager', 'Tooltip already shown, skipping');
      return;
    }
    
    // Create tooltip
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'unified-network-tooltip';
    this.tooltipElement.innerHTML = `
      <div class="tooltip-content">
        <h3>Welcome to Network Discovery</h3>
        <p>Your network naturally flows between connections and opportunities.</p>
        <ul>
          <li><strong>My Network</strong>: Your existing connections</li>
          <li><strong>Discovery</strong>: New opportunities appear when relevant</li>
          <li><strong>Presence</strong>: Nodes glow when people are active</li>
        </ul>
        <p class="tooltip-hint">Discovery appears automatically based on momentum, presence, and timing.</p>
        <button class="tooltip-close">Got it!</button>
      </div>
    `;
    
    // Add styles
    this.addTooltipStyles();
    
    // Add to container
    this.container.parentElement?.appendChild(this.tooltipElement);
    
    // Setup close handler
    const closeButton = this.tooltipElement.querySelector('.tooltip-close');
    closeButton?.addEventListener('click', () => {
      this.closeTooltip();
    });
    
    // Mark as shown
    this.hasShownTooltip = true;
    localStorage.setItem('unified-network-tooltip-seen', 'true');
    
    logger.info('OnboardingManager', 'First-time tooltip shown');
    this.emit('tooltip-shown');
  }
  
  /**
   * Close tooltip
   */
  closeTooltip() {
    if (this.tooltipElement) {
      this.tooltipElement.classList.add('tooltip-closing');
      
      setTimeout(() => {
        if (this.tooltipElement && this.tooltipElement.parentElement) {
          this.tooltipElement.parentElement.removeChild(this.tooltipElement);
        }
        this.tooltipElement = null;
      }, 300);
      
      logger.debug('OnboardingManager', 'Tooltip closed');
      this.emit('tooltip-closed');
    }
  }
  
  /**
   * Add tooltip styles
   */
  addTooltipStyles() {
    if (document.getElementById('unified-network-tooltip-styles')) {
      return;
    }
    
    const style = document.createElement('style');
    style.id = 'unified-network-tooltip-styles';
    style.textContent = `
      .unified-network-tooltip {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        color: white;
        padding: 24px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        z-index: 10000;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: tooltip-fade-in 0.3s ease-out;
        overflow: auto;
        overscroll-behavior: contain;
      }
      
      .unified-network-tooltip.tooltip-closing {
        animation: tooltip-fade-out 0.3s ease-out;
      }
      
      @keyframes tooltip-fade-in {
        from {
          opacity: 0;
          transform: translate(-50%, -45%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
      
      @keyframes tooltip-fade-out {
        from {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
        to {
          opacity: 0;
          transform: translate(-50%, -55%);
        }
      }
      
      .tooltip-content h3 {
        margin: 0 0 12px 0;
        font-size: 20px;
        font-weight: 600;
      }
      
      .tooltip-content p {
        margin: 0 0 12px 0;
        line-height: 1.5;
        opacity: 0.9;
      }
      
      .tooltip-content ul {
        margin: 0 0 12px 0;
        padding-left: 20px;
      }
      
      .tooltip-content li {
        margin: 8px 0;
        line-height: 1.5;
      }
      
      .tooltip-hint {
        font-size: 14px;
        opacity: 0.7;
        font-style: italic;
      }
      
      .tooltip-close {
        background: #4488ff;
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 6px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        width: 100%;
        margin-top: 12px;
        transition: background 0.2s;
      }
      
      .tooltip-close:hover {
        background: #5599ff;
      }
      
      .tooltip-close:active {
        background: #3377ee;
      }

      /* Mobile-specific improvements */
      @media (max-width: 768px) {
        .unified-network-tooltip {
          width: 90%;
          max-width: calc(100vw - 32px);
          padding: 20px;
        }

        .tooltip-content h3 {
          font-size: 1.5rem;
        }

        .tooltip-content p,
        .tooltip-content li {
          font-size: 0.95rem;
        }

        .tooltip-close {
          min-height: 48px;
          touch-action: manipulation;
        }
      }

      @media (max-width: 480px) {
        .unified-network-tooltip {
          width: 95%;
          max-width: calc(100vw - 16px);
          padding: 16px;
        }

        .tooltip-content h3 {
          font-size: 1.25rem;
        }

        .tooltip-content p,
        .tooltip-content li {
          font-size: 0.9rem;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
  
  /**
   * Reset tooltip (for testing)
   */
  resetTooltip() {
    localStorage.removeItem('unified-network-tooltip-seen');
    this.hasShownTooltip = false;
    logger.debug('OnboardingManager', 'Tooltip reset');
  }
  
  /**
   * Check if discovery is accessible to all users (no admin restrictions)
   * Requirement 10.1
   */
  isDiscoveryAccessible() {
    // Discovery is accessible to all authenticated users
    // No admin-only restrictions
    return true;
  }
  
  /**
   * Event system
   */
  on(event, handler) {
    if (!this.eventHandlers) this.eventHandlers = {};
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }
  
  off(event, handler) {
    if (!this.eventHandlers || !this.eventHandlers[event]) return;
    this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
  }
  
  emit(event, data) {
    if (!this.eventHandlers || !this.eventHandlers[event]) return;
    this.eventHandlers[event].forEach(handler => handler(data));
  }
  
  /**
   * Cleanup
   */
  destroy() {
    // Remove tooltip
    if (this.tooltipElement && this.tooltipElement.parentElement) {
      this.tooltipElement.parentElement.removeChild(this.tooltipElement);
    }
    
    this.eventHandlers = {};
    
    logger.info('OnboardingManager', 'Destroyed');
  }
}

// Create singleton instance
export const onboardingManager = new OnboardingManager();
