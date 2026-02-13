// assets/js/unified-network/mobile-tier-controller.js
// Mobile-only tier system for Unified Network Discovery
// Version: 1.0.0

/**
 * Mobile Tier Controller
 * Manages tier-based visibility filtering for mobile devices
 *
 * Feature flag: localStorage.ie_unified_mobile_tiers = "true"
 * Mobile detection: (max-width: 768px) AND touch device
 *
 * Tiers:
 * - T0 (Personal Hub): User + top 12 strongest connections (~12-20 nodes)
 * - T1 (Relational): User + all direct connections + their projects (~30-50 nodes)
 * - T2 (Discovery): Full network (all nodes visible)
 */
export class MobileTierController {
  constructor() {
    this._enabled = false;
    this._currentTier = 'T1'; // Default tier
    this._graphDataStore = null;
    this._nodeRenderer = null;
    this._stateManager = null;
    this._userId = null;

    // Tier configuration
    this._tierConfig = {
      T0: {
        name: 'Personal Hub',
        maxDirectConnections: 12,
        showProjects: false,
        showOrgs: false,
        showThemes: false,
        labelDensity: 'minimal'
      },
      T1: {
        name: 'Relational Network',
        maxDirectConnections: Infinity,
        showProjects: true,
        showOrgs: true,
        showThemes: false,
        labelDensity: 'normal'
      },
      T2: {
        name: 'Discovery',
        maxDirectConnections: Infinity,
        showProjects: true,
        showOrgs: true,
        showThemes: true,
        labelDensity: 'full'
      }
    };
  }

  /**
   * Initialize the tier controller
   * @param {Object} deps - Dependencies
   * @param {Object} deps.graphDataStore - Graph data store
   * @param {Object} deps.nodeRenderer - Node renderer
   * @param {Object} deps.stateManager - State manager
   * @param {string} deps.userId - Current user ID
   */
  initialize(deps) {
    this._graphDataStore = deps.graphDataStore;
    this._nodeRenderer = deps.nodeRenderer;
    this._stateManager = deps.stateManager;
    this._userId = deps.userId;

    // Check if mobile tier system should be enabled
    this._enabled = this._checkShouldEnable();

    if (!this._enabled) {
      console.log('🧩 [TIERS] disabled (not mobile or flag off)');
      return;
    }

    // Load saved tier preference or use default
    const savedTier = localStorage.getItem('ie_unified_active_tier');
    if (savedTier && this._tierConfig[savedTier]) {
      this._currentTier = savedTier;
    }

    console.log(`🧩 [TIERS] enabled=true tier=${this._currentTier} mobile=true`);
  }

  /**
   * Check if tier system should be enabled
   * @private
   * @returns {boolean}
   */
  _checkShouldEnable() {
    // Feature flag check
    const tierFlagEnabled = localStorage.getItem('ie_unified_mobile_tiers') === 'true';
    if (!tierFlagEnabled) {
      return false;
    }

    // Mobile detection
    const isMobileWidth = window.matchMedia('(max-width: 768px)').matches;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isMobile = isMobileWidth && isCoarsePointer;

    return isMobile;
  }

  /**
   * Check if tier system is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * Get current tier
   * @returns {string}
   */
  getTier() {
    return this._currentTier;
  }

  /**
   * Apply a tier to the graph
   * @param {string} tier - Tier to apply ('T0', 'T1', or 'T2')
   * @returns {Object} Stats about the tier application
   */
  applyTier(tier) {
    const startTime = performance.now();

    if (!this._enabled) {
      console.log('🧩 [TIERS] Cannot apply tier: system disabled');
      return { error: 'Tier system disabled' };
    }

    if (!this._tierConfig[tier]) {
      console.warn(`🧩 [TIERS] Unknown tier: ${tier}`);
      return { error: `Unknown tier: ${tier}` };
    }

    if (!this._graphDataStore || !this._nodeRenderer) {
      console.warn('🧩 [TIERS] Cannot apply tier: components not ready');
      return { error: 'Components not ready' };
    }

    console.log(`🧩 [TIERS] Applying tier ${tier} (${this._tierConfig[tier].name})...`);

    // Get all nodes
    const allNodes = this._graphDataStore.getNodes();
    if (!allNodes || allNodes.length === 0) {
      console.warn('🧩 [TIERS] No nodes available');
      return { error: 'No nodes available' };
    }

    // Calculate visible set based on tier
    let visibleNodeIds;
    let stats;

    switch (tier) {
      case 'T0':
        ({ visibleNodeIds, stats } = this._calculateT0Visibility(allNodes));
        break;
      case 'T1':
        ({ visibleNodeIds, stats } = this._calculateT1Visibility(allNodes));
        break;
      case 'T2':
        ({ visibleNodeIds, stats } = this._calculateT2Visibility(allNodes));
        break;
      default:
        return { error: `Invalid tier: ${tier}` };
    }

    // Apply visibility flags to all nodes
    let visibleCount = 0;
    let culledCount = 0;

    allNodes.forEach(node => {
      const isVisible = visibleNodeIds.has(node.id);
      node._tierVisible = isVisible;

      if (isVisible) {
        visibleCount++;
      } else {
        culledCount++;
      }
    });

    // Save current tier
    this._currentTier = tier;
    localStorage.setItem('ie_unified_active_tier', tier);

    // Trigger re-render
    const state = this._stateManager?.getState() || {};
    this._nodeRenderer.render(allNodes, { ...state, forceRender: true });

    const duration = (performance.now() - startTime).toFixed(2);

    const result = {
      tier,
      visibleCount,
      culledCount,
      totalCount: allNodes.length,
      duration: `${duration}ms`,
      ...stats
    };

    console.log(`🧩 [TIERS] Applied tier ${tier} in ${duration}ms:`, {
      visible: visibleCount,
      culled: culledCount,
      ...stats
    });

    return result;
  }

