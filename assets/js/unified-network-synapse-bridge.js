/**
 * Unified Network - Synapse Bridge
 * 
 * Deep integration between the new Unified Network Discovery system
 * and the existing Synapse core, focus system, and search integration.
 * 
 * This bridge ensures:
 * - Unified network responds to existing synapse events
 * - Existing code can control unified network transparently
 * - Smooth fallback to legacy synapse if unified network fails
 * - Full backward compatibility with existing features
 */

import { logger } from './logger.js';

// Bridge state
let bridgeState = {
  initialized: false,
  unifiedNetworkAvailable: false,
  legacySynapseAvailable: false,
  activeSystem: null, // 'unified' or 'legacy'
  eventListeners: []
};

/**
 * Initialize the synapse bridge
 * Call this after both systems are loaded
 */
export function initSynapseBridge() {
  if (bridgeState.initialized) {
    logger.warn('SynapseBridge', 'Already initialized');
    return;
  }
  
  logger.info('SynapseBridge', 'Initializing synapse bridge');
  
  // Check what systems are available
  bridgeState.unifiedNetworkAvailable = typeof window.unifiedNetworkIntegration !== 'undefined' &&
                                        window.unifiedNetworkIntegration.isActive();
  bridgeState.legacySynapseAvailable = typeof window.synapseApi !== 'undefined';
  
  // Determine active system
  if (bridgeState.unifiedNetworkAvailable) {
    bridgeState.activeSystem = 'unified';
    logger.info('SynapseBridge', 'Using unified network system');
  } else if (bridgeState.legacySynapseAvailable) {
    bridgeState.activeSystem = 'legacy';
    logger.info('SynapseBridge', 'Using legacy synapse system');
  } else {
    logger.error('SynapseBridge', 'No network system available!');
    return;
  }
  
  // Setup bidirectional event bridges
  setupLegacyToUnifiedBridge();
  setupUnifiedToLegacyBridge();
  
  // Enhance existing window functions
  enhanceWindowFunctions();
  
  // Setup focus system integration
  setupFocusSystemIntegration();
  
  // Setup search integration
  setupSearchIntegration();
  
  bridgeState.initialized = true;
  
  logger.info('SynapseBridge', '✅ Bridge initialized successfully', {
    activeSystem: bridgeState.activeSystem,
    unifiedAvailable: bridgeState.unifiedNetworkAvailable,
    legacyAvailable: bridgeState.legacySynapseAvailable
  });
  
  // Emit event for other systems
  window.dispatchEvent(new CustomEvent('synapse-bridge-ready', {
    detail: { activeSystem: bridgeState.activeSystem }
  }));
}

/**
 * Setup bridge from legacy synapse events to unified network
 */
function setupLegacyToUnifiedBridge() {
  if (!bridgeState.unifiedNetworkAvailable) return;
  
  const unifiedApi = window.unifiedNetworkIntegration.api;
  
  // Listen for legacy synapse:focus-node events
  const focusNodeListener = (event) => {
    const { nodeId, skipToast } = event.detail;
    logger.debug('SynapseBridge', 'Legacy focus-node event → unified network', { nodeId });
    
    try {
      unifiedApi.focusNode(nodeId, { 
        duration: 750, 
        smooth: true,
        skipNotification: skipToast 
      });
    } catch (error) {
      logger.error('SynapseBridge', 'Failed to focus node in unified network', error);
    }
  };
  
  window.addEventListener('synapse:focus-node', focusNodeListener);
  bridgeState.eventListeners.push({ event: 'synapse:focus-node', listener: focusNodeListener });
  
  // Listen for legacy synapse:focus-theme events
  const focusThemeListener = (event) => {
    const { themeId } = event.detail;
    logger.debug('SynapseBridge', 'Legacy focus-theme event → unified network', { themeId });
    
    try {
      // In unified network, themes are nodes too
      const themeNodeId = themeId.startsWith('theme:') ? themeId : `theme:${themeId}`;
      unifiedApi.focusNode(themeNodeId, { duration: 750, smooth: true });
    } catch (error) {
      logger.error('SynapseBridge', 'Failed to focus theme in unified network', error);
    }
  };
  
  window.addEventListener('synapse:focus-theme', focusThemeListener);
  bridgeState.eventListeners.push({ event: 'synapse:focus-theme', listener: focusThemeListener });
  
  // Listen for legacy synapse:show-activity events
  const showActivityListener = (event) => {
    const { userId } = event.detail;
    logger.debug('SynapseBridge', 'Legacy show-activity event → unified network', { userId });
    
    try {
      unifiedApi.centerOnCurrentUser();
    } catch (error) {
      logger.error('SynapseBridge', 'Failed to center on user in unified network', error);
    }
  };
  
  window.addEventListener('synapse:show-activity', showActivityListener);
  bridgeState.eventListeners.push({ event: 'synapse:show-activity', listener: showActivityListener });
  
  logger.debug('SynapseBridge', 'Legacy → Unified bridge setup complete');
}

