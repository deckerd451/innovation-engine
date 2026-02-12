// assets/js/synapse/core.js
// Synapse Core — init, svg, simulation wiring (modularized)
// Version: 7.1 - Canonical synapseCore + safe Quiet Mode wiring + readiness queue (2026-02-11)

import { initConnections } from "../connections.js";
import { openNodePanel } from "../node-panel.js";
import * as PathwayAnimations from "../pathway-animations.js";

import { loadSynapseData } from "./data.js";
import {
  setupDefs,
  renderLinks,
  renderNodes,
  renderThemeCircles,
  renderThemeProjectsOverlay, // (kept for compatibility; may be unused depending on render.js)
  drawProjectCircles,         // (kept for compatibility; may be unused depending on render.js)
  highlightSelectedTheme,
  clearThemeSelection,
} from "./render.js";

import { showSynapseNotification } from "./ui.js";
import { setupSynapseRealtime } from "./realtime.js";

import {
  setFocusOnNode,
  findCurrentUserNode,
  clearFocusEffects,
} from "./focus-system.js";

import {
  getThemeInterestCount, // (kept for compatibility; may be used by node panel / overlays)
  markInterested,
  renderThemeOverlayCard,
} from "./themes.js";

import ProgressiveDisclosure from "./progressive-disclosure.js";
import QuietMode from "./quiet-mode.js";

/* ==========================================================================
   STATE
   ========================================================================== */

let supabase = null;
let svg = null;
let container = null;
let zoomBehavior = null;
let simulation = null;

let nodes = [];
let links = [];
let nodeEls = null;
let linkEls = null;
let themeEls = null;
let projectEls = null;

let connectionsData = [];
let projectMembersData = [];
let currentUserCommunityId = null;

let initialized = false;

// Mode flags
let showFullCommunity = true; // Always show full community (Discovery Mode)
let userManuallyToggledMode = false; // Track if user manually changed the mode (kept for legacy UI)

// Readiness tracking for focus reliability
let _ready = false;
let __pendingFocus = null; // Single pending focus: { type:'node'|'theme'|'activity', id?: string, skipToast?: boolean }

// Canonical core object (single source of truth)
let synapseCore = null;

/* ==========================================================================
   CORE OBJECT HELPERS
   ========================================================================== */

function buildSynapseCore() {
  return {
    svg,
    container,
    nodes,
    links,
    nodeEls,
    linkEls,
    themeEls,
    projectEls,
    zoomBehavior,
    simulation,
    currentUserCommunityId,
    // expose mode flags too (read-only-ish)
    showFullCommunity,
  };
}

function syncSynapseCore() {
  if (!synapseCore) synapseCore = buildSynapseCore();

  // Update in-place so references remain stable
  synapseCore.svg = svg;
  synapseCore.container = container;
  synapseCore.nodes = nodes;
  synapseCore.links = links;
  synapseCore.nodeEls = nodeEls;
  synapseCore.linkEls = linkEls;
  synapseCore.themeEls = themeEls;
  synapseCore.projectEls = projectEls;
  synapseCore.zoomBehavior = zoomBehavior;
  synapseCore.simulation = simulation;
  synapseCore.currentUserCommunityId = currentUserCommunityId;
  synapseCore.showFullCommunity = showFullCommunity;

  window.synapseCore = synapseCore;
}

/* ==========================================================================
   READINESS TRACKING
   ========================================================================== */

function markSynapseReady() {
  if (_ready) return;

  _ready = true;
  console.log("✅ Synapse ready - nodes and graph loaded");

  // Replay pending focus (if any)
  if (__pendingFocus) {
    const pending = __pendingFocus;
    __pendingFocus = null;

    console.log("🔄 Replaying queued focus:", pending);

    // Prefer firing the same events the API uses (avoids recursion)
    if (pending.type === "node" && pending.id) {
      window.dispatchEvent(
        new CustomEvent("synapse:focus-node", {
          detail: { nodeId: pending.id, skipToast: !!pending.skipToast },
        })
      );
    } else if (pending.type === "theme" && pending.id) {
      window.dispatchEvent(
        new CustomEvent("synapse:focus-theme", { detail: { themeId: pending.id } })
      );
    } else if (pending.type === "activity") {
      window.dispatchEvent(
        new CustomEvent("synapse:show-activity", {
          detail: { userId: currentUserCommunityId },
        })
      );
    }
  }
}

/* ==========================================================================
   PUBLIC API
   ========================================================================== */

