// assets/js/pathway-animations.js
// Animated connection pathway system for Synapse
// - Recommendation engine (robust to string/array skills + interests)
// - Pathfinding over accepted links
// - Animated SVG pathway overlays (D3-global safe)
// - Compatibility exports expected by synapse/core.js:
//     showConnectPathways, clearConnectPathways, generateRecommendations (via getRecommendations wrapper in core)
//     plus helpers: updateAllPathwayPositions, showRecommendationPathways, etc.

import { getCurrentUserCommunityId } from "./connections.js";

/* ==========================================================================
   STATE
   ========================================================================== */

let supabase = null;

// In Synapse Core, these are D3 selections:
//   svg = d3.select(svgEl)
//   container = svg.append("g")
let svg = null;        // d3 selection
let container = null;  // d3 selection

let nodes = [];
let links = [];

let activePathways = []; // [{ id, group, segments, pathNodes, updatePositions }]
let pathwayLayer = null; // d3 selection group for all pathways

/* ==========================================================================
   INTERNAL UTILS
   ========================================================================== */

function d3() {
  // Synapse build uses global D3 (per core.js)
  return window.d3 || null;
}

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean).map(String);
  if (typeof val === "string") {
    // supports comma-separated strings or newline separated
    return val
      .split(/[,;\n]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(val)];
}

function normSet(list) {
  return new Set(toArray(list).map((s) => s.toLowerCase()));
}

function safeId(x) {
  return x?.id ?? x;
}

function isAcceptedLink(l) {
  const s = String(l?.status ?? "").toLowerCase();
  // treat missing status as "not accepted"
  return s === "accepted" || s === "connected" || s === "active" || s === "approved";
}

function linkConnects(l, a, b) {
  const src = safeId(l?.source);
  const tgt = safeId(l?.target);
  return (src === a && tgt === b) || (src === b && tgt === a);
}

function ensureLayer() {
  if (!container || !d3()) return null;

  // Create a single dedicated layer so clearing is reliable.
  // Place it before nodes if possible (so it sits "behind" nodes).
  if (pathwayLayer && !pathwayLayer.empty()) return pathwayLayer;

  // Try to insert before node groups if they exist; otherwise append.
  try {
    const existingNode = container.select(".synapse-node");
    if (!existingNode.empty()) {
      pathwayLayer = container.insert("g", ".synapse-node").attr("class", "synapse-pathways-layer");
    } else {
      pathwayLayer = container.append("g").attr("class", "synapse-pathways-layer");
      pathwayLayer.lower?.();
    }
  } catch (_) {
    pathwayLayer = container.append("g").attr("class", "synapse-pathways-layer");
  }

  return pathwayLayer;
}

function getNodeById(id) {
  return nodes.find((n) => n?.id === id) || null;
}