/**
 * Setup bridge from unified network events to legacy synapse
 */
function setupUnifiedToLegacyBridge() {
  if (!bridgeState.unifiedNetworkAvailable) return;
  
  const unifiedApi = window.unifiedNetworkIntegration.api;
  
  // Forward unified network events to legacy event format
  unifiedApi.on('node-focused', ({ nodeId, nodeType }) => {
    logger.debug('SynapseBridge', 'Unified node-focused → legacy event', { nodeId, nodeType });
    
    // Emit legacy-compatible event
    if (nodeType === 'theme') {
      window.dispatchEvent(new CustomEvent('synapse:focus-theme', {
        detail: { themeId: nodeId }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('synapse:focus-node', {
        detail: { nodeId, skipToast: true }
      }));
    }
  });
  
  unifiedApi.on('state-changed', ({ newState, oldState }) => {
    logger.debug('SynapseBridge', 'Unified state changed', { newState, oldState });
    
    // Update legacy UI if needed
    if (window.updateDiscoveryButtonState) {
      window.updateDiscoveryButtonState();
    }
  });
  
  logger.debug('SynapseBridge', 'Unified → Legacy bridge setup complete');
}

/**
 * Enhance existing window functions to work with both systems
 */
function enhanceWindowFunctions() {
  // Enhance window.focusOnNode
  if (typeof window.focusOnNode === 'function') {
    const originalFocusOnNode = window.focusOnNode;
    
    window.focusOnNode = function(nodeId, options) {
      logger.debug('SynapseBridge', 'window.focusOnNode called', { nodeId, activeSystem: bridgeState.activeSystem });
      
      if (bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable) {
        try {
          const unifiedApi = window.unifiedNetworkIntegration.api;
          unifiedApi.focusNode(nodeId, options);
          return true;
        } catch (error) {
          logger.error('SynapseBridge', 'Unified focus failed, falling back to legacy', error);
          return originalFocusOnNode.call(this, nodeId, options);
        }
      } else {
        return originalFocusOnNode.call(this, nodeId, options);
      }
    };
  }
  
  // Enhance window.centerOnNode
  if (typeof window.centerOnNode === 'function') {
    const originalCenterOnNode = window.centerOnNode;
    
    window.centerOnNode = function(nodeId, options) {
      logger.debug('SynapseBridge', 'window.centerOnNode called', { nodeId, activeSystem: bridgeState.activeSystem });
      
      if (bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable) {
        try {
          const unifiedApi = window.unifiedNetworkIntegration.api;
          unifiedApi.focusNode(nodeId, { ...options, skipDimming: true });
          return true;
        } catch (error) {
          logger.error('SynapseBridge', 'Unified center failed, falling back to legacy', error);
          return originalCenterOnNode.call(this, nodeId, options);
        }
      } else {
        return originalCenterOnNode.call(this, nodeId, options);
      }
    };
  }
  
  // Enhance window.centerOnCurrentUser
  if (typeof window.centerOnCurrentUser === 'function') {
    const originalCenterOnCurrentUser = window.centerOnCurrentUser;
    
    window.centerOnCurrentUser = function() {
      logger.debug('SynapseBridge', 'window.centerOnCurrentUser called', { activeSystem: bridgeState.activeSystem });
      
      if (bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable) {
        try {
          const unifiedApi = window.unifiedNetworkIntegration.api;
          unifiedApi.centerOnCurrentUser();
          return true;
        } catch (error) {
          logger.error('SynapseBridge', 'Unified center on user failed, falling back to legacy', error);
          return originalCenterOnCurrentUser.call(this);
        }
      } else {
        return originalCenterOnCurrentUser.call(this);
      }
    };
  }
  
  logger.debug('SynapseBridge', 'Window functions enhanced');
}

/**
 * Setup focus system integration
 */
function setupFocusSystemIntegration() {
  // Ensure focus system works with both unified and legacy
  
  // Listen for profile-loaded event to initialize focus
  window.addEventListener('profile-loaded', (event) => {
    const { userId } = event.detail || {};
    
    logger.debug('SynapseBridge', 'Profile loaded, setting up focus system', { userId });
    
    // Give systems time to initialize
    setTimeout(() => {
      if (bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable) {
        // Unified network handles its own initial focus
        logger.debug('SynapseBridge', 'Unified network will handle initial focus');
      } else if (bridgeState.legacySynapseAvailable) {
        // Legacy synapse handles its own initial focus
        logger.debug('SynapseBridge', 'Legacy synapse will handle initial focus');
      }
    }, 500);
  });
  
  logger.debug('SynapseBridge', 'Focus system integration setup');
}

/**
 * Setup search integration
 */
function setupSearchIntegration() {
  // Enhance search result handlers to work with both systems
  
  if (typeof window.openSearchResult === 'function') {
    const originalOpenSearchResult = window.openSearchResult;
    
    window.openSearchResult = async function(type, id) {
      logger.debug('SynapseBridge', 'Search result opened', { type, id, activeSystem: bridgeState.activeSystem });
      
      if (bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable) {
        try {
          const unifiedApi = window.unifiedNetworkIntegration.api;
          
          // Close search modal
          if (typeof window.closeEnhancedSearch === 'function') {
            window.closeEnhancedSearch();
          }
          
          // Focus on the result
          if (type === 'theme') {
            const themeNodeId = id.startsWith('theme:') ? id : `theme:${id}`;
            unifiedApi.focusNode(themeNodeId, { duration: 750, smooth: true });
          } else {
            unifiedApi.focusNode(id, { duration: 750, smooth: true });
          }
          
          return;
        } catch (error) {
          logger.error('SynapseBridge', 'Unified search result failed, falling back to legacy', error);
          return originalOpenSearchResult.call(this, type, id);
        }
      } else {
        return originalOpenSearchResult.call(this, type, id);
      }
    };
  }
  
  // Listen for search-result-selected events
  window.addEventListener('search-result-selected', (event) => {
    const { nodeId, nodeType } = event.detail;
    
    logger.debug('SynapseBridge', 'Search result selected', { nodeId, nodeType });
    
    if (bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable) {
      try {
        const unifiedApi = window.unifiedNetworkIntegration.api;
        unifiedApi.focusNode(nodeId, { duration: 750, smooth: true });
      } catch (error) {
        logger.error('SynapseBridge', 'Failed to focus search result in unified network', error);
      }
    }
  });
  
  logger.debug('SynapseBridge', 'Search integration setup');
}

/**
 * Get the active network system
 */
export function getActiveSystem() {
  return bridgeState.activeSystem;
}

/**
 * Check if unified network is active
 */
export function isUnifiedNetworkActive() {
  return bridgeState.activeSystem === 'unified' && bridgeState.unifiedNetworkAvailable;
}

/**
 * Check if legacy synapse is active
 */
export function isLegacySynapseActive() {
  return bridgeState.activeSystem === 'legacy' && bridgeState.legacySynapseAvailable;
}

/**
 * Get bridge state for debugging
 */
export function getBridgeState() {
  return { ...bridgeState };
}

/**
 * Cleanup bridge (for hot reload or testing)
 */
export function cleanupBridge() {
  // Remove all event listeners
  bridgeState.eventListeners.forEach(({ event, listener }) => {
    window.removeEventListener(event, listener);
  });
  
  bridgeState.eventListeners = [];
  bridgeState.initialized = false;
  
  logger.info('SynapseBridge', 'Bridge cleaned up');
}

// Export for global access
if (typeof window !== 'undefined') {
  window.synapseBridge = {
    init: initSynapseBridge,
    getActiveSystem,
    isUnifiedActive: isUnifiedNetworkActive,
    isLegacyActive: isLegacySynapseActive,
    getState: getBridgeState,
    cleanup: cleanupBridge
  };
}

logger.info('SynapseBridge', 'Bridge module loaded');
