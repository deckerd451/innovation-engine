// assets/js/synapse/core.js
// Synapse Core — init, svg, simulation wiring (modularized)
// Version: 6.0 - Fixed theme click handler null safety (2026-01-13)

import { initConnections } from "../connections.js";
import { openNodePanel } from "../node-panel.js";
import * as PathwayAnimations from "../pathway-animations.js";

import { loadSynapseData } from "./data.js";
import {
  setupDefs,
  renderLinks,
  renderNodes,
  renderThemeCircles,
  drawProjectCircles,
} from "./render.js";
import { showSynapseNotification } from "./ui.js";
import { setupSynapseRealtime } from "./realtime.js";
import {
  setFocusOnNode,
  findCurrentUserNode,
  clearFocusEffects,
} from "./focus-system.js";

import {
  getThemeInterestCount,
  markInterested,
  renderThemeOverlayCard,
} from "./themes.js";

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

let connectionsData = [];
let projectMembersData = [];
let currentUserCommunityId = null;

let initialized = false;
let projectCircles = null;
let showFullCommunity = false; // Default to filtered view (only user's activities)

/* ==========================================================================
   PUBLIC API
   ========================================================================== */

export async function initSynapseView() {
  if (initialized) {
    console.log("⚠️ Synapse already initialized — skipping.");
    return;
  }

  supabase = window.supabase;
  if (!supabase) {
    console.error("❌ Synapse: window.supabase not found");
    return;
  }

  // D3 must be global in this build
  if (!window.d3) {
    console.error("❌ Synapse: D3 not found on window. Load D3 before synapse.");
    return;
  }

  // Basic container checks
  if (!document.getElementById("synapse-svg")) {
    console.error("❌ Synapse: #synapse-svg not found in DOM");
    return;
  }
  if (!document.getElementById("synapse-main-view")) {
    console.warn(
      "⚠️ Synapse: #synapse-main-view not found (theme card/toasts may not render)"
    );
  }

  console.log("%c🧠 Synapse Core booting...", "color:#0ff; font-weight:bold;");

  // Connection system gives us currentUserCommunityId reliably
  const userInfo = await initConnections(supabase);
  currentUserCommunityId = userInfo?.currentUserCommunityId || null;

  setupSVG();
  await reloadAllData();
  await buildGraph();

  // Realtime refresh (connections/projects/themes)
  setupSynapseRealtime(supabase, async () => {
    await reloadAllData();
    await rebuildGraph();
  });

  // Pathway animation system (safe)
  try {
    PathwayAnimations.initPathwayAnimations(
      supabase,
      svg,
      container,
      nodes,
      links
    );
  } catch (e) {
    console.warn("⚠️ Pathway animations init failed:", e);
  }

  initialized = true;

  // Optional: expose for non-module callers / debugging
  window.initSynapseView = initSynapseView;
  window.refreshThemeCircles = refreshThemeCircles;
  window.refreshSynapseConnections = refreshSynapseConnections;
  window.toggleFullCommunityView = toggleFullCommunityView;

  // Expose functions needed by Illuminate Pathways
  window.getSynapseStats = getSynapseStats;
  window.getRecommendations = getRecommendations;
  window.showConnectPathways = showConnectPathways;
  window.clearConnectPathways = clearConnectPathways;

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

export async function toggleFullCommunityView(show) {
  if (typeof show === "boolean") {
    showFullCommunity = show;
  } else {
    showFullCommunity = !showFullCommunity;
  }

  console.log(
    `🌐 Synapse view mode: ${showFullCommunity ? "Full Community (Discovery Mode)" : "My Network"}`
  );

  // Per yellow comments: In discovery mode, show themes user is not connected to
  // This allows users to discover new themes through the start sequence
  await reloadAllData();
  await rebuildGraph();
}

export function getSynapseStats() {
  const peopleCount = nodes.filter((n) => n.type === "person").length;
  const projectCount = nodes.filter((n) => n.type === "project").length;
  const themeCount = nodes.filter((n) => n.type === "theme").length;

  const acceptedSet = new Set(["accepted", "active", "connected", "approved"]);
  const myConns = (connectionsData || []).filter(
    (c) =>
      c.from_user_id === currentUserCommunityId ||
      c.to_user_id === currentUserCommunityId
  );

  const myAccepted = myConns.filter((c) =>
    !c.status ? true : acceptedSet.has(String(c.status).toLowerCase())
  );

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

    // Clear focus effects when clicking background
    clearFocusEffects(nodeEls, linkEls);
  });
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

  console.log("📊 Synapse data loaded:", {
    nodes: nodes.length,
    links: links.length,
    connections: connectionsData.length,
    projectMembers: projectMembersData.length,
    currentUser: currentUserCommunityId,
    showFullCommunity
  });

  // Log breakdown by type
  const nodesByType = nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  console.log("📊 Nodes by type:", nodesByType);

  // Log current user info
  const currentUser = nodes.find(n => n.id === currentUserCommunityId);
  if (currentUser) {
    console.log("👤 Current user node:", {
      name: currentUser.name,
      projects: currentUser.projects?.length || 0,
      themes: currentUser.themes?.length || 0,
      connections: connectionsData.filter(c => 
        c.from_user_id === currentUserCommunityId || c.to_user_id === currentUserCommunityId
      ).length
    });
  } else {
    console.warn("⚠️ Current user node not found in data");
  }

  // ✅ Canonicalize + dedupe theme nodes:
  // - Force stable id: "theme:<theme_id>"
  // - Keep only one node per theme_id (joins/tags can duplicate)
  const seenTheme = new Map(); // theme_id -> canonical node
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

  // ✅ Canonicalize theme link endpoints:
  // Sometimes links use raw uuid (theme_id) instead of "theme:<uuid>"
  const themeIdToCanonical = new Map();
  for (const t of nodes.filter((n) => n.type === "theme" && n.theme_id)) {
    themeIdToCanonical.set(String(t.theme_id), t.id); // t.id is theme:<uuid>
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

  // Keep pathway module in sync with the latest arrays
  try {
    PathwayAnimations.updateGraphData?.(nodes, links);
  } catch (_) {}
}