export async function initSynapseView() {
  if (initialized) {
    console.log("⚠️ Synapse already initialized — skipping.");
    return;
  }

  initialized = true;

  supabase = window.supabase;
  if (!supabase) {
    console.error("❌ Synapse: window.supabase not found");
    initialized = false;
    return;
  }

  if (!window.d3) {
    console.error("❌ Synapse: D3 not found on window. Load D3 before synapse.");
    initialized = false;
    return;
  }

  if (!document.getElementById("synapse-svg")) {
    console.error("❌ Synapse: #synapse-svg not found in DOM");
    initialized = false;
    return;
  }

  if (!document.getElementById("synapse-main-view")) {
    console.warn("⚠️ Synapse: #synapse-main-view not found (theme card/toasts may not render)");
  }

  console.log("%c🧠 Synapse Core booting...", "color:#0ff; font-weight:bold;");

  // Connection system gives us currentUserCommunityId reliably
  const userInfo = await initConnections(supabase);
  currentUserCommunityId = userInfo?.currentUserCommunityId || null;

  setupSVG();
  await reloadAllData();
  await buildGraph();

  // Establish canonical synapseCore (and expose it)
  syncSynapseCore();

  // Quiet Mode v1 (Default - Radical Simplification)
  // Feature flag: quietMode overrides Progressive Disclosure
  const quietMode = true;

  if (quietMode) {
    try {
      console.log("🤫 Initializing Quiet Mode (v1)...");
      QuietMode.init(synapseCore);
      window.QuietMode = QuietMode;
      console.log("✅ Quiet Mode initialized");
    } catch (e) {
      console.error("❌ Quiet Mode init failed:", e);
    }
  } else {
    try {
      console.log("🎨 Initializing Progressive Disclosure System...");
      ProgressiveDisclosure.init(synapseCore);
      window.ProgressiveDisclosure = ProgressiveDisclosure;
      console.log("✅ Progressive Disclosure initialized");
    } catch (e) {
      console.error("❌ Progressive Disclosure init failed:", e);
    }
  }

  // Realtime refresh (connections/projects/themes)
  setupSynapseRealtime(supabase, async () => {
    await reloadAllData();
    await rebuildGraph();
  });

  // Pathway animation system (safe)
  try {
    PathwayAnimations.initPathwayAnimations(supabase, svg, container, nodes, links);
  } catch (e) {
    console.warn("⚠️ Pathway animations init failed:", e);
  }

  // Optional: expose for non-module callers / debugging
  window.initSynapseView = initSynapseView;
  window.refreshThemeCircles = refreshThemeCircles;
  window.refreshSynapseConnections = refreshSynapseConnections;
  window.refreshSynapseProjectCircles = refreshSynapseProjectCircles;
  window.openThemeCard = openThemeCard;

  // Expose theme selection functions for debugging
  window.highlightSelectedTheme = highlightSelectedTheme;
  window.clearThemeSelection = clearThemeSelection;

  window.testThemeSelection = function (themeId) {
    console.log("🎯 Testing theme selection for:", themeId);
    if (themeId) {
      highlightSelectedTheme(themeId);
      console.log("✅ Theme highlighted:", themeId);
    } else {
      clearThemeSelection();
      console.log("✅ All theme selections cleared");
    }
  };

  // Expose state for UI components (always true now)
  window.synapseShowFullCommunity = true;

  // Expose functions needed by Illuminate Pathways
  window.getSynapseStats = getSynapseStats;
  window.getRecommendations = getRecommendations;
  window.showConnectPathways = showConnectPathways;
  window.clearConnectPathways = clearConnectPathways;
  window.illuminatePathways = illuminatePathways;

  // Expose pathway animation functions for Intelligence Layer
  window.showRecommendationPathways = PathwayAnimations.showRecommendationPathways;
  window.clearAllPathways = PathwayAnimations.clearAllPathways;

  // Expose filtering function for category buttons
  window.filterSynapseByCategory = filterSynapseByCategory;
  window.refreshSynapseView = refreshSynapseConnections;

  // ================================================================
  // SYNAPSE API - Bridge for START Suggestions
  // ================================================================
  window.synapseApi = {
    open: () => {
      console.log("🌐 synapseApi.open() called");

      // Close START modal if open
      if (window.EnhancedStartUI && window.EnhancedStartUI.close) {
        window.EnhancedStartUI.close();
      } else if (window.closeStartModal) {
        window.closeStartModal();
      }

      // Explicitly show Synapse view
      const synapseView = document.getElementById("synapse-main-view");
      if (synapseView) {
        synapseView.style.display = "block";
        synapseView.style.visibility = "visible";
        synapseView.style.opacity = "1";
        synapseView.style.zIndex = "1";
        console.log("✅ Synapse view made visible");
      } else {
        console.warn("⚠️ synapse-main-view element not found");
      }

      // Hide dashboard pane if it exists
      const dashboardPane = document.getElementById("dashboard-pane");
      if (dashboardPane) {
        dashboardPane.style.display = "none";
        console.log("✅ Dashboard pane hidden");
      }

      // Try legacy showView if it exists
      if (window.showView) window.showView("synapse");
    },

    focusNode: (nodeId, opts = {}) => {
      console.log("🎯 synapseApi.focusNode() called:", nodeId);
      if (!nodeId) return console.warn("⚠️ focusNode called without nodeId");

      if (!_ready) {
        console.log("⏳ Synapse not ready yet - queueing focus request");
        __pendingFocus = { type: "node", id: nodeId, skipToast: !!opts.skipToast };
        return;
      }

      window.dispatchEvent(
        new CustomEvent("synapse:focus-node", {
          detail: { nodeId, skipToast: !!opts.skipToast },
        })
      );
    },

    focusTheme: (themeId) => {
      console.log("🎯 synapseApi.focusTheme() called:", themeId);
      if (!themeId) return console.warn("⚠️ focusTheme called without themeId");

      if (!_ready) {
        console.log("⏳ Synapse not ready yet - queueing focus request");
        __pendingFocus = { type: "theme", id: themeId };
        return;
      }

      window.dispatchEvent(new CustomEvent("synapse:focus-theme", { detail: { themeId } }));
    },

    showActivity: () => {
      console.log("📊 synapseApi.showActivity() called");

      if (!_ready) {
        console.log("⏳ Synapse not ready yet - queueing focus request");
        __pendingFocus = { type: "activity" };
        return;
      }

      window.dispatchEvent(
        new CustomEvent("synapse:show-activity", { detail: { userId: currentUserCommunityId } })
      );
    },

    debug: {
      getNodes: () => nodes,
      getLinks: () => links,
      isReady: () => _ready,
      getCore: () => synapseCore,
    },
  };

  // ================================================================
  // EVENT LISTENERS - Handle synapseApi events
  // ================================================================

  // Focus node
  window.addEventListener("synapse:focus-node", (event) => {
    const { nodeId, skipToast } = event.detail || {};
    console.log("🎯 Handling synapse:focus-node event:", nodeId);

    if (!nodeId || !nodes || !svg || !container || !zoomBehavior) {
      console.warn("⚠️ Cannot focus node - missing dependencies");
      return;
    }

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      console.warn("⚠️ Node not found:", nodeId);
      console.log("ℹ️ Falling back to activity view (centering on current user)");

      if (!skipToast) {
        showSynapseNotification(
          "Person not found in current view. They may not be in the network yet.",
          "info",
          6000
        );
      }

      const userNode = findCurrentUserNode(nodes, currentUserCommunityId);
      if (userNode) {
        setFocusOnNode(userNode, svg, container, zoomBehavior, nodeEls, linkEls, nodes);
      }
      return;
    }

    setFocusOnNode(node, svg, container, zoomBehavior, nodeEls, linkEls, nodes);
  });

  // Focus theme
  window.addEventListener("synapse:focus-theme", (event) => {
    const { themeId } = event.detail || {};
    console.log("🎯 Handling synapse:focus-theme event:", themeId);

    if (!themeId || !nodes || !svg || !container || !zoomBehavior) {
      console.warn("⚠️ Cannot focus theme - missing dependencies");
      return;
    }

    const themeNodeId = String(themeId).startsWith("theme:") ? themeId : `theme:${themeId}`;
    const themeNode = nodes.find((n) => n.id === themeNodeId || n.theme_id === themeId);

    if (!themeNode) {
      console.warn("⚠️ Theme node not found:", themeId);
      console.log("ℹ️ Falling back to activity view (centering on current user)");

      showSynapseNotification(
        "This theme isn't in your current view. You may need to join it or enable Discovery Mode.",
        "info",
        8000
      );

      const userNode = findCurrentUserNode(nodes, currentUserCommunityId);
      if (userNode) {
        setFocusOnNode(userNode, svg, container, zoomBehavior, nodeEls, linkEls, nodes);
      }
      return;
    }

    setFocusOnNode(themeNode, svg, container, zoomBehavior, nodeEls, linkEls, nodes);

    setTimeout(() => {
      openThemeCard(themeNode);
    }, 400);
  });

  // Activity view
  window.addEventListener("synapse:show-activity", (event) => {
    const { userId } = event.detail || {};
    console.log("📊 Handling synapse:show-activity event:", userId);

    const targetUserId = userId || currentUserCommunityId;

    if (!targetUserId || !nodes || !svg || !container || !zoomBehavior) {
      console.warn("⚠️ Cannot show activity - missing dependencies");
      return;
    }

    const userNode = findCurrentUserNode(nodes, targetUserId);
    if (!userNode) {
      console.warn("⚠️ User node not found:", targetUserId);
      return;
    }

    setFocusOnNode(userNode, svg, container, zoomBehavior, nodeEls, linkEls, nodes);
  });

  // Handy for console debugging
  try {
    window.__synapseStats = getSynapseStats();
  } catch (_) {}

  console.log("%c✅ Synapse ready", "color:#0f0; font-weight:bold;");
}

