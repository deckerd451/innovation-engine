// assets/js/unified-network/graph-data-store.js
// Graph Data Store for Unified Network Discovery
// Version: 1.0.0

/**
 * Graph Data Store
 * Manages node and edge data with Supabase integration
 */
export class GraphDataStore {
  constructor() {
    this._supabase = null;
    this._userId = null;
    this._nodes = new Map();
    this._edges = [];
    this._cache = new Map();
    this._initialized = false;
  }

  /**
   * Initialize data store
   * @param {Object} supabase - Supabase client
   * @param {string} userId - Current user ID
   * @returns {Promise<void>}
   */
  async initialize(supabase, userId) {
    if (this._initialized) {
      console.warn('GraphDataStore already initialized');
      return;
    }

    this._supabase = supabase;
    this._userId = userId;
    this._initialized = true;

    console.log('✅ GraphDataStore initialized');
  }

  /**
   * Load graph data from Supabase
   * @returns {Promise<{nodes: Node[], edges: Edge[]}>}
   */
  async loadGraphData() {
    if (!this._supabase || !this._userId) {
      console.error('GraphDataStore not initialized');
      return { nodes: [], edges: [] };
    }

    console.log('📊 Loading graph data...');

    try {
      // Load nodes (community members)
      const nodes = await this._loadNodes();
      
      // Load edges (connections)
      const edges = await this._loadEdges();

      // Store in memory
      this._nodes.clear();
      nodes.forEach(node => this._nodes.set(node.id, node));
      this._edges = edges;

      // Mark nodes as "My Network" based on connections
      await this._markMyNetworkNodes();

      console.log(`✅ Loaded ${nodes.length} nodes and ${edges.length} edges`);

      return { nodes, edges };
    } catch (error) {
      console.error('Error loading graph data:', error);
      
      // Return cached data if available
      return {
        nodes: Array.from(this._nodes.values()),
        edges: this._edges
      };
    }
  }

