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
    const { data, error } = await this._supabase
      .from('connections')
      .select('*')
      .or(`user_id.eq.${this._userId},connected_user_id.eq.${this._userId}`);

    if (error) {
      console.error('Error loading edges:', error);
      return [];
    }

    // Transform to edge format
    return data.map(conn => ({
      source: conn.user_id,
      target: conn.connected_user_id,
      type: 'connection',
      strength: 0.5,
      createdAt: new Date(conn.created_at)
    }));
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
