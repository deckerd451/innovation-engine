// assets/js/pathway-animations.js
// Animated connection pathway system for Synapse
//
// Synapse/Core expectations (based on your current modular wiring):
// - initPathwayAnimations(supabase, svgSelection, containerSelection, nodes, links)
// - updateAllPathwayPositions() called on simulation tick
// - showConnectPathways(fromId, toId, opts) (used by synapse/core.js wrapper)
// - clearConnectPathways() (used by synapse/core.js / synapse.js barrel)
// - generateRecommendations() (used by getRecommendations wrapper in core)
//
// Notes:
// - D3 is global in your build (window.d3).
// - svg and container passed from synapse/core.js are typically D3 selections.
// - This module is "safe": if D3 or container isn't available, it no-ops instead of crashing.

import { getCurrentUserCommunityId } from "./connections.js";

/* ==========================================================================
   STATE
   ========================================================================== */

let supabase = null;

// These may be D3 selections OR DOM nodes depending on caller.
// We normalize them with getD3Selection().
let svgSel = null;
let containerSel = null;

// Graph data snapshots (Synapse passes nodes/links arrays)
let nodes = [];
let links = [];

// Rendered overlays
let activePathways = []; // [{ id, group, segments, pathNodes, updatePositions }]
let activeHighlights = false;

/* ==========================================================================
   D3 + SELECTION HELPERS
   ========================================================================== */

function getD3() {
  return window?.d3 || null;
}

function isD3Selection(obj) {
  return !!obj && typeof obj === "object" && typeof obj.node === "function" && typeof obj.select === "function";
}

function getD3Selection(maybeSelOrNode) {
  const d3 = getD3();
  if (!d3 || !maybeSelOrNode) return null;
  if (isD3Selection(maybeSelOrNode)) return maybeSelOrNode;
  try {
    return d3.select(maybeSelOrNode);
  } catch (_) {
    return null;
  }
}

function getNodeId(n) {
  return n?.id ?? n?.community_id ?? n?.userId ?? null;
}

function getLinkIds(link) {
  const src = link?.source?.id ?? link?.source ?? null;
  const tgt = link?.target?.id ?? link?.target ?? null;
  return { src, tgt };
}

function isAcceptedStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "accepted" || s === "connected" || s === "active" || s === "approved";
}

/* ==========================================================================
   INITIALIZATION / UPDATES
   ========================================================================== */

export function initPathwayAnimations(supabaseClient, svgElement, containerElement, graphNodes, graphLinks) {
  supabase = supabaseClient || null;

  svgSel = getD3Selection(svgElement);
  containerSel = getD3Selection(containerElement);

  nodes = Array.isArray(graphNodes) ? graphNodes : [];
  links = Array.isArray(graphLinks) ? graphLinks : [];

  // Clean any stale overlays
  clearConnectPathways();
  clearHighlights();

  console.log("%c✨ Pathway Animations initialized", "color:#0ff; font-weight:bold");
  return true;
}

export function updateGraphData(graphNodes, graphLinks) {
  nodes = Array.isArray(graphNodes) ? graphNodes : [];
  links = Array.isArray(graphLinks) ? graphLinks : [];

  // Keep existing pathways in sync with new node references
  // (positions update function uses node objects in pathNodes)
  // We do NOT auto-clear; just let updateAllPathwayPositions() handle it.
}

/* ==========================================================================
   RECOMMENDATION ENGINE
   ========================================================================== */

/**
 * Generate recommendations for the current user from the already-loaded Synapse nodes/links.
 * Returns: [{ userId, type, name, score, reason, matchedSkills, pathDistance, node }]
 */
