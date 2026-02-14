// assets/js/unified-network/graph-data-store.js
// Graph Data Store for Unified Network Discovery
// Version: 1.0.2 (debug instrumentation)

// Debug toggle for edge loading diagnostics
const EDGE_DEBUG =
  new URLSearchParams(window.location.search).get("debugEdges") === "1" ||
  localStorage.getItem("ie_debug_edges") === "true";

/**
 * Debug logging helper (only logs when EDGE_DEBUG is enabled)
 */
function edgeDebug(...args) {
  if (EDGE_DEBUG) console.log(...args);
}

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

    // Expose debug helper when enabled
    if (EDGE_DEBUG) {
      const self = this;
      window.__debugUnifiedEdges = () => {
        try {
          return {
            nodeCount: self._nodes?.size || 0,
            edgeCount: self._edges?.length || 0,
            nodeIdSample: Array.from(self._nodes?.keys() || []).slice(0, 10),
            edgeSample: (self._edges || []).slice(0, 5).map(e => ({
              type: e.type,
              source: edgeId(e.source),
              target: edgeId(e.target)
            }))
          };
        } catch (err) {
          return { error: err.message };
        }
      };
    }
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
      console.log(`📊 [STORE] Loaded ${nodes.length} nodes, ${edges.length} edges (connections=${stats.connections}, projects=${stats.projects}, orgs=${stats.orgs}) userId=${this._userId}`);

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
   * Load edges from database (fail-soft, instrumented)
   * @private
   * @returns {Promise<{edges: Edge[], stats: Object}>}
   */
  async _loadEdges() {
    edgeDebug("🧪 [EDGES] _loadEdges() start", {
      hasSupabase: !!this._supabase,
      userId: this._userId,
      nodeCount: this._nodes.size
    });

    const edges = [];
    const stats = { connections: 0, projects: 0, orgs: 0 };

    // 1) Connection edges (accepted + pending)
    try {
      console.log('📊 [STORE] Loading connection edges...');
      const { data: connections, error: connError } = await this._supabase
        .from("connections")
        .select("id, from_user_id, to_user_id, status, created_at")
        .in("status", ["accepted", "pending"]);

      edgeDebug("🧪 [EDGES] connections result", {
        ok: !connError,
        error: connError,
        count: connections?.length || 0,
        sample: (connections || []).slice(0, 2)
      });

      if (connError) {
        console.warn("[STORE] connections edge load failed (query error):", connError);
      } else if (connections) {
        console.log(`📊 [STORE] Found ${connections.length} connections (accepted + pending)`);

        connections.forEach((conn) => {
          const fromExists = this._nodes.has(conn.from_user_id);
          const toExists = this._nodes.has(conn.to_user_id);

          if (fromExists && toExists) {
            edges.push({
              type: "connection",
              source: conn.from_user_id,
              target: conn.to_user_id,
              status: conn.status,
              strength: conn.status === "accepted" ? 0.5 : 0.3,
              createdAt: new Date(conn.created_at),
            });
            stats.connections++;
          } else {
            // Only log in debug mode
            if (window.log?.isDebugMode?.() || EDGE_DEBUG) {
              console.debug("Skipping connection edge (node missing)", {
                from_user_id: conn.from_user_id,
                to_user_id: conn.to_user_id,
                fromExists,
                toExists,
              });
            }
          }
        });
        console.log(`📊 [STORE] Created ${stats.connections} connection edges`);
      }
    } catch (err) {
      console.warn("[STORE] connections edge load failed", err);
    }

    // 2) Project membership edges (between members of same project)
    try {
      console.log('📊 [STORE] Loading project member edges...');
      const { data: projectMembers, error: pmError } = await this._supabase
        .from("project_members")
        .select("id, project_id, user_id, role");

      edgeDebug("🧪 [EDGES] project_members result", {
        ok: !pmError,
        error: pmError,
        count: projectMembers?.length || 0,
        sample: (projectMembers || []).slice(0, 2)
      });

      if (pmError) {
        console.warn("[STORE] project_members edge load failed (query error):", pmError);
      } else if (projectMembers) {
        console.log(`📊 [STORE] Found ${projectMembers.length} project memberships`);

        const projectGroups = {};
        projectMembers.forEach((pm) => {
          if (!projectGroups[pm.project_id]) projectGroups[pm.project_id] = [];
          projectGroups[pm.project_id].push(pm.user_id);
        });

        Object.entries(projectGroups).forEach(([projectId, members]) => {
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const userA = members[i];
              const userB = members[j];

              if (this._nodes.has(userA) && this._nodes.has(userB)) {
                const exists = edges.some((e) => {
                  const s = edgeId(e.source);
                  const t = edgeId(e.target);
                  return (s === userA && t === userB) || (s === userB && t === userA);
                });

                if (!exists) {
                  edges.push({
                    type: "project",
                    source: userA,
                    target: userB,
                    projectId: projectId,
                    strength: 0.3,
                    createdAt: new Date(),
                  });
                  stats.projects++;
                }
              }
            }
          }
        });
        console.log(`📊 [STORE] Created ${stats.projects} project edges`);
      }
    } catch (err) {
      console.warn("[STORE] project_members edge load failed", err);
    }

    // 3) Organization membership edges (between members of same org)
    try {
      console.log('📊 [STORE] Loading organization member edges...');
      const { data: orgMembers, error: omError } = await this._supabase
        .from("organization_members")
        .select("id, organization_id, community_id, role");

      edgeDebug("🧪 [EDGES] organization_members result", {
        ok: !omError,
        error: omError,
        count: orgMembers?.length || 0,
        sample: (orgMembers || []).slice(0, 2)
      });

      if (omError) {
        console.warn("[STORE] organization_members edge load failed (query error):", omError);
      } else if (orgMembers) {
        console.log(`📊 [STORE] Found ${orgMembers.length} organization memberships`);

        const orgGroups = {};
        orgMembers.forEach((om) => {
          if (!orgGroups[om.organization_id]) orgGroups[om.organization_id] = [];
          orgGroups[om.organization_id].push(om.community_id);
        });

        Object.entries(orgGroups).forEach(([organizationId, members]) => {
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const userA = members[i];
              const userB = members[j];

              if (this._nodes.has(userA) && this._nodes.has(userB)) {
                const exists = edges.some((e) => {
                  const s = edgeId(e.source);
                  const t = edgeId(e.target);
                  return (s === userA && t === userB) || (s === userB && t === userA);
                });

                if (!exists) {
                  edges.push({
                    type: "organization",
                    source: userA,
                    target: userB,
                    organizationId: organizationId,
                    strength: 0.2,
                    createdAt: new Date(),
                  });
                  stats.orgs++;
                }
              }
            }
          }
        });
        console.log(`📊 [STORE] Created ${stats.orgs} organization edges`);
      }
    } catch (err) {
      console.warn("[STORE] organization_members edge load failed", err);
    }

    // Debug: Show edges before and after node filtering
    edgeDebug("🧪 [EDGES] built edges (pre-filter)", {
      count: edges.length,
      sample: edges.slice(0, 5).map(e => ({
        type: e.type,
        source: edgeId(e.source),
        target: edgeId(e.target)
      }))
    });

    // Perform node existence filtering (defensive, edges should already be filtered above)
    const nodeIds = new Set(this._nodes.keys());
    const dropped = [];
    const filtered = edges.filter((e) => {
      const source = edgeId(e.source);
      const target = edgeId(e.target);
      const sourceExists = nodeIds.has(source);
      const targetExists = nodeIds.has(target);

      if (!sourceExists || !targetExists) {
        dropped.push({ type: e.type, source, target, sourceExists, targetExists });
        return false;
      }
      return true;
    });

    edgeDebug("🧪 [EDGES] edges after node-id filter", {
      count: filtered.length,
      dropped: edges.length - filtered.length
    });

    if (dropped.length > 0) {
      edgeDebug("🧪 [EDGES] dropped edge examples", dropped.slice(0, 10));
    }

    edgeDebug("🧪 [EDGES] _loadEdges() end", {
      totalEdges: filtered.length,
      stats
    });

    return { edges: filtered, stats };
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
   * Get edge statistics (debug helper)
   * @returns {Object} Edge statistics
   */
  getEdgeStats() {
    return {
      nodeCount: this._nodes.size,
      edgeCount: this._edges.length
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
