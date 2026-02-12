// ═══════════════════════════════════════════════════════════════════════════
// SCALE-REACTIVE TIER CONTROLLER
// Mobile-only zoom-based tier system for Innovation Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Purpose:
//   Adjust network representation based on zoom + intent on mobile devices
//   - Tier 0 (Personal Hub): >= 2.4x zoom, focused node + first-degree neighbors
//   - Tier 1 (Relational Network): 1.25-2.2x zoom, standard behavior
//   - Tier 2 (Ecosystem Discovery): < 1.1x zoom, discovery mode
//
// Feature Flag:
//   - localStorage["ie_mobile_scale_reactive"] = "true" | "false"
//   - URL params: ?scaleReactive=1 (enable) / ?scaleReactive=0 (disable)
//   - Auto-detects mobile: (max-width: 768px) AND (pointer: coarse)
//
// Desktop Safety:
//   - Early return if flag disabled or not mobile
//   - Zero listeners installed on desktop
//   - No performance impact
//
// Integration:
//   - Called from synapse/core.js after initialization
//   - Uses existing knobs (Quiet Mode, Focus System, State Manager)
//   - No refactoring of graph engine
//
// ═══════════════════════════════════════════════════════════════════════════

// Import focus system (verified exports)
import { setFocusOnNode, clearFocusEffects } from './synapse/focus-system.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const THRESHOLDS = {
  // Tier 0: Personal Hub (very close zoom)
  TIER_0_ENTER: 2.4,   // Enter at >= 2.4x
  TIER_0_EXIT: 2.2,    // Exit at < 2.2x (hysteresis: 0.2)

  // Tier 2: Ecosystem Discovery (far zoom)
  TIER_2_ENTER: 1.1,   // Enter at < 1.1x
  TIER_2_EXIT: 1.25,   // Exit at >= 1.25x (hysteresis: 0.15)

  // Tier 1: Relational Network (implicit: 1.25 <= zoom < 2.2)
};

const DWELL_TIME_MS = 250;    // Min dwell time before tier change
const DEBOUNCE_MS = 250;      // Min time between tier changes
const IDLE_THRESHOLD_MS = 12000; // 12 seconds idle threshold

// ═══════════════════════════════════════════════════════════════════════════
// URL PARAM HANDLING
// ═══════════════════════════════════════════════════════════════════════════

// Parse URL params and persist to localStorage
const urlParams = new URLSearchParams(window.location.search);
const scaleReactiveParam = urlParams.get('scaleReactive');

if (scaleReactiveParam === '1') {
  localStorage.setItem('ie_mobile_scale_reactive', 'true');
  console.info('[ScaleTier] Feature enabled via URL param');
} else if (scaleReactiveParam === '0') {
  localStorage.setItem('ie_mobile_scale_reactive', 'false');
  console.info('[ScaleTier] Feature disabled via URL param');
}

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function isMobileEnabled() {
  // Check feature flag
  const flagEnabled = localStorage.getItem('ie_mobile_scale_reactive') === 'true';
  if (!flagEnabled) return false;

  // Check mobile criteria
  const isMobileWidth = window.matchMedia('(max-width: 768px)').matches;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

  return isMobileWidth && isCoarsePointer;
}

// ═══════════════════════════════════════════════════════════════════════════
// IDLE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

let lastInteractionTime = Date.now();

function setupIdleTracking() {
  const events = ['mousedown', 'mousemove', 'touchstart', 'touchmove', 'keydown', 'wheel'];
  events.forEach(eventType => {
    window.addEventListener(eventType, () => {
      lastInteractionTime = Date.now();
    }, { passive: true });
  });
}

