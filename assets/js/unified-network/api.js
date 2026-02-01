// assets/js/unified-network/api.js
// Unified Network Discovery API
// Version: 1.0.0

import { SystemMode } from './types.js';
import { graphDataStore } from './graph-data-store.js';
import { relevanceScoreEngine } from './relevance-engine.js';
import { presenceEnergyTracker } from './presence-tracker.js';
import { stateManager } from './state-manager.js';
import { effectivePullCalculator } from './effective-pull.js';
import { nodeRenderer, NodeRenderer } from './node-renderer.js';
import { animationEngine } from './animation-engine.js';
import { physicsLoop, AdaptiveFrameRateManager } from './physics-loop.js';
import { interactionHandler } from './interaction-handler.js';
import { ActionResolver } from './action-resolver.js';
import { guidedNodeDecay } from './guided-node-decay.js';
import { DiscoveryTriggerManager } from './discovery-trigger-manager.js';
import { 
  applyEffectivePullForces,
  calculateAverageVelocity,
  positionGuidedNodesInThumbZone 
} from './physics.js';

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
    
    // Component references
    this._graphDataStore = graphDataStore;
    this._relevanceEngine = relevanceScoreEngine;
    this._presenceTracker = presenceEnergyTracker;
    this._stateManager = stateManager;
    this._effectivePullCalculator = effectivePullCalculator;
    this._nodeRenderer = nodeRenderer;
    this._animationEngine = animationEngine;
    this._physicsLoop = physicsLoop;
    this._interactionHandler = interactionHandler;
    this._actionResolver = new ActionResolver();
    this._guidedNodeDecay = guidedNodeDecay;
    this._discoveryTriggerManager = null;
    this._frameRateManager = null;
    
    // D3 simulation reference
    this._simulation = null;
    this._svg = null;
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

    try {
      // Get Supabase client
      const supabase = window.supabase;
      if (!supabase) {
        throw new Error('Supabase client not found on window');
      }

      // Get SVG element
      this._svg = document.getElementById(containerId);
      if (!this._svg) {
        throw new Error(`Container not found: ${containerId}`);
      }

      // 1. Initialize Graph Data Store
      await this._graphDataStore.initialize(supabase, userId);
      const { nodes, edges } = await this._graphDataStore.loadGraphData();
      console.log(`📊 Loaded ${nodes.length} nodes, ${edges.length} edges`);

      // 2. Initialize Relevance Engine
      this._relevanceEngine.initialize(this._graphDataStore);
      
      // Calculate initial relevance scores
      for (const node of nodes) {
        if (node.id !== userId) {
          node.relevanceScore = this._relevanceEngine.computeScore(userId, node.id);
        }
      }
      console.log('🎯 Relevance scores calculated');

      // 3. Initialize Presence Tracker
      await this._presenceTracker.initialize(supabase, userId);
      
      // Apply initial presence energy
      for (const node of nodes) {
        node.presenceEnergy = this._presenceTracker.getEnergy(node.id);
      }
      console.log('⚡ Presence energy initialized');

      // 4. Calculate effectivePull for all nodes
      this._effectivePullCalculator.updateAll(nodes);
      console.log('📈 effectivePull calculated');

      // 5. Initialize State Manager
      this._stateManager.initialize();
      
      // Determine initial My Network nodes (connected to user)
      const connectedNodes = this._graphDataStore.getConnectedNodes(userId);
      connectedNodes.forEach(node => {
        node.isMyNetwork = true;
      });
      console.log(`🏠 ${connectedNodes.length} nodes in My Network`);

      // 6. Setup D3 simulation (if not already exists)
      if (!window.d3) {
        throw new Error('D3 not found on window');
      }
      
      this._simulation = this._getOrCreateSimulation(nodes, edges);
      console.log('🌀 D3 simulation ready');

      // 7. Apply physics forces
      applyEffectivePullForces(this._simulation, nodes, edges);
      console.log('⚙️ Physics forces applied');

      // 8. Initialize Node Renderer
      this._nodeRenderer.initialize(this._svg);
      NodeRenderer.setupGlowFilter(this._svg);
      console.log('🎨 Renderer initialized');

      // 9. Initialize Interaction Handler
      this._interactionHandler.initialize(
        this._svg,
        this._nodeRenderer,
        this._stateManager
      );
      this._setupInteractionHandlers();
      console.log('👆 Interaction handler ready');

      // 10. Initialize Action Resolver
      this._actionResolver.initialize(
        supabase,
        this._graphDataStore,
        this._stateManager,
        this._relevanceEngine
      );
      this._setupActionResolverHandlers();
      console.log('🎯 Action resolver ready');

      // 11. Initialize Guided Node Decay
      this._guidedNodeDecay.initialize(
        this._animationEngine,
        this._effectivePullCalculator
      );
      this._setupGuidedNodeDecayHandlers();
      console.log('⏱️ Guided node decay ready');

      // 12. Initialize Discovery Trigger Manager
      this._discoveryTriggerManager = new DiscoveryTriggerManager(
        this._stateManager,
        this._graphDataStore,
        this._presenceTracker
      );
      this._setupDiscoveryTriggerHandlers();
      this._discoveryTriggerManager.start();
      console.log('🔍 Discovery trigger manager ready');

      // 13. Setup Physics Loop
      this._setupPhysicsLoop(nodes);
      this._physicsLoop.start();
      console.log('🔄 Physics loop started');

      // 14. Setup Adaptive Frame Rate
      this._frameRateManager = new AdaptiveFrameRateManager(this._physicsLoop);
      this._frameRateManager.start();
      console.log('🎯 Adaptive frame rate active');

      // 15. Subscribe to real-time updates
      this._graphDataStore.subscribeToUpdates();
      console.log('📡 Real-time subscriptions active');

      this._initialized = true;
      this.emit('initialized', { userId, containerId });
      
      console.log('✅ Unified Network Discovery System initialized');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Destroy and cleanup the system
   */
  destroy() {
    if (!this._initialized) return;

    console.log('🔄 Destroying Unified Network Discovery System');

    // Stop physics loop
    if (this._physicsLoop) {
      this._physicsLoop.stop();
    }

    // Stop frame rate manager
    if (this._frameRateManager) {
      this._frameRateManager.stop();
    }

    // Unsubscribe from presence
    if (this._presenceTracker) {
      this._presenceTracker.unsubscribe();
    }

    // Cleanup interaction handler
    if (this._interactionHandler) {
      this._interactionHandler.destroy();
    }

    // Cleanup action resolver
    if (this._actionResolver) {
      this._actionResolver.cleanup();
    }

    // Cleanup guided node decay
    if (this._guidedNodeDecay) {
      this._guidedNodeDecay.cleanup();
    }

    // Cleanup discovery trigger manager
    if (this._discoveryTriggerManager) {
      this._discoveryTriggerManager.destroy();
    }

    // Cancel all animations
    if (this._animationEngine) {
      this._animationEngine.cancelAllAnimations();
    }

    // Clear event handlers
    this._eventHandlers.clear();

    this._initialized = false;
    
    console.log('✅ Unified Network Discovery System destroyed');
  }

  /**
   * Get current system state
   * @returns {SystemState}
   */
  getState() {
    this._ensureInitialized();
    return this._stateManager.getState();
  }

  /**
   * Get node by ID
   * @param {string} nodeId - Node ID
   * @returns {Node|null}
   */
  getNode(nodeId) {
    this._ensureInitialized();
    return this._graphDataStore.getNode(nodeId);
  }

  /**
   * Get all nodes
   * @returns {Node[]}
   */
  getAllNodes() {
    this._ensureInitialized();
    return this._graphDataStore.getAllNodes();
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
    
    if (this._discoveryTriggerManager) {
      this._discoveryTriggerManager.forceDiscovery();
    }
  }

  /**
   * Set discovery preferences
   * @param {Object} preferences - Discovery preferences
   * @param {string} preferences.frequency - 'low', 'normal', 'high', or 'off'
   * @param {boolean} preferences.enabled - Enable/disable discovery
   */
  setDiscoveryPreferences(preferences) {
    this._ensureInitialized();
    console.log('⚙️ Setting discovery preferences', preferences);
    
    if (this._discoveryTriggerManager) {
      this._discoveryTriggerManager.setPreferences(preferences);
    }
  }

  /**
   * Get discovery preferences
   * @returns {Object} Current discovery preferences
   */
  getDiscoveryPreferences() {
    this._ensureInitialized();
    
    if (this._discoveryTriggerManager) {
      return this._discoveryTriggerManager.getPreferences();
    }
    
    return { frequency: 'normal', enabled: true };
  }

  /**
   * Dismiss a guided node
   * @param {string} nodeId - Node ID to dismiss
   */
  dismissGuidedNode(nodeId) {
    this._ensureInitialized();
    console.log(`❌ Dismissing guided node: ${nodeId}`);
    
    const node = this._graphDataStore.getNode(nodeId);
    if (node) {
      this._guidedNodeDecay.dismissNode(nodeId, node);
    }
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

  /**
   * Get or create D3 simulation
   * @private
   */
  _getOrCreateSimulation(nodes, edges) {
    // Check if simulation already exists
    if (window.synapseSimulation) {
      return window.synapseSimulation;
    }

    // Create new simulation
    const simulation = window.d3.forceSimulation(nodes)
      .force('link', window.d3.forceLink(edges).id(d => d.id).distance(100))
      .force('charge', window.d3.forceManyBody().strength(-50))
      .force('center', window.d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
      .force('collision', window.d3.forceCollide().radius(30));

    window.synapseSimulation = simulation;
    return simulation;
  }

  /**
   * Setup physics loop callbacks
   * @private
   */
  _setupPhysicsLoop(nodes) {
    this._physicsLoop.onUpdate((deltaTime) => {
      // Update simulation
      if (this._simulation) {
        this._simulation.tick();
      }

      // Calculate average velocity
      const avgVelocity = calculateAverageVelocity(nodes);
      this._stateManager.updateAverageVelocity(avgVelocity);

      // Check for state transitions
      if (this._stateManager.shouldTransitionToDiscovery(nodes)) {
        this._stateManager.transitionToDiscovery();
      } else if (this._stateManager.shouldTransitionToMyNetwork(nodes)) {
        this._stateManager.transitionToMyNetwork();
      }

      // Update guided nodes
      this._stateManager.updateGuidedNodes(nodes);

      // Apply decay to guided nodes
      const state = this._stateManager.getState();
      if (state.guidedNodes.length > 0) {
        for (const nodeId of state.guidedNodes) {
          const node = nodes.find(n => n.id === nodeId);
          if (node) {
            const newEffectivePull = this._guidedNodeDecay.applyDecay(node);
            if (newEffectivePull !== node.effectivePull) {
              node.effectivePull = newEffectivePull;
            }
          }
        }
      }

      // Position guided nodes in thumb zone
      if (state.guidedNodes.length > 0) {
        const guidedNodes = nodes.filter(n => state.guidedNodes.includes(n.id));
        positionGuidedNodesInThumbZone(
          guidedNodes,
          window.innerWidth,
          window.innerHeight
        );
      }

      // Render nodes
      this._nodeRenderer.render(nodes, state);
    });
  }

  /**
   * Setup interaction handlers
   * @private
   */
  _setupInteractionHandlers() {
    // Node tapped
    this._interactionHandler.on('node-tapped', ({ nodeId }) => {
      const node = this._graphDataStore.getNode(nodeId);
      if (node) {
        const action = this._interactionHandler.presentAction(node);
        this.emit('node-action-requested', { node, action });
      }
    });

    // Node dismissed
    this._interactionHandler.on('node-dismissed', ({ nodeId }) => {
      this.dismissGuidedNode(nodeId);
    });

    // Mark activity for frame rate manager
    this._interactionHandler.on('node-tapped', () => {
      if (this._frameRateManager) {
        this._frameRateManager.markActivity();
      }
    });
  }

  /**
   * Setup action resolver handlers
   * @private
   */
  _setupActionResolverHandlers() {
    // Action completed
    this._actionResolver.on('action-completed', ({ nodeId, actionType, result }) => {
      console.log(`✅ Action completed: ${actionType} on ${nodeId}`);
      this.emit('action-completed', { nodeId, actionType, result });
      
      // Reset decay timer on interaction
      this._guidedNodeDecay.onNodeInteraction(nodeId);
    });

    // Action failed
    this._actionResolver.on('action-failed', ({ nodeId, actionType, error }) => {
      console.error(`❌ Action failed: ${actionType} on ${nodeId}`, error);
      this.emit('action-failed', { nodeId, actionType, error });
    });

    // Graph updated
    this._actionResolver.on('graph-updated', (data) => {
      console.log('🔄 Graph updated after action', data);
      this.emit('graph-updated', data);
      
      // Trigger position recalculation
      if (this._simulation) {
        this._simulation.alpha(0.3).restart();
      }
    });

    // Recalculate positions
    this._actionResolver.on('recalculate-positions', () => {
      if (this._simulation) {
        this._simulation.alpha(0.5).restart();
      }
    });
  }

  /**
   * Setup guided node decay handlers
   * @private
   */
  _setupGuidedNodeDecayHandlers() {
    // Node fading out
    this._guidedNodeDecay.on('node-fading-out', ({ nodeId }) => {
      console.log(`🌫️ Node fading out: ${nodeId}`);
      this.emit('node-fading-out', { nodeId });
    });

    // Node faded out
    this._guidedNodeDecay.on('node-faded-out', ({ nodeId }) => {
      console.log(`✅ Node faded out: ${nodeId}`);
      this.emit('node-faded-out', { nodeId });
      
      // Check if all guided nodes have faded
      const state = this._stateManager.getState();
      if (state.guidedNodes.length === 0) {
        console.log('🏠 All guided nodes faded, recentering My Network');
        this.resetToMyNetwork();
      }
    });

    // Node dismissed
    this._guidedNodeDecay.on('node-dismissed', ({ nodeId, cooldownUntil }) => {
      console.log(`❌ Node dismissed: ${nodeId}, cooldown until ${new Date(cooldownUntil).toLocaleString()}`);
      this.emit('node-dismissed', { nodeId, cooldownUntil });
    });

    // Periodically clear expired dismissals
    setInterval(() => {
      this._guidedNodeDecay.clearExpiredDismissals();
    }, 60000); // Every minute
  }

  /**
   * Setup discovery trigger handlers
   * @private
   */
  _setupDiscoveryTriggerHandlers() {
    // Discovery triggered
    this._discoveryTriggerManager.on('discovery-triggered', ({ reasons, timestamp }) => {
      console.log(`🔍 Discovery triggered by: ${reasons.join(', ')}`);
      this.emit('discovery-triggered', { reasons, timestamp });
    });

    // Preferences updated
    this._discoveryTriggerManager.on('preferences-updated', (preferences) => {
      console.log('⚙️ Discovery preferences updated', preferences);
      this.emit('discovery-preferences-updated', preferences);
    });

    // Record interactions to reset inactivity timer
    this._interactionHandler.on('node-tapped', () => {
      this._discoveryTriggerManager.recordInteraction();
    });

    this._interactionHandler.on('node-dismissed', () => {
      this._discoveryTriggerManager.recordInteraction();
    });
  }

  /**
   * Execute action on a node
   * @param {string} nodeId - Node ID
   * @param {string} actionType - Action type
   * @returns {Promise<Object>} Action result
   */
  async executeAction(nodeId, actionType) {
    this._ensureInitialized();
    
    if (!this._userId) {
      throw new Error('User ID not set');
    }

    return await this._actionResolver.resolveAction(nodeId, actionType, this._userId);
  }
}

// Create singleton instance
export const unifiedNetworkApi = new UnifiedNetworkAPI();

// Export for global access
if (typeof window !== 'undefined') {
  window.unifiedNetworkApi = unifiedNetworkApi;
}