export async function generateRecommendations() {
  const currentUserId = getCurrentUserCommunityId();
  if (!currentUserId) return [];

  const currentUserNode = nodes.find((n) => getNodeId(n) === currentUserId);
  if (!currentUserNode) return [];

  const recommendations = [];

  for (const node of nodes) {
    const nodeId = getNodeId(node);
    if (!nodeId) continue;

    // Skip self + non-people/project types if you want (keep themes out of recs)
    if (nodeId === currentUserId) continue;
    if (node.type === "theme") continue;

    // Skip if already accepted-connected
    const existing = links.find((l) => {
      const { src, tgt } = getLinkIds(l);
      return (
        (src === currentUserId && tgt === nodeId) ||
        (tgt === currentUserId && src === nodeId)
      );
    });

    if (existing && isAcceptedStatus(existing.status)) continue;

    let score = 0;
    const reasons = [];
    let matchedSkills = [];

    // Normalize skills/interests to arrays
    const userSkills = Array.isArray(currentUserNode.skills)
      ? currentUserNode.skills
      : typeof currentUserNode.skills === "string"
      ? currentUserNode.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const userInterests = Array.isArray(currentUserNode.interests)
      ? currentUserNode.interests
      : typeof currentUserNode.interests === "string"
      ? currentUserNode.interests.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    if (node.type === "project") {
      const projectSkills = Array.isArray(node.required_skills)
        ? node.required_skills
        : typeof node.required_skills === "string"
        ? node.required_skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const skillMatches = projectSkills.filter((ps) =>
        userSkills.some((us) => {
          const a = String(us).toLowerCase();
          const b = String(ps).toLowerCase();
          return a.includes(b) || b.includes(a);
        })
      );

      if (skillMatches.length) {
        score += skillMatches.length * 15;
        matchedSkills = skillMatches;
        reasons.push(
          `${skillMatches.length} needed skill${skillMatches.length > 1 ? "s" : ""} match`
        );
      }

      if (String(node.status || "").toLowerCase() === "open") {
        score += 10;
        reasons.push("Open for new members");
      }

      const teamSize = Number(node.team_size);
      if (!Number.isNaN(teamSize) && teamSize > 0 && teamSize < 3) {
        score += 5;
        reasons.push("Small team (easy to join)");
      }
    } else {
      const nodeSkills = Array.isArray(node.skills)
        ? node.skills
        : typeof node.skills === "string"
        ? node.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const nodeInterests = Array.isArray(node.interests)
        ? node.interests
        : typeof node.interests === "string"
        ? node.interests.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const sharedSkills = userSkills.filter((s) =>
        nodeSkills.some((ns) => String(ns).toLowerCase() === String(s).toLowerCase())
      );

      if (sharedSkills.length) {
        score += sharedSkills.length * 10;
        matchedSkills = sharedSkills;
        reasons.push(`${sharedSkills.length} shared skill${sharedSkills.length > 1 ? "s" : ""}`);
      }

      const sharedInterests = userInterests.filter((i) =>
        nodeInterests.some((ni) => String(ni).toLowerCase() === String(i).toLowerCase())
      );

      if (sharedInterests.length) {
        score += sharedInterests.length * 8;
        reasons.push(
          `${sharedInterests.length} shared interest${sharedInterests.length > 1 ? "s" : ""}`
        );
      }

      const complementarySkills = nodeSkills.filter(
        (s) => !userSkills.some((us) => String(us).toLowerCase() === String(s).toLowerCase())
      );
      if (complementarySkills.length >= 2) {
        score += 5;
        reasons.push("Complementary skills");
      }

      if (node.availability && currentUserNode.availability) {
        if (String(node.availability) === String(currentUserNode.availability)) {
          score += 3;
          reasons.push("Similar availability");
        }
      }
    }

    const pathDistance = findShortestPathDistance(currentUserId, nodeId);

    if (pathDistance === 2) {
      score += 8;
      reasons.push("Friend of a friend");
    } else if (pathDistance === 3) {
      score += 3;
      reasons.push("Extended network");
    }

    if (score > 10) {
      recommendations.push({
        userId: nodeId,
        type: node.type || "person",
        name: node.name || node.title || "Unknown",
        score,
        reason: reasons.join(" · "),
        matchedSkills,
        pathDistance,
        node,
      });
    }
  }

  recommendations.sort((a, b) => b.score - a.score);

  console.log(`💡 Generated ${recommendations.length} recommendations`);
  return recommendations.slice(0, 10);
}

/* ==========================================================================
   PATHFINDING
   ========================================================================== */

/**
 * Shortest path using BFS (all edges weight=1).
 * Returns array of nodeIds representing the path, or null if none.
 */
export function findShortestPath(sourceId, targetId, includeSuggested = true) {
  if (!sourceId || !targetId) return null;
  if (sourceId === targetId) return [sourceId];

  // adjacency list
  const graph = new Map();
  for (const n of nodes) {
    const id = getNodeId(n);
    if (id) graph.set(id, []);
  }

  for (const l of links) {
    const { src, tgt } = getLinkIds(l);
    if (!src || !tgt) continue;

    const status = String(l.status || "").toLowerCase();
    const traversable =
      isAcceptedStatus(status) || (includeSuggested && status === "suggested");

    if (!traversable) continue;

    if (graph.has(src)) graph.get(src).push(tgt);
    if (graph.has(tgt)) graph.get(tgt).push(src);
  }

  // BFS
  const queue = [sourceId];
  const visited = new Set([sourceId]);
  const prev = new Map();

  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) break;

    const neighbors = graph.get(cur) || [];
    for (const nb of neighbors) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      prev.set(nb, cur);
      queue.push(nb);
    }
  }

  if (!prev.has(targetId)) return null;

  // reconstruct
  const path = [];
  let cur = targetId;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur);
    if (cur === sourceId) {
      path.unshift(sourceId);
      break;
    }
  }
  return path[0] === sourceId ? path : null;
}

export function findShortestPathDistance(sourceId, targetId) {
  const path = findShortestPath(sourceId, targetId);
  return path ? Math.max(0, path.length - 1) : Infinity;
}

/* ==========================================================================
   PATH VISUALIZATION
   ========================================================================== */

