// assets/js/unified-network/api.js
// Unified Network Discovery API
// Version: 1.0.0

import { SystemMode } from './types.js';

/**
 * Unified Network Discovery API
 * Main interface for the unified physics-driven network discovery system
 */
export class UnifiedNetworkAPI {
  constructor() {
    this._initialized = false;
    this._containerId = null;
    this._userId = null;
    this._eventHandlers = new Map();
    
    // Component references (to be wired in initialize)
    this._stateManager = null;
    this._physicsLoop = null;
    this._graphDataStore = null;
    this._presenceTracker = null;
    this._relevanceEngine = null;
    this._interactionHandler = null;
  }

  /**
   * Initialize the unified network system
   * @param {string} containerId - DOM container ID
   * @param {string} userId - Current user ID
   * @returns {Promise<void>}
   */
  async initialize(containerId, userId) {
    if (this._initialized) {
      console.warn('UnifiedNetworkAPI already initialized');
      return;
    }

    this._containerId = containerId;
    this._userId = userId;

    console.log('🚀 Initializing Unified Network Discovery System');
    console.log(`   Container: ${containerId}`);
    console.log(`   User: ${userId}`);

    // TODO: Wire up components
    // - GraphDataStore
    // - RelevanceScoreEngine
    // - PresenceEnergyTracker
    // - StateManager
    // - PhysicsLoop
    // - NodeRenderer
    // - AnimationEngine
    // - InteractionHandler

    this._initialized = true;
    this.emit('initialized', { userId, containerId });
    
    console.log('✅ Unified Network Discovery System initialized');
  }

  /**
   * Destroy and cleanup the system
   */
  destroy() {
    if (!this._initialized) return;

    console.log('🔄 Destroying Unified Network Discovery System');

    // TODO: Cleanup components
    // - Stop physics loop
    // - Unsubscribe from presence
    // - Clear event handlers
    // - Remove DOM elements

    this._initialized = false;
    this._eventHandlers.clear();
    
    console.log('✅ Unified Network Discovery System destroyed');
  }

  /**
   * Get current system state
   * @returns {SystemState}
   */
  getState() {
    this._ensureInitialized();
    // TODO: Return actual state from StateManager
    return {
      mode: SystemMode.MyNetwork,
      currentFocusedNodeId: null,
      isDefaultUserFocus: true,
      guidedNodes: [],
      presenceAmplifiedNode: null,
      lastInteractionTime: new Date(),
      averageVelocity: 0,
      isCalm: true,
      fps: 60,
      visibleNodeCount: 0
    };
  }

  /**
   * Get node by ID
   * @param {string} nodeId - Node ID
   * @returns {Node|null}
   */
  getNode(nodeId) {
    this._ensureInitialized();
    // TODO: Get from GraphDataStore
    return null;
  }

  /**
   * Get all nodes
   * @returns {Node[]}
   */
  getAllNodes() {
    this._ensureInitialized();
    // TODO: Get from GraphDataStore
    return [];
  }

  /**
   * Focus on a specific node
   * @param {string} nodeId - Node ID
   * @param {FocusOptions} [options] - Focus options
   */
  focusNode(nodeId, options = {}) {
    this._ensureInitialized();
    console.log(`🎯 Focusing on node: ${nodeId}`, options);
    // TODO: Implement focus logic
    this.emit('node-focused', { nodeId, options });
  }

  /**
   * Center on current user node
   */
  centerOnCurrentUser() {
    this._ensureInitialized();
    console.log('🎯 Centering on current user');
    // TODO: Implement centering logic
    this.emit('centered-on-user', { userId: this._userId });
  }

  /**
   * Reset to My Network state
   */
  resetToMyNetwork() {
    this._ensureInitialized();
    console.log('🔄 Resetting to My Network state');
    // TODO: Implement reset logic
    this.emit('reset-to-my-network');
  }

  /**
   * Manually trigger discovery state
   */
  triggerDiscovery() {
    this._ensureInitialized();
    console.log('🔍 Manually triggering Discovery state');
    // TODO: Implement discovery trigger
    this.emit('discovery-triggered');
  }

  /**
   * Dismiss a guided node
   * @param {string} nodeId - Node ID to dismiss
   */
  dismissGuidedNode(nodeId) {
    this._ensureInitialized();
    console.log(`❌ Dismissing guided node: ${nodeId}`);
    // TODO: Implement dismissal logic
    this.emit('node-dismissed', { nodeId });
  }

  /**
   * Update presence energy for a node
   * @param {string} nodeId - Node ID
   * @param {number} energy - Presence energy [0, 1]
   * @param {number} [ttl] - Time-to-live in milliseconds
   */
  updatePresence(nodeId, energy, ttl) {
    this._ensureInitialized();
    console.log(`⚡ Updating presence for ${nodeId}: ${energy}`, ttl ? `TTL: ${ttl}ms` : '');
    // TODO: Implement presence update
    this.emit('presence-updated', { nodeId, energy, ttl });
  }

  /**
   * Clear presence energy for a node
   * @param {string} nodeId - Node ID
   */
  clearPresence(nodeId) {
    this._ensureInitialized();
    console.log(`🔇 Clearing presence for ${nodeId}`);
    // TODO: Implement presence clear
    this.emit('presence-cleared', { nodeId });
  }

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
  }

  /**
   * Unregister event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    if (!this._eventHandlers.has(event)) return;
    
    const handlers = this._eventHandlers.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @private
   */
  emit(event, data) {
    if (!this._eventHandlers.has(event)) return;
    
    const handlers = this._eventHandlers.get(event);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Ensure system is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('UnifiedNetworkAPI not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if system is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Get current user ID
   * @returns {string|null}
   */
  getUserId() {
    return this._userId;
  }

  /**
   * Get container ID
   * @returns {string|null}
   */
  getContainerId() {
    return this._containerId;
  }
}

// Create singleton instance
export const unifiedNetworkApi = new UnifiedNetworkAPI();

// Export for global access
if (typeof window !== 'undefined') {
  window.unifiedNetworkApi = unifiedNetworkApi;
}
