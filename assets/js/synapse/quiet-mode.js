// ================================================================
// Synapse Quiet Mode v1 (Unified-safe + Persisted + Event-driven)
// ================================================================
// Goals:
// 1) Do NOT assume Quiet Mode is enabled by default
// 2) Keep state in sync with persisted preference key used by the checkbox
// 3) Avoid touching legacy D3 handles unless they exist
// 4) In unified mode (no D3 handles), emit events + avoid DOM operations
// 5) Provide enable()/disable()/isEnabled() and listen to quiet-mode-change
// ================================================================

/* ==========================================================================
   CONFIGURATION
   ========================================================================== */

const QUIET_MODE_CONFIG = {
  // Feature availability flag (not the user's preference)
  featureEnabled: true,

  // Canonical preference key (matches what you found in localStorage)
  prefKey: "quiet-mode-enabled", // "true" / "false"

  // Legacy keys to migrate (best-effort)
  legacyKeys: ["quiet_mode", "quietMode", "quietModeEnabled"],

  // Node limits
  maxVisibleNodes: 12,
  showOnlyFirstDegree: true,

  // Visual rules
  nodeScale: {
    user: 1.0,
    connection: 0.8,
    focused: 1.1,
  },

  colors: {
    user: "#00e0ff",
    connection: "#8899aa",
    focused: "#00e0ff",
    line: "rgba(136, 153, 170, 0.3)",
  },

  // Motion
  allowedMotion: ["focus", "search", "cta"],
  transitionDuration: 200,

  // Touch
  minTouchTarget: 44,
};

const state = {
  initialized: false,
  enabled: false, // mirrors persisted preference
  synapseCore: null,

  // quiet mode internal state
  focusedNode: null,
  searchQuery: "",
  activeCTA: null,
  visibleNodes: new Set(),
  relevanceScores: new Map(),

  // to restore UI after disabling
  uiWasHidden: false,
};

function log(...args) {
  console.log("🔇", ...args);
}
function warn(...args) {
  console.warn("🔇", ...args);
}

/* ==========================================================================
   PREFERENCE (PERSISTENCE)
   ========================================================================== */

function readPrefRaw() {
  try {
    return localStorage.getItem(QUIET_MODE_CONFIG.prefKey);
  } catch {
    return null;
  }
}

function writePrefRaw(val) {
  try {
    localStorage.setItem(QUIET_MODE_CONFIG.prefKey, val);
  } catch {
    // ignore
  }
}

function migrateLegacyKeysIfNeeded() {
  const raw = readPrefRaw();
  if (raw === "true" || raw === "false") return;

  try {
    for (const k of QUIET_MODE_CONFIG.legacyKeys) {
      const v = localStorage.getItem(k);
      if (v == null) continue;

      const enabled = v === "1" || v === "true";
      writePrefRaw(enabled ? "true" : "false");
      log(`Migrated legacy quiet pref from "${k}" -> "${QUIET_MODE_CONFIG.prefKey}" = ${enabled}`);
      return;
    }
  } catch {
    // ignore
  }
}

function readQuietPref() {
  migrateLegacyKeysIfNeeded();
  const raw = readPrefRaw();
  return raw === "true"; // default false if null/invalid
}

function setQuietPref(enabled) {
  writePrefRaw(enabled ? "true" : "false");
}

/* ==========================================================================
   ENV DETECTION (LEGACY D3 VS UNIFIED)
   ========================================================================== */

function hasLegacyD3Handles(core) {
  // legacy quiet mode expects nodeEls/linkEls and window.d3
  return !!(core && core.nodeEls && typeof window.d3 !== "undefined");
}

function getCoreUserId(core) {
  return core?.currentUserCommunityId || core?.currentUserId || core?.currentUser?.id || null;
}

function getNodesAndLinks(core) {
  const nodes = core?.nodes || core?.data?.nodes || null;
  const links = core?.links || core?.data?.links || null;
  return { nodes, links };
}

/* ==========================================================================
   PUBLIC API
   ========================================================================== */