/* ==========================================================================
   NESTED THEME LAYOUT
   - Themes you're associated with => concentric wells at center
   - All other themes => orbit around (do NOT share center)
   - Uses LINKS to infer your themes (doesn't rely on node.themes/projects)
   ========================================================================== */

function findMostActiveTheme(allNodes, currentUserCommunityId) {
  const themes = allNodes.filter((n) => n.type === "theme");
  const projects = allNodes.filter((n) => n.type === "project");
  const currentUser = allNodes.find((n) => n.id === currentUserCommunityId);

  if (!currentUser || themes.length === 0) return null;

  let maxActivity = -1;
  let mostActiveTheme = null;

  themes.forEach((theme) => {
    let activityScore = 0;

    const userProjectsInTheme = projects.filter(
      (p) => p.theme_id === theme.theme_id && currentUser.projects?.includes?.(p.id)
    );
    activityScore += userProjectsInTheme.length * 10;

    if (currentUser.themes?.includes?.(theme.theme_id)) {
      activityScore += 5;
    }

    const projectsInTheme = projects.filter((p) => p.theme_id === theme.theme_id);
    activityScore += projectsInTheme.length;

    if (activityScore > maxActivity) {
      maxActivity = activityScore;
      mostActiveTheme = theme.theme_id;
    }
  });

  return mostActiveTheme;
}

/**
 * ✅ Robust theme association:
 * - Does NOT rely on person node having `themes` or `projects`
 * - Infers "my themes" from links:
 *   - direct links to theme nodes (theme:*)
 *   - links to projects => inherits project.theme_id
 */