export async function refreshSynapseConnections() {
  await reloadAllData();
  await rebuildGraph();
}

export async function refreshThemeCircles() {
  await reloadAllData();
  await rebuildGraph();
}

export async function refreshSynapseProjectCircles() {
  await reloadAllData();
  await rebuildGraph();
}

/* ==========================================================================
   FILTERING (CATEGORY VIEW)
   ========================================================================== */

export function filterSynapseByCategory(category) {
  console.log(`🔍 Filtering synapse view by category: ${category}`);

  if (!svg) {
    console.warn("⚠️ SVG not available yet");
    return;
  }

  const allNodesSel = svg.selectAll(".synapse-node");
  const allLinksSel = svg.selectAll(".synapse-link");
  const themeCirclesSel = svg.selectAll(".theme-circle");

  console.log(
    `📊 Found ${allNodesSel.size()} visual nodes, ${allLinksSel.size()} links, ${themeCirclesSel.size()} theme circles`
  );

  const nodeTypes = {};
  nodes.forEach((n) => {
    nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  });
  console.log("📊 Available node types in data:", nodeTypes);

  const typeMap = {
    people: "person",
    projects: "project",
    organizations: "organization",
    themes: "theme",
    discovery: "all",
    all: "all",
  };

  const filterType = typeMap[category] || category;

  if (filterType === "all") {
    allNodesSel.transition().duration(300).style("opacity", 1).style("pointer-events", "auto");

    if (!allLinksSel.empty()) {
      allLinksSel
        .transition()
        .duration(300)
        .style("opacity", (d) => {
          if (d?.type === "project-member") return d.status === "pending" ? 0.5 : 0.8;
          return 0.6;
        });
    }

    if (!themeCirclesSel.empty()) {
      themeCirclesSel.transition().duration(300).style("opacity", 1).style("pointer-events", "auto");
    }

    console.log(`✅ Filter applied: showing all ${allNodesSel.size()} nodes`);
    return;
  }

  if (!Object.values(typeMap).includes(filterType) && !["person", "project", "organization", "theme"].includes(filterType)) {
    console.warn(`⚠️ Unknown category: ${category}`);
    return;
  }

  let matchCount = 0;
  allNodesSel.each(function (d) {
    if (d && d.type === filterType) matchCount++;
  });
  console.log(`📊 Found ${matchCount} visual nodes of type "${filterType}"`);

  allNodesSel
    .transition()
    .duration(300)
    .style("opacity", (d) => {
      if (!d) return 0.15;
      return d.type === filterType ? 1 : 0.15;
    })
    .style("pointer-events", (d) => {
      if (!d) return "none";
      return d.type === filterType ? "auto" : "none";
    });

  if (!themeCirclesSel.empty()) {
    const themeOpacity = filterType === "theme" ? 1 : 0.15;
    themeCirclesSel
      .transition()
      .duration(300)
      .style("opacity", themeOpacity)
      .style("pointer-events", filterType === "theme" ? "auto" : "none");
  }

  if (!allLinksSel.empty()) {
    allLinksSel
      .transition()
      .duration(300)
      .style("opacity", (d) => {
        if (!d) return 0.05;

        const sourceType =
          typeof d.source === "object" ? d.source.type : nodes.find((n) => n.id === d.source)?.type;
        const targetType =
          typeof d.target === "object" ? d.target.type : nodes.find((n) => n.id === d.target)?.type;

        const connectsVisible = sourceType === filterType || targetType === filterType;
        if (!connectsVisible) return 0.05;

        if (d.type === "project-member") return d.status === "pending" ? 0.3 : 0.6;
        return 0.4;
      });
  }

  console.log(`✅ Filter applied: ${category} (showing ${matchCount} ${filterType} nodes)`);
}