function getIdleDuration() {
  return Date.now() - lastInteractionTime;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTION TRACKING (via wrapping window.openNodePanel)
// ═══════════════════════════════════════════════════════════════════════════

let lastSelectedNodeData = null;

function wrapNodePanelForSelectionCapture() {
  const originalOpenPanel = window.openNodePanel;

  if (!originalOpenPanel) {
    console.warn('[ScaleTier] window.openNodePanel not found, selection tracking disabled');
    return;
  }

  window.openNodePanel = function(nodeData) {
    // Capture selection
    lastSelectedNodeData = nodeData;

    // Call original function
    return originalOpenPanel.call(this, nodeData);
  };
}

function getLastSelectedNode() {
  // If panel is closed, clear selection
  const panelOpen = document.getElementById('node-side-panel')?.classList.contains('open');
  if (!panelOpen) {
    lastSelectedNodeData = null;
  }
  return lastSelectedNodeData;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isPanelOpen() {
  const panel = document.getElementById('node-side-panel');
  return panel?.classList.contains('open') || false;
}

function isSearchActive(networkFilters) {
  if (!networkFilters) return false;

  const state = networkFilters.getState();

  // Signal A: Query has 2+ characters
  const hasQuery = state.query && state.query.trim().length >= 2;

  // Signal B: Filter panel is open (user actively filtering)
  const overlay = document.getElementById('network-filters-overlay');
  const filterPanelOpen = overlay && !overlay.classList.contains('hidden');

  return hasQuery || filterPanelOpen;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

function createStateAdapter(synapseCore, networkFilters, getCurrentZoom) {
  return function getState() {
    return {
      zoom: getCurrentZoom(),
      selectedNode: getLastSelectedNode(),
      panelOpen: isPanelOpen(),
      searchActive: isSearchActive(networkFilters),
      filterState: networkFilters ? networkFilters.getState() : null,
      nodes: synapseCore.nodes || [],
      links: synapseCore.links || [],
      idleDuration: getIdleDuration(),
      timestamp: Date.now()
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER APPLICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function applyTier0(synapseCore, decision) {
  // Tier 0: Personal Hub
  // - Enable Quiet Mode (focused + top 11 first-degree neighbors)
  // - Focus on selected node
  // - Reduce FPS to calm

  if (window.QuietMode && !window.QuietMode.isEnabled()) {
    window.QuietMode.enable('scale-tier-0');
  }

  // Focus on selected node if available
  if (decision.selectedNode) {
    try {
      setFocusOnNode(
        decision.selectedNode,
        synapseCore.svg,
        synapseCore.container,
        synapseCore.zoomBehavior,
        synapseCore.nodeEls,
        synapseCore.linkEls,
        synapseCore.nodes
      );
    } catch (err) {
      console.warn('[ScaleTier] Focus failed:', err);
    }
  }

  // Set calm FPS (optional, safe fallback)
  window.stateManager?.setCalm(true);
}

function applyTier1(synapseCore, decision) {
  // Tier 1: Relational Network
  // - Disable Quiet Mode (restore full network)
  // - Clear focus effects
  // - Set active FPS

  if (window.QuietMode?.isEnabled()) {
    window.QuietMode.disable('scale-tier-1');
  }

  try {
    clearFocusEffects(synapseCore.nodeEls, synapseCore.linkEls);
  } catch (err) {
    console.warn('[ScaleTier] Clear focus failed:', err);
  }

  window.stateManager?.setCalm(false);
}

function applyTier2(synapseCore, decision) {
  // Tier 2: Ecosystem Discovery
  // - Disable Quiet Mode
  // - Clear focus effects
  // - Transition to Discovery Mode
  // - Active FPS

  if (window.QuietMode?.isEnabled()) {
    window.QuietMode.disable('scale-tier-2');
  }

  try {
    clearFocusEffects(synapseCore.nodeEls, synapseCore.linkEls);
  } catch (err) {
    console.warn('[ScaleTier] Clear focus failed:', err);
  }

  window.stateManager?.transitionToDiscovery();
  window.stateManager?.setCalm(false);

  // DO NOT reset filters - user selections preserved
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER APPLICATOR (Idempotent, Diff-Based)
// ═══════════════════════════════════════════════════════════════════════════

function createTierApplicator(synapseCore) {
  let lastAppliedTier = null;

  return function applyTier(decision) {
    // Idempotency check
    if (lastAppliedTier === decision.tier) {
      return;
    }

    // Dev logging (only when flag enabled)
    if (localStorage.getItem('ie_mobile_scale_reactive') === 'true') {
      console.info('[ScaleTier]', decision.reason, {
        tier: decision.tier,
        previousTier: decision.previousTier,
        zoom: decision.zoom.toFixed(2),
        searchActive: decision.searchActive,
        panelOpen: decision.panelOpen
      });
    }

    // Apply tier-specific changes
    switch (decision.tier) {
      case 0: applyTier0(synapseCore, decision); break;
      case 1: applyTier1(synapseCore, decision); break;
      case 2: applyTier2(synapseCore, decision); break;
      default:
        console.warn('[ScaleTier] Unknown tier:', decision.tier);
    }

    lastAppliedTier = decision.tier;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER DECISION ENGINE (with Hysteresis)
// ═══════════════════════════════════════════════════════════════════════════

class TierDecider {
  constructor(thresholds) {
    this.thresholds = thresholds;
    this.currentTier = 1; // Start in Tier 1 (default)
    this.lastTierChangeTime = 0;
    this.lastZoomValue = 1.0;
    this.zoomDwellStartTime = Date.now();
  }

  decideTier(state) {
    const { zoom } = state;
    const now = Date.now();

    // Track zoom dwell time (reset if zoom changed)
    const zoomChanged = Math.abs(zoom - this.lastZoomValue) > 0.01;
    if (zoomChanged) {
      this.zoomDwellStartTime = now;
      this.lastZoomValue = zoom;
    }
    const dwellTime = now - this.zoomDwellStartTime;

    // Calculate proposed tier from zoom + hysteresis
    let proposedTier = this.calculateTierFromZoom(zoom);

    // Override based on intent (priority order)
    if (state.searchActive) {
      // Force Tier 2 during search
      proposedTier = 2;
    } else if (state.panelOpen || state.selectedNode) {
      // Cap at Tier 1 if panel open or node selected
      proposedTier = Math.min(proposedTier, 1);
    } else if (state.idleDuration > IDLE_THRESHOLD_MS) {
      // Idle > 12s: apply calm FPS without changing tier
      this.applyIdleOverlay();
      return null; // No tier change
    }

    // Check if transition allowed (dwell + debounce)
    const timeSinceLastChange = now - this.lastTierChangeTime;
    const transitionAllowed = dwellTime >= DWELL_TIME_MS && timeSinceLastChange >= DEBOUNCE_MS;

    if (!transitionAllowed || proposedTier === this.currentTier) {
      return null; // No change
    }

    // Build decision object
    const decision = {
      tier: proposedTier,
      previousTier: this.currentTier, // Before change
      zoom,
      reason: this.generateReason(proposedTier, state),
      searchActive: state.searchActive,
      panelOpen: state.panelOpen,
      selectedNode: state.selectedNode,
      idleDuration: state.idleDuration,
      dwellTime,
      transitionAllowed: true
    };

    // Update state AFTER building decision
    this.currentTier = proposedTier;
    this.lastTierChangeTime = now;

    return decision;
  }

  calculateTierFromZoom(zoom) {
    const { TIER_0_ENTER, TIER_0_EXIT, TIER_2_ENTER, TIER_2_EXIT } = this.thresholds;

    // Apply hysteresis based on current tier
    if (this.currentTier === 0) {
      // Currently in Tier 0: use EXIT threshold to leave
      return zoom >= TIER_0_EXIT ? 0 : 1;
    } else if (this.currentTier === 2) {
      // Currently in Tier 2: use EXIT threshold to leave
      return zoom < TIER_2_EXIT ? 2 : 1;
    } else {
      // Currently in Tier 1: use ENTER thresholds
      if (zoom >= TIER_0_ENTER) return 0;
      if (zoom < TIER_2_ENTER) return 2;
      return 1;
    }
  }

  applyIdleOverlay() {
    // Reduce FPS during idle (soft quiet mode)
    window.stateManager?.setCalm(true);
  }

  generateReason(tier, state) {
    if (state.searchActive) return 'Search active → Discovery';
    if (state.panelOpen) return 'Panel open → Relational cap';
    if (tier === 0) return `Zoom ${state.zoom.toFixed(2)}× → Personal Hub`;
    if (tier === 1) return `Zoom ${state.zoom.toFixed(2)}× → Relational`;
    if (tier === 2) return `Zoom ${state.zoom.toFixed(2)}× → Discovery`;
    return 'Unknown reason';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

let initialized = false;

export function initScaleTierController(config) {
  // Guard: only init once
  if (initialized) {
    console.warn('[ScaleTier] Already initialized');
    return;
  }

  // Guard: check if mobile + flag enabled
  if (!isMobileEnabled()) {
    console.info('[ScaleTier] Not enabled (flag off or not mobile)');
    return;
  }

  initialized = true;
  console.info('[ScaleTier] Initializing mobile scale-reactive tier system');

  // STEP 1 DEBUG: PROVE INIT RUNS
  document.body.style.outline = "5px solid red";
  console.error("[ScaleTier] ACTIVE");

  // Extract config
  const { synapseCore, networkFilters, getCurrentZoom } = config;

  if (!synapseCore || !getCurrentZoom) {
    console.error('[ScaleTier] Missing required config (synapseCore or getCurrentZoom)');
    return;
  }

  // Setup components
  setupIdleTracking();
  wrapNodePanelForSelectionCapture();

  // Create adapters
  const getState = createStateAdapter(synapseCore, networkFilters, getCurrentZoom);
  const applyTier = createTierApplicator(synapseCore);
  const decider = new TierDecider(THRESHOLDS);

  // Main loop: check tiers periodically
  let rafId = null;

  function checkTiers() {
    try {
      // STEP 3 DEBUG: LOG ZOOM VALUE LIVE
      console.log("Zoom:", getCurrentZoom());

      const state = getState();

      // STEP 2 DEBUG: FORCE TIER 0 MANUALLY
      applyTier({
        tier: 0,
        previousTier: 1,
        zoom: 3.0,
        reason: "FORCED DEBUG",
        searchActive: false,
        panelOpen: false,
        selectedNode: null,
        idleDuration: 0,
        dwellTime: 999,
        transitionAllowed: true
      });

      // Original logic (commented out for debug)
      // const decision = decider.decideTier(state);
      // if (decision) {
      //   applyTier(decision);
      // }
    } catch (err) {
      console.error('[ScaleTier] Error in tier check:', err);
    }

    // Continue loop
    rafId = requestAnimationFrame(checkTiers);
  }

  // Start loop
  rafId = requestAnimationFrame(checkTiers);

  console.info('[ScaleTier] Initialized successfully');

  // Return cleanup function (optional)
  return {
    destroy: () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      initialized = false;
      console.info('[ScaleTier] Destroyed');
    }
  };
}

// Export helper for external access if needed
export function setLastSelectedNode(nodeData) {
  lastSelectedNodeData = nodeData;
}
