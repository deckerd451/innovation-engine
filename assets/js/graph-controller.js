/**
 * ================================================================
 * GRAPH CONTROLLER — Desktop Tier Control + Focus API
 * ================================================================
 *
 * Exposed as: window.GraphController
 *
 * This module provides the desktop-tier operating layer for the
 * Synapse graph. It wraps existing APIs (window.synapseCore,
 * focus-system.js, window.d3) without rewriting physics or layout.
 *
 * TIER MODEL (Desktop):
 *   Tier 1 — You:        BFS 1 hop.  Direct connections only. Ecosystem dimmed.
 *   Tier 2 — Extended:   BFS 2 hops. Clusters near user visible.
 *   Tier 3 — Ecosystem:  All nodes fully visible.
 *
 * NOTE: Does NOT call mobileTierController (mobile-gated).
 * Desktop tier is implemented here via D3 opacity control on synapseCore.
 *
 * PRESERVED BEHAVIOR:
 *   - Node click → window.openNodePanel() (node-side-panel card)
 *   - All graph physics + layout engine unchanged
 *   - No new Supabase queries
 * ================================================================
 */

window.GraphController = (() => {
  'use strict';

  /* ── Tier configuration ──────────────────────────────────── */
  const TIER_CONFIG = {
    1: {
      hops: 1,
      dimOpacity: 0.08,        // ecosystem node opacity when dimmed
      dimLinkOpacity: 0.04,    // ecosystem link opacity when dimmed
      centerOnUser: true,
      label: 'Tier 1: You',
    },
    2: {
      hops: 2,
      dimOpacity: 0.30,
      dimLinkOpacity: 0.12,
      centerOnUser: false,
      label: 'Tier 2: Extended',
    },
    3: {
      hops: Infinity,          // all nodes visible
      dimOpacity: 1.0,
      dimLinkOpacity: 0.45,
      centerOnUser: false,
      label: 'Tier 3: Ecosystem',
    },
  };

  /* ── Internal state ─────────────────────────────────────── */
  let _currentTier = 1;
  let _userId = null;           // community.id (not auth.users.id)
  let _initialized = false;

  /* ── Helper: access synapseCore safely ───────────────────── */
  function _core() {
    return window.synapseCore || null;
  }

  /* ── BFS: compute Set of node IDs within N hops from userId ─ */
  function _computeHopSet(nodes, links, userId, maxHops) {
    if (!userId) return new Set(nodes.map(n => n.id));
    if (maxHops === Infinity) return new Set(nodes.map(n => n.id));

    const visited = new Set([userId]);
    let frontier = [userId];

    for (let hop = 0; hop < maxHops; hop++) {
      const next = [];
      frontier.forEach(id => {
        links.forEach(l => {
          const s = l.source && typeof l.source === 'object' ? l.source.id : l.source;
          const t = l.target && typeof l.target === 'object' ? l.target.id : l.target;
          if (s === id && !visited.has(t)) { visited.add(t); next.push(t); }
          if (t === id && !visited.has(s)) { visited.add(s); next.push(s); }
        });
      });
      frontier = next;
      if (next.length === 0) break;
    }

    return visited;
  }

  /* ── Apply tier-based opacity to all D3 nodes and links ───── */
  function _applyTierOpacity(nodeEls, linkEls, visibleIds, config) {
    if (!nodeEls) return;

    nodeEls
      .transition()
      .duration(400)
      .ease(window.d3 ? window.d3.easeQuadOut : undefined)
      .style('opacity', d => visibleIds.has(d.id) ? 1.0 : config.dimOpacity);

    if (linkEls) {
      linkEls
        .transition()
        .duration(400)
        .style('opacity', d => {
          const s = d.source && typeof d.source === 'object' ? d.source.id : d.source;
          const t = d.target && typeof d.target === 'object' ? d.target.id : d.target;
          const srcVisible = visibleIds.has(s);
          const tgtVisible = visibleIds.has(t);
          // Link fully visible only if BOTH endpoints are visible
          if (srcVisible && tgtVisible) return 0.6;
          // One endpoint visible → partial
          if (srcVisible || tgtVisible) return config.dimLinkOpacity * 2;
          return config.dimLinkOpacity;
        });
    }
  }

  /* ── Center graph view on user's node (smooth animation) ─── */
  function _centerOnUserNode(core) {
    if (!core || !window.d3) return;
    const userId = _userId || core.currentUserCommunityId;
    const userNode = core.nodes && core.nodes.find(n => n.id === userId);
    if (!userNode) {
      console.warn('[GraphController] User node not found for centering');
      return;
    }
    _centerOnNode(userNode, core.svg, core.zoomBehavior);
  }

  function _centerOnNode(node, svg, zoomBehavior) {
    if (!node || !svg || !zoomBehavior || !window.d3) return;

    // Account for dashboard width on desktop
    const dashWidth = window.innerWidth >= 1024 ? 320 : 0;
    const w = window.innerWidth - dashWidth;
    const h = window.innerHeight;
    const scale = 1.3;

    const x = -node.x * scale + dashWidth + w / 2;
    const y = -node.y * scale + h / 2;

    svg
      .transition()
      .duration(750)
      .ease(window.d3.easeCubicInOut)
      .call(
        zoomBehavior.transform,
        window.d3.zoomIdentity.translate(x, y).scale(scale)
      );
  }

  /* ================================================================
     PUBLIC API
     ================================================================ */

  /**
   * setTier(tierLevel: 1 | 2 | 3)
   * Apply desktop tier: compute hop visibility, update opacity, center if Tier 1.
   */
  function setTier(tierLevel) {
    const config = TIER_CONFIG[tierLevel];
    if (!config) {
      console.warn(`[GraphController] Unknown tier: ${tierLevel}`);
      return;
    }
    _currentTier = tierLevel;

    const core = _core();
    if (!core || !core.nodes || !core.nodeEls) {
      // Graph not ready yet — will be applied when graph initializes
      console.warn('[GraphController] synapseCore not ready — tier queued');
      return;
    }

    const userId = _userId || core.currentUserCommunityId;
    const links = core.links || [];

    // Build visible set
    const visibleIds = _computeHopSet(core.nodes, links, userId, config.hops);

    // Apply opacity
    _applyTierOpacity(core.nodeEls, core.linkEls, visibleIds, config);

    // Center on user for Tier 1
    if (config.centerOnUser) {
      setTimeout(() => _centerOnUserNode(core), 200); // slight delay for graph to settle
    }

    console.log(
      `[GraphController] ${config.label} applied — ` +
      `${visibleIds.size}/${core.nodes.length} nodes visible, userId=${userId}`
    );
  }

  /**
   * focusNode(id)
   * Open node card (preserves existing node-click behavior) + center graph on it.
   */
  function focusNode(id) {
    if (!id) return;
    const core = _core();
    if (!core) return;

    const node = core.nodes && core.nodes.find(n => n.id === id);
    if (!node) {
      console.warn(`[GraphController] focusNode: node ${id} not found`);
      return;
    }

    // Preserve existing click → card behavior
    if (typeof window.openNodePanel === 'function') {
      window.openNodePanel(node);
    }

    // Also center graph
    _centerOnNode(node, core.svg, core.zoomBehavior);
  }

  /**
   * focusNeighborhood(id, hops)
   * Center graph on node and apply distance-based dimming from it.
   * Relies on existing focus-system.js when available.
   */
  function focusNeighborhood(id, hops = 1) {
    const core = _core();
    if (!core) return;

    const node = core.nodes && core.nodes.find(n => n.id === id);
    if (!node) return;

    // Try focus-system first (existing function, more sophisticated)
    // It's an ES module but may be re-exported via events
    window.dispatchEvent(new CustomEvent('synapse:focus-node', {
      detail: { nodeId: id, skipToast: true }
    }));

    // Fallback: manual center + tier-scoped visibility from this node
    setTimeout(() => {
      const core2 = _core();
      if (!core2) return;
      _centerOnNode(node, core2.svg, core2.zoomBehavior);
    }, 100);
  }

  /**
   * highlightNodes(ids: string[])
   * Temporarily highlight specific nodes (others dimmed).
   */
  function highlightNodes(ids) {
    const core = _core();
    if (!core || !core.nodeEls) return;
    const idSet = new Set(ids);
    core.nodeEls
      .transition()
      .duration(300)
      .style('opacity', d => idSet.has(d.id) ? 1.0 : 0.15);
    if (core.linkEls) {
      core.linkEls
        .transition()
        .duration(300)
        .style('opacity', d => {
          const s = d.source?.id || d.source;
          const t = d.target?.id || d.target;
          return (idSet.has(s) || idSet.has(t)) ? 0.5 : 0.05;
        });
    }
  }

  /**
   * dimByTier(tierLevel)
   * Alias for setTier (used externally for clarity).
   */
  function dimByTier(tierLevel) {
    setTier(tierLevel);
  }

  /**
   * resetToTierDefault()
   * Re-apply current tier (useful after focusNode to restore tier view).
   */
  function resetToTierDefault() {
    setTier(_currentTier);
  }

  /**
   * initialize(userId: string)
   * Call after profile-loaded event on desktop.
   * Polls until synapseCore is available, then applies Tier 1.
   */
  function initialize(userId) {
    if (_initialized) return;
    _initialized = true;
    _userId = userId;

    console.log('[GraphController] Initializing for desktop (Tier 1 default)...');

    // Poll until synapseCore has loaded nodes
    let attempts = 0;
    const maxAttempts = 40; // 20 seconds max (500ms × 40)

    const tryApplyDefault = () => {
      const core = _core();
      const hasNodes = core && core.nodes && core.nodes.length > 0;
      const hasD3Els = core && core.nodeEls && core.nodeEls.size && core.nodeEls.size() > 0;

      if (hasNodes && hasD3Els) {
        setTier(1);
        console.log('[GraphController] Default Tier 1 applied on init');
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryApplyDefault, 500);
      } else {
        console.warn('[GraphController] Timed out waiting for synapseCore — Tier 1 not applied');
      }
    };

    setTimeout(tryApplyDefault, 800); // give synapse a head start
  }

  /**
   * getCurrentTier()
   * Returns the current active tier (1 | 2 | 3).
   */
  function getCurrentTier() {
    return _currentTier;
  }

  /* ── Public interface ──────────────────────────────────────── */
  return {
    initialize,
    setTier,
    focusNode,
    focusNeighborhood,
    highlightNodes,
    dimByTier,
    resetToTierDefault,
    getCurrentTier,
  };

})();

console.log('[GraphController] Loaded — window.GraphController ready');
