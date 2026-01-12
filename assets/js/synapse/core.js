// assets/js/synapse/core.js
// Synapse Core — init, svg, simulation wiring (modularized)

import { initConnections } from "../connections.js";
import { openNodePanel } from "../node-panel.js";
import * as PathwayAnimations from "../pathway-animations.js";

import { loadSynapseData } from "./data.js";
import { setupDefs, renderLinks, renderNodes, renderThemeCircles, drawProjectCircles } from "./render.js";
import { showSynapseNotification } from "./ui.js";
import { setupSynapseRealtime } from "./realtime.js";
import { setFocusOnNode, findCurrentUserNode, clearFocusEffects } from "./focus-system.js";

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
    console.warn("⚠️ Synapse: #synapse-main-view not found (theme card/toasts may not render)");
  }

  console.log("%c🧠 Synapse Core booting...", "color:#0ff; font-weight:bold;");

  // Connection system gives us currentUserCommunityId reliably
  const userInfo = await initConnections(supabase);
  currentUserCommunityId = userInfo?.currentUserCommunityId || null;

  setupSVG();
  await reloadAllData();
  buildGraph();

  // Realtime refresh (connections/projects/themes)
  setupSynapseRealtime(supabase, async () => {
    await reloadAllData();
    rebuildGraph();
  });

  // Pathway animation system (safe)
  try {
    PathwayAnimations.initPathwayAnimations(supabase, svg, container, nodes, links);
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
  rebuildGraph();
}

export async function refreshThemeCircles() {
  await reloadAllData();
  rebuildGraph();
}

export async function toggleFullCommunityView(show) {
  if (typeof show === 'boolean') {
    showFullCommunity = show;
  } else {
    showFullCommunity = !showFullCommunity;
  }

  console.log(`🌐 Synapse view mode: ${showFullCommunity ? 'Full Community' : 'My Network'}`);

  await reloadAllData();
  rebuildGraph();
}