export function initQuietMode(synapseCore) {
  if (!QUIET_MODE_CONFIG.featureEnabled) {
    log("Quiet Mode feature disabled (feature flag OFF)");
    return;
  }

  // Safe init
  state.synapseCore = synapseCore || state.synapseCore || null;

  if (state.initialized) {
    // Re-sync preference and (re)apply if needed
    state.enabled = readQuietPref();
    maybeApplyCurrentMode("reinit");
    return;
  }

  state.initialized = true;
  state.enabled = readQuietPref();

  log("Initializing Quiet Mode v1 (event-driven)");
  log("Persisted quiet mode state:", state.enabled);

  // Listen for external changes (checkbox + auto-disable)
  window.addEventListener("quiet-mode-change", onQuietModeChange);

  // Back-compat: if someone emits quiet-mode-disabled, treat as disable
  window.addEventListener("quiet-mode-disabled", () => {
    disable("event_quiet-mode-disabled");
  });

  // Apply initial state
  maybeApplyCurrentMode("init");
}

export function enable(reason = "manual_enable") {
  if (!QUIET_MODE_CONFIG.featureEnabled) return;

  state.enabled = true;
  setQuietPref(true);

  log("Quiet Mode enabled (persisted)", { reason });

  // Apply now if possible
  maybeApplyCurrentMode(reason);

  // Notify others
  window.dispatchEvent(
    new CustomEvent("quiet-mode-change", { detail: { enabled: true, reason } })
  );
}

export function disable(reason = "manual_disable") {
  if (!QUIET_MODE_CONFIG.featureEnabled) return;

  state.enabled = false;
  setQuietPref(false);

  log("Quiet Mode disabled (persisted)", { reason });

  // Restore full view if legacy, otherwise just emit state change
  restoreFullVisualization(reason);

  // Restore UI elements we hid
  showPreviouslyHiddenUI();

  // Notify others
  window.dispatchEvent(
    new CustomEvent("quiet-mode-change", { detail: { enabled: false, reason } })
  );
}

export function isEnabled() {
  state.enabled = readQuietPref();
  return state.enabled;
}

// Back-compat exports expected by other modules
export function applyQuietMode(core = state.synapseCore) {
  apply(core);
}

export function apply(core = state.synapseCore) {
  if (!QUIET_MODE_CONFIG.featureEnabled) return;
  if (!core) {
    warn("No synapse core provided; cannot apply quiet mode");
    return;
  }

  // If unified (no D3), avoid DOM ops and just emit signal
  if (!hasLegacyD3Handles(core)) {
    warn("Legacy D3 handles missing (unified renderer likely). Skipping DOM quiet-mode apply.");
    // Still do preference-driven UI hiding if you want (optional),
    // but safest is to just broadcast that quiet mode is enabled.
    hideForbiddenUI(); // purely DOM (not d3) – still safe
    window.dispatchEvent(
      new CustomEvent("quiet-mode-applied", { detail: { mode: "unified_safe" } })
    );
    return;
  }

  // Legacy D3 path
  try {
    disableOtherModes(core);
    applyLegacyD3QuietMode(core);
    setupQuietInteractions(core);
    setupQuietSearch(core);
    hideForbiddenUI();
    window.dispatchEvent(
      new CustomEvent("quiet-mode-applied", { detail: { mode: "legacy_d3" } })
    );
  } catch (err) {
    warn("Quiet Mode apply failed:", err);
  }
}

/* ==========================================================================
   INTERNAL: EVENT HANDLER
   ========================================================================== */

function onQuietModeChange(e) {
  const enabled = !!e?.detail?.enabled;
  const reason = e?.detail?.reason || "external_change";

  // Sync persisted preference and internal state
  setQuietPref(enabled);
  state.enabled = enabled;

  log("quiet-mode-change received:", { enabled, reason });

  if (enabled) {
    maybeApplyCurrentMode(reason);
  } else {
    restoreFullVisualization(reason);
    showPreviouslyHiddenUI();
  }
}

/* ==========================================================================
   INTERNAL: APPLY CURRENT MODE
   ========================================================================== */

function maybeApplyCurrentMode(reason) {
  // Always re-sync from persisted preference to avoid drift
  state.enabled = readQuietPref();

  if (!state.enabled) {
    // Not enabled => ensure we are not hiding UI from a previous run
    restoreFullVisualization(reason);
    showPreviouslyHiddenUI();
    return;
  }

  // Enabled
  apply(state.synapseCore);
}

/* ==========================================================================
   MODE OVERRIDE
   ========================================================================== */

