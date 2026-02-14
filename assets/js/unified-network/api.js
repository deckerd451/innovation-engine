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
import { TemporalPresenceManager } from './temporal-presence-manager.js';
import { AccessibilityManager } from './accessibility.js';
import { OnboardingManager } from './onboarding.js';
import { PerformanceManager } from './performance.js';
import { mobileTierController } from './mobile-tier-controller.js';
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
    this._temporalPresenceManager = null;
    this._accessibilityManager = null;
    this._onboardingManager = null;
    this._performanceManager = null;
    this._frameRateManager = null;
    this._mobileTierController = mobileTierController;
    
    // D3 simulation reference
    this._simulation = null;
    this._svg = null;
  }

  /**
   * Resolve community/profile ID from various sources
   * The database relationships use community profile IDs, not auth user IDs
   * @param {string} authUserId - Supabase auth user ID (fallback)
   * @returns {string} Community/profile ID
   * @private
   */
  _resolveCommunityId(authUserId) {
    // Try multiple sources in order of preference

    // 1. Explicit communityId passed via bootstrap context
    if (window.bootstrapSessionContext?.communityId) {
      return window.bootstrapSessionContext.communityId;
    }

    // 2. Global bootstrap object
    if (window.__BOOTSTRAP__?.communityId) {
      return window.__BOOTSTRAP__.communityId;
    }

    // 3. Current user profile (set by auth.js)
    if (window.currentUserProfile?.id) {
      return window.currentUserProfile.id;
    }

    // 4. Legacy synapse profile data
    if (window.synapseProfile?.id) {
      return window.synapseProfile.id;
    }

    // 5. Check for profileId in localStorage
    try {
      const storedProfile = localStorage.getItem('userProfile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        if (profile.id) {
          return profile.id;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }

    // 6. Fallback to auth user ID (may result in 0 edges)
    console.warn('⚠️ [UNIFIED] Could not resolve community ID, using auth user ID as fallback');
    return authUserId;
  }

  /**
   * Initialize the unified network system
   * @param {string} containerId - DOM container ID
   * @param {string} userId - Current user ID (may be auth ID or community ID)
   * @returns {Promise<void>}
   */
  async initialize(containerId, userId) {
    if (this._initialized) {
      console.warn('UnifiedNetworkAPI already initialized');
      return;
    }

    this._containerId = containerId;

    // Resolve the correct community/profile ID
    const authUserId = userId;
    const communityId = this._resolveCommunityId(authUserId);
    this._userId = communityId;

    console.log('🚀 Initializing Unified Network Discovery System');
    console.log(`   Container: ${containerId}`);
    console.log(`   User (auth): ${authUserId}`);
    console.log(`   User (community): ${communityId}`);
    if (authUserId !== communityId) {
      console.log('   ℹ️ Using community profile ID for graph queries');
    }

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

      // 1. Initialize Graph Data Store with community ID
      await this._graphDataStore.initialize(supabase, communityId);
      const { nodes, edges } = await this._graphDataStore.loadGraphData();
      console.log(`📊 Loaded ${nodes.length} nodes, ${edges.length} edges`);

      // ------------------------------------------------------------
// DEBUG HOOKS (safe) — lets you introspect from DevTools
// ------------------------------------------------------------
try {
  const qs = new URLSearchParams(window.location.search);
  const verbose =
    qs.has("debug") || qs.get("verbose") === "1" || localStorage.getItem("ie_debug") === "1";

  // Expose handles for DevTools
  window.graphDataStore = this._graphDataStore;
  window.unifiedApi = this;
  window.unifiedNetwork = {
    api: this,
    graphDataStore: this._graphDataStore,
    nodeRenderer: this._nodeRenderer,
    interactionHandler: this._interactionHandler,
    stateManager: this._stateManager,
    mobileTierController: this._mobileTierController,
    simulation: this._simulation,
  };

  // Enhanced debug hook for tier system
  window.__UNIFIED_NETWORK_DEBUG = {
    api: this,
    store: this._graphDataStore,
    nodes: nodes,
    edges: edges,
    nodesCount: nodes?.length || 0,
    edgesCount: edges?.length || 0,
    tiers: {
      enabled: this._mobileTierController?.isEnabled(),
      currentTier: this._mobileTierController?.getTier(),
      stats: this._mobileTierController?.getStats()
    }
  };

  if (verbose) {
    console.log("🧪 [DEBUG] Hooks exposed:", {
      unifiedApi: !!window.unifiedApi,
      graphDataStore: !!window.graphDataStore,
      __UNIFIED_NETWORK_DEBUG: !!window.__UNIFIED_NETWORK_DEBUG,
      nodes: nodes?.length,
      edges: edges?.length,
      sampleEdge: edges?.[0],
    });

    console.log("🧪 [DEBUG] Store snapshot:", {
      storeNodes: this._graphDataStore?.nodes?.length,
      storeEdges: this._graphDataStore?.edges?.length,
      storeLinks: this._graphDataStore?.links?.length,
    });

    console.log("🧪 [DEBUG] Tier system:", {
      enabled: this._mobileTierController?.isEnabled(),
      currentTier: this._mobileTierController?.getTier(),
      featureFlag: localStorage.getItem('ie_unified_mobile_tiers'),
      isMobileWidth: window.matchMedia('(max-width: 768px)').matches,
      isCoarsePointer: window.matchMedia('(pointer: coarse)').matches,
    });
  }
} catch (e) {
  // no-op
}


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

      // 13. Initialize Temporal Presence Manager
      this._temporalPresenceManager = new TemporalPresenceManager(
        this._graphDataStore,
        this._presenceTracker
      );
      this._setupTemporalPresenceHandlers();
      this._temporalPresenceManager.start();
      console.log('⏰ Temporal presence manager ready');

      // 14. Initialize Accessibility Manager
      this._accessibilityManager = new AccessibilityManager();
      this._accessibilityManager.initialize(this._svg);
      this._setupAccessibilityHandlers();
      console.log('♿ Accessibility features enabled');

      // 15. Initialize Onboarding Manager
      this._onboardingManager = new OnboardingManager();
      this._onboardingManager.initialize(this._svg, this);
      this._setupOnboardingHandlers();
      
      // Load saved preferences
      this._onboardingManager.loadPreferences();
      
      // Show first-time tooltip if needed
      setTimeout(() => {
        this._onboardingManager.showFirstTimeTooltip();
      }, 1000);
      console.log('👋 Onboarding ready');

      // 16. Initialize Performance Manager
      this._performanceManager = new PerformanceManager();
      this._performanceManager.initialize();
      this._setupPerformanceHandlers();
      
      // Optimize for large graphs
      this._performanceManager.optimizeForLargeGraph(nodes.length);
      console.log('⚡ Performance optimizations enabled');

      // 17. Setup Physics Loop
      this._setupPhysicsLoop(nodes);
      this._physicsLoop.start();
      console.log('🔄 Physics loop started');

      // 18. Setup Adaptive Frame Rate
      this._frameRateManager = new AdaptiveFrameRateManager(this._physicsLoop);
      this._frameRateManager.start();
      console.log('🎯 Adaptive frame rate active');

      // 19. Subscribe to real-time updates
      this._graphDataStore.subscribeToUpdates();
      console.log('📡 Real-time subscriptions active');

      // 20. Initialize Mobile Tier Controller (mobile-only, feature-flagged)
      this._mobileTierController.initialize({
        graphDataStore: this._graphDataStore,
        nodeRenderer: this._nodeRenderer,
        stateManager: this._stateManager,
        userId: userId
      });

      // Apply initial tier if mobile tier system is enabled (non-fatal)
      if (this._mobileTierController.isEnabled()) {
        try {
          const initialTier = this._mobileTierController.getTier();
          console.log(`🧩 [TIERS] Auto-applying initial tier: ${initialTier}`);
          const result = this._mobileTierController.applyTier(initialTier);

          if (result.error) {
            console.warn('🧩 [TIERS] Tier auto-apply failed (non-fatal):', result.error);
          } else if (result.skipped) {
            console.log('🧩 [TIERS] Tier auto-apply skipped:', result.reason);
          } else {
            console.log('🧩 [TIERS] Tier auto-apply succeeded:', result);
          }
        } catch (e) {
          console.warn('🧩 [TIERS] Tier auto-apply failed (non-fatal):', e.message);
        }
      }

      // Mark as initialized (tiers are optional and should never gate initialization)
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

    // Cleanup temporal presence manager
    if (this._temporalPresenceManager) {
      this._temporalPresenceManager.destroy();
    }

    // Cleanup accessibility manager
    if (this._accessibilityManager) {
      this._accessibilityManager.destroy();
    }

    // Cleanup onboarding manager
    if (this._onboardingManager) {
      this._onboardingManager.destroy();
    }

    // Cleanup performance manager
    if (this._performanceManager) {
      this._performanceManager.destroy();
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
   * Show discovery preferences panel
   */
  showPreferencesPanel() {
    this._ensureInitialized();
    
    if (this._onboardingManager) {
      this._onboardingManager.showPreferencesPanel();
    }
  }

  /**
   * Hide discovery preferences panel
   */
  hidePreferencesPanel() {
    this._ensureInitialized();

    if (this._onboardingManager) {
      this._onboardingManager.hidePreferencesPanel();
    }
  }

  /**
   * Apply mobile tier-based visibility
   *
   * Delegates to the mobile tier controller.
   * Feature flag: localStorage["ie_unified_mobile_tiers"] = "true"
   * Mobile gate: (max-width: 768px) AND (pointer: coarse)
   *
   * @param {string} tier - 'T0' (Personal Hub), 'T1' (Relational), or 'T2' (Discovery)
   * @returns {Object} Stats about the tier application
   */
  applyTier(tier) {
    this._ensureInitialized();

    try {
      const result = this._mobileTierController.applyTier(tier);

      if (result.error) {
        console.warn(`🧩 [TIERS] applyTier("${tier}") failed:`, result.error);
      } else if (result.skipped) {
        console.log(`🧩 [TIERS] applyTier("${tier}") skipped:`, result.reason);
      }

      return result;
    } catch (e) {
      console.error(`🧩 [TIERS] applyTier("${tier}") threw exception:`, e);
      return { error: e.message, exception: true };
    }
  }

  /**
   * Get current mobile tier
   * @returns {string} Current tier ('T0', 'T1', or 'T2')
   */
  getTier() {
    this._ensureInitialized();
    return this._mobileTierController.getTier();
  }

  /**
   * Check if mobile tier system is enabled
   * @returns {boolean} True if enabled
   */
  isTierEnabled() {
    this._ensureInitialized();
    return this._mobileTierController.isEnabled();
  }

  /**
   * Get tier statistics
   * @returns {Object} Tier stats
   */
  getTierStats() {
    this._ensureInitialized();
    return this._mobileTierController.getStats();
  }

  /**
   * Reset tier visibility (show all nodes)
   */
  resetTier() {
    this._ensureInitialized();
    return this._mobileTierController.reset();
  }

  /**
   * Show first-time tooltip (for testing or re-showing)
   */
  showOnboardingTooltip() {
    this._ensureInitialized();
    
    if (this._onboardingManager) {
      this._onboardingManager.showFirstTimeTooltip();
    }
  }

  /**
   * Check if discovery is accessible (no admin restrictions)
   * @returns {boolean} Always true - discovery is accessible to all users
   */
  isDiscoveryAccessible() {
    return true; // Requirement 10.1: No admin-only restrictions
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics (FPS, memory, etc.)
   */
  getPerformanceMetrics() {
    this._ensureInitialized();
    
    if (this._performanceManager) {
      return this._performanceManager.getMetrics();
    }
    
    return {};
  }

  /**
   * Log performance report
   */
  logPerformanceReport() {
    this._ensureInitialized();
    
    if (this._performanceManager) {
      this._performanceManager.logPerformanceReport();
    }
  }

  /**
   * Get temporal boost for a node
   * @param {string} nodeId - Node ID
   * @returns {Object|undefined} Temporal boost info
   */
  getTemporalBoost(nodeId) {
    this._ensureInitialized();
    
    if (this._temporalPresenceManager) {
      return this._temporalPresenceManager.getTemporalBoost(nodeId);
    }
    
    return undefined;
  }

  /**
   * Get collaborative boost for a node
   * @param {string} nodeId - Node ID
   * @returns {Object|undefined} Collaborative boost info
   */
  getCollaborativeBoost(nodeId) {
    this._ensureInitialized();
    
    if (this._temporalPresenceManager) {
      return this._temporalPresenceManager.getCollaborativeBoost(nodeId);
    }
    
    return undefined;
  }

  /**
   * Get all boosts for a node
   * @param {string} nodeId - Node ID
   * @returns {Object} All boosts (temporal and collaborative)
   */
  getAllBoosts(nodeId) {
    this._ensureInitialized();
    
    if (this._temporalPresenceManager) {
      return this._temporalPresenceManager.getAllBoosts(nodeId);
    }
    
    return { temporal: undefined, collaborative: undefined };
  }

  /**
   * Check if temporal priority should apply between two nodes
   * @param {Object} nodeA - First node
   * @param {Object} nodeB - Second node
   * @returns {boolean} True if nodeA should be prioritized
   */
  shouldPrioritizeTemporal(nodeA, nodeB) {
    this._ensureInitialized();
    
    if (this._temporalPresenceManager) {
      return this._temporalPresenceManager.shouldPrioritizeTemporal(nodeA, nodeB);
    }
    
    return false;
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
   * Setup temporal presence handlers
   * @private
   */
  _setupTemporalPresenceHandlers() {
    // Temporal boost applied
    this._temporalPresenceManager.on('temporal-boost-applied', ({ nodeId, boost, expiresAt, reason }) => {
      console.log(`⏰ Temporal boost applied: ${nodeId} (+${boost}) - ${reason}`);
      this.emit('temporal-boost-applied', { nodeId, boost, expiresAt, reason });
      
      // Trigger physics update
      if (this._simulation) {
        this._simulation.alpha(0.3).restart();
      }
    });

    // Temporal boost removed
    this._temporalPresenceManager.on('temporal-boost-removed', ({ nodeId, reason }) => {
      console.log(`⏰ Temporal boost removed: ${nodeId} - ${reason}`);
      this.emit('temporal-boost-removed', { nodeId, reason });
      
      // Trigger physics update
      if (this._simulation) {
        this._simulation.alpha(0.3).restart();
      }
    });

    // Collaborative boost applied
    this._temporalPresenceManager.on('collaborative-boost-applied', ({ nodeId, boost, reason, metadata }) => {
      console.log(`🤝 Collaborative boost applied: ${nodeId} (+${boost}) - ${reason}`);
      this.emit('collaborative-boost-applied', { nodeId, boost, reason, metadata });
      
      // Trigger physics update
      if (this._simulation) {
        this._simulation.alpha(0.3).restart();
      }
    });

    // Collaborative boost removed
    this._temporalPresenceManager.on('collaborative-boost-removed', ({ nodeId, reason }) => {
      console.log(`🤝 Collaborative boost removed: ${nodeId} - ${reason}`);
      this.emit('collaborative-boost-removed', { nodeId, reason });
      
      // Trigger physics update
      if (this._simulation) {
        this._simulation.alpha(0.3).restart();
      }
    });
  }

  /**
   * Setup accessibility handlers
   * @private
   */
  _setupAccessibilityHandlers() {
    // Node activated via keyboard
    this._accessibilityManager.on('node-activated', ({ nodeId }) => {
      console.log(`♿ Node activated via keyboard: ${nodeId}`);
      const node = this._graphDataStore.getNode(nodeId);
      if (node) {
        const action = this._interactionHandler.presentAction(node);
        this.emit('node-action-requested', { node, action });
      }
    });

    // Reset requested via keyboard
    this._accessibilityManager.on('reset-requested', () => {
      console.log('♿ Reset requested via keyboard');
      this.resetToMyNetwork();
    });

    // Discovery requested via keyboard
    this._accessibilityManager.on('discovery-requested', () => {
      console.log('♿ Discovery requested via keyboard');
      this.triggerDiscovery();
    });

    // Navigate nodes via keyboard
    this._accessibilityManager.on('navigate-nodes', ({ direction }) => {
      console.log(`♿ Navigate nodes: ${direction}`);
      // TODO: Implement node navigation
    });

    // Reduced motion enabled
    this._accessibilityManager.on('reduced-motion-enabled', () => {
      console.log('♿ Reduced motion enabled');
      this.emit('reduced-motion-enabled');
      
      // Adjust animation engine
      if (this._animationEngine) {
        this._animationEngine.setReducedMotion(true);
      }
    });

    // Reduced motion disabled
    this._accessibilityManager.on('reduced-motion-disabled', () => {
      console.log('♿ Reduced motion disabled');
      this.emit('reduced-motion-disabled');
      
      // Adjust animation engine
      if (this._animationEngine) {
        this._animationEngine.setReducedMotion(false);
      }
    });

    // Announce node focus changes
    this._interactionHandler.on('node-tapped', ({ nodeId }) => {
      const node = this._graphDataStore.getNode(nodeId);
      if (node) {
        this._accessibilityManager.announceNodeFocus(node);
      }
    });

    // Announce state transitions
    this._stateManager.on('state-changed', ({ newState, reason }) => {
      this._accessibilityManager.announceStateTransition(newState, reason);
    });

    // Announce action completion
    this._actionResolver.on('action-completed', ({ nodeId, actionType }) => {
      this._accessibilityManager.announceActionCompleted(nodeId, actionType);
    });
  }

  /**
   * Setup onboarding handlers
   * @private
   */
  _setupOnboardingHandlers() {
    // Tooltip shown
    this._onboardingManager.on('tooltip-shown', () => {
      console.log('👋 First-time tooltip shown');
      this.emit('onboarding-tooltip-shown');
    });

    // Tooltip closed
    this._onboardingManager.on('tooltip-closed', () => {
      console.log('👋 Tooltip closed');
      this.emit('onboarding-tooltip-closed');
    });

    // Preferences saved
    this._onboardingManager.on('preferences-saved', (preferences) => {
      console.log('⚙️ Discovery preferences saved', preferences);
      this.emit('discovery-preferences-saved', preferences);
    });

    // Preferences panel shown
    this._onboardingManager.on('preferences-panel-shown', () => {
      console.log('⚙️ Preferences panel shown');
      this.emit('preferences-panel-shown');
    });

    // Preferences panel hidden
    this._onboardingManager.on('preferences-panel-hidden', () => {
      console.log('⚙️ Preferences panel hidden');
      this.emit('preferences-panel-hidden');
    });
  }

  /**
   * Setup performance handlers
   * @private
   */
  _setupPerformanceHandlers() {
    // Background pause
    this._performanceManager.on('background-pause', () => {
      console.log('⚡ App backgrounded - pausing physics');
      
      // Pause physics loop
      if (this._physicsLoop) {
        this._physicsLoop.stop();
      }
      
      // Note: Presence tracking continues in background (event-driven)
      
      this.emit('background-paused');
    });

    // Background resume
    this._performanceManager.on('background-resume', () => {
      console.log('⚡ App foregrounded - resuming physics');
      
      // Resume physics loop
      if (this._physicsLoop) {
        this._physicsLoop.start();
      }
      
      // Note: Presence tracking continues automatically (event-driven)
      
      this.emit('background-resumed');
    });

    // Large graph detected
    this._performanceManager.on('large-graph-detected', ({ nodeCount }) => {
      console.log(`⚡ Large graph detected (${nodeCount} nodes) - applying optimizations`);
      
      // Reduce frame rate for large graphs
      if (this._frameRateManager) {
        this._frameRateManager.setTargetFPS(30);
      }
      
      this.emit('large-graph-detected', { nodeCount });
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
