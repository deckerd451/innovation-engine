// ======================================================================
// CharlestonHacks Innovation Engine — SYNAPSE 3.0 (FINAL BUILD)
// Fullscreen force graph, lazy-loaded, stable sizing, real connections,
// click-to-open-profile-card, click-to-create-connection
// ======================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

let synapseInitialized = false;
let simulation = null;
let selectedNode = null;

// ======================================================================
// MAIN ENTRY POINT (called only when Synapse tab becomes active)
// ======================================================================
export async function initSynapseView() {
  if (synapseInitialized) {
    console.log("🔁 Synapse already initialized.");
    return;
  }
  synapseInitialized = true;

  console.log("🧠 Initializing Synapse View…");

  const container = document.getElementById("synapse-container");
  if (!container) {
    console.error("❌ No #synapse-container found in DOM");
    return;
  }

  // Ensure visible before measuring
  container.classList.add("active");

  // Force a layout reflow
  await new Promise((r) => setTimeout(r, 50));

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  console.log("📐 Synapse size:", width, height);

  container.innerHTML = ""; // Clear old SVG etc.

  // ====================================================================
  // SVG + GRAPH LAYER
  // ====================================================================
  const svg = d3
    .select(container)
    .append("svg")
    .attr("id", "synapse-svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "rgba(0,0,0,0.92)");

  const g = svg.append("g");

  // ====================================================================
  // ZOOM & PAN
  // ====================================================================
  svg.call(
    d3
      .zoom()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => g.attr("transform", event.transform))
  );

  // ====================================================================
  // TOOLTIP
  // ====================================================================
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);

  // ====================================================================
  // LOAD NODES FROM SUPABASE
  // ====================================================================
  const { data: nodes, error: nodeError } = await supabase
    .from("community")
    .select("id, name, skills, interests, image_url");

  if (nodeError) {
    console.error("❌ Error loading nodes:", nodeError);
    return;
  }

  if (!nodes || nodes.length === 0) {
    container.innerHTML = "<div style='color:white;padding:20px;text-align:center;'>No community members found</div>";
    return;
  }

  // ====================================================================
  // LOAD CONNECTIONS FROM SUPABASE
  // ====================================================================
  const { data: linkData, error: linkError } = await supabase
    .from("connections")
    .select("from_user_id, to_user_id, type, created_at");

  if (linkError) {
    console.error("❌ Error loading connections:", linkError);
  }

  const links = (linkData || []).map((l) => ({
    source: l.from_user_id,
    target: l.to_user_id,
    type: l.type || "generic",
    created_at: l.created_at,
  }));

  console.log(`✔ Loaded ${nodes.length} nodes, ${links.length} links`);

  // ====================================================================
  // LINKS
  // ====================================================================
  const link = g
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke-width", 1.5);

  // ====================================================================
  // NODES
  // ====================================================================
  const node = g
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", 10)
    .attr("fill", "#4af")
    .style("cursor", "pointer")
    .call(
      d3
        .drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
    )
    // Tooltip
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${d.name}</strong><br>
          ${d.skills || ""}<br>
          ${d.interests || ""}`
        );
    })
    .on("mousemove", (event) => {
      tooltip.style("left", event.pageX + 12 + "px");
      tooltip.style("top", event.pageY + 12 + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    // Click actions
    .on("click", (event, d) => handleNodeClick(d, node));

  // ====================================================================
  // LABELS
  // ====================================================================
  const label = g
    .append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text((d) => d.name)
    .attr("font-size", 10)
    .attr("dy", "-0.9em")
    .attr("text-anchor", "middle")
    .style("fill", "#fff")
    .style("pointer-events", "none");

  // ====================================================================
  // FORCE SIMULATION
  // ====================================================================
  simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links).id((d) => d.id).distance(120)
    )
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", ticked);

  function ticked() {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    label.attr("x", (d) => d.x).attr("y", (d) => d.y);
  }

  console.log("✔ Synapse View Loaded");
}

// ======================================================================
// CLICK HANDLING
// ======================================================================
async function handleNodeClick(d, nodeSelection) {
  // If no selection: select source
  if (!selectedNode) {
    selectedNode = d;
    highlightNode(nodeSelection, d.id, true);
    showNotification(`Selected ${d.name}. Click another node to connect.`, "info");
    return;
  }

  // If clicking same node: deselect
  if (selectedNode.id === d.id) {
    highlightNode(nodeSelection, d.id, false);
    selectedNode = null;
    showNotification(`Selection cleared.`, "info");
    return;
  }

  // Otherwise create connection
  const { error } = await supabase.from("connections").insert([
    {
      from_user_id: selectedNode.id,
      to_user_id: d.id,
      type: "generic",
    },
  ]);

  if (error) {
    showNotification("Connection failed: " + error.message, "error");
    console.error(error);
  } else {
    showNotification(`Connected ${selectedNode.name} → ${d.name}`, "success");
  }

  highlightNode(nodeSelection, selectedNode.id, false);
  selectedNode = null;
}

// Highlight selected node
function highlightNode(nodeSelection, id, active) {
  nodeSelection
    .filter((n) => n.id === id)
    .attr("stroke", active ? "yellow" : "white")
    .attr("stroke-width", active ? 4 : 1.5);
}

// ======================================================================
// DRAGGING
// ======================================================================
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