function disableOtherModes(core) {
  // Disable Progressive Disclosure modes (if present)
  if (window.ProgressiveDisclosure) {
    log("Quiet Mode overriding Progressive Disclosure");
  }

  // Disable any other visualization modes
  if (window.synapseShowFullCommunity !== undefined) {
    window.synapseShowFullCommunity = false;
  }

  // If your core has mode toggles, keep this safe:
  if (core && typeof core.setMode === "function") {
    try {
      core.setMode("quiet");
    } catch {
      // ignore
    }
  }
}

/* ==========================================================================
   LEGACY D3 QUIET MODE: MAIN APPLY
   ========================================================================== */

function applyLegacyD3QuietMode(core) {
  const { nodes, links } = getNodesAndLinks(core);
  const { nodeEls, linkEls } = core;

  if (!nodes || !Array.isArray(nodes) || !nodeEls) {
    warn("No nodes/nodeEls available; cannot apply Quiet Mode (legacy)");
    return;
  }

  const currentUserId = getCoreUserId(core);
  const currentUser =
    nodes.find((n) => n.id === currentUserId || n.isCurrentUser) || null;

  if (!currentUser) {
    warn("Current user not found; cannot apply Quiet Mode");
    return;
  }

  // Calculate relevance scores for connections
  calculateRelevanceScores(nodes, links || [], currentUser);

  // Get visible connections (top N)
  const visibleConnections = getVisibleConnections(nodes, links || [], currentUser);

  // Update visible node set
  state.visibleNodes.clear();
  state.visibleNodes.add(currentUser.id);
  visibleConnections.forEach((n) => state.visibleNodes.add(n.id));

  log(`Showing ${state.visibleNodes.size} nodes (1 user + ${visibleConnections.length} connections)`);

  // Apply visuals
  applyQuietVisuals(nodeEls, linkEls, currentUser, visibleConnections, currentUserId);
}

function calculateRelevanceScores(nodes, links, currentUser) {
  state.relevanceScores.clear();

  nodes.forEach((node) => {
    if (!node || node.id === currentUser.id) return;

    let score = 0;

    // Recent activity (if available)
    if (node.last_activity_date) {
      const daysSince = (Date.now() - new Date(node.last_activity_date)) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 100 - daysSince);
    }

    // Connection count (more connected = more relevant)
    score += (node.connection_count || 0) * 2;

    // Shared skills/interests (if available)
    if (Array.isArray(currentUser.skills) && Array.isArray(node.skills)) {
      const userSkills = new Set(currentUser.skills);
      const shared = node.skills.filter((s) => userSkills.has(s)).length;
      score += shared * 10;
    }

    state.relevanceScores.set(node.id, score);
  });
}

function getVisibleConnections(nodes, links, currentUser) {
  const connectedIds = new Set();

  links.forEach((link) => {
    const s = link?.source?.id ?? link?.source;
    const t = link?.target?.id ?? link?.target;
    if (!s || !t) return;

    if (s === currentUser.id) connectedIds.add(t);
    else if (t === currentUser.id) connectedIds.add(s);
  });

  const connections = nodes.filter((n) => n && connectedIds.has(n.id));

  connections.sort((a, b) => {
    const scoreA = state.relevanceScores.get(a.id) || 0;
    const scoreB = state.relevanceScores.get(b.id) || 0;
    return scoreB - scoreA;
  });

  return connections.slice(0, QUIET_MODE_CONFIG.maxVisibleNodes - 1);
}

/* ==========================================================================
   LEGACY D3 QUIET MODE: VISUAL RULES
   ========================================================================== */

