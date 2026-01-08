// assets/js/synapse/core.js
// Synapse Core — init, svg, simulation wiring (modularized)

import { initConnections } from "../connections.js";
import { openNodePanel } from "../node-panel.js";
import * as PathwayAnimations from "../pathway-animations.js";

import { loadSynapseData } from "./data.js";
import { setupDefs, renderLinks, renderNodes, renderThemeCircles, drawProjectCircles } from "./render.js";
import { showSynapseNotification } from "./ui.js";
import { setupSynapseRealtime } from "./realtime.js";

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

  // Click background to close cards
  svg.on("click", () => {
    document.getElementById("synapse-theme-card")?.remove();
    try {
      window.closeSynapseProfileCard?.();
    } catch (_) {}
  });
}

/* ==========================================================================
   DATA LOADING
   ========================================================================== */

async function reloadAllData() {
  if (!supabase) return;

  const loaded = await loadSynapseData({ supabase, currentUserCommunityId });

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
   THEME GRAVITY PHYSICS
   ========================================================================== */

function createThemeGravityForce(allNodes) {
  // Custom force that creates gentle gravitational pull toward relevant themes
  return function themeGravity(alpha) {
    const themes = allNodes.filter(n => n.type === 'theme');
    const people = allNodes.filter(n => n.type === 'person');

    for (const person of people) {
      if (!person.x || !person.y) continue;

      for (const theme of themes) {
        if (!theme.x || !theme.y) continue;

        // Calculate distance from person to theme center
        const dx = theme.x - person.x;
        const dy = theme.y - person.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Only apply gravity within 200px range
        if (distance > 200 || distance < 1) continue;

        // Calculate relevance based on shared tags/skills/interests
        const relevance = calculateRelevance(person, theme);
        if (relevance < 0.3) continue; // Need at least 30% relevance

        // Apply gentle force (2-6% based on relevance)
        const strength = 0.02 + (relevance * 0.04); // 2% to 6%
        const force = (strength * alpha) / distance;

        person.vx += dx * force;
        person.vy += dy * force;
      }
    }
  };
}

function calculateRelevance(person, theme) {
  // Calculate how relevant this theme is to this person
  let relevanceScore = 0;
  let totalChecks = 0;

  // Check skills overlap
  const personSkills = (person.skills || []).map(s => String(s).toLowerCase());
  const themeTagsLower = (theme.tags || []).map(t => String(t).toLowerCase());

  if (personSkills.length > 0 && themeTagsLower.length > 0) {
    const sharedSkills = personSkills.filter(skill =>
      themeTagsLower.some(tag => tag.includes(skill) || skill.includes(tag))
    );
    relevanceScore += sharedSkills.length / Math.max(personSkills.length, themeTagsLower.length);
    totalChecks++;
  }

  // Check interests overlap
  const personInterests = (person.interests || []).map(i => String(i).toLowerCase());
  if (personInterests.length > 0 && themeTagsLower.length > 0) {
    const sharedInterests = personInterests.filter(interest =>
      themeTagsLower.some(tag => tag.includes(interest) || interest.includes(tag))
    );
    relevanceScore += sharedInterests.length / Math.max(personInterests.length, themeTagsLower.length);
    totalChecks++;
  }

  return totalChecks > 0 ? relevanceScore / totalChecks : 0;
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

  simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => {
          if (d.status === "project-member" || d.type === "project") return 80;
          if (d.status === "accepted") return 110;
          if (d.status === "pending") return 160;
          return 200;
        })
        .strength((d) => {
          if (d.status === "project-member" || d.type === "project") return 0.7;
          if (d.status === "accepted") return 0.5;
          if (d.status === "pending") return 0.3;
          return 0.06;
        })
    )
    .force("charge", d3.forceManyBody().strength(-320).distanceMax(420))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collision",
      d3.forceCollide().radius((d) => (d.type === "theme" ? 140 : d.type === "project" ? 55 : 40))
    )
    .force("themeGravity", createThemeGravityForce(nodes))
    .velocityDecay(0.6)
    .alphaDecay(0.05)
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
  simulation.on("tick", () => {
    tickCount++;
    if (tickCount % 2 !== 0) return;

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
          const themeRadius = 80; // Match render.js radius
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
  const interestCount = await getThemeInterestCount(supabase, themeNode.theme_id);

  // Load participants
  const { data: participantData } = await supabase
    .from('theme_participants')
    .select(`
      community_id,
      engagement_level,
      community:community_id (
        id,
        name,
        image_url
      )
    `)
    .eq('theme_id', themeNode.theme_id);

  const participants = (participantData || []).map(p => ({
    id: p.community_id,
    name: p.community?.name || 'Anonymous',
    image_url: p.community?.image_url,
    engagement_level: p.engagement_level
  }));

  await renderThemeOverlayCard({
    themeNode,
    interestCount,
    participants,
    onInterested: async () => {
      try {
        if (!currentUserCommunityId) {
          showSynapseNotification("Create your profile first", "error");
          return;
        }

        await markInterested(supabase, {
          themeId: themeNode.theme_id,
          communityId: currentUserCommunityId,
          days: 7,
        });

        showSynapseNotification("Marked interested ✨", "success");

        const newCount = await getThemeInterestCount(supabase, themeNode.theme_id);

        // Reload participants
        const { data: newParticipantData } = await supabase
          .from('theme_participants')
          .select(`
            community_id,
            engagement_level,
            community:community_id (
              id,
              name,
              image_url
            )
          `)
          .eq('theme_id', themeNode.theme_id);

        const newParticipants = (newParticipantData || []).map(p => ({
          id: p.community_id,
          name: p.community?.name || 'Anonymous',
          image_url: p.community?.image_url,
          engagement_level: p.engagement_level
        }));

        document.getElementById("synapse-theme-card")?.remove();
        await renderThemeOverlayCard({
          themeNode,
          interestCount: newCount,
          participants: newParticipants,
          onInterested: async () => {},
        });

        if (newCount >= 3) {
          simulation?.alpha?.(0.18)?.restart?.();
        }
      } catch (e) {
        console.error(e);
        showSynapseNotification(e?.message || "Failed to mark interested", "error");
      }
    },
  });
}

/* ==========================================================================
   NODE CLICK ROUTING
   ========================================================================== */

function onNodeClick(event, d) {
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

export { setupSynapseRealtime };