export function getSynapseStats() {
  const peopleCount = nodes.filter((n) => n.type === "person").length;
  const projectCount = nodes.filter((n) => n.type === "project").length;
  const themeCount = nodes.filter((n) => n.type === "theme").length;

  const acceptedSet = new Set(["accepted", "active", "connected", "approved"]);
  const myConns = (connectionsData || []).filter(
    (c) => c.from_user_id === currentUserCommunityId || c.to_user_id === currentUserCommunityId
  );

  const myAccepted = myConns.filter((c) => (!c.status ? true : acceptedSet.has(String(c.status).toLowerCase())));

  return {
    totalNodes: nodes.length,
    totalLinks: links.length,
    peopleCount,
    projectCount,
    themeCount,
    myConnectionCount: myAccepted.length || myConns.length || 0,
    currentUserCommunityId,
  };
}

export { showSynapseNotification };

/* ==========================================================================
   SVG SETUP
   ========================================================================== */

function setupSVG() {
  const svgEl = document.getElementById("synapse-svg");
  svgEl.innerHTML = "";

  const width = window.innerWidth;
  const height = window.innerHeight;

  svg = window.d3.select(svgEl).attr("viewBox", [0, 0, width, height]);

  zoomBehavior = window.d3
    .zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", (event) => {
      container.attr("transform", event.transform);

      if (window.ProgressiveDisclosure && window.ProgressiveDisclosure.handleZoomChange) {
        window.ProgressiveDisclosure.handleZoomChange(event.transform.k, {
          svg,
          container,
          nodes,
          links,
          nodeEls,
          linkEls,
          themeEls,
        });
      }
    });

  svg.call(zoomBehavior);

  container = svg.append("g").attr("class", "synapse-container");
  setupDefs(svg);

  // Click background to close cards and clear focus
  svg.on("click", () => {
    document.getElementById("synapse-theme-card")?.remove();
    try {
      window.closeSynapseProfileCard?.();
    } catch (_) {}

    clearFocusEffects(nodeEls, linkEls);
    clearThemeSelection();
  });
}

/* ==========================================================================
   ERROR HANDLING
   ========================================================================== */

function showSVGDimensionError() {
  const errorDiv = document.createElement("div");
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 107, 107, 0.95);
    color: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 10000;
    max-width: 500px;
    text-align: center;
  `;
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
    <h3 style="margin-bottom: 1rem;">Visualization Layout Error</h3>
    <p style="margin-bottom: 1.5rem; opacity: 0.9;">
      The network visualization container has zero dimensions. This usually happens when the page layout hasn't finished loading.
    </p>
    <button onclick="location.reload()" style="padding: 0.75rem 2rem; background: white; color: #ff6b6b; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
      Reload Page
    </button>
  `;
  document.body.appendChild(errorDiv);
}

/* ==========================================================================
   DATA LOADING
   ========================================================================== */

async function reloadAllData() {
  if (!supabase) return;

  console.log("🔄 Loading synapse data...");

  const loaded = await loadSynapseData({
    supabase,
    currentUserCommunityId,
    showFullCommunity,
  });

  nodes = loaded.nodes || [];
  links = loaded.links || [];
  connectionsData = loaded.connectionsData || [];
  projectMembersData = loaded.projectMembersData || [];

  window.synapseData = { nodes, links, connectionsData, projectMembersData };

  console.log("📊 Synapse data loaded:", {
    nodes: nodes.length,
    links: links.length,
    connections: connectionsData.length,
    projectMembers: projectMembersData.length,
    currentUser: currentUserCommunityId,
    showFullCommunity,
  });

  // Breakdown by type
  const nodesByType = nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  console.log("📊 Nodes by type:", nodesByType);

  // Current user sanity
  const currentUser = nodes.find((n) => n.id === currentUserCommunityId);
  if (currentUser) {
    console.log("👤 Current user node:", {
      name: currentUser.name,
      projects: currentUser.projects?.length || 0,
      themes: currentUser.themes?.length || 0,
      connections: connectionsData.filter(
        (c) => c.from_user_id === currentUserCommunityId || c.to_user_id === currentUserCommunityId
      ).length,
    });
  } else {
    console.warn("⚠️ Current user node not found in data");
  }

  // ✅ Canonicalize + dedupe theme nodes
  const seenTheme = new Map();
  const dedupedNodes = [];

  for (const n of nodes) {
    if (n?.type === "theme" && n.theme_id) {
      const key = String(n.theme_id);
      n.id = `theme:${key}`;
      if (seenTheme.has(key)) continue;
      seenTheme.set(key, n);
      dedupedNodes.push(n);
    } else {
      dedupedNodes.push(n);
    }
  }
  nodes = dedupedNodes;

  // ✅ Canonicalize theme link endpoints
  const themeIdToCanonical = new Map();
  for (const t of nodes.filter((n) => n.type === "theme" && n.theme_id)) {
    themeIdToCanonical.set(String(t.theme_id), t.id);
  }

  links = (links || []).map((l) => {
    const src = typeof l.source === "object" ? l.source.id : l.source;
    const tgt = typeof l.target === "object" ? l.target.id : l.target;

    const fix = (id) => {
      if (typeof id !== "string") return id;
      if (id.startsWith("theme:")) return id;
      if (themeIdToCanonical.has(id)) return themeIdToCanonical.get(id);
      return id;
    };

    return { ...l, source: fix(src), target: fix(tgt) };
  });

  try {
    PathwayAnimations.updateGraphData?.(nodes, links);
  } catch (_) {}

  // keep core in sync
  syncSynapseCore();
}