function applyQuietVisuals(nodeEls, linkEls, currentUser, visibleConnections, currentUserId) {
  const visibleIds = new Set([currentUser.id, ...visibleConnections.map((n) => n.id)]);

  nodeEls.each(function (d) {
    const node = window.d3.select(this);
    const isVisible = visibleIds.has(d.id);
    const isUser = d.id === currentUser.id || d.id === currentUserId;

    if (!isVisible) {
      node.style("display", "none");
      return;
    }

    node.style("display", "block").style("opacity", 1);

    // Remove forbidden elements
    node
      .selectAll(
        ".theme-ring, .node-badge, .node-icon, .xp-badge, .streak-badge, .project-glow-bg"
      )
      .remove();

    // Style circle
    const circle = node.select("circle.node-circle");
    if (!circle.empty()) {
      circle
        .attr(
          "r",
          (d.radius || 20) *
            (isUser ? QUIET_MODE_CONFIG.nodeScale.user : QUIET_MODE_CONFIG.nodeScale.connection)
        )
        .attr("fill", isUser ? QUIET_MODE_CONFIG.colors.user : QUIET_MODE_CONFIG.colors.connection)
        .attr("stroke", isUser ? "#fff" : QUIET_MODE_CONFIG.colors.connection)
        .attr("stroke-width", isUser ? 3 : 1.5)
        .style("filter", isUser ? "drop-shadow(0 0 8px rgba(0, 224, 255, 0.4))" : "none")
        .style("animation", "none")
        .style("opacity", 1);
    }

    // Remove outer rings
    node.selectAll(".user-outer-ring, .connection-indicator-ring, .org-outer-ring").remove();

    // Labels: only user visible by default
    const label = node.select("text");
    if (!label.empty()) {
      if (isUser) {
        label.attr("opacity", 1).attr("fill", "#fff").attr("font-weight", "bold").attr("font-size", "14px");
      } else {
        label.attr("opacity", 0);
      }
    }

    // Ensure minimum touch target
    const hitArea = node.select(".touch-hit-area");
    if (hitArea.empty()) {
      node
        .insert("circle", ":first-child")
        .attr("class", "touch-hit-area")
        .attr("r", QUIET_MODE_CONFIG.minTouchTarget / 2)
        .attr("fill", "transparent")
        .attr("pointer-events", "all");
    }
  });

  // Links
  if (linkEls) {
    linkEls.each(function (d) {
      const link = window.d3.select(this);

      const s = d?.source?.id ?? d?.source;
      const t = d?.target?.id ?? d?.target;
      const isVisible = visibleIds.has(s) && visibleIds.has(t);

      if (!isVisible) {
        link.style("display", "none");
        return;
      }

      link
        .style("display", "block")
        .attr("stroke", QUIET_MODE_CONFIG.colors.line)
        .attr("stroke-width", 1)
        .attr("opacity", 0.3)
        .style("animation", "none")
        .attr("marker-end", "none");
    });
  }
}

/* ==========================================================================
   INTERACTIONS (LEGACY D3 ONLY)
   ========================================================================== */

function setupQuietInteractions(core) {
  if (!hasLegacyD3Handles(core)) return;

  const { nodeEls, svg } = core;
  const currentUserId = getCoreUserId(core);

  if (!nodeEls) return;

  // Avoid rebinding multiple times
  nodeEls.on("click.quiet", null);

  // Tap node → focus
  nodeEls.on("click.quiet", function (event, d) {
    event?.stopPropagation?.();

    if (!state.visibleNodes.has(d.id)) return;
    if (d.id === currentUserId) return;

    enterFocusState(d, this, core);
  });

  // Tap background → unfocus
  if (svg && typeof svg.on === "function") {
    svg.on("click.quiet", () => exitFocusState(core));
  }
}

function enterFocusState(nodeData, nodeElement, core) {
  if (!hasLegacyD3Handles(core)) return;

  log("Focus:", nodeData?.name || nodeData?.id);

  state.focusedNode = nodeData.id;

  const node = window.d3.select(nodeElement);
  const { nodeEls, linkEls } = core;
  const currentUserId = getCoreUserId(core);

  // Enlarge focused node slightly
  node
    .select("circle.node-circle")
    .transition()
    .duration(QUIET_MODE_CONFIG.transitionDuration)
    .attr("r", (nodeData.radius || 20) * QUIET_MODE_CONFIG.nodeScale.focused)
    .attr("fill", QUIET_MODE_CONFIG.colors.focused)
    .style("filter", "drop-shadow(0 0 12px rgba(0, 224, 255, 0.6))");

  // Show focused node label
  node
    .select("text")
    .transition()
    .duration(QUIET_MODE_CONFIG.transitionDuration)
    .attr("opacity", 1)
    .attr("fill", "#fff");

  // Fade other nodes
  nodeEls.each(function (d) {
    if (d.id === nodeData.id || d.id === currentUserId) return;

    window.d3
      .select(this)
      .transition()
      .duration(QUIET_MODE_CONFIG.transitionDuration)
      .style("opacity", 0.2);
  });

  // Highlight link between current user and focused node
  if (linkEls) {
    linkEls.each(function (d) {
      const s = d?.source?.id ?? d?.source;
      const t = d?.target?.id ?? d?.target;

      const isConnected =
        (s === nodeData.id || t === nodeData.id) && (s === currentUserId || t === currentUserId);

      window.d3
        .select(this)
        .transition()
        .duration(QUIET_MODE_CONFIG.transitionDuration)
        .attr("opacity", isConnected ? 0.8 : 0.1)
        .attr("stroke-width", isConnected ? 2 : 1);
    });
  }

  // CTA currently disabled
  showCTA(nodeData, nodeElement);
}

