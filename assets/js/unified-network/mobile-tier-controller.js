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
   * Get nodes array from GraphDataStore (compatibility layer)
   * @private
   * @returns {Array} Array of node objects
   */
  _getNodesArray() {
    if (!this._graphDataStore) return [];

    // Try standard methods first (preferred)
    if (typeof this._graphDataStore.getNodes === 'function') {
      return this._graphDataStore.getNodes();
    }
    if (typeof this._graphDataStore.getAllNodes === 'function') {
      return this._graphDataStore.getAllNodes();
    }
    if (typeof this._graphDataStore.getNodesArray === 'function') {
      return this._graphDataStore.getNodesArray();
    }
    if (typeof this._graphDataStore.getState === 'function') {
      const state = this._graphDataStore.getState();
      if (state && Array.isArray(state.nodes)) {
        return state.nodes;
      }
    }

    // Try direct property access
    if (this._graphDataStore._nodes) {
      if (this._graphDataStore._nodes instanceof Map) {
        return Array.from(this._graphDataStore._nodes.values());
      }
      if (Array.isArray(this._graphDataStore._nodes)) {
        return this._graphDataStore._nodes;
      }
    }
    if (this._graphDataStore.nodes) {
      if (this._graphDataStore.nodes instanceof Map) {
        return Array.from(this._graphDataStore.nodes.values());
      }
      if (Array.isArray(this._graphDataStore.nodes)) {
        return this._graphDataStore.nodes;
      }
    }

    // Last resort: check debug hooks
    if (window.__UNIFIED_NETWORK_DEBUG?.nodes) {
      return window.__UNIFIED_NETWORK_DEBUG.nodes;
    }

    return [];
  }

  /**
   * Get edges array from GraphDataStore (compatibility layer)
   * @private
   * @returns {Array} Array of edge objects
   */
  _getEdgesArray() {
    if (!this._graphDataStore) return [];

    // Try standard methods first (preferred)
    if (typeof this._graphDataStore.getEdges === 'function') {
      return this._graphDataStore.getEdges();
    }
    if (typeof this._graphDataStore.getAllEdges === 'function') {
      return this._graphDataStore.getAllEdges();
    }
    if (typeof this._graphDataStore.getLinks === 'function') {
      return this._graphDataStore.getLinks();
    }
    if (typeof this._graphDataStore.getState === 'function') {
      const state = this._graphDataStore.getState();
      if (state) {
        if (Array.isArray(state.edges)) return state.edges;
        if (Array.isArray(state.links)) return state.links;
      }
    }

    // Try direct property access
    if (Array.isArray(this._graphDataStore._edges)) {
      return this._graphDataStore._edges;
    }
    if (Array.isArray(this._graphDataStore.edges)) {
      return this._graphDataStore.edges;
    }
    if (Array.isArray(this._graphDataStore._links)) {
      return this._graphDataStore._links;
    }
    if (Array.isArray(this._graphDataStore.links)) {
      return this._graphDataStore.links;
    }

    // Last resort: check debug hooks
    if (window.__UNIFIED_NETWORK_DEBUG?.edges) {
      return window.__UNIFIED_NETWORK_DEBUG.edges;
    }

    return [];
  }

  /**
   * Build edges from legacy window.synapseData as fallback
   * @private
   * @returns {Array} Array of edge objects
   */
  _buildLegacyEdges() {
    const edges = [];

    if (!window.synapseData) {
      return edges;
    }

    const nodeIds = new Set(this._getNodesArray().map(n => n.id));

    // 1) Connections
    if (Array.isArray(window.synapseData.connections)) {
      window.synapseData.connections.forEach(conn => {
        if (nodeIds.has(conn.from_user_id) && nodeIds.has(conn.to_user_id)) {
          edges.push({
            source: conn.from_user_id,
            target: conn.to_user_id,
            type: 'connection'
          });
        }
      });
    }

    // 2) Project members
    if (Array.isArray(window.synapseData.projectMembers)) {
      window.synapseData.projectMembers.forEach(pm => {
        if (nodeIds.has(pm.user_id) && nodeIds.has(pm.project_id)) {
          edges.push({
            source: pm.user_id,
            target: pm.project_id,
            type: 'project_member'
          });
        }
      });
    }

    // 3) Organization members
    const orgMembers = window.synapseData.orgMembers || window.synapseData.organizationMembers;
    if (Array.isArray(orgMembers)) {
      orgMembers.forEach(om => {
        const userId = om.user_id || om.community_id;
        const orgId = om.organization_id;
        if (userId && orgId && nodeIds.has(userId) && nodeIds.has(orgId)) {
          edges.push({
            source: userId,
            target: orgId,
            type: 'org_member'
          });
        }
      });
    }

    return edges;
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

    // Get all nodes using safe accessor
    const allNodes = this._getNodesArray();
    if (!allNodes || allNodes.length === 0) {
      console.warn('🧩 [TIERS] No nodes available yet; skipping tier apply');
      return { skipped: true, reason: 'No nodes available' };
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

    // Get edges (with fallback to legacy data)
    let edges = this._getEdgesArray();

    // If no edges from store, try legacy fallback
    if (!edges || edges.length === 0) {
      edges = this._buildLegacyEdges();
    }

    // Build node lookup
    const nodeById = new Map();
    allNodes.forEach(node => nodeById.set(node.id, node));

    // Helper to normalize edge endpoints (handles D3 mutations)
    const edgeId = (x) => (x && typeof x === 'object' ? x.id : x);

    // Find all nodes connected to current user
    const connectedNodeIds = new Set();
    edges.forEach(edge => {
      const source = edgeId(edge.source);
      const target = edgeId(edge.target);

      if (source === this._userId) {
        connectedNodeIds.add(target);
      } else if (target === this._userId) {
        connectedNodeIds.add(source);
      }
    });

    // Filter to people nodes only for T0
    const peopleNodes = Array.from(connectedNodeIds)
      .map(id => nodeById.get(id))
      .filter(node => node && (node.type === 'people' || node.type === 'person'));

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

    // Get edges (with fallback to legacy data)
    let edges = this._getEdgesArray();

    // If no edges from store, try legacy fallback
    if (!edges || edges.length === 0) {
      edges = this._buildLegacyEdges();
      if (edges.length > 0) {
        console.log('🧩 [TIERS] No unified edges found — using legacy edge fallback');
      }
    }

    // Build node lookup
    const nodeById = new Map();
    allNodes.forEach(node => nodeById.set(node.id, node));

    // Helper to normalize edge endpoints (handles D3 mutations)
    const edgeId = (x) => (x && typeof x === 'object' ? x.id : x);

    // Find all nodes connected to current user (1-hop neighborhood)
    const connectedNodeIds = new Set();
    edges.forEach(edge => {
      const source = edgeId(edge.source);
      const target = edgeId(edge.target);

      if (source === this._userId) {
        connectedNodeIds.add(target);
      } else if (target === this._userId) {
        connectedNodeIds.add(source);
      }
    });

    // Add connected nodes to visible set
    connectedNodeIds.forEach(nodeId => {
      const node = nodeById.get(nodeId);
      if (node) {
        visibleNodeIds.add(nodeId);

        // Count by type
        if (node.type === 'people' || node.type === 'person') peopleCount++;
        else if (node.type === 'project') projectCount++;
        else if (node.type === 'organization') orgCount++;
      }
    });

    // If showing projects, include projects connected to visible people
    if (config.showProjects) {
      const visiblePeople = Array.from(visibleNodeIds)
        .map(id => nodeById.get(id))
        .filter(n => n && (n.type === 'people' || n.type === 'person'));

      visiblePeople.forEach(person => {
        edges.forEach(edge => {
          const source = edgeId(edge.source);
          const target = edgeId(edge.target);

          // Handle project_membership edges: person → project
          if (edge.type === 'project_membership') {
            let projectId = null;

            // Check if this edge connects this person to a project
            if (source === person.id) {
              projectId = target;  // person → project
            } else if (target === person.id) {
              projectId = source;  // project → person (bidirectional)
            }

            if (projectId && !visibleNodeIds.has(projectId)) {
              const projectNode = nodeById.get(projectId);
              if (projectNode && projectNode.type === 'project') {
                visibleNodeIds.add(projectId);
                projectCount++;
              }
            }
          }
          // Legacy: Handle old person-to-person edges with projectId metadata
          else if (edge.type === 'project' && edge.projectId) {
            if (source === person.id || target === person.id) {
              if (!visibleNodeIds.has(edge.projectId)) {
                const projectNode = nodeById.get(edge.projectId);
                if (projectNode && projectNode.type === 'project') {
                  visibleNodeIds.add(edge.projectId);
                  projectCount++;
                }
              }
            }
          }
        });
      });
    }

    // If showing orgs, include orgs connected to visible people
    if (config.showOrgs) {
      const visiblePeople = Array.from(visibleNodeIds)
        .map(id => nodeById.get(id))
        .filter(n => n && (n.type === 'people' || n.type === 'person'));

      visiblePeople.forEach(person => {
        edges.forEach(edge => {
          const source = edgeId(edge.source);
          const target = edgeId(edge.target);

          // Handle organization edges: person-to-person edges with organizationId metadata
          if (edge.type === 'organization' && edge.organizationId) {
            // Check if this edge involves this person
            if (source === person.id || target === person.id) {
              // Add the organization node (from edge.organizationId metadata)
              if (!visibleNodeIds.has(edge.organizationId)) {
                const orgNode = nodeById.get(edge.organizationId);
                if (orgNode && orgNode.type === 'organization') {
                  visibleNodeIds.add(edge.organizationId);
                  orgCount++;
                }
              }
            }
          } else {
            // Fallback: treat endpoint as potential org (legacy behavior)
            let orgId = null;
            if (source === person.id) orgId = target;
            else if (target === person.id) orgId = source;

            if (orgId && !visibleNodeIds.has(orgId)) {
              const orgNode = nodeById.get(orgId);
              if (orgNode && orgNode.type === 'organization') {
                visibleNodeIds.add(orgId);
                orgCount++;
              }
            }
          }
        });
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

    const allNodes = this._getNodesArray();
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

    const allNodes = this._getNodesArray();
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