/* ==========================================================================
   LAYOUT (NESTED)
   ========================================================================== */

function calculateNestedPosition(node, allNodes, allLinks, centerX, centerY, currentUserCommunityId, showFullCommunity = true) {
  const themes = allNodes.filter((n) => n.type === "theme");

  // THEMES
  if (node.type === "theme") {
    const currentUser = allNodes.find((n) => n.id === currentUserCommunityId);
    const userProjects = currentUser?.projects || [];

    const isUserConnected = node.user_is_participant === true;
    const hasProjectsInTheme = (node.projects || []).some((project) => userProjects.includes(project.id));
    const shouldShowTheme = isUserConnected || hasProjectsInTheme;

    if (shouldShowTheme) {
      const myThemes = themes
        .filter((t) => {
          const hasThemeParticipation = t.user_is_participant === true;
          const hasThemeProjects = (t.projects || []).some((p) => userProjects.includes(p.id));
          return hasThemeParticipation || hasThemeProjects;
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

      const myIndex = myThemes.findIndex((t) => t.id === node.id);
      const baseThemeRadius = 180;

      const mostActiveThemeId = themes.reduce((max, theme) => {
        const currentScore = (theme.project_count || 0) + (theme.participant_count || 0);
        const maxScore = (max?.project_count || 0) + (max?.participant_count || 0);
        return currentScore > maxScore ? theme : max;
      }, null)?.theme_id;

      const isUserTheme = node.theme_id === mostActiveThemeId;

      const themeCount = Math.max(1, myThemes.length);
      const orbitDistance = baseThemeRadius * 1.8 + (themeCount > 3 ? themeCount * 20 : 0);
      const angleStep = (2 * Math.PI) / themeCount;
      const startAngle = -Math.PI / 2;
      const angle = startAngle + (Math.max(0, myIndex) * angleStep);

      return {
        x: centerX + Math.cos(angle) * orbitDistance,
        y: centerY + Math.sin(angle) * orbitDistance,
        themeRadius: baseThemeRadius,
        parentTheme: null,
        isUserTheme,
        hidden: false,
      };
    }

    if (showFullCommunity) {
      const otherThemes = themes
        .filter((t) => {
          const hasThemeParticipation = t.user_is_participant === true;
          const hasThemeProjects = (t.projects || []).some((p) => userProjects.includes(p.id));
          return !hasThemeParticipation && !hasThemeProjects;
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

      const otherIndex = otherThemes.findIndex((t) => t.id === node.id);
      const orbitR = 900;
      const angle = (Math.max(0, otherIndex) / Math.max(1, otherThemes.length)) * 2 * Math.PI;

      return {
        x: centerX + Math.cos(angle) * orbitR,
        y: centerY + Math.sin(angle) * orbitR,
        themeRadius: 180,
        parentTheme: null,
        isUserTheme: false,
        hidden: false,
        isDiscoverable: true,
      };
    }

    return {
      x: centerX + 10000,
      y: centerY + 10000,
      themeRadius: 0,
      parentTheme: null,
      isUserTheme: false,
      hidden: true,
    };
  }

  // PEOPLE
  if (node.type === "person") {
    if (node.isCurrentUser) {
      return { x: centerX, y: centerY, parentTheme: null, isUserCenter: true, hidden: false };
    }

    if (Array.isArray(node.themes) && node.themes.length > 0) {
      const firstTheme = allNodes.find((n) => n.type === "theme" && n.theme_id === node.themes[0]);
      if (firstTheme && !firstTheme.hidden) {
        const themeRadius = firstTheme.themeRadius || 250;
        const angle = Math.random() * 2 * Math.PI;
        const distance = themeRadius * 0.8 + Math.random() * (themeRadius * 0.15);

        return {
          x: firstTheme.x + Math.cos(angle) * distance,
          y: firstTheme.y + Math.sin(angle) * distance,
          parentTheme: firstTheme.theme_id,
          hidden: false,
        };
      }
    }

    if (node.isConnectedToCurrentUser) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = 300 + Math.random() * 200;
      return { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance, parentTheme: null, hidden: false };
    }

    if (!showFullCommunity) {
      return { x: centerX + 10000, y: centerY + 10000, parentTheme: null, hidden: true };
    }

    return { x: centerX + (Math.random() - 0.5) * 1400, y: centerY + (Math.random() - 0.5) * 1400, parentTheme: null, hidden: false };
  }

  // PROJECTS (free)
  if (node.type === "project") {
    if (node.theme_id) {
      const parentTheme = allNodes.find((n) => n.type === "theme" && n.theme_id === node.theme_id);
      if (parentTheme && !parentTheme.hidden) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = (parentTheme.themeRadius || 180) * 0.6;
        return { x: parentTheme.x + Math.cos(angle) * distance, y: parentTheme.y + Math.sin(angle) * distance, parentTheme: null, hidden: false };
      }
    }
    const angle = Math.random() * 2 * Math.PI;
    const distance = 300 + Math.random() * 200;
    return { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance, parentTheme: null, hidden: false };
  }

  // ORGS
  if (node.type === "organization") {
    const orgs = allNodes.filter((n) => n.type === "organization");
    const orgIndex = orgs.findIndex((o) => o.id === node.id);
    const orgCount = Math.max(1, orgs.length);
    const orgOrbitRadius = 550 + orgCount * 25;
    const angleStep = (2 * Math.PI) / orgCount;
    const startAngle = Math.PI / 4;
    const angle = startAngle + Math.max(0, orgIndex) * angleStep;

    return { x: centerX + Math.cos(angle) * orgOrbitRadius, y: centerY + Math.sin(angle) * orgOrbitRadius, parentTheme: null, hidden: false };
  }

  return { x: centerX, y: centerY, parentTheme: null, hidden: false };
}

/* ==========================================================================
   FORCES
   ========================================================================== */

function createContainmentForce(simulationNodes, allNodes) {
  return function containmentForce(alpha) {
    const strength = 0.5;

    simulationNodes.forEach((node) => {
      if (node.type === "theme") return;
      if (node.type === "project") return; // projects are free
      if (node.x == null || node.y == null || !node.parentTheme) return;
      if (node.isUserCenter) return;

      const parentTheme = allNodes.find((n) => n.type === "theme" && n.theme_id === node.parentTheme);
      if (!parentTheme || parentTheme.x == null || parentTheme.y == null) return;
      if (!parentTheme.themeRadius) return;

      const dx = node.x - parentTheme.x;
      const dy = node.y - parentTheme.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = parentTheme.themeRadius * 0.9;

      if (distance > maxRadius) {
        const overflow = distance - maxRadius;
        const force = (overflow * strength * alpha) / (distance || 1);
        node.vx -= (dx / distance) * force;
        node.vy -= (dy / distance) * force;
      }
    });
  };
}

/* ==========================================================================
   GRAPH BUILD / REBUILD
   ========================================================================== */

async function rebuildGraph() {
  try {
    container?.selectAll("*")?.remove();
  } catch (_) {}

  try {
    simulation?.stop();
  } catch (_) {}

  await buildGraph();

  try {
    PathwayAnimations.updateGraphData?.(nodes, links);
  } catch (_) {}

  syncSynapseCore();
}

/**
 * D3 forceLink throws if ANY link endpoint doesn't exist in nodes.
 * Normalize endpoints and drop invalids.
 */
function normalizeAndFilterLinks(allNodes, rawLinks) {
  const nodeIdSet = new Set(allNodes.map((n) => n.id));

  const themeIdToNodeId = new Map();
  allNodes
    .filter((n) => n.type === "theme")
    .forEach((t) => {
      if (t.theme_id) themeIdToNodeId.set(String(t.theme_id), t.id);
      themeIdToNodeId.set(String(t.id), t.id);
    });

  const normalizeEndpoint = (val) => {
    const id = typeof val === "object" ? val?.id : val;
    if (!id) return id;

    if (nodeIdSet.has(id)) return id;

    if (typeof id === "string") {
      if (id.startsWith("theme:")) {
        const themeUuid = id.slice("theme:".length);
        const mapped = themeIdToNodeId.get(themeUuid);
        if (mapped && nodeIdSet.has(mapped)) return mapped;
      }

      const mapped2 = themeIdToNodeId.get(id);
      if (mapped2 && nodeIdSet.has(mapped2)) return mapped2;
    }

    return id;
  };

  const normalized = (rawLinks || []).map((l) => {
    const sourceId = normalizeEndpoint(l.source);
    const targetId = normalizeEndpoint(l.target);
    return { ...l, source: sourceId, target: targetId };
  });

  return normalized.filter((l) => {
    const s = typeof l.source === "object" ? l.source?.id : l.source;
    const t = typeof l.target === "object" ? l.target?.id : l.target;
    const ok = nodeIdSet.has(s) && nodeIdSet.has(t);
    if (!ok) {
      console.warn("🧹 Dropping invalid link (missing node):", { source: s, target: t, link: l });
    }
    return ok;
  });
}

async function buildGraph() {
  const d3 = window.d3;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerX = width / 2;
  const centerY = height / 2;

  const perfStart = performance.now();
  console.log("🚀 Building graph...");

  links = normalizeAndFilterLinks(nodes, links);

  // Position nodes
  nodes.forEach((node) => {
    const position = calculateNestedPosition(node, nodes, links, centerX, centerY, currentUserCommunityId, showFullCommunity);

    node.x = position.x;
    node.y = position.y;
    node.themeRadius = position.themeRadius;
    node.parentTheme = position.parentTheme;
    node.isUserTheme = position.isUserTheme;
    node.isUserCenter = position.isUserCenter;
    node.hidden = position.hidden;

    // Pin visible themes
    if (node.type === "theme" && !node.hidden) {
      node.fx = node.x;
      node.fy = node.y;
    }
  });

  const visibleNodes = nodes.filter((n) => !n.hidden);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  const visibleLinks = links.filter((l) => {
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    const targetId = typeof l.target === "object" ? l.target.id : l.target;
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });

  console.log("🎯 Visibility filtering:", {
    totalNodes: nodes.length,
    visibleNodes: visibleNodes.length,
    hiddenNodes: nodes.length - visibleNodes.length,
    totalLinks: links.length,
    visibleLinks: visibleLinks.length,
    showFullCommunity,
  });

  if (visibleNodes.length === 0) {
    console.warn("⚠️ No visible nodes! Likely data issue.");
    const currentUserNode = nodes.find((n) => n.id === currentUserCommunityId);
    if (!currentUserNode) console.error("❌ Current user node NOT FOUND:", currentUserCommunityId);
  }

  if (visibleNodes.length <= 10 && !userManuallyToggledMode) {
    console.log("🔍 Limited content found. Discovery Mode available via button.");
  }

  const simulationNodes = visibleNodes;
  const simulationLinks = visibleLinks;

  simulation = d3
    .forceSimulation(simulationNodes)
    .force(
      "link",
      d3
        .forceLink(simulationLinks)
        .id((d) => d.id)
        .distance((d) => {
          if (d.type === "project-member") return 120;
          if (d.type === "theme" || d.status === "theme-participant") return 40;
          if (d.type === "connection") return 80;
          if (d.status === "suggested") return 100;
          return 80;
        })
        .strength((d) => {
          if (d.type === "project-member") return 0.4;
          if (d.type === "theme" || d.status === "theme-participant") return 0.3;
          if (d.type === "connection") return 0.2;
          if (d.status === "suggested") return 0.1;
          return 0.05;
        })
    )
    .force("charge", d3.forceManyBody().strength(-30).distanceMax(200))
    .force("containment", createContainmentForce(simulationNodes, visibleNodes))
    .force(
      "collision",
      d3
        .forceCollide()
        .radius((d) => {
          if (d.type === "theme") return 0;
          if (d.type === "project") return 35;
          if (d.isCurrentUser) return 60;
          if (d.shouldShowImage) return 35;
          return 28;
        })
        .strength(1.0)
        .iterations(3)
    )
    .velocityDecay(0.6)
    .alphaDecay(0.05)
    .alphaMin(0.001);

  // Render sanity: wait for layout if needed
  const svgRect = svg.node().getBoundingClientRect();
  console.log("📐 SVG dimensions before render:", {
    width: svgRect.width,
    height: svgRect.height,
    visible: svgRect.width > 0 && svgRect.height > 0,
  });

  if (svgRect.width === 0 || svgRect.height === 0) {
    console.warn("⚠️ SVG has zero dimensions, waiting for layout...");

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          console.log("✅ SVG layout ready, re-rendering...", { width, height });
          resizeObserver.disconnect();
          setTimeout(() => rebuildGraph(), 100);
          return;
        }
      }
    });

    resizeObserver.observe(svg.node());

    setTimeout(() => {
      resizeObserver.disconnect();
      const newRect = svg.node().getBoundingClientRect();
      if (newRect.width === 0 || newRect.height === 0) {
        console.error("❌ SVG still has zero dimensions after timeout");
        showSVGDimensionError();
      }
    }, 5000);

    return;
  }

  // ----- Render layers -----

  // 1) Themes (background)
  const visibleThemeNodes = visibleNodes.filter((n) => n.type === "theme");
  if (visibleThemeNodes.length > 0) {
    themeEls = renderThemeCircles(container, visibleThemeNodes, {
      onThemeHover: handleThemeHover,
      onThemeClick: (event, d) => openThemeCard(d),
    });
  }

  // 2) Links
  linkEls = renderLinks(container, simulationLinks);

  // 3) Projects (independent nodes)
  const visibleProjectNodes = visibleNodes.filter((n) => n.type === "project");
  if (visibleProjectNodes.length > 0) {
    projectEls = renderNodes(container, visibleProjectNodes, {
      onNodeClick,
      connectionsData,
      currentUserCommunityId,
    });
  }

  // 4) People + Orgs (foreground)
  const visibleInteractiveNodes = visibleNodes
    .filter((n) => n.type === "person" || n.type === "organization")
    .sort((a, b) => {
      if (a.isCurrentUser) return 1;
      if (b.isCurrentUser) return -1;
      return 0;
    });

  nodeEls = renderNodes(container, visibleInteractiveNodes, {
    onNodeClick,
    connectionsData,
    currentUserCommunityId,
  });

  // Drag (allow click)
  nodeEls.call(
    d3
      .drag()
      .clickDistance(5)
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded)
  );

  const perfEnd = performance.now();
  console.log(`⚡ Graph built in ${(perfEnd - perfStart).toFixed(2)}ms`);

  // Keep core synced after element refs are created
  syncSynapseCore();

  // Ready!
  markSynapseReady();

  // Tick loop
  let tickCount = 0;
  let hasInitialCentered = false;

  simulation.on("tick", () => {
    tickCount++;
    if (tickCount % 2 !== 0) return;

    // Keep themes pinned
    const visibleThemes = visibleNodes.filter((n) => n.type === "theme");
    for (const t of visibleThemes) {
      if (t.fx != null) t.x = t.fx;
      if (t.fy != null) t.y = t.fy;
    }

    if (!hasInitialCentered && simulation.alpha() < 0.1 && tickCount > 50) {
      hasInitialCentered = true;
      const userNode = findCurrentUserNode(visibleNodes, currentUserCommunityId);
      if (userNode) {
        console.log("🎯 Initial centering on user node:", userNode.name);
        setTimeout(() => {
          setFocusOnNode(userNode, svg, container, zoomBehavior, nodeEls, linkEls, visibleNodes);
        }, 500);
      }
    }

    // Links
    linkEls
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    // People/orgs
    nodeEls.attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Projects
    if (projectEls) projectEls.attr("transform", (d) => `translate(${d.x},${d.y})`);

    try {
      PathwayAnimations.updateAllPathwayPositions?.();
    } catch (_) {}
  });
}