function exitFocusState(core) {
  if (!state.focusedNode) return;

  log("Unfocus");
  state.focusedNode = null;

  // Reset visuals to default quiet view
  apply(core);

  hideCTA();
}

/* ==========================================================================
   CTA (disabled)
   ========================================================================== */

function showCTA() {
  // CTA disabled - messaging handled elsewhere
  return;
}

function hideCTA() {
  if (state.activeCTA) {
    state.activeCTA.remove();
    state.activeCTA = null;
  }
}

/* ==========================================================================
   SEARCH
   ========================================================================== */

function setupQuietSearch() {
  // Quiet search removed - using main search bar instead
  log("Quiet mode search disabled - use main search bar");
}

/* ==========================================================================
   HIDE / RESTORE UI
   ========================================================================== */

function hideForbiddenUI() {
  // Only do this when quiet mode is actually enabled
  if (!state.enabled) return;

  // Hide mode switcher
  const modeSwitcher = document.getElementById("synapse-mode-switcher");
  if (modeSwitcher) modeSwitcher.style.display = "none";

  // Hide category toggles
  document
    .querySelectorAll(".category-toggle, .filter-button, .view-toggle")
    .forEach((el) => (el.style.display = "none"));

  // Hide XP/streak UI
  document
    .querySelectorAll(".xp-bar, .streak-indicator, .level-badge, .leaderboard")
    .forEach((el) => (el.style.display = "none"));

  // Hide panels/sidebars
  document
    .querySelectorAll(".floating-panel, .sidebar, .bottom-tray:not(#quiet-search)")
    .forEach((el) => (el.style.display = "none"));

  state.uiWasHidden = true;
  log("Forbidden UI elements hidden");
}

function showPreviouslyHiddenUI() {
  if (!state.uiWasHidden) return;

  const modeSwitcher = document.getElementById("synapse-mode-switcher");
  if (modeSwitcher) modeSwitcher.style.display = "";

  document
    .querySelectorAll(".category-toggle, .filter-button, .view-toggle")
    .forEach((el) => (el.style.display = ""));

  document
    .querySelectorAll(".xp-bar, .streak-indicator, .level-badge, .leaderboard")
    .forEach((el) => (el.style.display = ""));

  document
    .querySelectorAll(".floating-panel, .sidebar, .bottom-tray")
    .forEach((el) => {
      if (!el.classList.contains("hidden")) el.style.display = "";
    });

  state.uiWasHidden = false;
  log("Hidden UI elements restored");
}

/* ==========================================================================
   DISABLE QUIET MODE: RESTORE FULL VISUALIZATION
   ========================================================================== */

function restoreFullVisualization(reason) {
  const core = state.synapseCore;
  if (!core) return;

  // Unified: don't attempt D3 restoration
  if (!hasLegacyD3Handles(core)) {
    log("restoreFullVisualization skipped (unified/no-d3)", { reason });
    return;
  }

  const { nodeEls, linkEls } = core;
  if (!nodeEls) return;

  log("Restoring full visualization (legacy D3)", { reason });

  // Show all nodes
  nodeEls.each(function () {
    const node = window.d3.select(this);
    node.style("display", "block").transition().duration(200).style("opacity", 1);

    node.select("text").transition().duration(200).attr("opacity", 1);
  });

  // Show all links
  if (linkEls) {
    linkEls.each(function () {
      const link = window.d3.select(this);
      link.style("display", "block").transition().duration(200).attr("opacity", 0.6);
    });
  }
}

/* ==========================================================================
   GLOBAL EXPORT (debug)
   ========================================================================== */

window.QuietMode = {
  init: initQuietMode,
  apply,
  enable,
  disable,
  isEnabled,
  config: QUIET_MODE_CONFIG,
  state,
};

export default window.QuietMode;
