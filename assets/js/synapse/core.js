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
   NESTED THEME LAYOUT (per yellow instructions)
   ========================================================================== */

/**
 * Calculate which theme has the most activity for the current user
 * Returns the theme_id or null if no themes
 */
function findMostActiveTheme(allNodes, currentUserCommunityId) {
  const themes = allNodes.filter(n => n.type === 'theme');
  const projects = allNodes.filter(n => n.type === 'project');
  const currentUser = allNodes.find(n => n.id === currentUserCommunityId);

  if (!currentUser || themes.length === 0) return null;

  let maxActivity = -1;
  let mostActiveTheme = null;

  themes.forEach(theme => {
    let activityScore = 0;

    // Score: Projects user is on in this theme
    const userProjectsInTheme = projects.filter(p =>
      p.theme_id === theme.theme_id &&
      currentUser.projects?.includes(p.id)
    );
    activityScore += userProjectsInTheme.length * 10;

    // Score: User participation in theme
    if (currentUser.themes?.includes(theme.theme_id)) {
      activityScore += 5;
    }

    // Score: Total projects in theme (minor factor)
    const projectsInTheme = projects.filter(p => p.theme_id === theme.theme_id);
    activityScore += projectsInTheme.length;

    if (activityScore > maxActivity) {
      maxActivity = activityScore;
      mostActiveTheme = theme.theme_id;
    }
  });

  return mostActiveTheme;
}

/**
 * Position nodes in nested structure:
 * - Themes are distributed around canvas
 * - Projects are INSIDE their theme circles
 * - Users are INSIDE the projects they're on
 * - Current user is in their most active theme
 */
function calculateNestedPosition(node, allNodes, centerX, centerY, currentUserCommunityId) {
  const themes = allNodes.filter(n => n.type === 'theme');
  const themeRadius = 150; // Theme circle radius
  const projectRadius = 40; // Project circle radius

  if (node.type === 'theme') {
    // Distribute themes in a grid-like pattern
    const themeIndex = themes.findIndex(t => t.id === node.id);
    const totalThemes = themes.length;

    // Arrange themes in a circular or grid pattern
    if (totalThemes === 1) {
      return { x: centerX, y: centerY, parentTheme: null };
    } else if (totalThemes === 2) {
      const spacing = 400;
      const offset = (themeIndex - 0.5) * spacing;
      return { x: centerX + offset, y: centerY, parentTheme: null };
    } else {
      // Circular arrangement for multiple themes
      const radius = Math.max(300, totalThemes * 80);
      const angle = (themeIndex / totalThemes) * 2 * Math.PI;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        parentTheme: null
      };
    }
  } else if (node.type === 'project') {
    // Position project INSIDE its theme circle
    if (node.theme_id) {
      const parentTheme = allNodes.find(n =>
        n.type === 'theme' && n.theme_id === node.theme_id
      );

      if (parentTheme && parentTheme.x && parentTheme.y) {
        // Get all projects in this theme
        const projectsInTheme = allNodes.filter(n =>
          n.type === 'project' && n.theme_id === node.theme_id
        );
        const projectIndex = projectsInTheme.findIndex(p => p.id === node.id);

        // Arrange projects in a circle inside the theme
        const projectCount = projectsInTheme.length;
        const innerRadius = projectCount > 3 ? 60 : 40; // Smaller radius for fewer projects
        const angle = (projectIndex / projectCount) * 2 * Math.PI;

        return {
          x: parentTheme.x + Math.cos(angle) * innerRadius,
          y: parentTheme.y + Math.sin(angle) * innerRadius,
          parentTheme: parentTheme.theme_id
        };
      }
    }

    // Fallback: position unassigned projects outside themes
    return {
      x: centerX + (Math.random() - 0.5) * 600,
      y: centerY + (Math.random() - 0.5) * 600,
      parentTheme: null
    };
  } else if (node.type === 'person') {
    // Position user INSIDE their project(s) or theme
    if (node.isCurrentUser) {
      // Current user goes in their most active theme
      const mostActiveThemeId = findMostActiveTheme(allNodes, currentUserCommunityId);
      if (mostActiveThemeId) {
        const activeTheme = allNodes.find(n =>
          n.type === 'theme' && n.theme_id === mostActiveThemeId
        );
        if (activeTheme && activeTheme.x && activeTheme.y) {
          return {
            x: activeTheme.x,
            y: activeTheme.y,
            parentTheme: mostActiveThemeId
          };
        }
      }
      // Fallback to center
      return { x: centerX, y: centerY, parentTheme: null };
    } else {
      // Other users: position inside their first project
      if (node.projects && node.projects.length > 0) {
        const firstProject = allNodes.find(n =>
          n.type === 'project' && n.id === node.projects[0]
        );
        if (firstProject && firstProject.x && firstProject.y) {
          // Randomly position around the project center
          const angle = Math.random() * 2 * Math.PI;
          const distance = Math.random() * 15 + 5; // 5-20px from center
          return {
            x: firstProject.x + Math.cos(angle) * distance,
            y: firstProject.y + Math.sin(angle) * distance,
            parentTheme: firstProject.parentTheme || null
          };
        }
      }

      // If no projects, position in a theme they participate in
      if (node.themes && node.themes.length > 0) {
        const firstTheme = allNodes.find(n =>
          n.type === 'theme' && n.theme_id === node.themes[0]
        );
        if (firstTheme && firstTheme.x && firstTheme.y) {
          const angle = Math.random() * 2 * Math.PI;
          const distance = Math.random() * 60 + 30;
          return {
            x: firstTheme.x + Math.cos(angle) * distance,
            y: firstTheme.y + Math.sin(angle) * distance,
            parentTheme: firstTheme.theme_id
          };
        }
      }

      // Fallback: position outside themes
      return {
        x: centerX + (Math.random() - 0.5) * 800,
        y: centerY + (Math.random() - 0.5) * 800,
        parentTheme: null
      };
    }
  }

  return { x: centerX, y: centerY, parentTheme: null };
}

