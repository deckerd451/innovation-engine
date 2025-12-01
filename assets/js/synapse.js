// ======================================================================
// CharlestonHacks Innovation Engine – SYNAPSE VIEW 3.0 (FINAL 2025)
// Features:
//   ✔ Lazy-load on tab open
//   ✔ Pan + zoom
//   ✔ Drag nodes
//   ✔ Skill-based auto-links
//   ✔ Fullscreen overlay
//   ✔ Tooltips
//   ✔ Works with your existing community schema
// ======================================================================

import { supabase } from "./supabaseClient.js";

let svg, width, height;
let nodeGroup, linkGroup;
let simulation;
let tooltip;
let isInitialized = false;
let activeNodes = [];
let activeLinks = [];

// DOM refs
const synapseContainer = document.getElementById("synapse-container");
const synapseSVG = document.getElementById("synapse-svg");

// ======================================================================
// FETCH COMMUNITY FROM SUPABASE
// ======================================================================
async function fetchCommunity() {
  console.log("📡 Fetching community for Synapse…");

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

  return data.map(row => ({
    id: row.id,
    name: row.name || "Unnamed",
    skills: row.skills ? row.skills.split(",").map(s => s.trim().toLowerCase()) : [],
    interests: row.interests || [],
    image_url: row.image_url || "",
    availability: row.availability || "Available",
    connection_count: row.connection_count || 0,
    x: row.x || Math.random() * 800,
    y: row.y || Math.random() * 600,
  }));
}

// ======================================================================
// INITIALIZE SVG
// ======================================================================
function initSVG() {
  width = synapseContainer.clientWidth;
  height = synapseContainer.clientHeight;

  svg = d3.select(synapseSVG);
  svg.selectAll("*").remove();

  // Pan + zoom
  svg.call(
    d3.zoom()
      .scaleExtent([0.3, 2])
      .on("zoom", event => {
        nodeGroup.attr("transform", event.transform);
        linkGroup.attr("transform", event.transform);
      })
  );

  linkGroup = svg.append("g").attr("class", "links");
  nodeGroup = svg.append("g").attr("class", "nodes");

  // Tooltip
  tooltip = d3.select("body")
    .append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);
}

// ======================================================================
// CREATE LINKS BASED ON SKILL OVERLAP
// ======================================================================
function computeLinks(nodes) {
  const links = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const overlap = nodes[i].skills.filter(s => nodes[j].skills.includes(s));
      if (overlap.length > 0) {
        links.push({ source: nodes[i].id, target: nodes[j].id });
      }
    }
  }
  return links;
}

// ======================================================================
// FORCE SIMULATION
// ======================================================================
function createSimulation(nodes, links) {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(140))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", () => {
      svg.selectAll(".link")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      svg.selectAll(".node-group")
        .attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
}

// ======================================================================
// RENDER GRAPH
// ======================================================================
function renderGraph(nodes, links) {
  // Render links
  linkGroup.selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("stroke", "rgba(0,255,255,0.3)")
    .attr("stroke-width", 1.5);

  // Node groups
  const nodeElements = nodeGroup.selectAll(".node-group")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node-group")
    .call(
      d3.drag()
        .on("start", dragStart)
        .on("drag", dragMove)
        .on("end", dragEnd)
    );

  // Avatar circle
  nodeElements.append("circle")
    .attr("r", 22)
    .attr("fill", d => d.image_url ? `url(#img-${d.id})` : "#0ff")
    .attr("stroke", "#0ff")
    .attr("stroke-width", 1.5);

  // Name label
  nodeElements.append("text")
    .text(d => d.name)
    .attr("x", 28)
    .attr("y", 5)
    .attr("fill", "#0ff")
    .attr("font-size", "12px")
    .attr("font-family", "monospace");

  // Tooltip events
  nodeElements
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.name}</strong><br>
          Skills: ${d.skills.join(", ") || "None"}<br>
          Availability: ${d.availability}
        `);
    })
    .on("mousemove", event => {
      tooltip.style("left", (event.pageX + 10) + "px")
             .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

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

function dragMove(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// ======================================================================
// LAZY-LOAD SYNAPSE WHEN TAB IS OPENED
// ======================================================================
export async function initSynapseView() {
  if (isInitialized) {
    console.log("🧠 Synapse already initialized.");
    return;
  }

  console.log("🧠 Initializing Synapse View…");

  initSVG();
  activeNodes = await fetchCommunity();
  activeLinks = computeLinks(activeNodes);

  renderGraph(activeNodes, activeLinks);

  isInitialized = true;
  console.log("🧠 Synapse ready with", activeNodes.length, "nodes.");
}

// ======================================================================
// TAB DETECTION – Only initialize when user clicks Synapse tab
// ======================================================================
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    if (tab === "synapse") {
      synapseContainer.classList.add("active");
      setTimeout(() => initSynapseView(), 150);
    } else {
      synapseContainer.classList.remove("active");
    }
  });
});

// ======================================================================
// RESIZE SVG ON WINDOW RESIZE
// ======================================================================
window.addEventListener("resize", () => {
  if (!isInitialized) return;
  initSVG();
  renderGraph(activeNodes, activeLinks);
});
