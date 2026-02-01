/**
 * Unified Network Discovery - Dashboard Integration
 * 
 * This module integrates the new Unified Network Discovery system
 * with the existing dashboard, providing a smooth transition path.
 * 
 * Features:
 * - Feature flag for gradual rollout
 * - Backward compatibility with existing synapse
 * - Event bridging between systems
 * - Graceful fallback on errors
 */

import { unifiedNetworkApi } from './unified-network/api.js';
import { logger } from './logger.js';
import { initializeErrorHandling } from './unified-network/error-integration.js';

// Feature flag - can be controlled via localStorage or server config
const FEATURE_FLAGS = {
  ENABLE_UNIFIED_NETWORK: localStorage.getItem('enable-unified-network') === 'true',
  DEBUG_MODE: localStorage.getItem('unified-network-debug') === 'true'
};

// Integration state
let integrationState = {
  initialized: false,
  usingUnifiedNetwork: false,
  fallbackToLegacy: false,
  error: null
};

/**
 * Initialize the unified network system
 */
export async function initUnifiedNetwork(userId, containerId = 'synapse-svg') {
  // Check feature flag
  if (!FEATURE_FLAGS.ENABLE_UNIFIED_NETWORK) {
    logger.info('UnifiedNetworkIntegration', 'Feature disabled, using legacy synapse');
    integrationState.usingUnifiedNetwork = false;
    return false;
  }
  
  logger.info('UnifiedNetworkIntegration', 'Initializing unified network discovery');
  
  try {
    // Initialize error handling FIRST
    initializeErrorHandling(unifiedNetworkApi);
    
    // Initialize the unified network API
    await unifiedNetworkApi.initialize(containerId, userId);
    
    // Setup event bridges
    setupEventBridges();
    
    // Setup UI integrations
    setupUIIntegrations();
    
    // Mark as initialized
    integrationState.initialized = true;
    integrationState.usingUnifiedNetwork = true;
    
    logger.info('UnifiedNetworkIntegration', '✅ Unified network initialized successfully');
    
    // Emit custom event for other systems
    window.dispatchEvent(new CustomEvent('unified-network-ready', {
      detail: { userId, containerId }
    }));
    
    return true;
    
  } catch (error) {
    logger.error('UnifiedNetworkIntegration', 'Failed to initialize unified network', error);
    
    integrationState.error = error;
    integrationState.fallbackToLegacy = true;
    
    // Show user-friendly error
    showErrorNotification('Network visualization failed to load. Using fallback mode.');
    
    return false;
  }
}

/**
 * Setup event bridges between unified network and dashboard
 */
function setupEventBridges() {
  // Discovery triggered
  unifiedNetworkApi.on('discovery-triggered', ({ reasons }) => {
    logger.debug('UnifiedNetworkIntegration', 'Discovery triggered', { reasons });
    
    // Could show a subtle notification
    if (FEATURE_FLAGS.DEBUG_MODE) {
      console.log('🔍 Discovery activated:', reasons.join(', '));
    }
  });
  
  // Action completed
  unifiedNetworkApi.on('action-completed', ({ nodeId, actionType, result }) => {
    logger.info('UnifiedNetworkIntegration', 'Action completed', { nodeId, actionType });
    
    // Refresh dashboard stats
    if (window.loadCommunityStats) {
      window.loadCommunityStats();
    }
    
    // Show success notification
    const messages = {
      'connect': 'Connection established!',
      'join-project': 'Joined project successfully!',
      'explore-theme': 'Theme added to your interests!'
    };
    
    showSuccessNotification(messages[actionType] || 'Action completed!');
  });
  
  // Action failed
  unifiedNetworkApi.on('action-failed', ({ nodeId, actionType, error }) => {
    logger.error('UnifiedNetworkIntegration', 'Action failed', { nodeId, actionType, error });
    
    showErrorNotification('Action failed. Please try again.');
  });
  
  // Node focused
  unifiedNetworkApi.on('node-focused', ({ nodeId }) => {
    logger.debug('UnifiedNetworkIntegration', 'Node focused', { nodeId });
    
    // Could open node panel if needed
    // if (window.openNodePanel) {
    //   window.openNodePanel(nodeId);
    // }
  });
  
  // Background paused/resumed
  unifiedNetworkApi.on('background-paused', () => {
    logger.debug('UnifiedNetworkIntegration', 'App backgrounded - physics paused');
  });
  
  unifiedNetworkApi.on('background-resumed', () => {
    logger.debug('UnifiedNetworkIntegration', 'App foregrounded - physics resumed');
  });
  
  // Performance monitoring
  if (FEATURE_FLAGS.DEBUG_MODE) {
    setInterval(() => {
      const metrics = unifiedNetworkApi.getPerformanceMetrics();
      logger.debug('UnifiedNetworkIntegration', 'Performance', {
        fps: metrics.fps,
        memory: `${(metrics.memoryUsage / (1024 * 1024)).toFixed(2)}MB`
      });
    }, 30000); // Every 30 seconds
  }
}

/**
 * Setup UI integrations
 */
