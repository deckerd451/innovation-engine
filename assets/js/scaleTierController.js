// ═══════════════════════════════════════════════════════════════════════════
// SCALE-REACTIVE TIER CONTROLLER (REWRITTEN — FIXED)
// Mobile-only zoom-based tier system for Innovation Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Key guarantees (this rewrite):
// - NO top-level side effects (no localStorage writes, no console logs) on import
// - Mobile-only + feature-flag guarded initialization
// - Selection capture via safe wrapper that preserves arguments
// - Throttled evaluation loop (not per-frame heavy)
// - Clean destroy(): restores wrapped globals + removes listeners
//
// Activation:
// - localStorage["ie_mobile_scale_reactive"] === "true"
// - URL params (handled ONLY inside init):
//     ?scaleReactive=1  -> enable (persist)
//     ?scaleReactive=0  -> disable (persist)
// - Mobile gate:
//     (max-width: 768px) AND (pointer: coarse)
//
// ═══════════════════════════════════════════════════════════════════════════

import { setFocusOnNode, clearFocusEffects } from "./synapse/focus-system.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const THRESHOLDS = {
  TIER_0_ENTER: 2.4,
  TIER_0_EXIT: 2.2,
  TIER_2_ENTER: 1.1,
  TIER_2_EXIT: 1.25,
};

const DWELL_TIME_MS = 250;
const DEBOUNCE_MS = 250;
const IDLE_THRESHOLD_MS = 12000;
const EVAL_TICK_MS = 120; // ~8Hz

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL STATE (module-scoped, no side effects)
// ═══════════════════════════════════════════════════════════════════════════

let initialized = false;

// Selection tracking
let lastSelectedNodeData = null;

// Idle tracking
let lastInteractionTime = Date.now();
let idleListenersAttached = false;
const idleListenerRemovers = [];

// Wrapping globals (panel)
let panelWrapped = false;
let originalOpenNodePanel = null;
let originalCloseNodePanel = null;

// Loop control
let rafId = null;
let lastEvalTs = 0;