/* ==========================================================================
   THEME INTERACTIONS
   ========================================================================== */

function handleThemeHover(event, themeNode, isEntering) {
  if (isEntering) event.currentTarget.style.cursor = "pointer";
}

async function openThemeCard(themeNode) {
  const d3 = window.d3;

  highlightSelectedTheme(themeNode.theme_id);

  console.log("🎯 Opening theme card for:", {
    themeId: themeNode.theme_id,
    themeName: themeNode.title || themeNode.name,
    embeddedProjects: themeNode.projects?.length || 0,
  });

  const scale = 1.2;

  svg
    .transition()
    .duration(750)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity
        .translate(window.innerWidth / 2, window.innerHeight / 2)
        .scale(scale)
        .translate(-themeNode.x, -themeNode.y)
    );

  const themeTags = themeNode.tags || [];
  const embeddedProjects = themeNode.projects || [];

  const additionalProjectNodes = nodes.filter((n) => {
    if (n.type !== "project") return false;
    if (embeddedProjects.some((p) => p.id === n.id)) return false;

    if (n.theme_id === themeNode.theme_id) return true;

    const projectTags = n.tags || [];
    return projectTags.some((tag) => themeTags.includes(tag));
  });

  const allRelatedProjects = [...embeddedProjects, ...additionalProjectNodes];

  nodeEls?.style("opacity", (d) => {
    if (!d) return 0.2;
    if (d.type === "project" && allRelatedProjects.some((p) => p.id === d.id)) return 1;
    return 0.2;
  });

  linkEls?.style("opacity", (d) => {
    if (!d) return 0.1;
    const sourceId = typeof d.source === "object" ? d.source?.id : d.source;
    const targetId = typeof d.target === "object" ? d.target?.id : d.target;

    const isRelatedLink = allRelatedProjects.some((p) => sourceId === p?.id || targetId === p?.id);
    return isRelatedLink ? 0.6 : 0.1;
  });

  themeEls?.style("opacity", (d) => (d?.id === themeNode?.id ? 1 : 0.3));

  await openThemeProjectsPanel(themeNode, allRelatedProjects);
}

