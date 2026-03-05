/**
 * Event Mode Gravity Overlay for Desktop Synapse
 * 
 * Overlays a "Beacon Gravity" view onto the existing Synapse visualization:
 * - Beacon node becomes center of gravity
 * - Active attendees cluster around beacon with pulsing glow (energy 0-1)
 * - Suggested proximity edges render as dashed animated lines
 * - Clicking suggested edge promotes it to connection
 * 
 * Data Sources:
 * - public.beacons (beacon definition)
 * - public.presence_sessions (active attendees, context_type='beacon')
 * - public.interaction_edges (suggested edges, status='suggested')
 * - public.connections (accepted edges, existing)
 * 
 * Polling Intervals:
 * - Active presence: 5s
 * - Suggested edges: 10s
 * - Edge inference: 20s
 * - Connections refresh: after promote
 * 
 * RPC Calls:
 * - upsert_presence_ping(context_type, context_id, energy, ttl_seconds)
 * - infer_ble_edges(group_id, min_overlap_seconds, lookback_minutes)
 * - promote_edge_to_connection(edge_id)
 * 
 * Identity: Uses community.id consistently (matches graph nodes)
 */

(() => {
  'use strict';

  const GUARD = '__CH_EVENT_MODE_GRAVITY_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ Event Mode Gravity already loaded');
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Polling intervals
    PRESENCE_REFRESH_INTERVAL: 5000,    // 5 seconds
    EDGES_REFRESH_INTERVAL: 10000,      // 10 seconds
    INFERENCE_INTERVAL: 20000,          // 20 seconds
    
    // Presence ping
    PING_INTERVAL: 5000,                // 5 seconds
    PING_TTL: 25,                       // 25 seconds
    
    // Inference parameters
    MIN_OVERLAP_SECONDS: 120,           // 2 minutes
    LOOKBACK_MINUTES: 240,              // 4 hours
    
    // Visual
    BEACON_RADIUS: 40,
    ATTENDEE_GLOW_MIN: 0.3,
    ATTENDEE_GLOW_MAX: 1.0,
    PULSE_DURATION: 2000,               // 2 seconds
    
    // Forces
    BEACON_GRAVITY_STRENGTH: 0.5,
    ATTENDEE_CLUSTER_DISTANCE: 150,
    
    // Debug
    DEBUG: true,
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let supabase = null;
  let synapseCore = null;
  let isActive = false;
  
  // Event configuration
  let currentBeacon = null;
  let currentGroupId = null;
  
  // Polling intervals
  let presenceInterval = null;
  let edgesInterval = null;
  let inferenceInterval = null;
  let pingInterval = null;
  
  // Data
  let activeAttendees = new Map(); // communityId -> { name, avatar, energy, expiresAt }
  let suggestedEdges = new Map();  // edgeId -> { fromId, toId, overlapSeconds, confidence }
  
  // Graph elements
  let beaconNode = null;
  let attendeeNodes = new Set();
  let suggestedEdgeElements = new Map();
  
  // Original forces (to restore)
  let originalForces = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Enable Event Mode
   * @param {object} options - { beaconId, groupId }
   */
  async function enableEventMode(options = {}) {
    if (isActive) {
      console.warn('⚠️ [Event Mode] Already active');
      return;
    }

    const { beaconId, groupId } = options;
    
    if (!beaconId) {
      console.error('❌ [Event Mode] beaconId required');
      return;
    }

    console.log('🎯 [Event Mode] Enabling...', { beaconId, groupId });

    // Get dependencies
    supabase = window.supabase;
    synapseCore = window.synapseCore;

    if (!supabase) {
      console.error('❌ [Event Mode] Supabase not available');
      return;
    }

    if (!synapseCore) {
      console.error('❌ [Event Mode] Synapse core not available');
      return;
    }

    // Load beacon data
    const beacon = await loadBeacon(beaconId);
    if (!beacon) {
      console.error('❌ [Event Mode] Beacon not found');
      return;
    }

    currentBeacon = beacon;
    currentGroupId = groupId || beacon.group_id;
    isActive = true;

    // Save original forces
    saveOriginalForces();

    // Create beacon node
    await createBeaconNode();

    // Start polling
    startPolling();

    // Initial data load
    await refreshEventPresence();
    await refreshSuggestedEdges();

    // Notify
    notifyStateChange();
    
    console.log('✅ [Event Mode] Enabled');
    if (CONFIG.DEBUG) {
      console.log('📊 [Event Mode] Beacon:', currentBeacon);
      console.log('📊 [Event Mode] Group:', currentGroupId);
    }
  }

  /**
   * Disable Event Mode
   */
  function disableEventMode() {
    if (!isActive) return;

    console.log('🛑 [Event Mode] Disabling...');

    // Stop polling
    stopPolling();

    // Remove beacon node
    removeBeaconNode();

    // Remove suggested edges
    clearSuggestedEdges();

    // Restore original forces
    restoreOriginalForces();

    // Clear state
    isActive = false;
    currentBeacon = null;
    currentGroupId = null;
    activeAttendees.clear();
    suggestedEdges.clear();
    attendeeNodes.clear();

    // Notify
    notifyStateChange();

    console.log('✅ [Event Mode] Disabled');
  }

  // ============================================================================
  // BEACON MANAGEMENT
  // ============================================================================

  /**
   * Load beacon from database
   */
  async function loadBeacon(beaconId) {
    try {
      const { data, error } = await supabase
        .from('beacons')
        .select('*')
        .eq('id', beaconId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('❌ [Event Mode] Failed to load beacon:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ [Event Mode] Error loading beacon:', error);
      return null;
    }
  }

  /**
   * Create beacon node in graph
   */
  async function createBeaconNode() {
    if (!synapseCore || !currentBeacon) return;

    // Check if beacon node already exists
    const existingNode = synapseCore.nodes.find(n => n.id === currentBeacon.id);
    
    if (existingNode) {
      // Re-skin existing node as beacon
      beaconNode = existingNode;
      beaconNode.isBeacon = true;
      beaconNode.beaconData = currentBeacon;
    } else {
      // Create new beacon node
      beaconNode = {
        id: currentBeacon.id,
        name: currentBeacon.label || 'Event Beacon',
        type: 'beacon',
        isBeacon: true,
        beaconData: currentBeacon,
        fx: null, // Will be set to center
        fy: null,
        radius: CONFIG.BEACON_RADIUS,
      };

      synapseCore.nodes.push(beaconNode);
    }

    // Pin beacon to center
    pinBeaconToCenter();

    // Apply beacon forces
    applyBeaconForces();

    // Re-render
    if (typeof window.refreshSynapseView === 'function') {
      window.refreshSynapseView();
    }

    console.log('✅ [Event Mode] Beacon node created');
  }

  /**
   * Remove beacon node
   */
  function removeBeaconNode() {
    if (!beaconNode || !synapseCore) return;

    // Unpin beacon
    beaconNode.fx = null;
    beaconNode.fy = null;
    beaconNode.isBeacon = false;

    // If we created the node, remove it
    if (beaconNode.type === 'beacon') {
      const index = synapseCore.nodes.indexOf(beaconNode);
      if (index > -1) {
        synapseCore.nodes.splice(index, 1);
      }
    }

    beaconNode = null;

    console.log('✅ [Event Mode] Beacon node removed');
  }

  /**
   * Pin beacon to center of viewport
   */
  function pinBeaconToCenter() {
    if (!beaconNode || !synapseCore) return;

    const svg = synapseCore.svg;
    if (!svg) return;

    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;

    beaconNode.fx = width / 2;
    beaconNode.fy = height / 2;
  }

  // ============================================================================
  // PRESENCE MANAGEMENT
  // ============================================================================

  /**
   * Refresh active presence
   */
  async function refreshEventPresence() {
    if (!isActive || !currentBeacon) return;

    try {
      // Query active presence sessions
      const { data, error } = await supabase
        .from('presence_sessions')
        .select(`
          user_id,
          energy,
          expires_at,
          community:user_id (
            id,
            name,
            image_url
          )
        `)
        .eq('context_type', 'beacon')
        .eq('context_id', currentBeacon.id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('❌ [Event Mode] Failed to fetch presence:', error);
        return;
      }

      // Update active attendees
      const newAttendees = new Map();
      
      (data || []).forEach(session => {
        if (!session.community) return;

        const communityId = session.user_id;
        newAttendees.set(communityId, {
          id: communityId,
          name: session.community.name || 'Unknown',
          imageUrl: session.community.image_url,
          energy: session.energy || 0.6,
          expiresAt: new Date(session.expires_at),
        });
      });

      // Find added/removed attendees
      const added = [];
      const removed = [];

      newAttendees.forEach((attendee, id) => {
        if (!activeAttendees.has(id)) {
          added.push(attendee);
        }
      });

      activeAttendees.forEach((attendee, id) => {
        if (!newAttendees.has(id)) {
          removed.push(attendee);
        }
      });

      // Update state
      activeAttendees = newAttendees;

      // Update graph
      if (added.length > 0) {
        await addAttendeeNodes(added);
      }

      if (removed.length > 0) {
        removeAttendeeNodes(removed);
      }

      if (CONFIG.DEBUG && (added.length > 0 || removed.length > 0)) {
        console.log('📊 [Event Mode] Presence updated:', {
          total: activeAttendees.size,
          added: added.length,
          removed: removed.length,
        });
      }

    } catch (error) {
      console.error('❌ [Event Mode] Error refreshing presence:', error);
    }
  }

  /**
   * Add attendee nodes to graph
   */
  async function addAttendeeNodes(attendees) {
    if (!synapseCore) return;

    attendees.forEach(attendee => {
      // Check if node already exists
      let node = synapseCore.nodes.find(n => n.id === attendee.id);

      if (node) {
        // Update existing node
        node.isAttendee = true;
        node.attendeeData = attendee;
      } else {
        // Create new node
        node = {
          id: attendee.id,
          name: attendee.name,
          type: 'person',
          isAttendee: true,
          attendeeData: attendee,
          imageUrl: attendee.imageUrl,
        };

        synapseCore.nodes.push(node);
      }

      attendeeNodes.add(node);
    });

    // Re-render
    if (typeof window.refreshSynapseView === 'function') {
      window.refreshSynapseView();
    }
  }

  /**
   * Remove attendee nodes
   */
  function removeAttendeeNodes(attendees) {
    if (!synapseCore) return;

    attendees.forEach(attendee => {
      const node = synapseCore.nodes.find(n => n.id === attendee.id);
      if (node) {
        node.isAttendee = false;
        node.attendeeData = null;
        attendeeNodes.delete(node);
      }
    });
  }

  // ============================================================================
  // SUGGESTED EDGES MANAGEMENT
  // ============================================================================

  /**
   * Refresh suggested edges
   */
  async function refreshSuggestedEdges() {
    if (!isActive || !currentBeacon) return;

    try {
      // Query suggested edges
      const { data, error } = await supabase
        .from('interaction_edges')
        .select('*')
        .eq('status', 'suggested')
        .or(`beacon_id.eq.${currentBeacon.id}${currentGroupId ? `,group_id.eq.${currentGroupId}` : ''}`);

      if (error) {
        console.error('❌ [Event Mode] Failed to fetch suggested edges:', error);
        return;
      }

      // Update suggested edges
      const newEdges = new Map();
      
      (data || []).forEach(edge => {
        newEdges.set(edge.id, {
          id: edge.id,
          fromId: edge.from_user_id,
          toId: edge.to_user_id,
          overlapSeconds: edge.overlap_seconds || 0,
          confidence: edge.confidence || 0,
          beaconId: edge.beacon_id,
        });
      });

      // Find added/removed edges
      const added = [];
      const removed = [];

      newEdges.forEach((edge, id) => {
        if (!suggestedEdges.has(id)) {
          added.push(edge);
        }
      });

      suggestedEdges.forEach((edge, id) => {
        if (!newEdges.has(id)) {
          removed.push(edge);
        }
      });

      // Update state
      suggestedEdges = newEdges;

      // Update graph
      if (added.length > 0) {
        addSuggestedEdgeElements(added);
      }

      if (removed.length > 0) {
        removeSuggestedEdgeElements(removed);
      }

      if (CONFIG.DEBUG && (added.length > 0 || removed.length > 0)) {
        console.log('📊 [Event Mode] Suggested edges updated:', {
          total: suggestedEdges.size,
          added: added.length,
          removed: removed.length,
        });
      }

    } catch (error) {
      console.error('❌ [Event Mode] Error refreshing suggested edges:', error);
    }
  }

  /**
   * Add suggested edge elements to graph
   */
  function addSuggestedEdgeElements(edges) {
    if (!synapseCore) return;

    edges.forEach(edge => {
      // Check if both nodes exist
      const fromNode = synapseCore.nodes.find(n => n.id === edge.fromId);
      const toNode = synapseCore.nodes.find(n => n.id === edge.toId);

      if (!fromNode || !toNode) {
        if (CONFIG.DEBUG) {
          console.warn('⚠️ [Event Mode] Suggested edge nodes not found:', edge);
        }
        return;
      }

      // Add to links array with special type
      const link = {
        id: `suggested-${edge.id}`,
        source: fromNode,
        target: toNode,
        type: 'suggested',
        isSuggested: true,
        suggestedData: edge,
      };

      synapseCore.links.push(link);
      suggestedEdgeElements.set(edge.id, link);
    });

    // Re-render
    if (typeof window.refreshSynapseView === 'function') {
      window.refreshSynapseView();
    }
  }

  /**
   * Remove suggested edge elements
   */
  function removeSuggestedEdgeElements(edges) {
    if (!synapseCore) return;

    edges.forEach(edge => {
      const link = suggestedEdgeElements.get(edge.id);
      if (link) {
        const index = synapseCore.links.indexOf(link);
        if (index > -1) {
          synapseCore.links.splice(index, 1);
        }
        suggestedEdgeElements.delete(edge.id);
      }
    });

    // Re-render
    if (typeof window.refreshSynapseView === 'function') {
      window.refreshSynapseView();
    }
  }

  /**
   * Clear all suggested edges
   */
  function clearSuggestedEdges() {
    if (!synapseCore) return;

    suggestedEdgeElements.forEach((link, edgeId) => {
      const index = synapseCore.links.indexOf(link);
      if (index > -1) {
        synapseCore.links.splice(index, 1);
      }
    });

    suggestedEdgeElements.clear();
    suggestedEdges.clear();
  }

  /**
   * Promote suggested edge to connection
   */
  async function promoteSuggestedEdge(edgeId) {
    if (!supabase) return false;

    try {
      console.log('🔄 [Event Mode] Promoting edge:', edgeId);

      await supabase.rpc('promote_edge_to_connection', {
        p_edge_id: edgeId
      });

      // Remove from suggested edges
      const edge = suggestedEdges.get(edgeId);
      if (edge) {
        removeSuggestedEdgeElements([edge]);
        suggestedEdges.delete(edgeId);
      }

      // Refresh connections
      if (typeof window.refreshSynapseConnections === 'function') {
        await window.refreshSynapseConnections();
      }

      console.log('✅ [Event Mode] Edge promoted');
      return true;

    } catch (error) {
      console.error('❌ [Event Mode] Failed to promote edge:', error);
      return false;
    }
  }

  // ============================================================================
  // FORCES MANAGEMENT
  // ============================================================================

  /**
   * Save original forces
   */
  function saveOriginalForces() {
    if (!synapseCore || !synapseCore.simulation) return;

    const sim = synapseCore.simulation;
    originalForces = {
      charge: sim.force('charge'),
      link: sim.force('link'),
      collide: sim.force('collide'),
      center: sim.force('center'),
      x: sim.force('x'),
      y: sim.force('y'),
    };

    console.log('💾 [Event Mode] Original forces saved');
  }

  /**
   * Apply beacon gravity forces
   */
  function applyBeaconForces() {
    if (!synapseCore || !synapseCore.simulation || !beaconNode) return;

    const sim = synapseCore.simulation;

    // Add radial force toward beacon
    sim.force('beacon-gravity', window.d3.forceRadial(
      CONFIG.ATTENDEE_CLUSTER_DISTANCE,
      beaconNode.fx,
      beaconNode.fy
    ).strength(node => {
      // Only apply to attendees
      return node.isAttendee ? CONFIG.BEACON_GRAVITY_STRENGTH : 0;
    }));

    // Restart simulation
    sim.alpha(0.3).restart();

    console.log('✅ [Event Mode] Beacon forces applied');
  }

  /**
   * Restore original forces
   */
  function restoreOriginalForces() {
    if (!synapseCore || !synapseCore.simulation || !originalForces) return;

    const sim = synapseCore.simulation;

    // Remove beacon gravity
    sim.force('beacon-gravity', null);

    // Restore original forces
    Object.entries(originalForces).forEach(([name, force]) => {
      if (force) {
        sim.force(name, force);
      }
    });

    // Restart simulation
    sim.alpha(0.3).restart();

    originalForces = null;

    console.log('✅ [Event Mode] Original forces restored');
  }

  // ============================================================================
  // POLLING
  // ============================================================================

  /**
   * Start polling loops
   */
  function startPolling() {
    // Presence refresh
    presenceInterval = setInterval(() => {
      refreshEventPresence();
    }, CONFIG.PRESENCE_REFRESH_INTERVAL);

    // Suggested edges refresh
    edgesInterval = setInterval(() => {
      refreshSuggestedEdges();
    }, CONFIG.EDGES_REFRESH_INTERVAL);

    // Edge inference
    inferenceInterval = setInterval(() => {
      runEdgeInference();
    }, CONFIG.INFERENCE_INTERVAL);

    // Presence ping (if current user is at event)
    if (synapseCore && synapseCore.currentUserCommunityId) {
      pingInterval = setInterval(() => {
        sendPresencePing();
      }, CONFIG.PING_INTERVAL);
    }

    console.log('✅ [Event Mode] Polling started');
  }

  /**
   * Stop polling loops
   */
  function stopPolling() {
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }

    if (edgesInterval) {
      clearInterval(edgesInterval);
      edgesInterval = null;
    }

    if (inferenceInterval) {
      clearInterval(inferenceInterval);
      inferenceInterval = null;
    }

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    console.log('✅ [Event Mode] Polling stopped');
  }

  /**
   * Run edge inference
   */
  async function runEdgeInference() {
    if (!supabase || !currentGroupId) return;

    try {
      if (CONFIG.DEBUG) {
        console.log('🔮 [Event Mode] Running edge inference...');
      }

      await supabase.rpc('infer_ble_edges', {
        p_group_id: currentGroupId,
        p_min_overlap_seconds: CONFIG.MIN_OVERLAP_SECONDS,
        p_lookback_minutes: CONFIG.LOOKBACK_MINUTES,
      });

      if (CONFIG.DEBUG) {
        console.log('✅ [Event Mode] Edge inference complete');
      }

    } catch (error) {
      console.error('❌ [Event Mode] Edge inference failed:', error);
    }
  }

  /**
   * Send presence ping for current user
   */
  async function sendPresencePing() {
    if (!supabase || !currentBeacon || !synapseCore) return;

    const userId = synapseCore.currentUserCommunityId;
    if (!userId) return;

    try {
      // Calculate energy (could be based on activity, for now use default)
      const energy = 0.7;

      await supabase.rpc('upsert_presence_ping', {
        p_context_type: 'beacon',
        p_context_id: currentBeacon.id,
        p_energy: energy,
        p_ttl_seconds: CONFIG.PING_TTL,
      });

      if (CONFIG.DEBUG) {
        console.log('📡 [Event Mode] Presence ping sent');
      }

    } catch (error) {
      console.error('❌ [Event Mode] Presence ping failed:', error);
    }
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  function notifyStateChange() {
    window.dispatchEvent(new CustomEvent('event-mode-changed', {
      detail: {
        isActive,
        beacon: currentBeacon,
        attendeeCount: activeAttendees.size,
        suggestedEdgeCount: suggestedEdges.size,
      }
    }));
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.EventModeGravity = {
    enableEventMode,
    disableEventMode,
    refreshEventPresence,
    refreshSuggestedEdges,
    promoteSuggestedEdge,
    isActive: () => isActive,
    getState: () => ({
      isActive,
      beacon: currentBeacon,
      attendeeCount: activeAttendees.size,
      suggestedEdgeCount: suggestedEdges.size,
      attendees: Array.from(activeAttendees.values()),
      suggestedEdges: Array.from(suggestedEdges.values()),
    }),
  };

  console.log('✅ Event Mode Gravity module loaded');

})();