export function getSynapseStats() {
  const peopleCount = nodes.filter((n) => n.type === "person").length;
  const projectCount = nodes.filter((n) => n.type === "project").length;
  const themeCount = nodes.filter((n) => n.type === "theme").length;

  const acceptedSet = new Set(["accepted", "active", "connected", "approved"]);
  const myConns = (connectionsData || []).filter(
    (c) => c.from_user_id === currentUserCommunityId || c.to_user_id === currentUserCommunityId
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

  const loaded = await loadSynapseData({
    supabase,
    currentUserCommunityId,
    showFullCommunity
  });

  nodes = loaded.nodes || [];
  links = loaded.links || [];
  connectionsData = loaded.connectionsData || [];
  projectMembersData = loaded.projectMembersData || [];

  // Themes are now loaded directly in loadSynapseData()

  // Keep pathway module in sync with the latest arrays
  try {
    PathwayAnimations.updateGraphData?.(nodes, links);
  } catch (_) {}
}

/* ==========================================================================
   HIERARCHICAL CONCENTRIC CIRCLES LAYOUT
   ========================================================================== */

// Define the radial structure
const RADIAL_CONFIG = {
  center: 0,           // User at center
  innerRing: 250,      // Theme nodes
  middleRing: 500,     // Project nodes
  outerRing: 750       // Other people and organizations
};

/**
 * Calculate initial radial position for a node based on its type and relationships
 */
function calculateRadialPosition(node, allNodes, centerX, centerY, currentUserCommunityId) {
  let targetRadius = 0;
  let angle = 0;

  // Determine which ring this node belongs to
  if (node.isCurrentUser) {
    // Center: Current user
    targetRadius = RADIAL_CONFIG.center;
    angle = 0;
  } else if (node.type === 'theme') {
    // Inner ring: Themes
    targetRadius = RADIAL_CONFIG.innerRing;

    // Distribute themes evenly around the inner ring
    const themes = allNodes.filter(n => n.type === 'theme');
    const themeIndex = themes.findIndex(t => t.id === node.id);
    const totalThemes = themes.length;
    angle = (themeIndex / totalThemes) * 2 * Math.PI;
  } else if (node.type === 'project') {
    // Middle ring: Projects (positioned near their theme if assigned)
    targetRadius = RADIAL_CONFIG.middleRing;

    if (node.theme_id) {
      // Find the parent theme to align angular position
      const parentTheme = allNodes.find(n => n.type === 'theme' && n.theme_id === node.theme_id);
      if (parentTheme && parentTheme.angle !== undefined) {
        // Position project at same angle as theme, but in middle ring
        angle = parentTheme.angle;
        // Add slight offset for multiple projects per theme
        const projectsInTheme = allNodes.filter(n =>
          n.type === 'project' && n.theme_id === node.theme_id
        );
        const projectIndex = projectsInTheme.findIndex(p => p.id === node.id);
        angle += (projectIndex - projectsInTheme.length / 2) * 0.15; // Spread projects
      } else {
        angle = Math.random() * 2 * Math.PI;
      }
    } else {
      // Distribute unassigned projects evenly
      const projects = allNodes.filter(n => n.type === 'project');
      const projectIndex = projects.findIndex(p => p.id === node.id);
      const totalProjects = projects.length;
      angle = (projectIndex / totalProjects) * 2 * Math.PI;
    }
  } else if (node.type === 'person') {
    // Outer ring: Other people
    targetRadius = RADIAL_CONFIG.outerRing;

    // Position people near themes they participate in, or projects they're on
    if (node.themes && node.themes.length > 0) {
      // Position near first theme they participate in
      const firstTheme = allNodes.find(n =>
        n.type === 'theme' && n.theme_id === node.themes[0]
      );
      if (firstTheme && firstTheme.angle !== undefined) {
        angle = firstTheme.angle;
        // Add spread for multiple people per theme
        angle += (Math.random() - 0.5) * 0.3;
      } else {
        angle = Math.random() * 2 * Math.PI;
      }
    } else if (node.projects && node.projects.length > 0) {
      // Position near first project they're on
      const firstProject = allNodes.find(n =>
        n.type === 'project' && n.id === node.projects[0]
      );
      if (firstProject && firstProject.angle !== undefined) {
        angle = firstProject.angle;
        angle += (Math.random() - 0.5) * 0.3;
      } else {
        angle = Math.random() * 2 * Math.PI;
      }
    } else {
      // Distribute unconnected people evenly
      const people = allNodes.filter(n => n.type === 'person' && !n.isCurrentUser);
      const personIndex = people.findIndex(p => p.id === node.id);
      const totalPeople = people.length;
      angle = (personIndex / totalPeople) * 2 * Math.PI;
    }
  }

  // Store angle for reference by child nodes
  node.angle = angle;
  node.targetRadius = targetRadius;

  // Calculate x, y from polar coordinates
  return {
    x: centerX + Math.cos(angle) * targetRadius,
    y: centerY + Math.sin(angle) * targetRadius,
    angle: angle,
    targetRadius: targetRadius
  };
}

/**
 * Custom force to maintain radial structure (concentric circles)
 */
function createRadialForce(allNodes, centerX, centerY) {
  return function radialForce(alpha) {
    const strength = 0.3; // How strongly to pull nodes to their target radius

    allNodes.forEach(node => {
      if (!node.x || !node.y || node.targetRadius === undefined) return;

      // Calculate current radius from center
      const dx = node.x - centerX;
      const dy = node.y - centerY;
      const currentRadius = Math.sqrt(dx * dx + dy * dy);

      // Don't apply force if we're at the center (current user)
      if (node.targetRadius === 0) {
        node.vx = 0;
        node.vy = 0;
        node.x = centerX;
        node.y = centerY;
        return;
      }

      // Calculate how far we are from target radius
      const radiusError = currentRadius - node.targetRadius;

      // Apply force toward/away from center to reach target radius
      if (currentRadius > 1) { // Avoid division by zero
        const forceStrength = (radiusError * strength * alpha) / currentRadius;
        node.vx -= dx * forceStrength;
        node.vy -= dy * forceStrength;
      }
    });
  };
}

/**
 * Custom force to maintain angular spacing within rings
 */
function createAngularSortingForce(allNodes, centerX, centerY) {
  return function angularSortingForce(alpha) {
    const strength = 0.05; // Gentle force to maintain angular order

    // Group nodes by ring
    const rings = {
      innerRing: allNodes.filter(n => n.targetRadius === RADIAL_CONFIG.innerRing),
      middleRing: allNodes.filter(n => n.targetRadius === RADIAL_CONFIG.middleRing),
      outerRing: allNodes.filter(n => n.targetRadius === RADIAL_CONFIG.outerRing)
    };

    Object.values(rings).forEach(ringNodes => {
      if (ringNodes.length <= 1) return;

      ringNodes.forEach((node, i) => {
        if (!node.x || !node.y) return;

        // Find neighboring nodes in the ring
        const prevNode = ringNodes[(i - 1 + ringNodes.length) % ringNodes.length];
        const nextNode = ringNodes[(i + 1) % ringNodes.length];

        if (!prevNode || !nextNode) return;

        // Calculate current angle
        const dx = node.x - centerX;
        const dy = node.y - centerY;
        const currentAngle = Math.atan2(dy, dx);

        // Calculate ideal angle (between neighbors)
        const prevAngle = Math.atan2(prevNode.y - centerY, prevNode.x - centerX);
        const nextAngle = Math.atan2(nextNode.y - centerY, nextNode.x - centerX);

        // Gentle push to maintain spacing
        let targetAngle = (prevAngle + nextAngle) / 2;

        // Handle wrap-around
        if (Math.abs(nextAngle - prevAngle) > Math.PI) {
          targetAngle += Math.PI;
        }

        // Apply small rotational force
        const angleDiff = targetAngle - currentAngle;
        const radius = node.targetRadius || 1;

        // Convert angle difference to tangential velocity
        node.vx += -Math.sin(currentAngle) * angleDiff * strength * alpha * radius;
        node.vy += Math.cos(currentAngle) * angleDiff * strength * alpha * radius;
      });
    });
  };
}

/* ==========================================================================
   GRAPH BUILD / REBUILD
   ========================================================================== */

function rebuildGraph() {
  try {
    container?.selectAll("*")?.remove();
  } catch (_) {}

  try {
    simulation?.stop();
  } catch (_) {}

  buildGraph();

  // Ensure pathway module sees the rebuilt graph arrays
  try {
    PathwayAnimations.updateGraphData?.(nodes, links);
  } catch (_) {}
}

function buildGraph() {
  const d3 = window.d3;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerX = width / 2;
  const centerY = height / 2;

  // Apply initial radial positioning to all nodes
  nodes.forEach(node => {
    const position = calculateRadialPosition(node, nodes, centerX, centerY, currentUserCommunityId);
    node.x = position.x;
    node.y = position.y;
    node.angle = position.angle;
    node.targetRadius = position.targetRadius;
  });

  simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => {
          // Radial layout: links should adapt to hierarchy
          const source = typeof d.source === 'object' ? d.source : nodes.find(n => n.id === d.source);
          const target = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === d.target);

          if (!source || !target) return 100;

          // Calculate natural distance based on ring positions
          const sourceRadius = source.targetRadius || 0;
          const targetRadius = target.targetRadius || 0;
          const radiusDiff = Math.abs(sourceRadius - targetRadius);

          // Connections within the same ring should be shorter
          if (radiusDiff < 50) return 80;

          // Connections between adjacent rings
          if (radiusDiff < 300) return 150;

          // Connections spanning multiple rings
          return 250;
        })
        .strength((d) => {
          // Weaker link strength to allow radial forces to dominate
          const source = typeof d.source === 'object' ? d.source : nodes.find(n => n.id === d.source);
          const target = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === d.target);

          if (!source || !target) return 0.1;

          // Stronger for same-ring connections
          const sourceRadius = source.targetRadius || 0;
          const targetRadius = target.targetRadius || 0;
          const radiusDiff = Math.abs(sourceRadius - targetRadius);

          if (radiusDiff < 50) return 0.4;
          if (radiusDiff < 300) return 0.2;
          return 0.1;
        })
    )
    .force("charge", d3.forceManyBody().strength(-150).distanceMax(300))
    .force("radial", createRadialForce(nodes, centerX, centerY))
    .force("angular", createAngularSortingForce(nodes, centerX, centerY))
    .force(
      "collision",
      d3.forceCollide().radius((d) => {
        // Collision radius based on node type and hierarchy
        if (d.type === "theme") return 110; // Themes are large in inner ring
        if (d.type === "project") return 45;
        if (d.isCurrentUser) return 60; // Center user is largest
        return 35;
      })
    )
    .velocityDecay(0.4)
    .alphaDecay(0.03)
    .alphaMin(0.001);

  // Project circles (behind)
  projectCircles = drawProjectCircles(container, nodes.filter((n) => n.type === "person"));

  // Links
  linkEls = renderLinks(container, links);

  // Nodes (people and projects)
  const nonThemeNodes = nodes.filter(n => n.type !== 'theme');
  nodeEls = renderNodes(container, nonThemeNodes, { onNodeClick });

  // Theme circles (separate rendering)
  const themeNodes = nodes.filter(n => n.type === 'theme');
  if (themeNodes.length > 0) {
    themeEls = renderThemeCircles(container, themeNodes, {
      onThemeHover: handleThemeHover,
      onThemeClick: (event, d) => openThemeCard(d)
    });
  }

  // Drag for nodes
  nodeEls.call(
    d3
      .drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded)
  );

  // Drag for theme circles
  if (themeEls) {
    themeEls.call(
      d3
        .drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
    );
  }

  // Tick
  let tickCount = 0;
  let hasInitialCentered = false;
  simulation.on("tick", () => {
    tickCount++;
    if (tickCount % 2 !== 0) return;

    // Center on user's node when simulation stabilizes (first time only)
    if (!hasInitialCentered && simulation.alpha() < 0.1 && tickCount > 50) {
      hasInitialCentered = true;
      const userNode = findCurrentUserNode(nodes, currentUserCommunityId);
      if (userNode) {
        console.log('🎯 Initial centering on user node:', userNode.name);
        setTimeout(() => {
          setFocusOnNode(userNode, svg, container, zoomBehavior, nodeEls, linkEls, nodes);
        }, 500); // Small delay to ensure rendering is complete
      }
    }

    // Update link positions
    linkEls
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    // Update connection highlighting based on theme proximity
    if (themeNodes.length > 0) {
      linkEls.each(function(link) {
        if (link.source.type !== 'person' || link.target.type !== 'person') return;

        // Check if both endpoints are inside any theme circle
        let insideTheme = false;
        for (const theme of themeNodes) {
          const themeRadius = 90; // Match render.js radius (70-90px)
          const sourceDist = Math.hypot(link.source.x - theme.x, link.source.y - theme.y);
          const targetDist = Math.hypot(link.target.x - theme.x, link.target.y - theme.y);

          if (sourceDist < themeRadius && targetDist < themeRadius) {
            insideTheme = true;
            break;
          }
        }

        // Adjust opacity based on theme membership
        const currentOpacity = parseFloat(window.d3.select(this).attr('opacity')) || 0.8;
        const targetOpacity = insideTheme ? Math.min(1.0, currentOpacity * 1.2) : 0.8;
        window.d3.select(this).attr('opacity', targetOpacity);
      });
    }

    nodeEls.attr("transform", (d) => `translate(${d.x},${d.y})`);

    if (themeEls) {
      themeEls.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }

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
  // Future: Add hover effects, tooltips, or visual feedback
  // For now, just change cursor
  if (isEntering) {
    event.currentTarget.style.cursor = 'pointer';
  }
}

async function openThemeCard(themeNode) {
  // ============================================================================
  // NEW PARADIGM: Themes are contextual lenses, not joinable destinations
  // ============================================================================
  // When user clicks a theme:
  // 1. Recenter graph on theme
  // 2. Dim everything except related projects
  // 3. Open side panel showing those projects
  // 4. Projects become the action point (not the theme)
  // ============================================================================

  // 1. Recenter and zoom to theme
  const scale = 1.2; // Zoom in slightly

  svg.transition()
    .duration(750)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity
        .translate(window.innerWidth / 2, window.innerHeight / 2)
        .scale(scale)
        .translate(-themeNode.x, -themeNode.y)
    );

  // 2. Find projects related to this theme
  const themeTags = themeNode.tags || [];

  // Projects are related if:
  // 1. Explicitly assigned (theme_id matches) - PRIORITY
  // 2. Share tags with this theme (tag matching)
  const relatedProjects = nodes.filter(n => {
    if (n.type !== 'project') return false;

    // Check explicit assignment first
    if (n.theme_id === themeNode.theme_id) {
      return true;
    }

    // Fall back to tag matching
    const projectTags = n.tags || [];
    return projectTags.some(tag => themeTags.includes(tag));
  });

  // 3. Dim everything except related projects
  nodeEls?.style('opacity', d => {
    if (d.type === 'project' && relatedProjects.some(p => p.id === d.id)) {
      return 1; // Full brightness for related projects
    }
    return 0.2; // Dim everything else
  });

  linkEls?.style('opacity', d => {
    // Only show links to/from related projects
    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
    const targetId = typeof d.target === 'object' ? d.target.id : d.target;

    const isRelatedLink = relatedProjects.some(p =>
      (sourceId === p.id || targetId === p.id)
    );
    return isRelatedLink ? 0.6 : 0.1;
  });

  themeEls?.style('opacity', d => {
    return d.id === themeNode.id ? 1 : 0.3;
  });

  // 4. Open side panel with project list (not join UI)
  await openThemeProjectsPanel(themeNode, relatedProjects);
}