async function openThemeProjectsPanel(themeNode, relatedProjects) {
  try {
    openNodePanel({
      id: themeNode.id,
      name: themeNode.title,
      type: "theme",
      description: themeNode.description,
      tags: themeNode.tags,
      expires_at: themeNode.expires_at,
      relatedProjects,
      isThemeLens: true,
      onClearFocus: clearThemeFocus,
    });
  } catch (error) {
    console.error("Failed to open theme panel:", error);
    showSynapseNotification("Could not open theme details", "error");
  }
}

function clearThemeFocus() {
  clearThemeSelection();

  nodeEls?.style("opacity", 1);
  linkEls?.style("opacity", (d) => (d?.status === "suggested" ? 0.5 : 0.8));
  themeEls?.style("opacity", 1);
}

/* ==========================================================================
   NODE CLICK ROUTING
   ========================================================================== */

function onNodeClick(event, d) {
  event.stopPropagation();

  if (window.AnimationLifecycle) window.AnimationLifecycle.recordInteraction();

  setFocusOnNode(d, svg, container, zoomBehavior, nodeEls, linkEls, nodes);

  if (d.type === "theme") return void openThemeCard(d);

  if (d.type === "organization") {
    try {
      openNodePanel({
        id: d.org_id || d.id,
        name: d.name,
        type: "organization",
        description: d.description,
        website: d.website,
        industry: d.industry,
        size: d.size,
        location: d.location,
        logo_url: d.logo_url,
        verified: d.verified,
        slug: d.slug,
        member_count: d.member_count,
        ...d,
      });
    } catch (e) {
      console.warn("openNodePanel for organization failed:", e);
    }
    return;
  }

  try {
    openNodePanel({ id: d.id, name: d.name, type: d.type || "person", ...d });
  } catch (e) {
    console.warn("openNodePanel failed:", e);
  }
}

