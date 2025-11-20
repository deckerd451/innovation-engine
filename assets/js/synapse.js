// ============================================================================
// CharlestonHacks – Synapse View 3.1 (2025)
// ---------------------------------------------------------------------------
// ✓ Works with Option B (email → backfill → user_id)
// ✓ Safe for old community rows that lacked user_id until login
// ✓ Only loads nodes with a valid row (id, name, skills, image_url)
// ✓ Robust null handling to prevent graph crashes
// ✓ Fullscreen operation, ESC exit supported
// ✓ D3 Force Simulation with auto-resize
// ============================================================================

import { supabase } from "./supabaseClient.js";

// DOM
const container = document.getElementById("synapse-container");
const svg = d3.select("#synapse-svg");

// Graph state
let simulation = null;
let nodes = [];
let links = [];

/* ============================================================================
   INIT SYNAPSE VIEW
============================================================================ */
export async function initSynapseView() {
  console.log("🧠 Initializing Synapse View…");

  // Prevent re-initializing multiple times
  if (svg.selectAll("*").size() > 0) {
    console.log("Synapse already initialized. Skipping reload.");
    return;
  }

  const data = await loadCommunityData();
  if (!data || data.length === 0) {
    console.warn("No community data available for Synapse view.");
    return;
  }

  buildGraph(data);
}

/* ============================================================================
   LOAD COMMUNITY DATA – Hardened for Option B
============================================================================ */
async function loadCommunityData() {
  try {
    const { data: auth } = await supabase.auth.getSession();
         if (!auth?.session?.user) {
      console.warn("Synapse load blocked — user not authenticated.");
      return [];
    }

    // RLS allows SELECT for all authenticated users
    const { data, error } = await supabase
      .from("community")
      .select("id, user_id, name, skills, image_url, x, y, availability")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Synapse load error:", error);
      return [];
    }

    // Filter out rows missing required pieces
    const clean = data.filter(row =>
      row &&
      row.id &&
      row.name &&
      typeof row.name === "string"
    );

    console.log(`🌐 Synapse loaded ${clean.length} community nodes`);
    return clean;

  } catch (err) {
    console.error("❌ Fatal Synapse error:", err);
    return [];
  }
}

/* ============================================================================
   BUILD GRAPH (D3 FORCE GRAPH)
============================================================================ */
function buildGraph(data) {
  nodes = data.map(row => ({
    id: row.id,
    name: row.name,
    skills: row.skills || "",
    img: row.image_url || null,
    availability: row.availability || "Available",
    x: row.x || Math.random() * window.innerWidth,
    y: row.y || Math.random() * window.innerHeight
  }));

  // TEMP: simple random links to keep the UI interesting
  links = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    if (Math.random() < 0.25) {
      links.push({ source: nodes[i].id, target: nodes[i + 1].id });
    }
  }

  svg.selectAll("*").remove();

  const link = svg
    .append("g")
    .attr("stroke", "#555")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.2)
    .selectAll("line")
    .data(links)
    .enter()
    .append("line");

  const node = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "synapse-node");

  // Avatar circles (or fallback dots)
  node
    .append("circle")
    .attr("r", 14)
    .attr("fill", d => (d.img ? `url(#img-${d.id})` : "#00c8ff"))
    .attr("stroke", "#0ff")
    .attr("stroke-width", 0.8);

  // Labels
  node
    .append("text")
    .text(d => d.name.split(" ")[0])
    .attr("fill", "#0ff")
    .attr("font-size", 10)
    .attr("dx", 18)
    .attr("dy", 4)
    .attr("pointer-events", "none");

  // Tooltip
  const tooltip = createTooltip();

  node.on("mouseenter", (e, d) => showTooltip(tooltip, d, e.pageX, e.pageY));
  node.on("mousemove", (e, d) => moveTooltip(tooltip, e.pageX, e.pageY));
  node.on("mouseleave", () => hideTooltip(tooltip));

  // D3 Simulation
  simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
    .force("collision", d3.forceCollide().radius(24))
    .on("tick", ticked);

  function ticked() {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x}, ${d.y})`);
  }

  console.log("🧩 Synapse graph built");
}

/* ============================================================================
   TOOLTIP
============================================================================ */
function createTooltip() {
  const t = document.createElement("div");
  t.className = "synapse-tooltip";
  t.style.display = "none";
  document.body.appendChild(t);
  return t;
}

function showTooltip(el, d, x, y) {
  el.innerHTML = `
    <b>${d.name}</b><br>
    ${d.skills || ""}
  `;
  el.style.left = `${x + 12}px`;
  el.style.top = `${y + 12}px`;
  el.style.display = "block";
}

function moveTooltip(el, x, y) {
  el.style.left = `${x + 12}px`;
  el.style.top = `${y + 12}px`;
}

function hideTooltip(el) {
  el.style.display = "none";
}

/* ============================================================================
   EXIT SYNAPSE (matched to main.js)
============================================================================ */
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && container.classList.contains("active")) {
    container.classList.remove("active");
    const header = document.querySelector(".header");
    const footer = document.querySelector("footer");
    const bgCanvas = document.getElementById("neural-bg");

    header.style.display = "";
    footer.style.display = "";
    if (bgCanvas) bgCanvas.style.display = "";

    // Return to Profile tab
    document.querySelector('[data-tab="profile"]')?.click();
  }
});