function getUserThemeSet(allNodes, allLinks, currentUserCommunityId) {
  const set = new Set();
  if (!currentUserCommunityId) return set;

  // projectId -> themeId
  const projectToTheme = new Map();
  for (const n of allNodes) {
    if (n?.type === "project" && n.id && n.theme_id) {
      projectToTheme.set(String(n.id), String(n.theme_id));
    }
  }

  for (const l of allLinks || []) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    const sId = String(s);
    const tId = String(t);
    const me = String(currentUserCommunityId);

    // Direct theme links
    if (sId === me && tId.startsWith("theme:")) set.add(tId.slice("theme:".length));
    if (tId === me && sId.startsWith("theme:")) set.add(sId.slice("theme:".length));

    // Project membership links => inherit theme
    let other = null;
    if (sId === me) other = tId;
    else if (tId === me) other = sId;

    if (other) {
      const themeId = projectToTheme.get(String(other));
      if (themeId) set.add(String(themeId));
    }
  }

  return set;
}

function calculateNestedPosition(
  node,
  allNodes,
  allLinks,
  centerX,
  centerY,
  currentUserCommunityId
) {
  const themes = allNodes.filter((n) => n.type === "theme");

  // ----------------------------
  // THEMES - Per yellow comments: Only show themes user is connected to (unless in discovery mode)
  // ----------------------------
  if (node.type === "theme") {
    const userThemeSet = getUserThemeSet(allNodes, allLinks, currentUserCommunityId);

    // Per yellow comments: Hide themes user is not connected to (unless in discovery mode)
    const isUserConnected = node.theme_id && userThemeSet.has(String(node.theme_id));
    
    // In discovery mode (showFullCommunity), show all themes but position differently
    if (!isUserConnected && !showFullCommunity) {
      // Position far off-screen or mark as hidden
      return {
        x: centerX + 10000, // Off-screen
        y: centerY + 10000,
        themeRadius: 0,
        parentTheme: null,
        isUserTheme: false,
        hidden: true, // Mark as hidden
      };
    }

    if (isUserConnected) {
      // User's themes - concentric around center
      const myThemes = themes
        .filter((t) => t.theme_id && userThemeSet.has(String(t.theme_id)))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))); // stable order

      const myIndex = myThemes.findIndex((t) => t.id === node.id);
      const baseThemeRadius = 220;
      const themeRadiusIncrement = 140;

      const mostActiveThemeId = findMostActiveTheme(allNodes, currentUserCommunityId);
      const isUserTheme = node.theme_id === mostActiveThemeId;

      return {
        x: centerX, // All user themes centered on user
        y: centerY,
        themeRadius: baseThemeRadius + Math.max(0, myIndex) * themeRadiusIncrement,
        parentTheme: null,
        isUserTheme,
        hidden: false,
      };
    } else {
      // Discovery mode: show unconnected themes in outer orbit
      const otherThemes = themes
        .filter((t) => !t.theme_id || !userThemeSet.has(String(t.theme_id)))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))); // stable order

      const otherIndex = otherThemes.findIndex((t) => t.id === node.id);
      const orbitR = 900; // Further out for discovery
      const angle = (otherIndex / Math.max(1, otherThemes.length)) * 2 * Math.PI;

      return {
        x: centerX + Math.cos(angle) * orbitR,
        y: centerY + Math.sin(angle) * orbitR,
        themeRadius: 180,
        parentTheme: null,
        isUserTheme: false,
        hidden: false,
        isDiscoverable: true, // Mark as discoverable theme
      };
    }
  }

  // ----------------------------
  // PROJECTS - Per yellow comments: Should be associated with themes and reside within theme circles
  // ----------------------------
  if (node.type === "project") {
    const fallbackRadius = 250;

    if (node.theme_id) {
      const parentTheme = allNodes.find(
        (n) => n.type === "theme" && n.theme_id === node.theme_id
      );

      if (parentTheme && !parentTheme.hidden) {
        const projectsInTheme = allNodes.filter(
          (n) => n.type === "project" && n.theme_id === node.theme_id
        );

        const projectIndex = projectsInTheme.findIndex((p) => p.id === node.id);
        const projectCount = projectsInTheme.length;

        const angle = (projectIndex / (projectCount || 1)) * 2 * Math.PI;
        // Per yellow comments: Projects should be "orbited" by people within the theme circle
        const projectDistance = (parentTheme.themeRadius || fallbackRadius) * 0.5; // Closer to theme center

        return {
          x: parentTheme.x + Math.cos(angle) * projectDistance,
          y: parentTheme.y + Math.sin(angle) * projectDistance,
          parentTheme: parentTheme.theme_id,
          themeRadius: parentTheme.themeRadius,
          projectOrbitAngle: angle,
          hidden: false,
        };
      }
    }

    // Per yellow comments: If project has no theme or theme is hidden, hide the project
    return {
      x: centerX + 10000, // Off-screen
      y: centerY + 10000,
      parentTheme: null,
      hidden: true,
    };
  }

  // ----------------------------
  // PEOPLE - Per yellow comments: User should be fixed in center
  // ----------------------------
  if (node.type === "person") {
    const fallbackRadius = 250;

    if (node.isCurrentUser) {
      // Per yellow comments: User node should be fixed in the center
      return {
        x: centerX,
        y: centerY,
        parentTheme: findMostActiveTheme(allNodes, currentUserCommunityId),
        isUserCenter: true,
        hidden: false,
      };
    }

    // Per yellow comments: Other people should orbit around projects within theme circles
    if (Array.isArray(node.projects) && node.projects.length > 0) {
      const firstProject = allNodes.find(
        (n) => n.type === "project" && n.id === node.projects[0]
      );

      if (firstProject && firstProject.x != null && firstProject.y != null && !firstProject.hidden) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * 25 + 15; // Closer orbit around projects

        return {
          x: firstProject.x + Math.cos(angle) * distance,
          y: firstProject.y + Math.sin(angle) * distance,
          parentTheme: firstProject.parentTheme || null,
          parentProject: firstProject.id,
          hidden: false,
        };
      }
    }

    // If person has themes but no projects, place near theme center
    if (Array.isArray(node.themes) && node.themes.length > 0) {
      const firstTheme = allNodes.find(
        (n) => n.type === "theme" && n.theme_id === node.themes[0]
      );

      if (firstTheme && !firstTheme.hidden) {
        const themeRadius = firstTheme.themeRadius || fallbackRadius;
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * (themeRadius * 0.3) + themeRadius * 0.2;

        return {
          x: firstTheme.x + Math.cos(angle) * distance,
          y: firstTheme.y + Math.sin(angle) * distance,
          parentTheme: firstTheme.theme_id,
          hidden: false,
        };
      }
    }

    // Per yellow comments: If person is not connected to user's themes, hide them
    return {
      x: centerX + 10000, // Off-screen
      y: centerY + 10000,
      parentTheme: null,
      hidden: true,
    };
  }

  return { x: centerX, y: centerY, parentTheme: null, hidden: false };
}

