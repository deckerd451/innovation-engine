// ======================================================================
// CharlestonHacks Innovation Engine – SYNAPSE VIEW (FINAL 2025)
// With:
//   ✔ Real Supabase connections
//   ✔ Lazy load on tab activation
//   ✔ Click-to-open-profile-card
//   ✔ Smooth zoom/pan
//   ✔ Tooltips + hover highlight
// ======================================================================

import { supabase } from "./supabaseClient.js";

let svg, width, height;
let nodeGroup, linkGroup;
let simulation;
let tooltip;

let activeNodes = [];
let activeLinks = [];
let isInitialized = false;

// DOM
const container = document.getElementById("synapse-container");
const svgEl = document.getElementById("synapse-svg");

// ======================================================================
// FETCH NODES (community table)
// ======================================================================
async function fetchCommunity() {
  console.log("📡 Synapse: Loading community…");

  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      skills,
      interests,
      availability,
      image_url,
      connection_count,
      x,
      y
    `);

  if (error) {
    console.error("❌ Failed to load community:", error);
    return [];
  }

  return data.map(row => ({
    id: row.id,
    name: row.name || "Unnamed",
    skills: row.skills ? row.skills.split(",").map(s => s.trim()) : [],
    interests: row.interests || [],
    image_url: row.image_url || null,
    availability: row.availability || "Available",
    connection_count: row.connection_count || 0,
    x: row.x || Math.random() * 400,
    y: row.y || Math.random() * 300
  }));
}

// ======================================================================
// FETCH REAL CONNECTIONS
// ======================================================================
async function fetchConnections() {
  console.log("🔌 Synapse: Loading real connections…");

  const { data, error } = await supabase
    .from("connections")
    .select("source, target");

  if (error) {
    console.error("❌ Failed to load connections:", error);
    return [];
  }

  return data.map(link => ({
    source: link.source,
    target: link.target,
  }));
}

// ======================================================================
// INITIALIZE SVG + ZOOM/PAN + GROUPS
// ======================================================================
function initSVG() {
  width = container.clientWidth;
  height = container.clientHeight;

  svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  // Zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.4, 2.5])
    .on("zoom", (event) => {
      nodeGroup.attr("transform", event.transform);
      linkGroup.attr("transform", event.transform);
    });

  svg.call(zoom);

  linkGroup = svg.append("g").attr("class", "links");
  nodeGroup = svg.append("g").attr("class", "nodes");

  tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);
}

// ======================================================================
// RENDER GRAPH
// ======================================================================
function renderGraph(nodes, links) {
  // Build links referencing node objects
  const idToNode = new Map(nodes.map(n => [n.id, n]));
  const safeLinks = links
    .map(l => ({
      source: idToNode.get(l.source),
      target: idToNode.get(l.target),
    }))
    .filter(l => l.source && l.target); // remove broken refs

  // Render links
  const linkElements = linkGroup
    .selectAll("line")
    .data(safeLinks)
    .enter()
    .append("line")
    .attr("stroke", "rgba(0,255,255,0.25)")
    .attr("stroke-width", 1.2);

  // Render nodes
  const nodeElements = nodeGroup
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "synapse-node")
    .call(d3.drag()
      .on("start", dragStart)
      .on("drag", dragged)
      .on("end", dragEnd)
    );

  // AVATAR CIRCLE
  nodeElements.append("circle")
    .attr("r", 22)
    .attr("fill", d => d.image_url ? `url(#img-${d.id})` : "#0ff")
    .attr("stroke", "#0ff")
    .attr("stroke-width", 1.2)
    .on("mouseover", (_, d) => showTooltip(d))
    .on("mouseout", () => hideTooltip())
    .on("click", (_, d) => openCard(d));

  // NAME LABEL
  nodeElements.append("text")
    .text(d => d.name)
    .attr("x", 28)
    .attr("y", 5)
    .attr("fill", "#0ff")
    .attr("font-size", "12px")
    .attr("font-family", "monospace")
    .style("pointer-events", "none");

  // FORCE LAYOUT
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(safeLinks).id(d => d.id).distance(120))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", () => {
      linkElements
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeElements.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
}

// ======================================================================
// CLICK NODE → OPEN PROFILE CARD
// ======================================================================
function openCard(node) {
  console.log("🟦 Opening profile card for:", node);

  window.dispatchEvent(new CustomEvent("openProfileCard", { detail: node }));

  // Optional: automatically switch to Search tab
  document.querySelector(`.tab-button[data-tab="search"]`).click();
}

// ======================================================================
// TOOLTIP
// ======================================================================
function showTooltip(d) {
  tooltip
    .style("opacity", 1)
    .html(`
      <b>${d.name}</b><br>
      Skills: ${d.skills.join(", ")}<br>
      Status: ${d.availability}
    `)
    .style("left", `${d3.event?.pageX + 12}px`)
    .style("top", `${d3.event?.pageY - 10}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// ======================================================================
// DRAGGING
// ======================================================================
function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// ======================================================================
// PUBLIC INIT (called only when Synapse tab becomes active)
// ======================================================================
export async function initSynapseView() {
  if (isInitialized) return;

  initSVG();

  activeNodes = await fetchCommunity();
  activeLinks = await fetchConnections();

  console.log("🧠 Synapse loaded:", activeNodes.length, "nodes,", activeLinks.length, "links");

  renderGraph(activeNodes, activeLinks);

  isInitialized = true;
}

// ======================================================================
// AUTO-RESIZE
// ======================================================================
window.addEventListener("resize", () => {
  if (!isInitialized) return;
  initSynapseView(); // re-render safely
});
