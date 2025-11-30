// ======================================================================
// CharlestonHacks Innovation Engine – SYNAPSE VIEW (FINAL 2025)
// Fully aligned with existing Supabase schema
// ======================================================================

import { supabase } from "./supabaseClient.js";

let svg, width, height;
let nodeGroup, linkGroup;
let simulation;
let isLoaded = false;

// DOM references
const synapseContainer = document.getElementById("synapse-container");
const synapseSVG = document.getElementById("synapse-svg");

// ======================================================================
// FETCH COMMUNITY NODES (Safe + Schema-Aligned)
// ======================================================================
async function fetchCommunity() {
  console.log("📡 Loading community for Synapse View…");

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
    console.error("❌ Synapse fetch failed:", error);
    return [];
  }

  // Normalize
  return data.map(row => ({
    id: row.id,
    name: row.name || "Unnamed",
    skills: row.skills ? row.skills.split(",").map(s => s.trim()) : [],
    interests: row.interests || [],
    image_url: row.image_url || "",
    availability: row.availability || "Available",
    connection_count: row.connection_count || 0,
    x: row.x || Math.random() * 800,
    y: row.y || Math.random() * 600
  }));
}

// ======================================================================
// SVG INITIALIZATION
// ======================================================================
function initSVG() {
  width = synapseContainer.clientWidth;
  height = synapseContainer.clientHeight;

  svg = d3.select(synapseSVG);
  svg.selectAll("*").remove(); // clear previous run

  linkGroup = svg.append("g").attr("class", "links");
  nodeGroup = svg.append("g").attr("class", "nodes");
}

// ======================================================================
// DEFINE PATTERNS FOR USER AVATARS (CRITICAL)
// ======================================================================
function defineImagePatterns(nodes) {
  const defs = svg.append("defs");

  nodes.forEach(n => {
    if (!n.image_url) return;

    defs.append("pattern")
      .attr("id", `img-${n.id}`)
      .attr("patternUnits", "objectBoundingBox")
      .attr("width", 1)
      .attr("height", 1)
      .append("image")
      .attr("href", n.image_url)
      .attr("width", 44)
      .attr("height", 44)
      .attr("preserveAspectRatio", "xMidYMid slice");
  });
}

// ======================================================================
// D3 FORCE SIMULATION ENGINE
// ======================================================================
function createSimulation(nodes, links) {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(120))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", ticked);

  function ticked() {
    linkGroup
      .selectAll("line")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    nodeGroup
      .selectAll("g")
      .attr("transform", d => `translate(${d.x}, ${d.y})`);
  }
}

// ======================================================================
// RENDER GRAPH (Nodes + Links)
// ======================================================================
function renderGraph(nodes) {
  // 1) Add avatar patterns BEFORE drawing nodes
  defineImagePatterns(nodes);

  // 2) Create fake skill-overlap links
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const overlap = nodes[i].skills.filter(s => nodes[j].skills.includes(s));
      if (overlap.length > 0) {
        links.push({ source: nodes[i].id, target: nodes[j].id });
      }
    }
  }

  // 3) Draw links
  linkGroup
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", "rgba(0,255,255,0.35)")
    .attr("stroke-width", 1.5);

  // 4) Draw nodes
  const nodeElements = nodeGroup
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "synapse-node")
    .call(
      d3.drag()
        .on("start", dragStart)
        .on("drag", dragged)
        .on("end", dragEnd)
    );

  // Avatar circle (or fallback)
  nodeElements.append("circle")
    .attr("r", 22)
    .attr("fill", d => d.image_url ? `url(#img-${d.id})` : "#0ff")
    .attr("stroke", "#0ff")
    .attr("stroke-width", 1.5);

  // Text label
  nodeElements.append("text")
    .text(d => d.name)
    .attr("x", 28)
    .attr("y", 5)
    .attr("fill", "#0ff")
    .attr("font-size", "12px")
    .attr("font-family", "monospace");

  // 5) Start the force engine
  createSimulation(nodes, links);
}

// ======================================================================
// DRAG HANDLERS
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
// PUBLIC INIT FUNCTION
// ======================================================================
export async function initSynapseView() {
  if (isLoaded) return; // prevents double initialization
  isLoaded = true;

  console.log("🧠 Initializing Synapse View…");

  initSVG();
  const nodes = await fetchCommunity();
  renderGraph(nodes);

  console.log(`🧠 Synapse ready (${nodes.length} nodes).`);
}

// ======================================================================
// AUTO-RESIZE ON WINDOW RESIZE
// ======================================================================
window.addEventListener("resize", () => {
  if (!isLoaded) return;
  initSVG();
});