function hasAcceptedConnectionBetween(a, b) {
  return (links || []).some((l) => isAcceptedLink(l) && linkConnects(l, a, b));
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

export function initPathwayAnimations(supabaseClient, svgSelection, containerSelection, graphNodes, graphLinks) {
  supabase = supabaseClient ?? null;
  svg = svgSelection ?? null;
  container = containerSelection ?? null;

  nodes = Array.isArray(graphNodes) ? graphNodes : [];
  links = Array.isArray(graphLinks) ? graphLinks : [];

  ensureLayer();

  console.log("%c✨ Pathway Animations initialized", "color:#0ff; font-weight:bold");
  return true;
}

export function updateGraphData(graphNodes, graphLinks) {
  nodes = Array.isArray(graphNodes) ? graphNodes : [];
  links = Array.isArray(graphLinks) ? graphLinks : [];
}

/* ==========================================================================
   RECOMMENDATION ENGINE
   ========================================================================== */

/**
 * Generate recommendations for current user.
 * Returns array of:
 * { userId, type, name, score, reason, matchedSkills, pathDistance, node }
 */
export async function generateRecommendations() {
  const currentUserId = getCurrentUserCommunityId();
  if (!currentUserId) return [];

  const me = getNodeById(currentUserId);
  if (!me) return [];

  const meSkills = normSet(me.skills);
  const meInterests = normSet(me.interests);

  const recs = [];

  for (const node of nodes) {
    if (!node?.id) continue;
    if (node.id === currentUserId) continue;

    // Skip if already accepted-connected
    if (hasAcceptedConnectionBetween(currentUserId, node.id)) continue;

    const type = node.type || "person";
    let score = 0;
    const reasons = [];
    let matchedSkills = [];

    if (type === "project") {
      const needed = normSet(node.required_skills || node.skills || node.tags);
      const matches = [...needed].filter((s) => meSkills.has(s));
      if (matches.length) {
        score += matches.length * 12;
        matchedSkills = matches;
        reasons.push(`${matches.length} skill match${matches.length > 1 ? "es" : ""}`);
      }

      const projectStatus = String(node.status || "").toLowerCase();
      if (projectStatus === "open") {
        score += 8;
        reasons.push("Open project");
      }

      const teamSize = Number(node.team_size);
      if (!Number.isNaN(teamSize) && teamSize > 0 && teamSize < 3) {
        score += 4;
        reasons.push("Small team");
      }
    } else {
      const theirSkills = normSet(node.skills);
      const theirInterests = normSet(node.interests);

      const sharedSkills = [...meSkills].filter((s) => theirSkills.has(s));
      if (sharedSkills.length) {
        score += sharedSkills.length * 8;
        matchedSkills = sharedSkills;
        reasons.push(`${sharedSkills.length} shared skill${sharedSkills.length > 1 ? "s" : ""}`);
      }

      const sharedInterests = [...meInterests].filter((s) => theirInterests.has(s));
      if (sharedInterests.length) {
        score += sharedInterests.length * 6;
        reasons.push(`${sharedInterests.length} shared interest${sharedInterests.length > 1 ? "s" : ""}`);
      }

      // “Complementary” bonus: they have skills you don’t (only if they have at least a couple)
      const complement = [...theirSkills].filter((s) => s && !meSkills.has(s));
      if (complement.length >= 2) {
        score += 3;
        reasons.push("Complementary skills");
      }

      if (node.availability && me.availability && node.availability === me.availability) {
        score += 2;
        reasons.push("Similar availability");
      }
    }

    // Network distance bonus (only if reachable)
    const dist = findShortestPathDistance(currentUserId, node.id);
    if (dist === 2) {
      score += 6;
      reasons.push("Friend-of-friend");
    } else if (dist === 3) {
      score += 2;
      reasons.push("Extended network");
    }

    // Keep threshold modest so you actually get results early
    if (score >= 8) {
      recs.push({
        userId: node.id,
        type,
        name: node.name || node.title || "Unknown",
        score,
        reason: reasons.join(" · ") || "Suggested",
        matchedSkills,
        pathDistance: Number.isFinite(dist) ? dist : null,
        node,
      });
    }
  }

  recs.sort((a, b) => b.score - a.score);
  console.log(`💡 Generated ${recs.length} recommendations`);
  return recs.slice(0, 10);
}

/* ==========================================================================
   PATHFINDING
   ========================================================================== */

export function findShortestPath(sourceId, targetId, includeSuggested = false) {
  if (!sourceId || !targetId) return null;
  if (sourceId === targetId) return [sourceId];

  const graph = new Map();
  for (const n of nodes) {
    if (n?.id) graph.set(n.id, []);
  }

  for (const l of links) {
    const src = safeId(l?.source);
    const tgt = safeId(l?.target);
    if (!src || !tgt) continue;

    const status = String(l?.status ?? "").toLowerCase();
    const ok =
      isAcceptedLink(l) ||
      (includeSuggested && status === "suggested");

    if (!ok) continue;

    graph.get(src)?.push(tgt);
    graph.get(tgt)?.push(src);
  }

  // BFS (all edges weight 1) — faster + simpler than Dijkstra here
  const queue = [sourceId];
  const prev = new Map();
  prev.set(sourceId, null);

  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) break;

    const nbrs = graph.get(cur) || [];
    for (const nb of nbrs) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }

  if (!prev.has(targetId)) return null;

  const path = [];
  let cur = targetId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path;
}

export function findShortestPathDistance(sourceId, targetId) {
  const p = findShortestPath(sourceId, targetId, false);
  return p ? p.length - 1 : Infinity;
}

/* ==========================================================================
   PATH VISUALIZATION
   ========================================================================== */

