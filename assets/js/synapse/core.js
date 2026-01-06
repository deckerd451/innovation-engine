// assets/js/synapse/core.js
// Synapse Core — init, svg, simulation wiring (modularized)

import { initConnections } from "../connections.js";
import { openNodePanel } from "../node-panel.js";
import * as PathwayAnimations from "../pathway-animations.js";

import { loadSynapseData } from "./data.js";
import { setupDefs, renderLinks, renderNodes, drawProjectCircles } from "./render.js";
import { showSynapseNotification } from "./ui.js";
import { setupSynapseRealtime } from "./realtime.js";

import {
  fetchActiveThemes,
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

  console.log("%c✅ Synapse ready", "color:#0f0; font-weight:bold;");
}

export async function refreshSynapseConnections() {
  await reloadAllData();
  rebuildGraph();
}

export async function refreshThemeCircles() {
  // same as refreshSynapseConnections for now (themes are part of nodes[])
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
  nodes = loaded.nodes;
  links = loaded.links;
  connectionsData = loaded.connectionsData || [];
  projectMembersData = loaded.projectMembersData || [];

  // Theme nodes (MVP)
  try {
    const themeNodes = await fetchActiveThemes(supabase);
    nodes = [...nodes, ...themeNodes];
  } catch (e) {
    console.warn("⚠️ Theme load skipped:", e);
  }
}

/* ==========================================================================
   GRAPH BUILD / REBUILD
   ========================================================================== */

function rebuildGraph() {
  // Simple + safe rebuild: clear container and restart sim
  try {
    container?.selectAll("*")?.remove();
  } catch (_) {}

  try {
    simulation?.stop();
  } catch (_) {}

  buildGraph();
}

function buildGraph() {
  const d3 = window.d3;
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Create simulation
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
    .velocityDecay(0.6)
    .alphaDecay(0.05)
    .alphaMin(0.001);

  // Draw project circles (behind)
  projectCircles = drawProjectCircles(container, nodes.filter((n) => n.type === "person"));

  // Render links
  linkEls = renderLinks(container, links);

  // Render nodes (people/projects) + basic click handler
  nodeEls = renderNodes(container, nodes, {
    onNodeClick: onNodeClick,
  });

  // Make theme nodes visible + clickable (renderNodes doesn't know themes)
  styleThemeNodes();

  // Drag behavior
  nodeEls.call(
    d3
      .drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded)
  );

  // Tick
  let tickCount = 0;
  simulation.on("tick", () => {
    tickCount++;
    if (tickCount % 2 !== 0) return;

    linkEls
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    nodeEls.attr("transform", (d) => `translate(${d.x},${d.y})`);

    projectCircles?.update?.();

    try {
      PathwayAnimations.updateAllPathwayPositions();
    } catch (_) {}
  });
}

/* ==========================================================================
   THEME NODE STYLING + CLICK
   ========================================================================== */

function styleThemeNodes() {
  // renderNodes created <g> for all nodes; for theme nodes,
  // overwrite their contents with a large dashed circle + label.
  nodeEls.each(function (d) {
    if (d.type !== "theme") return;

    const g = window.d3.select(this);
    g.selectAll("*").remove();

    g.append("circle")
      .attr("r", 120)
      .attr("fill", "rgba(0,224,255,0.06)")
      .attr("stroke", "rgba(0,224,255,0.25)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "8,6");

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "rgba(255,255,255,0.9)")
      .attr("font-size", "14px")
      .attr("font-family", "system-ui, sans-serif")
      .attr("font-weight", 650)
      .attr("pointer-events", "none")
      .text(d.title || d.name || "Theme");

    g.style("cursor", "pointer");
  });
}

async function openThemeCard(themeNode) {
  const interestCount = await getThemeInterestCount(supabase, themeNode.theme_id);

  renderThemeOverlayCard({
    themeNode,
    interestCount,
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

        // Re-render card with updated count; prevent spam inserts for MVP
        document.getElementById("synapse-theme-card")?.remove();
        renderThemeOverlayCard({
          themeNode,
          interestCount: newCount,
          onInterested: async () => {},
        });

        // Gentle nudge: if enough momentum, give the sim a tiny kick
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

  // Normal nodes go to your node panel
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
export { setupSynapseRealtime };


