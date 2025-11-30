// ======================================================================
// CharlestonHacks Innovation Engine – SYNAPSE VIEW (FINAL 2025)
// Fullscreen, zoom, pan, avatars, safe layout, performance optimized
// ======================================================================

import { supabase } from "./supabaseClient.js";

let svg, width, height;
let nodeGroup, linkGroup;
let simulation;
let zoomHandler;
let isLoaded = false;

// DOM
const container = document.getElementById("synapse-container");
const synapseSVG = document.getElementById("synapse-svg");

// ======================================================================
// FETCH COMMUNITY (schema-safe)
// ======================================================================
async function fetchCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      skills,
      image_url,
      availability,
      x,
      y
    `);

  if (error) {
    console.error("❌ Synapse fetch error:", error);
    return [];
  }

  return data.map(p => ({
    id: p.id,
    name: p.name || "Unnamed",
    skills: p.skills ? p.skills.split(",").map(s => s.trim()) : [],
    image_url: p.image_url || "",
    availability: p.availability || "Available",
    x: p.x || Math.random() * 800,
    y: p.y || Math.random() * 600
  }));
}

// ======================================================================
// INITIALIZE SVG
// ======================================================================
function initSVG() {
  width = container.clientWidth;
  height = container.clientHeight;

  svg = d3.select(synapseSVG);
  svg.selectAll("*").remove();

  // Wrapper group for zoom/pan
  const zoomLayer = svg.append("g").attr("class", "zoom-layer");

  linkGroup = zoomLayer.append("g").attr("class", "links");
  nodeGroup = zoomLayer.append("g").attr("class", "nodes");

  // Enable zoom
  zoomHandler = d3.zoom()
    .scaleExtent([0.2, 2.5])
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
    });

  svg.call(zoomHandler);
}

// ======================================================================
// BUILD LINKS BASED ON SKILL OVERLAP
// ======================================================================
function buildLinks(nodes) {
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const overlap = nodes[i].skills.filter(s => nodes[j].skills.includes(s));
      if (overlap.length > 0) {
        links.push({
          source: nodes[i].id,
          target: nodes[j].id,
          strength: Math.min(0.05 * overlap.length, 0.1)
        });
      }
    }
  }
  return links;
}

// ======================================================================
// RENDER GRAPH
// ======================================================================
function renderGraph(nodes) {
  const links = buildLinks(nodes);

  // Draw links
  const linkElements = linkGroup
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", "rgba(0,255,255,.25)")
    .attr("stroke-width", 1.2);

  // Draw nodes
  const node = nodeGroup
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
    )
    .on("click", d => {
      console.log("Clicked:", d.name); 
      // FUTURE: open profile card sidebar
    });

  node.append("circle")
    .attr("r", 26)
    .attr("fill", d => d.image_url ? `url(#img-${d.id})` : "#0ff")
    .attr("stroke", "#0ff")
    .attr("stroke-width", 1.5);

  node.append("text")
    .text(d => d.name)
    .attr("x", 32)
    .attr("y", 5)
    .attr("fill", "#0ff")
    .attr("font-size", "12px")
    .attr("font-family", "monospace");

  // Run physics
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(140).strength(d => d.strength))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", () => {
      linkElements
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
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
// PUBLIC INIT
// ======================================================================
export async function initSynapseView() {
  if (isLoaded) return;
  isLoaded = true;

  console.log("🧠 Initializing Synapse View…");

  // SAFETY: auto-fix too-small containers
  if (container.clientWidth < 600) {
    console.warn("⚠️ Synapse container too narrow, forcing fullscreen layout");
    container.style.width = "100vw";
    container.style.height = "100vh";
  }

  initSVG();

  const nodes = await fetchCommunity();
  console.log(`🧠 Loaded ${nodes.length} nodes`);

  renderGraph(nodes);

  console.log("🧠 Synapse ready!");
}

// Handle window resize
window.addEventListener("resize", () => {
  if (!isLoaded) return;
  initSVG();
});
