// synapse.js — CharlestonHacks Synapse Graph (clean rewrite)
// Features:
// - D3 force graph
// - Project circles (deduped)
// - Realtime updates (top-level, dashboard-safe)
// - Hover highlight for project circles
// - Clickable project circles → open project panel
// - Zero dashboardPane changes required

import {
  initConnections,
  getAllConnectionsForSynapse
} from "./connections.js";

import { getAllProjectMembers } from "./projects.js";
import { openNodePanel } from "./node-panel.js";

/* ==========================================================================
   GLOBAL STATE
   ========================================================================== */

let supabase;
let svg, container;
let simulation;
let nodes = [];
let links = [];

let nodeEls, linkEls, projectCircleEls;
let connectionsData = [];
let projectMembersData = [];
let currentUserCommunityId = null;
let initialized = false;

/* ==========================================================================
   REALTIME — TOP LEVEL (CRITICAL)
   ========================================================================== */

let realtimeChannel = null;
let realtimeDebounce = null;

export function setupSynapseRealtime(sb) {
  if (!sb?.channel) return null;
  if (realtimeChannel) return realtimeChannel;

  const scheduleRefresh = () => {
    clearTimeout(realtimeDebounce);
    realtimeDebounce = setTimeout(() => {
      if (window.refreshSynapseProjectCircles) {
        window.refreshSynapseProjectCircles();
      }
    }, 400);
  };

  realtimeChannel = sb
    .channel("synapse-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, scheduleRefresh)
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        console.log("✓ Synapse realtime active");
      }
    });

  return realtimeChannel;
}

// Expose immediately for dashboardPane safety
try {
  window.setupSynapseRealtime = setupSynapseRealtime;
} catch (_) {}

/* ==========================================================================
   INIT
   ========================================================================== */

export async function initSynapseView() {
  if (initialized) return;
  initialized = true;

  supabase = window.supabase;
  if (!supabase) {
    console.error("Supabase missing");
    return;
  }

  const info = await initConnections(supabase);
  currentUserCommunityId = info?.currentUserCommunityId;

  setupSVG();
  await loadData();
  startSimulation();
  setupSynapseRealtime(supabase);

  console.log("✓ Synapse ready");
}

/* ==========================================================================
   SVG / ZOOM
   ========================================================================== */

function setupSVG() {
  const el = document.getElementById("synapse-svg");
  el.innerHTML = "";

  svg = d3.select(el)
    .attr("viewBox", [0, 0, window.innerWidth, window.innerHeight]);

  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", e => container.attr("transform", e.transform));

  svg.call(zoom);

  container = svg.append("g").attr("class", "synapse-container");
}

/* ==========================================================================
   DATA LOAD
   ========================================================================== */

async function loadData() {
  const { data: community } = await supabase
    .from("community")
    .select("id,name,image_url,skills,x,y");

  connectionsData = await getAllConnectionsForSynapse();
  projectMembersData = await getAllProjectMembers();

  const { data: projects } = await supabase
    .from("projects")
    .select("id,title,required_skills");

  nodes = community.map(m => ({
    id: m.id,
    name: m.name,
    type: "person",
    skills: parseSkills(m.skills),
    image_url: m.image_url,
    isCurrentUser: m.id === currentUserCommunityId,
    x: m.x ?? Math.random() * window.innerWidth,
    y: m.y ?? Math.random() * window.innerHeight,
    projects: projectMembersData
      .filter(pm => pm.user_id === m.id)
      .map(pm => pm.project_id)
  }));

  projects.forEach(p => {
    nodes.push({
      id: p.id,
      name: p.title,
      type: "project",
      required_skills: p.required_skills || [],
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight
    });
  });

  links = [];

  connectionsData.forEach(c => {
    links.push({
      id: c.id,
      source: c.from_user_id,
      target: c.to_user_id,
      status: c.status
    });
  });

  projectMembersData.forEach(pm => {
    links.push({
      id: `pm-${pm.project_id}-${pm.user_id}`,
      source: pm.project_id,
      target: pm.user_id,
      status: "project"
    });
  });
}

/* ==========================================================================
   PROJECT CIRCLES (DEDUP + HOVER + CLICK)
   ========================================================================== */

function drawProjectCircles() {
  container.selectAll("g.project-circles").remove(); // 🔑 hard dedup

  const groups = {};
  nodes.forEach(n => {
    n.projects?.forEach(pid => {
      groups[pid] ??= [];
      groups[pid].push(n);
    });
  });

  projectCircleEls = container.insert("g", ":first-child")
    .attr("class", "project-circles")
    .selectAll("circle")
    .data(Object.entries(groups))
    .enter()
    .append("circle")
    .attr("fill", "none")
    .attr("stroke", "rgba(0,224,255,0.6)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "8,5")
    .attr("opacity", 0.6)
    .style("cursor", "pointer")

    // Hover highlight
    .on("mouseenter", function () {
      d3.select(this)
        .attr("opacity", 1)
        .attr("stroke-width", 4);
    })
    .on("mouseleave", function () {
      d3.select(this)
        .attr("opacity", 0.6)
        .attr("stroke-width", 2);
    })

    // ✅ CLICK → OPEN PROJECT PANEL
    .on("click", function (event, [projectId]) {
      event.stopPropagation();
      const projectNode = nodes.find(
        n => n.type === "project" && n.id === projectId
      );
      if (projectNode) {
        openNodePanel({ ...projectNode, type: "project" });
      }
    });
}

function updateProjectCircles() {
  if (!projectCircleEls) return;

  projectCircleEls.each(function ([_, members]) {
    let cx = 0, cy = 0;
    members.forEach(n => {
      cx += n.x;
      cy += n.y;
    });
    cx /= members.length;
    cy /= members.length;

    let r = 0;
    members.forEach(n => {
      r = Math.max(r, Math.hypot(n.x - cx, n.y - cy));
    });

    d3.select(this)
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", r + 80);
  });
}

/* ==========================================================================
   SIMULATION
   ========================================================================== */

function startSimulation() {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(120))
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
    .force("collision", d3.forceCollide().radius(40))
    .alphaDecay(0.05);

  drawProjectCircles();

  linkEls = container.append("g")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", d => d.status === "project" ? "#ff6b6b" : "#00e0ff")
    .attr("opacity", 0.6);

  nodeEls = container.append("g")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .on("click", (_, d) => openNodePanel(d));

  nodeEls.append("circle")
    .attr("r", d => d.type === "project" ? 18 : d.isCurrentUser ? 26 : 16)
    .attr("fill", d => d.type === "project" ? "#ff6b6b" : "#00e0ff");

  simulation.on("tick", () => {
    linkEls
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    nodeEls.attr("transform", d => `translate(${d.x},${d.y})`);
    updateProjectCircles();
  });
}

/* ==========================================================================
   REFRESH (USED BY REALTIME)
   ========================================================================== */

window.refreshSynapseProjectCircles = async function () {
  await loadData();
  simulation.nodes(nodes);
  simulation.force("link").links(links);
  drawProjectCircles();
  simulation.alpha(0.6).restart();
};

/* ==========================================================================
   UTILS
   ========================================================================== */

function parseSkills(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  return s.split(",").map(x => x.trim());
}