export function animatePathway(sourceId, targetId, options = {}) {
  const D3 = d3();
  if (!D3 || !container) {
    console.warn("animatePathway: D3/container not ready");
    return null;
  }

  const {
    color = "#00e0ff",
    duration = 1500,
    particleCount = 2,
    glowIntensity = 10,
    onComplete = null,
    forceDirect = false, // if true, draw direct even if no accepted path
    targetNode = null, // NEW: pass the target node data for click handling
  } = options;

  let path = findShortestPath(sourceId, targetId, false);

  if ((!path || path.length < 2) && forceDirect) {
    // draw direct if both nodes exist
    if (getNodeById(sourceId) && getNodeById(targetId)) path = [sourceId, targetId];
  }

  if (!path || path.length < 2) {
    console.warn("No path found for pathway animation", { sourceId, targetId });
    return null;
  }

  const pathNodes = path.map(getNodeById).filter(Boolean);
  if (pathNodes.length !== path.length) {
    console.warn("Some nodes in path were not found in current graph");
    return null;
  }

  const layer = ensureLayer();
  if (!layer) return null;

  // Create group
  const group = layer
    .append("g")
    .attr("class", "animated-pathway")
    .attr("data-source", sourceId)
    .attr("data-target", targetId)
    .style("cursor", "pointer"); // Make it clear this is clickable

  // Draw segments
  const segments = [];
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const a = pathNodes[i];
    const b = pathNodes[i + 1];

    const seg = group
      .append("path")
      .attr("class", "pathway-segment")
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 4)
      .attr("opacity", 0)
      .attr("filter", `drop-shadow(0 0 ${glowIntensity}px ${color})`)
      .style("cursor", "pointer"); // Make segments clickable

    segments.push({ pathEl: seg, source: a, target: b });
  }

  // Get target node data for click handler (define outside the handler)
  const targetNodeData = targetNode || getNodeById(targetId);

  // NEW: Add click handler to open target node's profile
  const handlePathwayClick = (event) => {
    event.stopPropagation();
    
    if (!targetNodeData) {
      console.warn("Cannot open profile - target node data not available");
      return;
    }
    
    console.log("🎯 Pathway clicked - opening profile for:", targetNodeData.name);
    
    // Import openNodePanel if available
    if (typeof window.openNodePanel === 'function') {
      window.openNodePanel({
        id: targetNodeData.id,
        name: targetNodeData.name,
        type: targetNodeData.type || "person",
        ...targetNodeData,
      });
    } else {
      console.warn("openNodePanel not available");
    }
  };
  
  // Add click handler to the group
  group.on("click", handlePathwayClick);

  const updatePositions = () => {
    for (const s of segments) {
      const { source, target, pathEl } = s;
      if (source?.x == null || source?.y == null || target?.x == null || target?.y == null) continue;

      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const curvature = Math.min(40, dist * 0.18);

      const offsetX = (-dy / dist) * curvature;
      const offsetY = (dx / dist) * curvature;

      const cx = midX + offsetX;
      const cy = midY + offsetY;

      pathEl.attr("d", `M ${source.x},${source.y} Q ${cx},${cy} ${target.x},${target.y}`);
    }
  };

  updatePositions();

  // Fade segments in sequentially
  let idx = 0;
  const step = () => {
    if (idx >= segments.length) {
      if (particleCount > 0) animateParticles(group, pathNodes, color, particleCount);
      if (typeof onComplete === "function") onComplete();
      return;
    }
    segments[idx].pathEl
      .transition()
      .duration(Math.max(150, duration / segments.length))
      .attr("opacity", 0.85)
      .on("end", () => {
        idx++;
        step();
      });
  };

  step();

  const entry = {
    id: `${sourceId}-${targetId}-${Date.now()}`,
    group,
    segments,
    pathNodes,
    updatePositions,
    targetNode: targetNodeData, // Store target node data
  };

  activePathways.push(entry);
  return entry;
}

function animateParticles(group, pathNodes, color, count) {
  const D3 = d3();
  if (!D3) return;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = group
        .append("circle")
        .attr("class", "pathway-particle")
        .attr("r", 4)
        .attr("fill", color)
        .attr("filter", `drop-shadow(0 0 6px ${color})`)
        .attr("cx", pathNodes[0].x)
        .attr("cy", pathNodes[0].y)
        .attr("opacity", 0.95);

      animateParticleAlongNodes(p, pathNodes, 2200);
    }, i * 180);
  }
}

function animateParticleAlongNodes(particleSel, pathNodes, duration) {
  const D3 = d3();
  if (!D3) return;

  let i = 0;
  const hop = () => {
    if (i >= pathNodes.length - 1) {
      particleSel.transition().duration(250).attr("opacity", 0).remove();
      return;
    }

    const next = pathNodes[i + 1];
    particleSel
      .transition()
      .duration(Math.max(180, duration / pathNodes.length))
      .ease(D3.easeLinear)
      .attr("cx", next.x)
      .attr("cy", next.y)
      .on("end", () => {
        i++;
        hop();
      });
  };

  hop();
}

