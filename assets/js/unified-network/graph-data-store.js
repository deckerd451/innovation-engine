// assets/js/unified-network/graph-data-store.js
// Graph Data Store for Unified Network Discovery
// Version: 1.0.1 (edge endpoint normalization / D3-safe)

/**
 * Normalize an edge endpoint that may be:
 * - a string ID (pre-D3)
 * - a node object with `.id` (post-D3 mutation)
 */
function edgeId(x) {
  return x && typeof x === "object" ? x.id : x;
}

/**
 * Graph Data Store
 * Manages node and edge data with Supabase integration
 */
export class GraphDataStore {
  constructor() {
    this._supabase = null;
    this._userId = null;

    // Node storage: Map<id, node>
    this._nodes = new Map();

    // Edge storage: Edge[]
    // NOTE: D3 may mutate edges so `edge.source/target` can become objects.
    this._edges = [];

    this._cache = new Map();
    this._initialized = false;
  }

  /**
   * Initialize data store
   * @param {Object} supabase - Supabase client
   * @param {string} userId - Current user ID (community/profile id)
   * @returns {Promise<void>}
   */
  async initialize(supabase, userId) {
    if (this._initialized) {
      console.warn("GraphDataStore already initialized");
      return;
    }

    this._supabase = supabase;
    this._userId = userId;
    this._initialized = true;

    console.log("✅ GraphDataStore initialized");
  }

  /**
   * Load graph data from Supabase
   * @returns {Promise<{nodes: Node[], edges: Edge[]}>}
   */
  async loadGraphData() {
    if (!this._supabase || !this._userId) {
      console.error("GraphDataStore not initialized");
      return { nodes: [], edges: [] };
    }

    console.log("📊 Loading graph data...");

    try {
      // Load nodes (community members)
      const nodes = await this._loadNodes();

      // Load edges (connections + project/org membership)
      const { edges, stats } = await this._loadEdges();

      // Store in memory
      this._nodes.clear();
      nodes.forEach((node) => this._nodes.set(node.id, node));
      this._edges = edges;

      // Mark nodes as "My Network" based on connections / membership
      await this._markMyNetworkNodes();

      // Detailed summary log
      console.log(`📊 [STORE] Loaded ${nodes.length} nodes, ${edges.length} edges (connections=${stats.connections}, projects=${stats.projects}, orgs=${stats.orgs})`);

      return { nodes, edges };
    } catch (error) {
      console.error("Error loading graph data:", error);

      // Return cached data if available
      return {
        nodes: Array.from(this._nodes.values()),
        edges: this._edges,
      };
    }
  }

  /**
   * Mark nodes as "My Network" based on connections / shared projects / shared orgs
   * @private
   */
  async _markMyNetworkNodes() {
    // Current user is always in their network
    const currentUserNode = this._nodes.get(this._userId);
    if (currentUserNode) currentUserNode.isMyNetwork = true;

    // 1) Accepted connections involving current user
    const { data: userConnections, error } = await this._supabase
      .from("connections")
      .select("from_user_id, to_user_id, status")
      .or(`from_user_id.eq.${this._userId},to_user_id.eq.${this._userId}`)
      .eq("status", "accepted");

    if (error) {
      console.error("Error loading user connections for My Network:", error);
    } else if (userConnections) {
      userConnections.forEach((conn) => {
        const connectedUserId =
          conn.from_user_id === this._userId ? conn.to_user_id : conn.from_user_id;
        const node = this._nodes.get(connectedUserId);
        if (node) node.isMyNetwork = true;
      });
    }

    // 2) Project memberships (mark anyone who shares a project with user)
    const { data: userProjects, error: projError } = await this._supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", this._userId);

    if (!projError && userProjects) {
      const projectIds = userProjects.map((p) => p.project_id);

      if (projectIds.length > 0) {
        const { data: projectMembers, error: pmError } = await this._supabase
          .from("project_members")
          .select("user_id, project_id")
          .in("project_id", projectIds);

        if (!pmError && projectMembers) {
          projectMembers.forEach((pm) => {
            const node = this._nodes.get(pm.user_id);
            if (node && pm.user_id !== this._userId) node.isMyNetwork = true;
          });
        }
      }
    }

    // 3) Organization memberships (mark anyone who shares an org with user)
    const { data: userOrgs, error: orgError } = await this._supabase
      .from("organization_members")
      .select("organization_id")
      .eq("community_id", this._userId);

    if (!orgError && userOrgs) {
      const orgIds = userOrgs.map((o) => o.organization_id);

      if (orgIds.length > 0) {
        const { data: orgMembers, error: omError } = await this._supabase
          .from("organization_members")
          .select("community_id, organization_id")
          .in("organization_id", orgIds);

        if (!omError && orgMembers) {
          orgMembers.forEach((om) => {
            const node = this._nodes.get(om.community_id);
            if (node && om.community_id !== this._userId) node.isMyNetwork = true;
          });
        }
      }
    }

    // Everything else is Discovery
    this._nodes.forEach((node) => {
      if (!node.isMyNetwork) node.isDiscovery = true;
    });
  }