  /**
   * Mark nodes as "My Network" based on connections
   * @private
   */
  async _markMyNetworkNodes() {
    // Current user is always in their network
    const currentUserNode = this._nodes.get(this._userId);
    if (currentUserNode) {
      currentUserNode.isMyNetwork = true;
    }

    // Get user's connections
    const { data: userConnections, error } = await this._supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${this._userId},to_user_id.eq.${this._userId}`)
      .eq('status', 'accepted');

    if (error) {
      console.error('Error loading user connections for My Network:', error);
      return;
    }

    // Mark connected users as "My Network"
    if (userConnections) {
      userConnections.forEach(conn => {
        const connectedUserId = conn.from_user_id === this._userId 
          ? conn.to_user_id 
          : conn.from_user_id;
        
        const node = this._nodes.get(connectedUserId);
        if (node) {
          node.isMyNetwork = true;
        }
      });
    }

    // Get user's project memberships
    const { data: userProjects, error: projError } = await this._supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', this._userId);

    if (!projError && userProjects) {
      const projectIds = userProjects.map(p => p.project_id);
      
      if (projectIds.length > 0) {
        // Get all members of these projects
        const { data: projectMembers, error: pmError } = await this._supabase
          .from('project_members')
          .select('user_id')
          .in('project_id', projectIds);

        if (!pmError && projectMembers) {
          projectMembers.forEach(pm => {
            const node = this._nodes.get(pm.user_id);
            if (node && pm.user_id !== this._userId) {
              node.isMyNetwork = true;
            }
          });
        }
      }
    }

    // Get user's organization memberships
    const { data: userOrgs, error: orgError } = await this._supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', this._userId);

    if (!orgError && userOrgs) {
      const orgIds = userOrgs.map(o => o.organization_id);
      
      if (orgIds.length > 0) {
        // Get all members of these organizations
        const { data: orgMembers, error: omError } = await this._supabase
          .from('organization_members')
          .select('user_id')
          .in('organization_id', orgIds);

        if (!omError && orgMembers) {
          orgMembers.forEach(om => {
            const node = this._nodes.get(om.user_id);
            if (node && om.user_id !== this._userId) {
              node.isMyNetwork = true;
            }
          });
        }
      }
    }

    // All other nodes are "Discovery"
    this._nodes.forEach(node => {
      if (!node.isMyNetwork) {
        node.isDiscovery = true;
      }
    });
  }

  /**
   * Load nodes from database
   * @private
   */
  async _loadNodes() {
    const { data, error } = await this._supabase
      .from('community')
      .select('*');

    if (error) {
      console.error('Error loading nodes:', error);
      return [];
    }

    // Transform to node format
    return data.map(user => ({
      id: user.id,
      type: 'person',
      name: user.name || user.username || 'Unknown',
      imageUrl: user.avatar_url,
      
      // Physics properties (will be set by D3)
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      
      // Computed properties (will be calculated)
      relevanceScore: 0,
      presenceEnergy: 0,
      effectivePull: 0,
      
      // State flags
      isMyNetwork: user.id === this._userId, // Current user is always in network
      isDiscovery: false,
      isFocused: false,
      isGuided: false,
      
      // Metadata
      sharedThemes: [],
      sharedProjects: [],
      
      // Raw data
      _raw: user
    }));
  }

  /**
   * Load edges from database
   * @private
   */
  async _loadEdges() {
    const edges = [];
    
    // 1. Load connection edges (all connections, not just user's)
    try {
      const { data: connections, error: connError } = await this._supabase
        .from('connections')
        .select('*')
        .eq('status', 'accepted'); // Only accepted connections create visible edges

      if (connError) {
        console.error('Error loading connection edges:', connError);
      } else if (connections) {
        // Check if both nodes exist before adding edge
        connections.forEach(conn => {
          const fromExists = this._nodes.has(conn.from_user_id);
          const toExists = this._nodes.has(conn.to_user_id);
          
          if (fromExists && toExists) {
            edges.push({
              source: conn.from_user_id,
              target: conn.to_user_id,
              type: 'connection',
              strength: 0.5,
              createdAt: new Date(conn.created_at)
            });
          } else {
            // Only log in debug mode
            if (window.log?.isDebugMode?.()) {
              console.debug(`Skipping connection edge: from_user_exists: ${fromExists}, to_user_exists: ${toExists}`);
            }
          }
        });
      }
    } catch (e) {
      console.error('Error loading connections:', e);
    }

    // 2. Load project membership edges
    try {
      const { data: projectMembers, error: pmError } = await this._supabase
        .from('project_members')
        .select('project_id, user_id');

      if (pmError) {
        console.error('Error loading project member edges:', pmError);
      } else if (projectMembers) {
        // Group by project to create edges between project members
        const projectGroups = {};
        projectMembers.forEach(pm => {
          if (!projectGroups[pm.project_id]) {
            projectGroups[pm.project_id] = [];
          }
          projectGroups[pm.project_id].push(pm.user_id);
        });

        // Create edges between members of the same project
        Object.values(projectGroups).forEach(members => {
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const user1 = members[i];
              const user2 = members[j];
              
              if (this._nodes.has(user1) && this._nodes.has(user2)) {
                // Check if edge already exists
                const exists = edges.some(e => 
                  (e.source === user1 && e.target === user2) ||
                  (e.source === user2 && e.target === user1)
                );
                
                if (!exists) {
                  edges.push({
                    source: user1,
                    target: user2,
                    type: 'project',
                    strength: 0.3,
                    createdAt: new Date()
                  });
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error('Error loading project members:', e);
    }

    // 3. Load organization membership edges
    try {
      const { data: orgMembers, error: omError } = await this._supabase
        .from('organization_members')
        .select('organization_id, user_id');

      if (omError) {
        console.error('Error loading org member edges:', omError);
      } else if (orgMembers) {
        // Group by organization
        const orgGroups = {};
        orgMembers.forEach(om => {
          if (!orgGroups[om.organization_id]) {
            orgGroups[om.organization_id] = [];
          }
          orgGroups[om.organization_id].push(om.user_id);
        });

        // Create edges between members of the same organization
        Object.values(orgGroups).forEach(members => {
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const user1 = members[i];
              const user2 = members[j];
              
              if (this._nodes.has(user1) && this._nodes.has(user2)) {
                // Check if edge already exists
                const exists = edges.some(e => 
                  (e.source === user1 && e.target === user2) ||
                  (e.source === user2 && e.target === user1)
                );
                
                if (!exists) {
                  edges.push({
                    source: user1,
                    target: user2,
                    type: 'organization',
                    strength: 0.2,
                    createdAt: new Date()
                  });
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error('Error loading organization members:', e);
    }

    return edges;
  }

  /**
   * Get node by ID
   * @param {string} nodeId - Node ID
   * @returns {Node|null}
   */
  getNode(nodeId) {
    return this._nodes.get(nodeId) || null;
  }

  /**
   * Get all nodes
   * @returns {Node[]}
   */
  getAllNodes() {
    return Array.from(this._nodes.values());
  }

  /**
   * Get all edges
   * @returns {Edge[]}
   */
  getAllEdges() {
    return [...this._edges];
  }

  /**
   * Update node
   * @param {string} nodeId - Node ID
   * @param {Partial<Node>} updates - Node updates
   */
  updateNode(nodeId, updates) {
    const node = this._nodes.get(nodeId);
    if (!node) {
      console.warn(`Node not found: ${nodeId}`);
      return;
    }

    Object.assign(node, updates);
    this._nodes.set(nodeId, node);
  }

  /**
   * Update multiple nodes
   * @param {Array<{id: string, updates: Partial<Node>}>} nodeUpdates - Array of updates
   */
  updateNodes(nodeUpdates) {
    nodeUpdates.forEach(({ id, updates }) => {
      this.updateNode(id, updates);
    });
  }

  /**
   * Add edge
   * @param {Edge} edge - Edge to add
   */
  addEdge(edge) {
    // Check if edge already exists
    const exists = this._edges.some(e => 
      (e.source === edge.source && e.target === edge.target) ||
      (e.source === edge.target && e.target === edge.source)
    );

    if (!exists) {
      this._edges.push(edge);
    }
  }

  /**
   * Remove edge
   * @param {string} sourceId - Source node ID
   * @param {string} targetId - Target node ID
   */
  removeEdge(sourceId, targetId) {
    this._edges = this._edges.filter(e => 
      !((e.source === sourceId && e.target === targetId) ||
        (e.source === targetId && e.target === sourceId))
    );
  }

  /**
   * Get edges for a node
   * @param {string} nodeId - Node ID
   * @returns {Edge[]}
   */
  getNodeEdges(nodeId) {
    return this._edges.filter(e => 
      e.source === nodeId || e.target === nodeId
    );
  }

  /**
   * Get connected nodes
   * @param {string} nodeId - Node ID
   * @returns {Node[]}
   */
  getConnectedNodes(nodeId) {
    const edges = this.getNodeEdges(nodeId);
    const connectedIds = edges.map(e => 
      e.source === nodeId ? e.target : e.source
    );

    return connectedIds
      .map(id => this.getNode(id))
      .filter(node => node !== null);
  }

  /**
   * Check if nodes are connected
   * @param {string} nodeId1 - First node ID
   * @param {string} nodeId2 - Second node ID
   * @returns {boolean}
   */
  areNodesConnected(nodeId1, nodeId2) {
    return this._edges.some(e => 
      (e.source === nodeId1 && e.target === nodeId2) ||
      (e.source === nodeId2 && e.target === nodeId1)
    );
  }

  /**
   * Get My Network nodes
   * @returns {Node[]}
   */
  getMyNetworkNodes() {
    return this.getAllNodes().filter(node => node.isMyNetwork);
  }

  /**
   * Get Discovery nodes
   * @returns {Node[]}
   */
  getDiscoveryNodes() {
    return this.getAllNodes().filter(node => node.isDiscovery);
  }

  /**
   * Mark node as My Network
   * @param {string} nodeId - Node ID
   */
  markAsMyNetwork(nodeId) {
    this.updateNode(nodeId, {
      isMyNetwork: true,
      isDiscovery: false
    });
  }

  /**
   * Mark node as Discovery
   * @param {string} nodeId - Node ID
   */
  markAsDiscovery(nodeId) {
    this.updateNode(nodeId, {
      isDiscovery: true
    });
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {*} Cached value
   */
  getCached(key) {
    return this._cache.get(key);
  }

  /**
   * Set cached value
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - Time-to-live in milliseconds
   */
  setCached(key, value, ttl) {
    this._cache.set(key, value);

    // Set expiration if TTL provided
    if (ttl) {
      setTimeout(() => {
        this._cache.delete(key);
      }, ttl);
    }
  }

  /**
   * Clear cache
   * @param {string} [key] - Specific key to clear, or all if not provided
   */
  clearCache(key) {
    if (key) {
      this._cache.delete(key);
    } else {
      this._cache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      keys: Array.from(this._cache.keys())
    };
  }

  /**
   * Refresh data from database
   * @returns {Promise<{nodes: Node[], edges: Edge[]}>}
   */
  async refresh() {
    console.log('🔄 Refreshing graph data...');
    return await this.loadGraphData();
  }

  /**
   * Subscribe to real-time updates
   */
  subscribeToUpdates() {
    if (!this._supabase) return;

    // Subscribe to community changes
    this._supabase
      .channel('community_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community'
      }, (payload) => {
        console.log('📡 Community update:', payload);
        this.refresh();
      })
      .subscribe();

    // Subscribe to connection changes
    this._supabase
      .channel('connections_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'connections'
      }, (payload) => {
        console.log('📡 Connection update:', payload);
        this.refresh();
      })
      .subscribe();

    console.log('📡 Subscribed to real-time updates');
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      nodeCount: this._nodes.size,
      edgeCount: this._edges.length,
      myNetworkCount: this.getMyNetworkNodes().length,
      discoveryCount: this.getDiscoveryNodes().length,
      cacheSize: this._cache.size
    };
  }

  /**
   * Check if initialized
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
}

// Create singleton instance
export const graphDataStore = new GraphDataStore();
