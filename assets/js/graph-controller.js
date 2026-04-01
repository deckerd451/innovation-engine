/**
 * ================================================================
 * GRAPH CONTROLLER — Desktop Tier Control + Focus API
 * ================================================================
 *
 * Exposed as: window.GraphController
 *
 * Delegates to the Unified Network API for tier control, node focus,
 * and graph centering. Maps desktop tier levels (1/2/3) to unified
 * network tier strings (T1/T2/T3).
 *
 * TIER MODEL (Desktop):
 *   Tier 1 — You:        Direct connections only.
 *   Tier 2 — Extended:   Clusters near user visible.
 *   Tier 3 — Ecosystem:  All nodes fully visible.
 * ================================================================
 */

window.GraphController = (() => {
  'use strict';

  const TIER_MAP = { 1: 'T1', 2: 'T2', 3: 'T3' };

  let _currentTier = 3;
  let _userId = null;
  let _initialized = false;

  function _api() {
    return window.unifiedNetworkIntegration?.api || null;
  }

  function setTier(tierLevel) {
    if (!TIER_MAP[tierLevel]) {
      console.warn(`[GraphController] Unknown tier: ${tierLevel}`);
      return;
    }
    _currentTier = tierLevel;

    const api = _api();
    if (api && typeof api.applyTier === 'function') {
      api.applyTier(TIER_MAP[tierLevel]);
      console.log(`[GraphController] Tier ${tierLevel} applied via unified network`);
    } else {
      console.warn('[GraphController] Unified network API not ready — tier queued');
    }
  }

  function focusNode(id) {
    if (!id) return;
    const api = _api();
    if (api && typeof api.focusNode === 'function') {
      // Guard: only focus person nodes (graph is people-only)
      const node = api.getNode?.(id);
      if (!node) {
        console.log(`[GraphController] focusNode(${id}) — not a graph node, ignoring`);
        return;
      }
      api.focusNode(id);
    }
    if (typeof window.openNodePanel === 'function') {
      const node = api?.getNode?.(id);
      if (node) window.openNodePanel(node);
    }
  }

  function focusNeighborhood(id, hops = 1) {
    if (!id) return;
    const api = _api();
    if (api && typeof api.focusNode === 'function') {
      api.focusNode(id, { skipDimming: true });
    }
  }

  function highlightNodes(ids) {
    // No-op: unified network handles highlighting internally
    console.log('[GraphController] highlightNodes delegated to unified network');
  }

  function dimByTier(tierLevel) {
    setTier(tierLevel);
  }

  function resetToTierDefault() {
    setTier(_currentTier);
  }

  function initialize(userId) {
    if (_initialized) return;
    _initialized = true;
    _userId = userId;

    console.log('[GraphController] Initializing for desktop (Tier 3 ecosystem)...');

    // Wait for unified network to be ready, then apply default tier
    let attempts = 0;
    const maxAttempts = 40;

    const tryApplyDefault = () => {
      const api = _api();
      if (api && typeof api.applyTier === 'function' && api.isInitialized()) {
        setTier(3);
        console.log('[GraphController] Default Tier 3 applied on init');
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryApplyDefault, 500);
      } else {
        console.warn('[GraphController] Timed out waiting for unified network — Tier 3 not applied');
      }
    };

    setTimeout(tryApplyDefault, 800);
  }

  function getCurrentTier() {
    return _currentTier;
  }

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