function setupUIIntegrations() {
  // Add preferences button to dashboard
  addPreferencesButton();
  
  // Setup search integration
  setupSearchIntegration();
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
}

/**
 * Add discovery preferences button to dashboard
 */
function addPreferencesButton() {
  // Find a good place to add the button (e.g., in the header or settings)
  const header = document.querySelector('.dashboard-header') || 
                 document.querySelector('header') ||
                 document.querySelector('.top-bar');
  
  if (!header) {
    logger.warn('UnifiedNetworkIntegration', 'Could not find header to add preferences button');
    return;
  }
  
  const button = document.createElement('button');
  button.className = 'unified-network-preferences-btn';
  button.innerHTML = '<i class="fas fa-cog"></i> Discovery';
  button.title = 'Discovery Preferences';
  button.style.cssText = `
    background: rgba(68, 136, 255, 0.2);
    border: 1px solid rgba(68, 136, 255, 0.5);
    color: #4488ff;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    margin-left: 12px;
  `;
  
  button.addEventListener('click', () => {
    unifiedNetworkApi.showPreferencesPanel();
  });
  
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(68, 136, 255, 0.3)';
    button.style.borderColor = 'rgba(68, 136, 255, 0.8)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(68, 136, 255, 0.2)';
    button.style.borderColor = 'rgba(68, 136, 255, 0.5)';
  });
  
  header.appendChild(button);
  
  logger.debug('UnifiedNetworkIntegration', 'Preferences button added');
}

/**
 * Setup search integration
 */
function setupSearchIntegration() {
  // Listen for search results and focus nodes
  window.addEventListener('search-result-selected', (event) => {
    const { nodeId } = event.detail;
    
    if (nodeId && integrationState.usingUnifiedNetwork) {
      unifiedNetworkApi.focusNode(nodeId, { duration: 750, smooth: true });
    }
  });
  
  logger.debug('UnifiedNetworkIntegration', 'Search integration setup');
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + D: Trigger discovery
    if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
      event.preventDefault();
      unifiedNetworkApi.triggerDiscovery();
    }
    
    // Ctrl/Cmd + H: Go to My Network
    if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
      event.preventDefault();
      unifiedNetworkApi.resetToMyNetwork();
    }
    
    // Ctrl/Cmd + P: Show preferences
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
      event.preventDefault();
      unifiedNetworkApi.showPreferencesPanel();
    }
  });
  
  logger.debug('UnifiedNetworkIntegration', 'Keyboard shortcuts setup');
}

/**
 * Show success notification
 */
function showSuccessNotification(message) {
  // Use existing notification system if available
  if (window.showSynapseNotification) {
    window.showSynapseNotification(message, 'success');
  } else {
    // Fallback to simple notification
    showSimpleNotification(message, 'success');
  }
}

/**
 * Show error notification
 */
function showErrorNotification(message) {
  // Use existing notification system if available
  if (window.showSynapseNotification) {
    window.showSynapseNotification(message, 'error');
  } else {
    // Fallback to simple notification
    showSimpleNotification(message, 'error');
  }
}

/**
 * Simple notification fallback
 */
function showSimpleNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `unified-network-notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4488ff'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentElement) {
        notification.parentElement.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

/**
 * Check if unified network is active
 */
export function isUnifiedNetworkActive() {
  return integrationState.usingUnifiedNetwork && integrationState.initialized;
}

/**
 * Get integration state
 */
export function getIntegrationState() {
  return { ...integrationState };
}

/**
 * Enable unified network (for testing/admin)
 */
export function enableUnifiedNetwork() {
  localStorage.setItem('enable-unified-network', 'true');
  logger.info('UnifiedNetworkIntegration', 'Unified network enabled - reload page to activate');
  
  showSuccessNotification('Unified Network enabled! Reload the page to activate.');
}

/**
 * Disable unified network
 */
export function disableUnifiedNetwork() {
  localStorage.removeItem('enable-unified-network');
  logger.info('UnifiedNetworkIntegration', 'Unified network disabled - reload page to use legacy');
  
  showSuccessNotification('Unified Network disabled! Reload the page to use legacy mode.');
}

/**
 * Toggle debug mode
 */
export function toggleDebugMode() {
  const current = localStorage.getItem('unified-network-debug') === 'true';
  localStorage.setItem('unified-network-debug', (!current).toString());
  
  logger.info('UnifiedNetworkIntegration', `Debug mode ${!current ? 'enabled' : 'disabled'}`);
  
  showSuccessNotification(`Debug mode ${!current ? 'enabled' : 'disabled'}!`);
}

// Export for global access
if (typeof window !== 'undefined') {
  window.unifiedNetworkIntegration = {
    init: initUnifiedNetwork,
    isActive: isUnifiedNetworkActive,
    getState: getIntegrationState,
    enable: enableUnifiedNetwork,
    disable: disableUnifiedNetwork,
    toggleDebug: toggleDebugMode,
    api: unifiedNetworkApi
  };
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

logger.info('UnifiedNetworkIntegration', 'Integration module loaded');