/* ==========================================================================
   RECOMMENDATION HIGHLIGHTS
   ========================================================================== */

export function clearHighlights() {
  if (!container) return;
  try {
    container.selectAll(".recommendation-glow").remove();
  } catch (_) {}
}

export function highlightRecommendedNodes(recommendations) {
  clearHighlights();

  const D3 = d3();
  if (!D3 || !container || !Array.isArray(recommendations)) return;

  // Try common class first; fallback to all <g> bound nodes
  let nodeSelection = container.selectAll(".synapse-node");
  if (nodeSelection.empty()) nodeSelection = container.selectAll("g");

  for (const rec of recommendations) {
    const sel = nodeSelection.filter((d) => d?.id === rec.userId);
    if (sel.empty()) continue;

    sel.each(function (d) {
      const g = D3.select(this);
      const baseRadius = d?.type === "project" ? 50 : (d?.isCurrentUser ? 35 : 28);

      const glow = g
        .insert("circle", ":first-child")
        .attr("class", "recommendation-glow")
        .attr("r", baseRadius + 10)
        .attr("fill", "none")
        .attr("stroke", d?.type === "project" ? "#ff6b6b" : "#00e0ff")
        .attr("stroke-width", 3)
        .attr("opacity", 0.55);

      const pulse = () => {
        glow
          .transition()
          .duration(900)
          .attr("r", baseRadius + 15)
          .attr("opacity", 0.25)
          .transition()
          .duration(900)
          .attr("r", baseRadius + 10)
          .attr("opacity", 0.55)
          .on("end", pulse);
      };
      pulse();
    });
  }

  console.log(`✨ Highlighted ${recommendations.length} recommended nodes`);
}

/* ==========================================================================
   LIFECYCLE / UPDATES
   ========================================================================== */

export function updateAllPathwayPositions() {
  for (const p of activePathways) {
    try {
      p?.updatePositions?.();
    } catch (_) {}
  }
}

/* ==========================================================================
   COMPATIBILITY EXPORTS (USED BY synapse/core.js)
   ========================================================================== */

export function showConnectPathways(fromId, toId, opts = {}) {
  // Core calls this; draw a pathway immediately.
  // Use forceDirect so you can show a “suggested” direct pathway even without an accepted graph path.
  return animatePathway(fromId, toId, { ...opts, forceDirect: true });
}

export function clearConnectPathways() {
  // Core calls this to clear overlays
  clearAllPathways();
  clearHighlights();
}

export function clearAllPathways() {
  if (!container) return;

  try {
    // Remove only our layer contents if present
    if (pathwayLayer && !pathwayLayer.empty()) {
      pathwayLayer.selectAll(".animated-pathway").remove();
    } else {
      container.selectAll(".animated-pathway").remove();
    }
  } catch (_) {}

  activePathways = [];
  console.log("🧹 Cleared all pathways");
}

export async function showRecommendationPathways(limit = 5) {
  clearAllPathways();

  const recs = await generateRecommendations();
  const currentUserId = getCurrentUserCommunityId();
  if (!currentUserId) return [];

  if (!recs.length) {
    console.warn("showRecommendationPathways: no recommendations generated");
    return [];
  }

  highlightRecommendedNodes(recs);

  const top = recs.slice(0, Math.max(1, Number(limit) || 5));

  top.forEach((rec, i) => {
    setTimeout(() => {
      showConnectPathways(currentUserId, rec.userId, {
        color: rec.type === "project" ? "#ff6b6b" : "#00e0ff",
        duration: 1600,
        particleCount: 2,
        glowIntensity: 12,
        targetNode: rec.node, // Pass the target node data for click handling
      });
    }, i * 350);
  });

  console.log(`🌟 Showing pathways to top ${top.length} recommendations`);
  return recs;
}

/* ==========================================================================
   DEFAULT EXPORT (OPTIONAL LEGACY)
   ========================================================================== */

export default {
  initPathwayAnimations,
  updateGraphData,

  generateRecommendations,
  findShortestPath,
  findShortestPathDistance,

  animatePathway,
  updateAllPathwayPositions,

  highlightRecommendedNodes,
  clearHighlights,

  showConnectPathways,
  clearConnectPathways,

  clearAllPathways,
  showRecommendationPathways,
};