  /**
   * Calculate T0 (Personal Hub) visibility
   * Shows user + top N connections by effectivePull
   * @private
   */
  _calculateT0Visibility(allNodes) {
    const config = this._tierConfig.T0;
    const visibleNodeIds = new Set();

    // Always include current user
    visibleNodeIds.add(this._userId);

    // Get connected nodes (direct connections to user)
    const connectedNodes = this._graphDataStore.getConnectedNodes(this._userId);

    // Filter to people nodes only for T0
    const peopleNodes = connectedNodes.filter(node => node.type === 'people');

    // Sort by effectivePull (strength of connection)
    const sortedByPull = peopleNodes
      .sort((a, b) => (b.effectivePull || 0) - (a.effectivePull || 0))
      .slice(0, config.maxDirectConnections);

    // Add top connections
    sortedByPull.forEach(node => {
      visibleNodeIds.add(node.id);
    });

    const stats = {
      visiblePeople: sortedByPull.length,
      visibleProjects: 0,
      visibleOrgs: 0,
      visibleThemes: 0
    };

    return { visibleNodeIds, stats };
  }

  /**
   * Calculate T1 (Relational Network) visibility
   * Shows user + all connections + their projects + orgs
   * @private
   */
  _calculateT1Visibility(allNodes) {
    const config = this._tierConfig.T1;
    const visibleNodeIds = new Set();
    let peopleCount = 0;
    let projectCount = 0;
    let orgCount = 0;

    // Always include current user
    visibleNodeIds.add(this._userId);

    // Get all nodes connected to user (direct connections)
    const connectedNodes = this._graphDataStore.getConnectedNodes(this._userId);

    connectedNodes.forEach(node => {
      visibleNodeIds.add(node.id);

      // Count by type
      if (node.type === 'people') peopleCount++;
      else if (node.type === 'project') projectCount++;
      else if (node.type === 'organization') orgCount++;
    });

    // If showing projects, include projects connected to visible people
    if (config.showProjects) {
      connectedNodes.forEach(node => {
        if (node.type === 'people') {
          const personProjects = this._graphDataStore.getConnectedNodes(node.id);
          personProjects.forEach(proj => {
            if (proj.type === 'project' && !visibleNodeIds.has(proj.id)) {
              visibleNodeIds.add(proj.id);
              projectCount++;
            }
          });
        }
      });
    }

    // If showing orgs, include orgs connected to visible people
    if (config.showOrgs) {
      connectedNodes.forEach(node => {
        if (node.type === 'people') {
          const personOrgs = this._graphDataStore.getConnectedNodes(node.id);
          personOrgs.forEach(org => {
            if (org.type === 'organization' && !visibleNodeIds.has(org.id)) {
              visibleNodeIds.add(org.id);
              orgCount++;
            }
          });
        }
      });
    }

    const stats = {
      visiblePeople: peopleCount,
      visibleProjects: projectCount,
      visibleOrgs: orgCount,
      visibleThemes: 0
    };

    return { visibleNodeIds, stats };
  }

  /**
   * Calculate T2 (Discovery) visibility
   * Shows everything (full network)
   * @private
   */
  _calculateT2Visibility(allNodes) {
    const visibleNodeIds = new Set();
    let peopleCount = 0;
    let projectCount = 0;
    let orgCount = 0;
    let themeCount = 0;

    allNodes.forEach(node => {
      visibleNodeIds.add(node.id);

      // Count by type
      if (node.type === 'people') peopleCount++;
      else if (node.type === 'project') projectCount++;
      else if (node.type === 'organization') orgCount++;
      else if (node.type === 'theme') themeCount++;
    });

    const stats = {
      visiblePeople: peopleCount,
      visibleProjects: projectCount,
      visibleOrgs: orgCount,
      visibleThemes: themeCount
    };

    return { visibleNodeIds, stats };
  }

  /**
   * Reset all tier visibility flags
   */
  reset() {
    if (!this._graphDataStore) return;

    const allNodes = this._graphDataStore.getNodes();
    allNodes.forEach(node => {
      node._tierVisible = true;
    });

    console.log('🧩 [TIERS] Reset: all nodes visible');
  }

  /**
   * Get tier statistics
   * @returns {Object}
   */
  getStats() {
    if (!this._graphDataStore) {
      return { error: 'Graph data store not available' };
    }

    const allNodes = this._graphDataStore.getNodes();
    const visibleNodes = allNodes.filter(n => n._tierVisible !== false);

    return {
      enabled: this._enabled,
      currentTier: this._currentTier,
      totalNodes: allNodes.length,
      visibleNodes: visibleNodes.length,
      culledNodes: allNodes.length - visibleNodes.length,
      tierConfig: this._tierConfig[this._currentTier]
    };
  }
}

// Create singleton instance
export const mobileTierController = new MobileTierController();
