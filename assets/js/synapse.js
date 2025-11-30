// ======================================================================
// CharlestonHacks Innovation Engine – SYNAPSE VIEW (FINAL 2025)
// Pure SVG implementation (no D3), aligned with community schema
// ======================================================================

import { supabase } from "./supabaseClient.js";

let isInitialized = false;
let nodesCache = [];
let linksCache = [];

// ======================================================================
// DOM HELPERS
// ======================================================================
function getElements() {
  const container = document.getElementById("synapse");
  const svg = document.getElementById("synapse-svg");

  if (!container || !svg) {
    console.warn("🧠 Synapse: container or SVG not found in DOM");
    return null;
  }

  // Tooltip div (create if missing)
  let tooltip = document.querySelector(".synapse-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "synapse-tooltip";
    document.body.appendChild(tooltip);
  }

  return { container, svg, tooltip };
}

// ======================================================================
// FETCH COMMUNITY DATA
// ======================================================================
async function fetchCommunity() {
  console.log("📡 Synapse: loading community nodes…");

  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      skills,
      interests,
      availability,
      image_url,
      connection_count
    `);

  if (error) {
    console.error("❌ Synapse fetch failed:", error);
    return [];
  }

  const cleaned = data.map((row) => ({
    id: row.id,
    name: row.name || "Unnamed",
    skills: row.skills
      ? row.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    interests: Array.isArray(row.interests) ? row.interests : [],
    availability: row.availability || "Available",
    image_url: row.image_url || "",
    connection_count: row.connection_count || 0,
  }));

  console.log(`🧠 Synapse: loaded ${cleaned.length} members`);
  return cleaned;
}

// ======================================================================
// LAYOUT + LINK GENERATION
// ======================================================================
function buildLinks(nodes) {
  const links = [];
  const maxLinksPerNode = 4;

  for (let i = 0; i < nodes.length; i++) {
    let count = 0;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      if (count >= maxLinksPerNode) break;

      const overlap = nodes[i].skills.filter((s) =>
        nodes[j].skills.includes(s)
      );
      if (overlap.length > 0) {
        links.push({
          source: nodes[i].id,
          target: nodes[j].id,
          label: overlap[0],
        });
        count++;
      }
    }
  }

  return links;
}

function applyRadialLayout(nodes, width, height) {
  if (!nodes.length) return;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 80;

  nodes.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / nodes.length;
    node.x = cx + radius * Math.cos(angle);
    node.y = cy + radius * Math.sin(angle);
  });
}

// ======================================================================
// SVG RENDERING
// ======================================================================
function renderSynapse(nodes, links, svg, tooltip, container) {
  const svgNS = "http://www.w3.org/2000/svg";

  // Determine size (fallback if hidden)
  let width = container.clientWidth || 900;
  let height = container.clientHeight || 600;

  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Group layers
  const linkGroup = document.createElementNS(svgNS, "g");
  const nodeGroup = document.createElementNS(svgNS, "g");
  linkGroup.setAttribute("class", "synapse-links");
  nodeGroup.setAttribute("class", "synapse-nodes");

  svg.appendChild(linkGroup);
  svg.appendChild(nodeGroup);

  // ---- Links ----
  links.forEach((link) => {
    const source = nodes.find((n) => n.id === link.source);
    const target = nodes.find((n) => n.id === link.target);
    if (!source || !target) return;

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", source.x);
    line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x);
    line.setAttribute("y2", target.y);
    line.setAttribute("stroke", "rgba(0, 255, 255, 0.25)");
    line.setAttribute("stroke-width", "1.2");

    linkGroup.appendChild(line);
  });

  // ---- Nodes ----
  nodes.forEach((node) => {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
    g.setAttribute("class", "synapse-node");

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", "20");
    circle.setAttribute("fill", "#001820");
    circle.setAttribute("stroke", "#00ffff");
    circle.setAttribute("stroke-width", "1.5");

    const name = document.createElementNS(svgNS, "text");
    name.textContent = node.name;
    name.setAttribute("x", "0");
    name.setAttribute("y", "40");
    name.setAttribute("fill", "#00ffff");
    name.setAttribute("font-size", "12");
    name.setAttribute("text-anchor", "middle");
    name.setAttribute("font-family", "monospace");

    g.appendChild(circle);
    g.appendChild(name);
    nodeGroup.appendChild(g);

    // ---- Tooltip events ----
    const skillsPreview = node.skills.slice(0, 4).join(", ") || "No skills yet";
    const tooltipText = `
${node.name}
Availability: ${node.availability}
Connections: ${node.connection_count}
Skills: ${skillsPreview}
`.trim();

    g.addEventListener("mouseenter", (evt) => {
      tooltip.textContent = tooltipText;
      tooltip.style.opacity = "1";
      tooltip.style.visibility = "visible";

      const rect = svg.getBoundingClientRect();
      tooltip.style.left = `${rect.left + node.x + 12}px`;
      tooltip.style.top = `${rect.top + node.y - 10}px`;
    });

    g.addEventListener("mouseleave", () => {
      tooltip.style.opacity = "0";
      tooltip.style.visibility = "hidden";
    });
  });
}

// ======================================================================
// PUBLIC INIT
// ======================================================================
export async function initSynapseView() {
  if (isInitialized) {
    // If container was resized while hidden, re-render with cached data
    const els = getElements();
    if (!els || !nodesCache.length) return;
    applyRadialLayout(
      nodesCache,
      els.container.clientWidth || 900,
      els.container.clientHeight || 600
    );
    renderSynapse(nodesCache, linksCache, els.svg, els.tooltip, els.container);
    return;
  }

  const els = getElements();
  if (!els) return;

  console.log("🧠 Initializing Synapse View…");

  const nodes = await fetchCommunity();
  if (!nodes.length) {
    console.warn("🧠 Synapse: no community data to render");
    return;
  }

  const links = buildLinks(nodes);
  applyRadialLayout(
    nodes,
    els.container.clientWidth || 900,
    els.container.clientHeight || 600
  );
  renderSynapse(nodes, links, els.svg, els.tooltip, els.container);

  nodesCache = nodes;
  linksCache = links;
  isInitialized = true;

  console.log(`🧠 Synapse ready with ${nodes.length} nodes and ${links.length} links`);
}

// ======================================================================
// AUTO-INIT WHEN MODULE IS IMPORTED
// ======================================================================
initSynapseView().catch((err) =>
  console.error("❌ Synapse initialization error:", err)
);

// Optional: re-layout on window resize (only if already initialized)
window.addEventListener("resize", () => {
  if (!isInitialized || !nodesCache.length) return;
  const els = getElements();
  if (!els) return;

  applyRadialLayout(
    nodesCache,
    els.container.clientWidth || 900,
    els.container.clientHeight || 600
  );
  renderSynapse(nodesCache, linksCache, els.svg, els.tooltip, els.container);
});