function ensureOverlayLayer() {
  const d3 = getD3();
  if (!d3 || !containerSel) return null;

  // Use a stable overlay group so clearing is easy.
  let layer = containerSel.select("g.connect-pathways-layer");
  if (!layer.empty()) return layer;

  // Insert early so it doesn't block clicks on nodes
  layer = containerSel
    .insert("g", ":first-child")
    .attr("class", "connect-pathways-layer")
    .style("pointer-events", "none");

  return layer;
}

function buildCurvedPathData(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  // gentle curve, scaled by distance
  const curvature = Math.min(45, dist * 0.18);

  const offsetX = (-dy / dist) * curvature;
  const offsetY = (dx / dist) * curvature;

  const cx = midX + offsetX;
  const cy = midY + offsetY;

  return `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`;
}

/**
 * Animate a pathway between two ids.
 * Returns pathwayData or null.
 */
export function animatePathway(sourceId, targetId, options = {}) {
  const d3 = getD3();
  if (!d3) return null;
  if (!containerSel) return null;

  const {
    color = "#00e0ff",
    duration = 1800,
    particleCount = 2,
    glowIntensity = 10,
    onComplete = null,
    forceDirect = false, // if true, even if no graph path, draw direct
  } = options;

  // Try to find a multi-hop path; else fallback to direct if allowed.
  let pathIds = findShortestPath(sourceId, targetId);
  if (!pathIds || pathIds.length < 2) {
    if (!forceDirect) {
      // allow direct if both nodes exist
      const aOk = nodes.some((n) => getNodeId(n) === sourceId);
      const bOk = nodes.some((n) => getNodeId(n) === targetId);
      if (aOk && bOk) pathIds = [sourceId, targetId];
      else return null;
    } else {
      pathIds = [sourceId, targetId];
    }
  }

  const pathNodes = pathIds
    .map((id) => nodes.find((n) => getNodeId(n) === id))
    .filter(Boolean);

  if (pathNodes.length < 2) return null;

  const layer = ensureOverlayLayer();
  if (!layer) return null;

  const group = layer
    .append("g")
    .attr("class", "animated-pathway")
    .attr("data-source", sourceId)
    .attr("data-target", targetId);

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
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("filter", `drop-shadow(0 0 ${glowIntensity}px ${color})`);

    segments.push({ path: seg, source: a, target: b });
  }

  const updatePositions = () => {
    for (const seg of segments) {
      const a = seg.source;
      const b = seg.target;
      if (typeof a.x !== "number" || typeof a.y !== "number") continue;
      if (typeof b.x !== "number" || typeof b.y !== "number") continue;
      seg.path.attr("d", buildCurvedPathData(a, b));
    }
  };

  updatePositions();

  // sequential fade-in
  let idx = 0;
  const perSeg = Math.max(200, Math.floor(duration / Math.max(1, segments.length)));

  const animateNext = () => {
    if (idx >= segments.length) {
      if (particleCount > 0) spawnParticles(group, pathNodes, color, particleCount);
      if (typeof onComplete === "function") onComplete();
      return;
    }

    segments[idx].path
      .transition()
      .duration(perSeg)
      .attr("opacity", 0.85)
      .on("end", () => {
        idx++;
        animateNext();
      });
  };

  animateNext();

  const pathwayData = {
    id: `${sourceId}__${targetId}__${Date.now()}`,
    group,
    segments,
    pathNodes,
    updatePositions,
  };

  activePathways.push(pathwayData);
  return pathwayData;
}

function spawnParticles(group, pathNodes, color, count) {
  const d3 = getD3();
  if (!d3) return;

  for (let i = 0; i < count; i++) {
    window.setTimeout(() => {
      const particle = group
        .append("circle")
        .attr("class", "pathway-particle")
        .attr("r", 4)
        .attr("fill", color)
        .attr("opacity", 0.9)
        .attr("filter", `drop-shadow(0 0 6px ${color})`)
        .attr("cx", pathNodes[0].x)
        .attr("cy", pathNodes[0].y);

      animateParticle(particle, pathNodes, 2400);
    }, i * 180);
  }
}

function animateParticle(particle, pathNodes, duration) {
  const d3 = getD3();
  if (!d3) return;

  let i = 0;
  const step = () => {
    if (i >= pathNodes.length - 1) {
      particle.transition().duration(250).attr("opacity", 0).remove();
      return;
    }
    const next = pathNodes[i + 1];
    particle
      .transition()
      .duration(Math.max(180, Math.floor(duration / Math.max(1, pathNodes.length - 1))))
      .ease(d3.easeLinear)
      .attr("cx", next.x)
      .attr("cy", next.y)
      .on("end", () => {
        i++;
        step();
      });
  };
  step();
}

/* ==========================================================================
   HIGHLIGHTS
   ========================================================================== */

export function highlightRecommendedNodes(recommendations) {
  const d3 = getD3();
 
