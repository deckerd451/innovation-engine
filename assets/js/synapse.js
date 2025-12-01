// ======================================================================
// CharlestonHacks – Synapse View 2025 FINAL BUILD
// Fully compatible with:
//   ✔ New 2card.html fullscreen container
//   ✔ community table (id, name, email, skills, image_url, etc.)
//   ✔ connections table (from_user_id, to_user_id, type, created_at, status)
//   ✔ D3 v7.x
// ======================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { supabase } from "./supabaseClient.js";

let synapseInitialized = false;
let simulation = null;

let selectedNode = null;   // for click-to-connect
let svg, g, tooltip;

// ================================================================
// MAIN ENTRY
// ================================================================
export async function initSynapseView() {
  if (synapseInitialized) {
    console.log("[Synapse] Already initialized — skipping.");
    return;
  }

  synapseInitialized = true;
  console.log("[Synapse] Initializing…");

  const container = document.getElementById("synapse-container");
  const svgEl = document.getElementById("synapse-svg");

  if (!container || !svgEl) {
    console.error("[Synapse] Container or SVG missing.");
    return;
  }

  // Clear old SVG
  svgEl.innerHTML = "";

  const width = svgEl.clientWidth || window.innerWidth;
  const height = svgEl.clientHeight || window.innerHeight;

  // Build SVG via d3
  svg = d3.select(svgEl)
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", [0, 0, width, height]);

  g = svg.append("g");

  // Zoom/Pan
  svg.call(
    d3.zoom().on("zoom", (event) => g.attr("transform", event.transform))
  );

  // Tooltip
  tooltip = d3.select("body")
    .append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);

  // Load Data
  const nodes = await loadNodes();
  const links = await loadLinks();
  if (!nodes.length) {
    showFallback("No user profiles found.");
    return;
  }

  drawGraph(nodes, links, width, height);
  console.log("[Synapse] View ready.");
}

// ================================================================
// LOAD NODES
// ================================================================
async function loadNodes() {
  const { data, error } = await supabase
    .from("community")
    .select("id, name, skills, interests, image_url, email");

  if (error) {
    console.error("[Synapse] Node load error:", error);
    return [];
  }

  return data || [];
}

// ================================================================
// LOAD LINKS
// ================================================================
async function loadLinks() {
  const { data, error } = await supabase
    .from("connections")
    .select("from_user_id, to_user_id, type, created_at");

  if (error) {
    console.error("[Synapse] Link load error:", error);
    return [];
  }

  return (data || []).map((l) => ({
    source: l.from_user_id,
    target: l.to_user_id,
    type: l.type
  }));
}

// ================================================================
// FALLBACK
// ================================================================
function showFallback(msg) {
  const container = document.getElementById("synapse-container");
  container.innerHTML = `<div style="color:white; text-align:center; margin-top:40px;">${msg}</div>`;
}

// ================================================================
// DRAW GRAPH
// ================================================================
function drawGraph(nodes, links, width, height) {

  // Lines
  const link = g.append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke-width", 1.5);

  // Circles
  const node = g.append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", 12)
    .attr("fill", "#39f")
    .style("cursor", "pointer")
    .call(d3.drag()
      .on("start", dragStart)
      .on("drag", dragged)
      .on("end", dragEnd)
    )
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`<strong>${d.name}</strong><br>${d.skills || ""}`)
    })
    .on("mousemove", (event) => {
      tooltip.style("left", event.pageX + 10 + "px")
             .style("top", event.pageY + 10 + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    .on("click", (event, d) => handleNodeClick(d, node));

  // Labels
  const label = g.append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text((d) => d.name)
    .attr("font-size", 12)
    .attr("dx", 16)
    .attr("dy", ".35em")
    .style("fill", "#fff");

  // SIMULATION
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(140))
    .force("charge", d3.forceManyBody().strength(-320))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y);

      label
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y);
    });
}

// ================================================================
// NODE CLICK BEHAVIOR
// ================================================================
async function handleNodeClick(d, nodeSel) {

  // Click 1 → SELECT node
  if (!selectedNode) {
    selectedNode = d;
    highlight(nodeSel, d.id, true);
    return;
  }

  // Click same node → UNSELECT
  if (selectedNode.id === d.id) {
    highlight(nodeSel, d.id, false);
    selectedNode = null;
    return;
  }

  // Click 2 → CREATE CONNECTION
  const { error } = await supabase.from("connections").insert({
    from_user_id: selectedNode.id,
    to_user_id: d.id,
    type: "generic",
    status: "active"
  });

  highlight(nodeSel, selectedNode.id, false);
  selectedNode = null;

  if (error) {
    console.error("[Synapse] Connection error:", error);
    return;
  }
  console.log("[Synapse] Connection created.");
}

// Highlight selected
function highlight(nodeSel, id, on) {
  nodeSel.filter((n) => n.id === id)
    .attr("stroke", on ? "yellow" : "#fff")
    .attr("stroke-width", on ? 4 : 1.5);
}

// Drag handlers
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