/* ==========================================================================
   DRAG
   ========================================================================== */

let dragMoved = false;

function dragStarted(event, d) {
  if (window.AnimationLifecycle) window.AnimationLifecycle.recordInteraction();

  dragMoved = false;
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  if (window.AnimationLifecycle) window.AnimationLifecycle.recordInteraction();

  dragMoved = true;
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;

  if (!dragMoved) onNodeClick(event.sourceEvent, d);
}

/* ==========================================================================
   PATHWAY COMPAT EXPORTS (synapse.js expects these)
   ========================================================================== */

export function clearConnectPathways(opts = {}) {
  try {
    if (typeof PathwayAnimations.clearAllPathways === "function") return PathwayAnimations.clearAllPathways(opts);
    if (typeof PathwayAnimations.clearConnectPathways === "function") return PathwayAnimations.clearConnectPathways(opts);
    console.warn("⚠️ clearConnectPathways not available in pathway-animations.js");
    return null;
  } catch (e) {
    console.warn("⚠️ clearConnectPathways failed:", e);
    return null;
  }
}

export async function getRecommendations({ limit = 12 } = {}) {
  try {
    if (typeof PathwayAnimations.generateRecommendations === "function") {
      const recs = await PathwayAnimations.generateRecommendations();
      return Array.isArray(recs) ? recs.slice(0, limit) : [];
    }
    console.warn("⚠️ generateRecommendations not available in pathway-animations.js");
    return [];
  } catch (e) {
    console.warn("⚠️ getRecommendations failed:", e);
    return [];
  }
}

export async function showConnectPathways(fromId, toId, opts = {}) {
  try {
    const resolvedFrom = fromId || currentUserCommunityId || null;

    let resolvedTo = toId || null;
    if (!resolvedTo) {
      const recs = await getRecommendations({ limit: 1 });
      resolvedTo = recs?.[0]?.userId || null;
    }

    if (!resolvedFrom || !resolvedTo) {
      console.warn("⚠️ showConnectPathways missing ids", { fromId, toId, resolvedFrom, resolvedTo, currentUserCommunityId });
      return null;
    }

    if (typeof PathwayAnimations.showConnectPathways === "function") {
      return PathwayAnimations.showConnectPathways(resolvedFrom, resolvedTo, opts);
    }

    if (typeof PathwayAnimations.animatePathway === "function") {
      return PathwayAnimations.animatePathway(resolvedFrom, resolvedTo, opts);
    }

    console.warn("⚠️ showConnectPathways not available in pathway-animations.js");
    return null;
  } catch (e) {
    console.warn("⚠️ showConnectPathways failed:", e);
    return null;
  }
}

export async function illuminatePathways({ limit = 5, clearFirst = true, opts = {} } = {}) {
  const me = currentUserCommunityId || null;
  if (!me) return [];

  const recs = await getRecommendations({ limit });
  if (!recs.length) return [];

  if (clearFirst) clearConnectPathways();

  if (typeof PathwayAnimations.showRecommendationPathways === "function") {
    await PathwayAnimations.showRecommendationPathways(limit);
    return recs;
  }

  for (const rec of recs) {
    await showConnectPathways(me, rec.userId, opts);
  }
  return recs;
}

export { setupSynapseRealtime, clearThemeFocus };
