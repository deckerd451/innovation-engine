/**
 * Onboarding Module
 * 
 * Provides onboarding and discovery accessibility features:
 * - First-time tooltip (one-time only)
 * - User preference UI for discovery frequency
 * - No admin-only restrictions
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */

import { logger } from '../logger.js';

export class OnboardingManager {
  constructor() {
    this.hasShownTooltip = false;
    this.tooltipElement = null;
    this.preferencesPanelElement = null;
    
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
    
    // Create preferences panel
    this.createPreferencesPanel();
    
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
        z-index: 10000;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: tooltip-fade-in 0.3s ease-out;
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
    `;
    
    document.head.appendChild(style);
  }
  
  /**
   * Create preferences panel
   */
  createPreferencesPanel() {
    this.preferencesPanelElement = document.createElement('div');
    this.preferencesPanelElement.className = 'unified-network-preferences';
    this.preferencesPanelElement.style.display = 'none';
    this.preferencesPanelElement.innerHTML = `
      <div class="preferences-content">
        <h3>Discovery Preferences</h3>
        <div class="preference-group">
          <label for="discovery-frequency">Discovery Frequency</label>
          <select id="discovery-frequency" class="preference-select">
            <option value="off">Off - Manual only</option>
            <option value="low">Low - Every 4 minutes</option>
            <option value="normal" selected>Normal - Every 2 minutes</option>
            <option value="high">High - Every minute</option>
          </select>
          <p class="preference-description">
            How often discovery mode activates automatically. 
            You can always trigger it manually.
          </p>
        </div>
        <div class="preference-group">
          <label>
            <input type="checkbox" id="discovery-enabled" checked>
            Enable automatic discovery
          </label>
          <p class="preference-description">
            When disabled, discovery only activates when you trigger it manually.
          </p>
        </div>
        <div class="preference-actions">
          <button class="preference-save">Save Preferences</button>
          <button class="preference-cancel">Cancel</button>
        </div>
      </div>
    `;
    
    // Add styles
    this.addPreferencesStyles();
    
    // Add to body
    document.body.appendChild(this.preferencesPanelElement);
    
    // Setup handlers
    this.setupPreferencesHandlers();
    
    logger.debug('OnboardingManager', 'Preferences panel created');
  }
  
  /**
   * Setup preferences panel handlers
   */
  setupPreferencesHandlers() {
    const saveButton = this.preferencesPanelElement.querySelector('.preference-save');
    const cancelButton = this.preferencesPanelElement.querySelector('.preference-cancel');
    const frequencySelect = this.preferencesPanelElement.querySelector('#discovery-frequency');
    const enabledCheckbox = this.preferencesPanelElement.querySelector('#discovery-enabled');
    
    saveButton?.addEventListener('click', () => {
      const frequency = frequencySelect?.value || 'normal';
      const enabled = enabledCheckbox?.checked || false;
      
      this.savePreferences({ frequency, enabled });
      this.hidePreferencesPanel();
    });
    
    cancelButton?.addEventListener('click', () => {
      this.hidePreferencesPanel();
    });
  }
  
  /**
   * Show preferences panel
   */
  showPreferencesPanel() {
    if (!this.preferencesPanelElement) return;
    
    // Load current preferences
    const prefs = this.api.getDiscoveryPreferences();
    
    const frequencySelect = this.preferencesPanelElement.querySelector('#discovery-frequency');
    const enabledCheckbox = this.preferencesPanelElement.querySelector('#discovery-enabled');
    
    if (frequencySelect) frequencySelect.value = prefs.frequency || 'normal';
    if (enabledCheckbox) enabledCheckbox.checked = prefs.enabled !== false;
    
    this.preferencesPanelElement.style.display = 'flex';
    
    logger.debug('OnboardingManager', 'Preferences panel shown');
    this.emit('preferences-panel-shown');
  }
  
  /**
   * Hide preferences panel
   */
  hidePreferencesPanel() {
    if (!this.preferencesPanelElement) return;
    
    this.preferencesPanelElement.style.display = 'none';
    
    logger.debug('OnboardingManager', 'Preferences panel hidden');
    this.emit('preferences-panel-hidden');
  }
  
  /**
   * Save preferences
   */
  savePreferences(preferences) {
    // Save to API
    this.api.setDiscoveryPreferences(preferences);
    
    // Save to localStorage for persistence
    localStorage.setItem('unified-network-preferences', JSON.stringify(preferences));
    
    logger.info('OnboardingManager', 'Preferences saved', preferences);
    this.emit('preferences-saved', preferences);
  }
  
  /**
   * Load preferences from localStorage
   */
  loadPreferences() {
    const stored = localStorage.getItem('unified-network-preferences');
    
    if (stored) {
      try {
        const preferences = JSON.parse(stored);
        this.api.setDiscoveryPreferences(preferences);
        logger.debug('OnboardingManager', 'Preferences loaded', preferences);
        return preferences;
      } catch (error) {
        logger.error('OnboardingManager', 'Failed to parse preferences', error);
      }
    }
    
    return null;
  }
  
  /**
   * Add preferences panel styles
   */
  addPreferencesStyles() {
    if (document.getElementById('unified-network-preferences-styles')) {
      return;
    }
    
    const style = document.createElement('style');
    style.id = 'unified-network-preferences-styles';
    style.textContent = `
      .unified-network-preferences {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      
      .preferences-content {
        background: white;
        padding: 24px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      
      .preferences-content h3 {
        margin: 0 0 20px 0;
        font-size: 20px;
        font-weight: 600;
        color: #333;
      }
      
      .preference-group {
        margin-bottom: 20px;
      }
      
      .preference-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: #333;
      }
      
      .preference-select {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        background: white;
      }
      
      .preference-description {
        margin: 8px 0 0 0;
        font-size: 13px;
        color: #666;
        line-height: 1.4;
      }
      
      .preference-group input[type="checkbox"] {
        margin-right: 8px;
      }
      
      .preference-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
      
      .preference-save,
      .preference-cancel {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .preference-save {
        background: #4488ff;
        color: white;
      }
      
      .preference-save:hover {
        background: #5599ff;
      }
      
      .preference-cancel {
        background: #f0f0f0;
        color: #333;
      }
      
      .preference-cancel:hover {
        background: #e0e0e0;
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
    
    // Remove preferences panel
    if (this.preferencesPanelElement && this.preferencesPanelElement.parentElement) {
      this.preferencesPanelElement.parentElement.removeChild(this.preferencesPanelElement);
    }
    
    this.eventHandlers = {};
    
    logger.info('OnboardingManager', 'Destroyed');
  }
}

// Create singleton instance
export const onboardingManager = new OnboardingManager();