  /**
   * Load nodes from database
   * @private
   */
  async _loadNodes() {
    const { data, error } = await this._supabase.from("community").select("*");

    if (error) {
      console.error("Error loading nodes:", error);
      return [];
    }

    return (data || []).map((user) => ({
      id: user.id,
      type: "person",
      name: user.name || user.username || "Unknown",

      // Prefer `image_url` if your community table uses it; fall back to `avatar_url`
      imageUrl: user.image_url || user.avatar_url,

      // Physics properties (set by D3)
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,

      // Computed properties
      relevanceScore: 0,
      presenceEnergy: 0,
      effectivePull: 0,

      // State flags
      isMyNetwork: user.id === this._userId,
      isDiscovery: false,
      isFocused: false,
      isGuided: false,

      // Metadata
      sharedThemes: [],
      sharedProjects: [],

      // Raw data
      _raw: user,
    }));
  }

  /**
   * Load edges from database
   * @private
   * @returns {Promise<{edges: Edge[], stats: Object}>}
   */
  async _loadEdges() {
    const edges = [];
    const stats = { connections: 0, projects: 0, orgs: 0 };

    // 1) Accepted connection edges (global)
    try {
      const { data: connections, error: connError } = await this._supabase
        .from("connections")
        .select("*")
        .eq("status", "accepted");

      if (connError) {
        console.error("Error loading connection edges:", connError);
      } else if (connections) {
        connections.forEach((conn) => {
          const fromExists = this._nodes.has(conn.from_user_id);
          const toExists = this._nodes.has(conn.to_user_id);

          if (fromExists && toExists) {
            edges.push({
              source: conn.from_user_id,
              target: conn.to_user_id,
              type: "connection",
              strength: 0.5,
              createdAt: new Date(conn.created_at),
            });
            stats.connections++;
          } else {
            // Only log in debug mode
            if (window.log?.isDebugMode?.()) {
              console.debug("Skipping connection edge (node missing)", {
                from_user_id: conn.from_user_id,
                to_user_id: conn.to_user_id,
                fromExists,
                toExists,
              });
            }
          }
        });
      }
    } catch (e) {
      console.error("Error loading connections:", e);
    }

    // 2) Project membership edges (between members of same project)
    try {
      const { data: projectMembers, error: pmError } = await this._supabase
        .from("project_members")
        .select("project_id, user_id");

      if (pmError) {
        console.error("Error loading project member edges:", pmError);
      } else if (projectMembers) {
        const projectGroups = {};
        projectMembers.forEach((pm) => {
          if (!projectGroups[pm.project_id]) projectGroups[pm.project_id] = [];
          projectGroups[pm.project_id].push(pm.user_id);
        });

        Object.values(projectGroups).forEach((members) => {
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const user1 = members[i];
              const user2 = members[j];

              if (this._nodes.has(user1) && this._nodes.has(user2)) {
                const exists = edges.some((e) => {
                  const s = edgeId(e.source);
                  const t = edgeId(e.target);
                  return (s === user1 && t === user2) || (s === user2 && t === user1);
                });

                if (!exists) {
                  edges.push({
                    source: user1,
                    target: user2,
                    type: "project",
                    strength: 0.3,
                    createdAt: new Date(),
                  });
                  stats.projects++;
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error("Error loading project members:", e);
    }

    // 3) Organization membership edges (between members of same org)
    try {
      const { data: orgMembers, error: omError } = await this._supabase
        .from("organization_members")
        .select("organization_id, community_id");

      if (omError) {
        console.error("Error loading org member edges:", omError);
      } else if (orgMembers) {
        const orgGroups = {};
        orgMembers.forEach((om) => {
          if (!orgGroups[om.organization_id]) orgGroups[om.organization_id] = [];
          orgGroups[om.organization_id].push(om.community_id);
        });

        Object.values(orgGroups).forEach((members) => {
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const user1 = members[i];
              const user2 = members[j];

              if (this._nodes.has(user1) && this._nodes.has(user2)) {
                const exists = edges.some((e) => {
                  const s = edgeId(e.source);
                  const t = edgeId(e.target);
                  return (s === user1 && t === user2) || (s === user2 && t === user1);
                });

                if (!exists) {
                  edges.push({
                    source: user1,
                    target: user2,
                    type: "organization",
                    strength: 0.2,
                    createdAt: new Date(),
                  });
                  stats.orgs++;
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error("Error loading organization members:", e);
    }

    return { edges, stats };
  }

  /**
   * Get node by ID
   * @param {string} nodeId
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
   * Get all nodes (alias for getAllNodes)
   * @returns {Node[]}
   */
  getNodes() {
    return this.getAllNodes();
  }

  /**
   * Get all edges
   * @returns {Edge[]}
   */
  getAllEdges() {
    return [...this._edges];
  }

  /**
   * Get all edges (alias for getAllEdges)
   * @returns {Edge[]}
   */
  getEdges() {
    return this.getAllEdges();
  }

  /**
   * Update node
   * @param {string} nodeId
   * @param {Partial<Node>} updates
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
   * @param {Array<{id: string, updates: Partial<Node>}>} nodeUpdates
   */
  updateNodes(nodeUpdates) {
    (nodeUpdates || []).forEach(({ id, updates }) => this.updateNode(id, updates));
  }

  /**
   * Add edge
   * @param {Edge} edge
   */
  addEdge(edge) {
    const sNew = edgeId(edge.source);
    const tNew = edgeId(edge.target);

    const exists = this._edges.some((e) => {
      const s = edgeId(e.source);
      const t = edgeId(e.target);
      return (s === sNew && t === tNew) || (s === tNew && t === sNew);
    });

    if (!exists) this._edges.push(edge);
  }

  /**
   * Remove edge (undirected)
   * @param {string} sourceId
   * @param {string} targetId
   */
  removeEdge(sourceId, targetId) {
    this._edges = this._edges.filter((e) => {
      const s = edgeId(e.source);
      const t = edgeId(e.target);
      return !((s === sourceId && t === targetId) || (s === targetId && t === sourceId));
    });
  }

  /**
   * Get edges for a node (D3-safe)
   * @param {string} nodeId
   * @returns {Edge[]}
   */
  getNodeEdges(nodeId) {
    return this._edges.filter((e) => {
      const s = edgeId(e.source);
      const t = edgeId(e.target);
      return s === nodeId || t === nodeId;
    });
  }

  /**
   * Get connected nodes (D3-safe)
   * @param {string} nodeId
   * @returns {Node[]}
   */
  getConnectedNodes(nodeId) {
    const edges = this.getNodeEdges(nodeId);

    const connectedIds = edges
      .map((e) => {
        const s = edgeId(e.source);
        const t = edgeId(e.target);
        return s === nodeId ? t : s;
      })
      .filter(Boolean);

    return connectedIds.map((id) => this.getNode(id)).filter(Boolean);
  }

  /**
   * Check if nodes are connected (D3-safe)
   * @param {string} nodeId1
   * @param {string} nodeId2
   * @returns {boolean}
   */
  areNodesConnected(nodeId1, nodeId2) {
    return this._edges.some((e) => {
      const s = edgeId(e.source);
      const t = edgeId(e.target);
      return (s === nodeId1 && t === nodeId2) || (s === nodeId2 && t === nodeId1);
    });
  }

  /**
   * Get My Network nodes
   * @returns {Node[]}
   */
  getMyNetworkNodes() {
    return this.getAllNodes().filter((node) => node.isMyNetwork);
  }

  /**
   * Get Discovery nodes
   * @returns {Node[]}
   */
  getDiscoveryNodes() {
    return this.getAllNodes().filter((node) => node.isDiscovery);
  }

  /**
   * Mark node as My Network
   * @param {string} nodeId
   */
  markAsMyNetwork(nodeId) {
    this.updateNode(nodeId, { isMyNetwork: true, isDiscovery: false });
  }

  /**
   * Mark node as Discovery
   * @param {string} nodeId
   */
  markAsDiscovery(nodeId) {
    this.updateNode(nodeId, { isDiscovery: true });
  }

  /**
   * Cache helpers
   */
  getCached(key) {
    return this._cache.get(key);
  }

  setCached(key, value, ttl) {
    this._cache.set(key, value);
    if (ttl) {
      setTimeout(() => this._cache.delete(key), ttl);
    }
  }

  clearCache(key) {
    if (key) this._cache.delete(key);
    else this._cache.clear();
  }

  getCacheStats() {
    return { size: this._cache.size, keys: Array.from(this._cache.keys()) };
  }

  /**
   * Refresh data from database
   */
  async refresh() {
    console.log("🔄 Refreshing graph data...");
    return await this.loadGraphData();
  }

  /**
   * Subscribe to real-time updates
   */
  subscribeToUpdates() {
    if (!this._supabase) return;

    this._supabase
      .channel("community_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community" },
        (payload) => {
          console.log("📡 Community update:", payload);
          this.refresh();
        }
      )
      .subscribe();

    this._supabase
      .channel("connections_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections" },
        (payload) => {
          console.log("📡 Connection update:", payload);
          this.refresh();
        }
      )
      .subscribe();

    console.log("📡 Subscribed to real-time updates");
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      nodeCount: this._nodes.size,
      edgeCount: this._edges.length,
      myNetworkCount: this.getMyNetworkNodes().length,
      discoveryCount: this.getDiscoveryNodes().length,
      cacheSize: this._cache.size,
    };
  }

  /**
   * Check if initialized
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Get current user ID (community/profile id)
   */
  getUserId() {
    return this._userId;
  }
}

// Create singleton instance
export const graphDataStore = new GraphDataStore();