function devLog(...args) {
  if (localStorage.getItem("ie_mobile_scale_reactive") === "true") {
    console.info(...args);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAG + MOBILE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function isMobileDevice() {
  const isMobileWidth = window.matchMedia("(max-width: 768px)").matches;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return isMobileWidth && isCoarsePointer;
}

function isFeatureEnabled() {
  return localStorage.getItem("ie_mobile_scale_reactive") === "true";
}

function isMobileEnabled() {
  return isFeatureEnabled() && isMobileDevice();
}

function applyUrlOverridesOnce() {
  const param = new URLSearchParams(window.location.search).get("scaleReactive");
  if (param === "1") localStorage.setItem("ie_mobile_scale_reactive", "true");
  else if (param === "0") localStorage.setItem("ie_mobile_scale_reactive", "false");
}

// ═══════════════════════════════════════════════════════════════════════════
// IDLE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

function setupIdleTracking() {
  if (idleListenersAttached) return;
  idleListenersAttached = true;

  const events = ["mousedown", "mousemove", "touchstart", "touchmove", "keydown", "wheel"];
  const handler = () => {
    lastInteractionTime = Date.now();
  };

  events.forEach((evt) => {
    window.addEventListener(evt, handler, { passive: true });
    idleListenerRemovers.push(() => window.removeEventListener(evt, handler));
  });
}

function teardownIdleTracking() {
  while (idleListenerRemovers.length) {
    try {
      idleListenerRemovers.pop()();
    } catch {
      // ignore
    }
  }
  idleListenersAttached = false;
}

function getIdleDuration() {
  return Date.now() - lastInteractionTime;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTION TRACKING (wrap window.openNodePanel / closeNodePanel)
// ═══════════════════════════════════════════════════════════════════════════

function wrapNodePanelForSelectionCapture() {
  if (panelWrapped) return;

  const openFn = window.openNodePanel;
  const closeFn = window.closeNodePanel;

  if (typeof openFn !== "function") {
    console.warn("[ScaleTier] window.openNodePanel not found; selection tracking disabled");
    return;
  }

  originalOpenNodePanel = openFn;
  originalCloseNodePanel = typeof closeFn === "function" ? closeFn : null;

  window.openNodePanel = function (...args) {
    lastSelectedNodeData = args[0] ?? null;
    return originalOpenNodePanel.apply(this, args);
  };

  if (originalCloseNodePanel) {
    window.closeNodePanel = function (...args) {
      lastSelectedNodeData = null;
      return originalCloseNodePanel.apply(this, args);
    };
  }

  panelWrapped = true;
}

function unwrapNodePanel() {
  if (!panelWrapped) return;

  try {
    if (originalOpenNodePanel) window.openNodePanel = originalOpenNodePanel;
    if (originalCloseNodePanel) window.closeNodePanel = originalCloseNodePanel;
  } catch {
    // ignore
  } finally {
    panelWrapped = false;
    originalOpenNodePanel = null;
    originalCloseNodePanel = null;
    lastSelectedNodeData = null;
  }
}

function isPanelOpen() {
  const panel = document.getElementById("node-side-panel");
  return panel?.classList.contains("open") || false;
}

function getLastSelectedNode() {
  if (!isPanelOpen()) lastSelectedNodeData = null;
  return lastSelectedNodeData;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH + FILTER STATE
// ═══════════════════════════════════════════════════════════════════════════

function isSearchActive(networkFilters) {
  try {
    if (!networkFilters || typeof networkFilters.getState !== "function") return false;

    const state = networkFilters.getState() || {};
    const hasQuery = typeof state.query === "string" && state.query.trim().length >= 2;

    const overlay = document.getElementById("network-filters-overlay");
    const filterPanelOpen = !!(overlay && !overlay.classList.contains("hidden"));

    return hasQuery || filterPanelOpen;
  } catch {
    return false;
  }
}

function safeFilterState(networkFilters) {
  try {
    if (!networkFilters || typeof networkFilters.getState !== "function") return null;
    return networkFilters.getState();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

function createStateAdapter(synapseCore, networkFilters, getCurrentZoom) {
  return function getState() {
    return {
      zoom: Number(getCurrentZoom?.() ?? 1.0),
      selectedNode: getLastSelectedNode(),
      panelOpen: isPanelOpen(),
      searchActive: isSearchActive(networkFilters),
      filterState: safeFilterState(networkFilters),
      nodes: synapseCore?.nodes || [],
      links: synapseCore?.links || [],
      idleDuration: getIdleDuration(),
      timestamp: Date.now(),
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

function applyTier0(synapseCore, decision) {
  if (window.QuietMode && typeof window.QuietMode.isEnabled === "function") {
    if (!window.QuietMode.isEnabled()) window.QuietMode.enable?.("scale-tier-0");
  }

  if (decision.selectedNode) {
    try {
      setFocusOnNode(
        decision.selectedNode,
        synapseCore?.svg,
        synapseCore?.container,
        synapseCore?.zoomBehavior,
        synapseCore?.nodeEls,
        synapseCore?.linkEls,
        synapseCore?.nodes
      );
    } catch (err) {
      console.warn("[ScaleTier] Focus failed:", err);
    }
  }

  window.stateManager?.setCalm?.(true);
  window.stateManager?.transitionToMyNetwork?.();
}

function applyTier1(synapseCore) {
  if (window.QuietMode?.isEnabled?.()) window.QuietMode.disable?.("scale-tier-1");

  try {
    clearFocusEffects(synapseCore?.nodeEls, synapseCore?.linkEls);
  } catch (err) {
    console.warn("[ScaleTier] Clear focus failed:", err);
  }

  window.stateManager?.setCalm?.(false);
  window.stateManager?.transitionToMyNetwork?.();
}

function applyTier2(synapseCore) {
  if (window.QuietMode?.isEnabled?.()) window.QuietMode.disable?.("scale-tier-2");

  try {
    clearFocusEffects(synapseCore?.nodeEls, synapseCore?.linkEls);
  } catch (err) {
    console.warn("[ScaleTier] Clear focus failed:", err);
  }

  window.stateManager?.transitionToDiscovery?.();
  window.stateManager?.setCalm?.(false);
}

function createTierApplicator(synapseCore) {
  let lastAppliedTier = null;

  return function applyTier(decision) {
    if (!decision) return;
    if (lastAppliedTier === decision.tier) return;

    devLog("[ScaleTier]", decision.reason, {
      tier: decision.tier,
      previousTier: decision.previousTier,
      zoom: decision.zoom?.toFixed?.(2),
      searchActive: !!decision.searchActive,
      panelOpen: !!decision.panelOpen,
    });

    if (decision.tier === 0) applyTier0(synapseCore, decision);
    else if (decision.tier === 1) applyTier1(synapseCore);
    else if (decision.tier === 2) applyTier2(synapseCore);
    else console.warn("[ScaleTier] Unknown tier:", decision.tier);

    lastAppliedTier = decision.tier;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER DECISION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

class TierDecider {
  constructor(thresholds) {
    this.thresholds = thresholds;
    this.currentTier = 1;
    this.lastTierChangeTime = 0;
    this.lastZoomValue = 1.0;
    this.zoomDwellStartTime = Date.now();
  }

  decideTier(state) {
    const zoom = Number(state.zoom ?? 1.0);
    const now = Date.now();

    const zoomChanged = Math.abs(zoom - this.lastZoomValue) > 0.01;
    if (zoomChanged) {
      this.zoomDwellStartTime = now;
      this.lastZoomValue = zoom;
    }
    const dwellTime = now - this.zoomDwellStartTime;

    let proposedTier = this.calculateTierFromZoom(zoom);

    if (state.searchActive) proposedTier = 2;
    else if (state.panelOpen || state.selectedNode) proposedTier = Math.min(proposedTier, 1);
    else if ((state.idleDuration ?? 0) > IDLE_THRESHOLD_MS) {
      window.stateManager?.setCalm?.(true);
      return null;
    }

    const timeSinceLastChange = now - this.lastTierChangeTime;
    const transitionAllowed = dwellTime >= DWELL_TIME_MS && timeSinceLastChange >= DEBOUNCE_MS;

    if (!transitionAllowed || proposedTier === this.currentTier) return null;

    const decision = {
      tier: proposedTier,
      previousTier: this.currentTier,
      zoom,
      reason: this.generateReason(proposedTier, state, zoom),
      searchActive: !!state.searchActive,
      panelOpen: !!state.panelOpen,
      selectedNode: state.selectedNode || null,
      idleDuration: Number(state.idleDuration ?? 0),
      dwellTime,
      transitionAllowed: true,
    };

    this.currentTier = proposedTier;
    this.lastTierChangeTime = now;
    return decision;
  }

  calculateTierFromZoom(zoom) {
    const { TIER_0_ENTER, TIER_0_EXIT, TIER_2_ENTER, TIER_2_EXIT } = this.thresholds;

    if (this.currentTier === 0) return zoom >= TIER_0_EXIT ? 0 : 1;
    if (this.currentTier === 2) return zoom < TIER_2_EXIT ? 2 : 1;

    if (zoom >= TIER_0_ENTER) return 0;
    if (zoom < TIER_2_ENTER) return 2;
    return 1;
  }

  generateReason(tier, state, zoom) {
    if (state.searchActive) return "Search active → Discovery";
    if (state.panelOpen) return "Panel open → Relational cap";
    if (tier === 0) return `Zoom ${zoom.toFixed(2)}× → Personal Hub`;
    if (tier === 1) return `Zoom ${zoom.toFixed(2)}× → Relational`;
    if (tier === 2) return `Zoom ${zoom.toFixed(2)}× → Discovery`;
    return "Unknown reason";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function initScaleTierController(config) {
  applyUrlOverridesOnce();

  if (initialized) return;
  if (!isMobileEnabled()) return;

  initialized = true;

  const { synapseCore, networkFilters, getCurrentZoom } = config || {};
  if (!synapseCore || typeof getCurrentZoom !== "function") {
    console.warn("[ScaleTier] Missing required config; not initializing");
    initialized = false;
    return;
  }

  devLog("[ScaleTier] Initializing mobile scale-reactive tier system");

  setupIdleTracking();
  wrapNodePanelForSelectionCapture();

  const getState = createStateAdapter(synapseCore, networkFilters, getCurrentZoom);
  const applyTier = createTierApplicator(synapseCore);
  const decider = new TierDecider(THRESHOLDS);

  lastEvalTs = 0;

  function loop(ts) {
    try {
      if (ts - lastEvalTs >= EVAL_TICK_MS) {
        lastEvalTs = ts;

        const state = getState();
        const decision = decider.decideTier(state);
        if (decision) applyTier(decision);
      }
    } catch (err) {
      console.error("[ScaleTier] Loop error:", err);
    }

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  return {
    destroy: () => {
      try {
        if (rafId) cancelAnimationFrame(rafId);
      } catch {
        // ignore
      }
      rafId = null;

      teardownIdleTracking();
      unwrapNodePanel();

      initialized = false;
      devLog("[ScaleTier] Destroyed");
    },
  };
}

export function setLastSelectedNode(nodeData) {
  lastSelectedNodeData = nodeData ?? null;
}