/* ==========================================================================
   FORCES
   ========================================================================== */

/**
 * ✅ FIXED:
 * containment measures from the *parent theme position* (not from center)
 */
function createContainmentForce(simulationNodes, allNodes) {
  return function containmentForce(alpha) {
    const strength = 0.5;

    simulationNodes.forEach((node) => {
      if (node.type === "theme") return;
      if (node.x == null || node.y == null || !node.parentTheme) return;
      if (node.isUserCenter) return;

      const parentTheme = allNodes.find(
        (n) => n.type === "theme" && n.theme_id === node.parentTheme
      );
      if (!parentTheme || parentTheme.x == null || parentTheme.y == null) return;
      if (!parentTheme.themeRadius) return;

      const dx = node.x - parentTheme.x;
      const dy = node.y - parentTheme.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const maxRadius =
        node.type === "project"
          ? parentTheme.themeRadius * 0.75
          : parentTheme.themeRadius * 0.9;

      if (distance > maxRadius) {
        const overflow = distance - maxRadius;
        const force = (overflow * strength * alpha) / (distance || 1);

        node.vx -= (dx / distance) * force;
        node.vy -= (dy / distance) * force;
      }
    });
  };
}

function createProjectContainmentForce(allNodes) {
  return function projectContainmentForce(alpha) {
    const strength = 0.6;
    const projectCircleRadius = 35;

    allNodes.forEach((node) => {
      if (node.type !== "person" || node.x == null || node.y == null) return;
      if (node.isUserCenter) return;
      if (!node.projects || node.projects.length === 0) return;

      const project = allNodes.find(
        (n) => n.type === "project" && n.id === node.projects[0]
      );
      if (!project || project.x == null || project.y == null) return;

      const dx = node.x - project.x;
      const dy = node.y - project.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > projectCircleRadius) {
        const overflow = distance - projectCircleRadius;
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
}

/**
 * ✅ CRITICAL FIX:
 * D3 forceLink throws "node not found: <id>" if ANY link endpoint doesn't exist in the simulation nodes.
 *
 * This function:
 * - Normalizes endpoints to ids
 * - Repairs "theme:<uuid>" into actual theme node ids when possible
 * - Drops any remaining invalid links
 */
function normalizeAndFilterLinks(allNodes, rawLinks) {
  const nodeIdSet = new Set(allNodes.map((n) => n.id));

  // Map theme_id -> node.id (because links may use raw uuid or "theme:<uuid>")
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

      // raw uuid theme_id?
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

  const filtered = normalized.filter((l) => {
    const s = typeof l.source === "object" ? l.source?.id : l.source;
    const t = typeof l.target === "object" ? l.target?.id : l.target;

    const ok = nodeIdSet.has(s) && nodeIdSet.has(t);
    if (!ok) {
      console.warn("🧹 Dropping invalid link (missing node):", {
        source: s,
        target: t,
        link: l,
      });
    }
    return ok;
  });

  return filtered;
}

async function buildGraph() {
  const d3 = window.d3;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerX = width / 2;
  const centerY = height / 2;

  // Performance monitoring
  const perfStart = performance.now();
  console.log("🚀 Building graph with performance optimizations...");

  // Ensure links are safe before any link-based computation
  links = normalizeAndFilterLinks(nodes, links);

  // Step 1: Position all nodes first
  nodes.forEach((node) => {
    const position = calculateNestedPosition(
      node,
      nodes,
      links,
      centerX,
      centerY,
      currentUserCommunityId
    );

    node.x = position.x;
    node.y = position.y;
    node.themeRadius = position.themeRadius;
    node.parentTheme = position.parentTheme;
    node.isUserTheme = position.isUserTheme;
    node.isUserCenter = position.isUserCenter;
    node.parentProject = position.parentProject;
    node.projectOrbitAngle = position.projectOrbitAngle;
    node.hidden = position.hidden;

    // Pin themes so they act "static" but exist for forceLink resolution
    if (node.type === "theme" && !node.hidden) {
      node.fx = node.x;
      node.fy = node.y;
    }
  });

  // Per yellow comments: Filter out hidden nodes and links to hidden nodes
  const visibleNodes = nodes.filter((n) => !n.hidden);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  
  const visibleLinks = links.filter((l) => {
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    const targetId = typeof l.target === "object" ? l.target.id : l.target;
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });

  console.log(`🎯 Visibility filtering:`, {
    totalNodes: nodes.length,
    visibleNodes: visibleNodes.length,
    hiddenNodes: nodes.length - visibleNodes.length,
    totalLinks: links.length,
    visibleLinks: visibleLinks.length,
    showFullCommunity
  });

  // Log what types of nodes are visible
  const visibleByType = visibleNodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  console.log("👁️ Visible nodes by type:", visibleByType);

  // If no visible nodes, this might be the issue
  if (visibleNodes.length === 0) {
    console.warn("⚠️ No visible nodes! This might be why nothing is showing.");
    console.log("🔍 All nodes:", nodes.map(n => ({ id: n.id, type: n.type, hidden: n.hidden })));
  }

  // If no visible nodes, automatically enable discovery mode for new users
  if (visibleNodes.length <= 1) { // Only current user or no nodes
    console.log("🔍 No connected content found, enabling discovery mode...");
    if (!showFullCommunity) {
      showFullCommunity = true;
      console.log("🌐 Discovery mode enabled - reloading data...");
      await reloadAllData();
      await rebuildGraph();
      return;
    }
  }

  // ✅ Use only visible nodes and links for simulation
  const simulationNodes = visibleNodes;
  const simulationLinks = visibleLinks;

  // Performance: Count DOM elements that will be created
  const domElementCount = {
    themes: visibleNodes.filter(n => n.type === 'theme').length * 4, // Simplified: 2 circles + 3 text elements
    projects: visibleNodes.filter(n => n.type === 'project').length * 1, // 1 circle each
    people: visibleNodes.filter(n => n.type === 'person').length * 3, // circle + image/text + label
    links: simulationLinks.length * 1, // 1 line each (simplified)
  };
  const totalElements = Object.values(domElementCount).reduce((a, b) => a + b, 0);
  console.log("📊 DOM elements to create:", domElementCount, "Total:", totalElements);

  simulation = d3
    .forceSimulation(simulationNodes)
    .force(
      "link",
      d3
        .forceLink(simulationLinks)
        .id((d) => d.id)
        .distance((d) => {
          if (d.type === "project" || d.status === "project-member") return 30;
          if (d.type === "theme" || d.status === "theme-participant") return 40;
          if (d.status === "accepted") return 60;
          return 80;
        })
        .strength((d) => {
          if (d.type === "project" || d.status === "project-member") return 0.2;
          if (d.type === "theme" || d.status === "theme-participant") return 0.15;
          return 0.05;
        })
    )
    .force("charge", d3.forceManyBody().strength(-50).distanceMax(150))
    .force("containment", createContainmentForce(simulationNodes, visibleNodes))
    .force("projectContainment", createProjectContainmentForce(visibleNodes))
    .force(
      "collision",
      d3
        .forceCollide()
        .radius((d) => {
          if (d.type === "theme") return 0; // themes are separate visuals; keep collision out of it
          if (d.type === "project") return 38;
          if (d.isCurrentUser) return 30;
          return 20;
        })
        .strength(0.7)
    )
    .velocityDecay(0.5)
    .alphaDecay(0.04)
    .alphaMin(0.001);

  // RENDERING ORDER: Background to foreground for proper z-index layering
  
  // 1. Theme circles (background layer) - render FIRST so they appear behind everything
  const visibleThemeNodes = visibleNodes.filter((n) => n.type === "theme");
  if (visibleThemeNodes.length > 0) {
    themeEls = renderThemeCircles(container, visibleThemeNodes, {
      onThemeHover: handleThemeHover,
      onThemeClick: (event, d) => openThemeCard(d),
    });
  }

  // 2. Project circles (behind nodes but above themes)
  const visibleProjects = visibleNodes.filter((n) => n.type === "project");
  projectCircles = drawProjectCircles(container, visibleProjects);

  // 3. Links (middle layer)
  linkEls = renderLinks(container, simulationLinks);

  // 4. Nodes (foreground layer) - render LAST so they appear on top
  const visibleNonThemeNodes = visibleNodes.filter((n) => n.type !== "theme");
  nodeEls = renderNodes(container, visibleNonThemeNodes, { onNodeClick });

  // Drag for nodes
  nodeEls.call(
    d3
      .drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded)
  );

  // Performance monitoring
  const perfEnd = performance.now();
  console.log(`⚡ Graph built in ${(perfEnd - perfStart).toFixed(2)}ms with ${totalElements} DOM elements`);

  // Tick
  let tickCount = 0;
  let hasInitialCentered = false;

  simulation.on("tick", () => {
    tickCount++;
    if (tickCount % 2 !== 0) return;

    // Keep themes pinned every tick (prevents drift) - only visible themes
    const visibleThemes = visibleNodes.filter((n) => n.type === "theme");
    if (visibleThemes.length > 0) {
      for (const t of visibleThemes) {
        if (t.fx != null) t.x = t.fx;
        if (t.fy != null) t.y = t.fy;
      }
    }

    if (!hasInitialCentered && simulation.alpha() < 0.1 && tickCount > 50) {
      hasInitialCentered = true;
      const userNode = findCurrentUserNode(visibleNodes, currentUserCommunityId);
      if (userNode) {
        console.log("🎯 Initial centering on user node:", userNode.name);
        setTimeout(() => {
          setFocusOnNode(
            userNode,
            svg,
            container,
            zoomBehavior,
            nodeEls,
            linkEls,
            visibleNodes
          );
        }, 500);
      }
    }

    // Update link positions - simplified for single line elements
    linkEls
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    nodeEls.attr("transform", (d) => `translate(${d.x},${d.y})`);

    projectCircles?.update?.();

    try {
      PathwayAnimations.updateAllPathwayPositions?.();
    } catch (_) {}
  });
}

/* ==========================================================================
   THEME INTERACTIONS
   ========================================================================== */

function handleThemeHover(event, themeNode, isEntering) {
  if (isEntering) {
    event.currentTarget.style.cursor = "pointer";
  }
}

async function openThemeCard(themeNode) {
  const d3 = window.d3;

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

  const relatedProjects = nodes.filter((n) => {
    if (n.type !== "project") return false;

    if (n.theme_id === themeNode.theme_id) return true;

    const projectTags = n.tags || [];
    return projectTags.some((tag) => themeTags.includes(tag));
  });

  nodeEls?.style("opacity", (d) => {
    if (!d) return 0.2;
    if (d.type === "project" && relatedProjects.some((p) => p.id === d.id)) {
      return 1;
    }
    return 0.2;
  });

  linkEls?.style("opacity", (d) => {
    if (!d) return 0.1;
    const sourceId = typeof d.source === "object" ? d.source?.id : d.source;
    const targetId = typeof d.target === "object" ? d.target?.id : d.target;

    const isRelatedLink = relatedProjects.some(
      (p) => sourceId === p?.id || targetId === p?.id
    );
    return isRelatedLink ? 0.6 : 0.1;
  });

  themeEls?.style("opacity", (d) => (d?.id === themeNode?.id ? 1 : 0.3));

  await openThemeProjectsPanel(themeNode, relatedProjects);
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
  nodeEls?.style("opacity", 1);
  linkEls?.style("opacity", (d) => {
    if (d.status === "suggested") return 0.5;
    return 0.8;
  });
  themeEls?.style("opacity", 1);
}

/* ==========================================================================
   NODE CLICK ROUTING
   ========================================================================== */

function onNodeClick(event, d) {
  event.stopPropagation();

  setFocusOnNode(d, svg, container, zoomBehavior, nodeEls, linkEls, nodes);

  if (d.type === "theme") {
    openThemeCard(d);
    return;
  }

  try {
    openNodePanel({
      id: d.id,
      name: d.name,
      type: d.type || "person",
      ...d,
    });
  } catch (e) {
    console.warn("openNodePanel failed:", e);
  }
}

/* ==========================================================================
   DRAG
   ========================================================================== */

function dragStarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

/* ==========================================================================
   PATHWAY COMPAT EXPORTS (synapse.js expects these)
   ========================================================================== */

export function clearConnectPathways(opts = {}) {
  try {
    if (typeof PathwayAnimations.clearAllPathways === "function") {
      return PathwayAnimations.clearAllPathways(opts);
    }
    if (typeof PathwayAnimations.clearConnectPathways === "function") {
      return PathwayAnimations.clearConnectPathways(opts);
    }
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
      console.warn("⚠️ showConnectPathways missing ids", {
        fromId,
        toId,
        resolvedFrom,
        resolvedTo,
        currentUserCommunityId,
      });
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

export async function illuminatePathways(
  { limit = 5, clearFirst = true, opts = {} } = {}
) {
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