/**
 * Create containment force to keep nodes inside their parent containers
 */
function createContainmentForce(allNodes) {
  return function containmentForce(alpha) {
    const strength = 0.5;

    allNodes.forEach(node => {
      if (!node.x || !node.y || !node.parentTheme) return;

      // Find parent theme
      const parentTheme = allNodes.find(n =>
        n.type === 'theme' && n.theme_id === node.parentTheme
      );

      if (!parentTheme || !parentTheme.x || !parentTheme.y) return;

      // Calculate distance from theme center
      const dx = node.x - parentTheme.x;
      const dy = node.y - parentTheme.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Theme radius boundary (smaller than visual radius to keep nodes inside)
      const maxRadius = node.type === 'project' ? 80 : 120;

      if (distance > maxRadius) {
        // Push node back toward theme center
        const overflow = distance - maxRadius;
        const force = (overflow * strength * alpha) / (distance || 1);

        node.vx -= (dx / distance) * force;
        node.vy -= (dy / distance) * force;
      }
    });
  };
}

/**
 * Create project containment force to keep users inside projects
 */
function createProjectContainmentForce(allNodes) {
  return function projectContainmentForce(alpha) {
    const strength = 0.7;

    allNodes.forEach(node => {
      if (node.type !== 'person' || !node.x || !node.y) return;
      if (!node.projects || node.projects.length === 0) return;

      // Find first project user is in
      const project = allNodes.find(n =>
        n.type === 'project' && n.id === node.projects[0]
      );

      if (!project || !project.x || !project.y) return;

      // Calculate distance from project center
      const dx = node.x - project.x;
      const dy = node.y - project.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Keep users within project radius
      const maxRadius = 25;

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

  // Step 1: Position themes first (they need to be positioned before other nodes)
  nodes.filter(n => n.type === 'theme').forEach(node => {
    const position = calculateNestedPosition(node, nodes, centerX, centerY, currentUserCommunityId);
    node.x = position.x;
    node.y = position.y;
    node.parentTheme = position.parentTheme;
  });

  // Step 2: Position projects (they depend on theme positions)
  nodes.filter(n => n.type === 'project').forEach(node => {
    const position = calculateNestedPosition(node, nodes, centerX, centerY, currentUserCommunityId);
    node.x = position.x;
    node.y = position.y;
    node.parentTheme = position.parentTheme;
  });

  // Step 3: Position people (they depend on project and theme positions)
  nodes.filter(n => n.type === 'person').forEach(node => {
    const position = calculateNestedPosition(node, nodes, centerX, centerY, currentUserCommunityId);
    node.x = position.x;
    node.y = position.y;
    node.parentTheme = position.parentTheme;
  });

  simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => {
          // Very weak link forces - we want containment to dominate
          if (d.type === "project" || d.status === "project-member") return 30;
          if (d.type === "theme" || d.status === "theme-participant") return 40;
          if (d.status === "accepted") return 60;
          return 80;
        })
        .strength((d) => {
          // Very weak link strength to allow containment forces to dominate
          if (d.type === "project" || d.status === "project-member") return 0.2;
          if (d.type === "theme" || d.status === "theme-participant") return 0.15;
          return 0.05;
        })
    )
    .force("charge", d3.forceManyBody().strength(-80).distanceMax(200))
    .force("containment", createContainmentForce(nodes))
    .force("projectContainment", createProjectContainmentForce(nodes))
    .force(
      "collision",
      d3.forceCollide().radius((d) => {
        // Collision radius based on node type
        if (d.type === "theme") return 150; // Large theme circles
        if (d.type === "project") return 35; // Medium project circles
        if (d.isCurrentUser) return 30; // Current user
        return 20; // Other users
      }).strength(0.8)
    )
    .velocityDecay(0.5)
    .alphaDecay(0.04)
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
