/**
 * Unified Network - Error Handler Integration
 * 
 * Integrates error handling into the unified network API and components
 */

import { errorHandler, ErrorType, setupGlobalErrorHandlers } from './error-handler.js';
import { logger } from '../logger.js';

/**
 * Initialize error handling for unified network
 */
export function initializeErrorHandling(api) {
  logger.info('ErrorIntegration', 'Initializing error handling');
  
  // Setup global error handlers
  setupGlobalErrorHandlers();
  
  // Set notification callback
  errorHandler.setNotificationCallback((message, type, options) => {
    showUnifiedNetworkNotification(message, type, options);
  });
  
  // Set fallback callback (switch to legacy synapse)
  errorHandler.setFallbackCallback(async (errorInfo) => {
    logger.warn('ErrorIntegration', 'Executing fallback to legacy synapse');
    
    // Disable unified network. Must set to 'false' (not removeItem) because
    // the canonical check is !== 'false' — a missing key means default ON.
    localStorage.setItem('enable-unified-network', 'false');
    
    // Emit event for bridge to handle
    window.dispatchEvent(new CustomEvent('unified-network-fallback', {
      detail: { errorInfo }
    }));
    
    // If legacy synapse is available, switch to it
    if (window.synapseApi && typeof window.initSynapseView === 'function') {
      try {
        await window.initSynapseView();
        logger.info('ErrorIntegration', 'Successfully fell back to legacy synapse');
      } catch (error) {
        logger.error('ErrorIntegration', 'Fallback to legacy synapse failed', error);
        throw error;
      }
    }
  });
  
  // Wrap API methods with error handling
  wrapAPIWithErrorHandling(api);
  
  logger.info('ErrorIntegration', '✅ Error handling initialized');
}

/**
 * Wrap API methods with error handling
 */
function wrapAPIWithErrorHandling(api) {
  // Wrap initialize
  const originalInitialize = api.initialize.bind(api);
  api.initialize = async function(...args) {
    try {
      return await originalInitialize(...args);
    } catch (error) {
      await errorHandler.handleError(error, {
        operation: 'initialization',
        method: 'initialize',
        args
      });
      throw error;
    }
  };
  
  // Wrap focusNode
  const originalFocusNode = api.focusNode.bind(api);
  api.focusNode = async function(...args) {
    try {
      return await originalFocusNode(...args);
    } catch (error) {
      await errorHandler.handleError(error, {
        operation: 'user-action',
        method: 'focusNode',
        args
      });
      // Don't re-throw, allow graceful degradation
    }
  };
  
  // Wrap triggerDiscovery
  const originalTriggerDiscovery = api.triggerDiscovery.bind(api);
  api.triggerDiscovery = async function(...args) {
    try {
      return await originalTriggerDiscovery(...args);
    } catch (error) {
      await errorHandler.handleError(error, {
        operation: 'user-action',
        method: 'triggerDiscovery',
        args
      });
      // Don't re-throw, allow graceful degradation
    }
  };
  
  // Wrap dismissGuidedNode
  const originalDismissGuidedNode = api.dismissGuidedNode.bind(api);
  api.dismissGuidedNode = async function(...args) {
    try {
      return await originalDismissGuidedNode(...args);
    } catch (error) {
      await errorHandler.handleError(error, {
        operation: 'user-action',
        method: 'dismissGuidedNode',
        args
      });
      // Don't re-throw, allow graceful degradation
    }
  };
  
  logger.debug('ErrorIntegration', 'API methods wrapped with error handling');
}

/**
 * Show unified network notification
 */
function showUnifiedNetworkNotification(message, type = 'info', options = {}) {
  // Try to use existing notification system
  if (window.showSynapseNotification) {
    window.showSynapseNotification(message, type);
    return;
  }
  
  // Fallback to custom notification
  const notification = document.createElement('div');
  notification.className = 'unified-network-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${getNotificationColor(type)};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-width: 400px;
    font-weight: 600;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add icon
  const icon = getNotificationIcon(type);
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <i class="fas ${icon}" style="font-size: 20px;"></i>
      <div style="flex: 1;">${message}</div>
    </div>
  `;
  
  // Add action button if specified
  if (options.action === 'reload') {
    const button = document.createElement('button');
    button.textContent = 'Reload Page';
    button.style.cssText = `
      margin-top: 12px;
      width: 100%;
      padding: 8px;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      color: white;
      font-weight: 600;
      cursor: pointer;
    `;
    button.onclick = () => window.location.reload();
    notification.appendChild(button);
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after delay (unless it has an action)
  if (!options.action) {
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (notification.parentElement) {
          notification.parentElement.removeChild(notification);
        }
      }, 300);
    }, options.duration || 5000);
  }
}

/**
 * Get notification color by type
 */
function getNotificationColor(type) {
  const colors = {
    error: '#ff4444',
    warning: '#ffaa00',
    success: '#44ff44',
    info: '#4488ff'
  };
  return colors[type] || colors.info;
}

/**
 * Get notification icon by type
 */
function getNotificationIcon(type) {
  const icons = {
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    success: 'fa-check-circle',
    info: 'fa-info-circle'
  };
  return icons[type] || icons.info;
}

/**
 * Create safe wrapper for async operations
 */
export function createSafeOperation(operation, context = {}) {
  return async function(...args) {
    try {
      return await operation(...args);
    } catch (error) {
      await errorHandler.handleError(error, {
        ...context,
        args
      });
      return null; // Return null on error for graceful degradation
    }
  };
}

/**
 * Monitor component health
 */
export function monitorComponentHealth(component, componentName) {
  // Wrap component methods with error handling
  const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(component))
    .filter(name => name !== 'constructor' && typeof component[name] === 'function');
  
  methodNames.forEach(methodName => {
    const originalMethod = component[methodName].bind(component);
    
    component[methodName] = async function(...args) {
      try {
        return await originalMethod(...args);
      } catch (error) {
        await errorHandler.handleError(error, {
          operation: componentName,
          method: methodName,
          args
        });
        throw error;
      }
    };
  });
  
  logger.debug('ErrorIntegration', `Health monitoring enabled for ${componentName}`);
}

/**
 * Get error statistics
 */
export function getErrorStatistics() {
  return errorHandler.getErrorStats();
}

/**
 * Check if system is healthy
 */
export function isSystemHealthy() {
  return errorHandler.isHealthy();
}

/**
 * Clear error history
 */
export function clearErrorHistory() {
  errorHandler.clearErrors();
}

// Add CSS for notifications
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
  
  .unified-network-notification {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
`;
document.head.appendChild(style);

// Export for global access
if (typeof window !== 'undefined') {
  window.unifiedNetworkErrorIntegration = {
    getStats: getErrorStatistics,
    isHealthy: isSystemHealthy,
    clearHistory: clearErrorHistory
  };
}

logger.info('ErrorIntegration', 'Error integration module loaded');
