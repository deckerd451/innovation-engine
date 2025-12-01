// ======================================================================
// CharlestonHacks Innovation Engine – SYNAPSE VIEW (FINAL + CONNECTIONS)
// Features:
//   ✔ Real Supabase connections
//   ✔ Lazy load on tab activation
//   ✔ Click-to-open-profile-card
//   ✔ SHIFT-click Node A → Click Node B = CREATE CONNECTION
//   ✔ Visual highlight + live link creation
//   ✔ Auto-update connection_count
//   ✔ Smooth zoom/pan + tooltips
// ======================================================================

import { supabase } from "./supabaseClient.js";

let svg, width, height;
let nodeGroup, linkGroup;
let simulation;
let tooltip;

let nodes = [];
let links = [];
let isInitialized = false;

// For click-to-connect mode
let pendingSourceNode = null;

// DOM
const container = document.getElementById("synapse-container");
const svgEl = document.getElementById("synapse-svg");

// ======================================================================
// FETCH NODES
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
// FETCH EXISTING CONNECTIONS
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

  return data.map(l => ({
    source: l.source,
    target: l.target
  }));
}

// ======================================================================
// SAVE NEW CONNECTION
// ======================================================================
async function createConnection(sourceId, targetId) {
  console.log("✨ Creating connection:", sourceId, "→", targetId);

  const { error } = await supabase
    .from("connections")
    .insert([{ source: sourceId, target: targetId }]);

  if (error) {
    console.error("❌ Failed to create connection:", error);
    return false;
  }

  return true;
}

// ======================================================================
// UPDATE connection_count in community table
// ======================================================================
async function bumpConnectionCounts(a, b) {
  await supabase.from("community")
    .update({ connection_count: (a.connection_count || 0) + 1 })
    .eq("id", a.id);

  await supabase.from("community")
    .update({ connection_count: (b.connection_count || 0) + 1 })
    .eq("id", b.id);

  a.connection_count++;
  b.connection_count++;
}

// ======================================================================
// HIGHLIGHT SELECTED (for connection mode)
// ======================================================================
function highlightPending(node) {
  nodeGroup.selectAll("circle")
    .attr("stroke", d => d.id === node.id ? "#ff0" : "#0ff")
    .attr("stroke-width", d => d.id === node.id ? 3 : 1.2);
}

function clearHighlight() {
  nodeGroup.selectAll("circle")
    .attr("stroke", "#0ff")
    .attr("stroke-width", 1.2);
}

// ======================================================================
// INITIALIZE SVG
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
function renderGraph() {
  const idToNode = new Map(nodes.map(n => [n.id, n]));
  
  const safeLinks = links
    .map(l => ({
      source: idToNode.get(l.source),
      target: idToNode.get(l.target),
    }))
    .filter(l => l.source && l.target);

  // Render link lines
  const linkElements = linkGroup
    .selectAll("line")
    .data(safeLinks)
    .enter()
    .append("line")
    .attr("stroke", "rgba(0,255,255,0.25)")
    .attr("stroke-width", 1.3);

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

  // Avatar circle
  nodeElements.append("circle")
    .attr("r", 22)
    .attr("fill", d => d.image_url ? `url(#img-${d.id})` : "#0ff")
    .attr("stroke", "#0ff")
    .attr("stroke-width", 1.2)
    .on("mouseover", (_, d) => showTooltip(d))
    .on("mouseout", () => hideTooltip())
    .on("click", (_, d) => handleNodeClick(d));

  // Name
  nodeElements.append("text")
    .text(d => d.name)
    .attr("x", 28)
    .attr("y", 5)
    .attr("fill", "#0ff")
    .attr("font-size", "12px")
    .style("pointer-events", "none");

  // Force engine
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
// NODE CLICK HANDLER (open profile OR connect)
// ======================================================================
async function handleNodeClick(node) {
  if (d3.event.shiftKey) {
    // SHIFT-CLICK = SELECT FIRST NODE
    pendingSourceNode = node;
    highlightPending(node);
    showNotification("Select a second person to create a connection.", "info");
    return;
  }

  // NORMAL CLICK (open card)
  if (pendingSourceNode) {
    await attemptConnection(node);
    return;
  }

  // Open profile card
  window.dispatchEvent(new CustomEvent("openProfileCard", { detail: node }));
  document.querySelector('.tab-button[data-tab="search"]').click();
}

// ======================================================================
// ATTEMPT TO CREATE CONNECTION
// ======================================================================
async function attemptConnection(targetNode) {
  const source = pendingSourceNode;

  if (!source || source.id === targetNode.id) {
    showNotification("Cannot connect a user to themselves.", "error");
    clearHighlight();
    pendingSourceNode = null;
    return;
  }

  // Check if connection exists
  const exists = links.some(
    l => (l.source === source.id && l.target === targetNode.id)
      || (l.source === targetNode.id && l.target === source.id)
  );

  if (exists) {
    showNotification("Connection already exists!", "warning");
    clearHighlight();
    pendingSourceNode = null;
    return;
  }

  // CREATE IN DB
  const ok = await createConnection(source.id, targetNode.id);

  if (!ok) {
    showNotification("Failed to create connection.", "error");
    pendingSourceNode = null;
    clearHighlight();
    return;
  }

  // Update local graph
  links.push({ source: source.id, target: targetNode.id });
  bumpConnectionCounts(source, targetNode);

  showNotification("New connection created!", "success");

  clearHighlight();
  pendingSourceNode = null;

  // Re-render force layout
  initSVG();
  renderGraph();
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
      Connections: ${d.connection_count}
    `)
    .style("left", `${d3.event.pageX + 12}px`)
    .style("top", `${d3.event.pageY - 10}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// ======================================================================
// DRAG BEHAVIOR
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
// INIT (Lazy loaded when Synapse tab is clicked)
// ======================================================================
export async function initSynapseView() {
  if (isInitialized) return;

  nodes = await fetchCommunity();
  links = await fetchConnections();

  console.log("🧠 Synapse:", nodes.length, "nodes,", links.length, "links");

  initSVG();
  renderGraph();

  isInitialized = true;
}

// ======================================================================
// RESIZE
// ======================================================================
window.addEventListener("resize", () => {
  if (!isInitialized) return;
  initSynapseView();
});