async function openThemeProjectsPanel(themeNode, relatedProjects) {
  // Open node panel in "theme lens" mode
  // Shows theme context + list of projects (not join buttons)

  try {
    openNodePanel({
      id: themeNode.id,
      name: themeNode.title,
      type: "theme",
      description: themeNode.description,
      tags: themeNode.tags,
      expires_at: themeNode.expires_at,
      relatedProjects: relatedProjects,
      isThemeLens: true, // Flag for panel to show project list
      onClearFocus: clearThemeFocus // Function to reset graph
    });
  } catch (error) {
    console.error("Failed to open theme panel:", error);
    showSynapseNotification("Could not open theme details", "error");
  }
}

function clearThemeFocus() {
  // Reset all opacities when closing theme panel
  nodeEls?.style('opacity', 1);
  linkEls?.style('opacity', d => {
    if (d.status === "suggested") return 0.5;
    return 0.8;
  });
  themeEls?.style('opacity', 1);
}

/* ==========================================================================
   NODE CLICK ROUTING
   ========================================================================== */

function onNodeClick(event, d) {
  event.stopPropagation(); // Prevent background click

  // Apply focus to the clicked node (center + distance-based dimming)
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

/**
 * Clear any currently drawn pathways (compat for synapse.js / dashboard).
 */
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

/**
 * Return top recommendations using pathway-animations.js engine.
 */
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

/**
 * Draw a pathway from -> to.
 * If `toId` is missing (your Illuminate button case), auto-pick the top recommendation.
 */
export async function showConnectPathways(fromId, toId, opts = {}) {
  try {
    const resolvedFrom = fromId || currentUserCommunityId || null;

    // If no toId provided, auto-select a top recommendation
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

    // If pathway module has a direct API, use it
    if (typeof PathwayAnimations.showConnectPathways === "function") {
      return PathwayAnimations.showConnectPathways(resolvedFrom, resolvedTo, opts);
    }

    // Otherwise fall back to animatePathway
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

/**
 * Convenience: illuminate top N pathways at once.
 * (Optional for your UI, but useful.)
 */
export async function illuminatePathways({ limit = 5, clearFirst = true, opts = {} } = {}) {
  const me = currentUserCommunityId || null;
  if (!me) return [];

  const recs = await getRecommendations({ limit });
  if (!recs.length) return [];

  if (clearFirst) clearConnectPathways();

  // If pathway module supports a batch helper, prefer it
  if (typeof PathwayAnimations.showRecommendationPathways === "function") {
    await PathwayAnimations.showRecommendationPathways(limit);
    return recs;
  }

  // Otherwise draw sequentially
  for (const rec of recs) {
    await showConnectPathways(me, rec.userId, opts);
  }
  return recs;
}

export { setupSynapseRealtime, clearThemeFocus };
