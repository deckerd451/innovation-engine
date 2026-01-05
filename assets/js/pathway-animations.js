// pathway-animations.js - Animated connection pathway system
// Provides intelligent recommendations and animated SVG pathways

import { getCurrentUserCommunityId } from './connections.js';

// ========================
// STATE
// ========================
let supabase = null;
let svg = null;
let container = null;
let nodes = [];
let links = [];
let activePathways = [];
let animationFrameId = null;
let isAnimating = false;

// ========================
// INITIALIZATION
// ========================
export function initPathwayAnimations(supabaseClient, svgElement, containerElement, graphNodes, graphLinks) {
  supabase = supabaseClient;
  svg = svgElement;
  container = containerElement;
  nodes = graphNodes;
  links = graphLinks;

  console.log('%c✨ Pathway Animations initialized', 'color: #0ff; font-weight: bold');
  return true;
}

// Update nodes/links when graph changes
export function updateGraphData(graphNodes, graphLinks) {
  nodes = graphNodes;
  links = graphLinks;
}

// ========================
// RECOMMENDATION ENGINE
// ========================

/**
 * Generate intelligent recommendations for the current user
 * Returns array of {userId, score, reason, matchedSkills, pathDistance}
 */
export async function generateRecommendations() {
  const currentUserId = getCurrentUserCommunityId();
  if (!currentUserId) return [];

  const currentUserNode = nodes.find(n => n.id === currentUserId);
  if (!currentUserNode) return [];

  const recommendations = [];

  // Score each person and project
  for (const node of nodes) {
    // Skip self
    if (node.id === currentUserId) continue;

    // Check if already connected
    const existingConnection = links.find(l =>
      (l.source?.id === currentUserId && l.target?.id === node.id) ||
      (l.target?.id === currentUserId && l.source?.id === node.id) ||
      (l.source === currentUserId && l.target === node.id) ||
      (l.target === currentUserId && l.source === node.id)
    );

    if (existingConnection && existingConnection.status === 'accepted') continue;

    let score = 0;
    let reasons = [];
    let matchedSkills = [];

    if (node.type === 'project') {
      // PROJECT MATCHING
      const projectSkills = node.required_skills || [];
      const userSkills = currentUserNode.skills || [];

      // Match user skills to project needs
      const skillMatches = projectSkills.filter(ps =>
        userSkills.some(us => us.toLowerCase().includes(ps.toLowerCase()) || ps.toLowerCase().includes(us.toLowerCase()))
      );

      if (skillMatches.length > 0) {
        score += skillMatches.length * 15; // High value for skill matches
        matchedSkills = skillMatches;
        reasons.push(`${skillMatches.length} needed skill${skillMatches.length > 1 ? 's' : ''} match`);
      }

      // Bonus for open projects
      if (node.status === 'open') {
        score += 10;
        reasons.push('Open for new members');
      }

      // Bonus for small teams (easier to join)
      if (node.team_size < 3) {
        score += 5;
        reasons.push('Small team (easy to join)');
      }

    } else {
      // PERSON MATCHING
      const nodeSkills = node.skills || [];
      const userSkills = currentUserNode.skills || [];
      const nodeInterests = node.interests || [];
      const userInterests = currentUserNode.interests || [];

      // Skill overlap
      const sharedSkills = userSkills.filter(s =>
        nodeSkills.some(ns => ns.toLowerCase() === s.toLowerCase())
      );

      if (sharedSkills.length > 0) {
        score += sharedSkills.length * 10;
        matchedSkills = sharedSkills;
        reasons.push(`${sharedSkills.length} shared skill${sharedSkills.length > 1 ? 's' : ''}`);
      }

      // Interest overlap
      const sharedInterests = userInterests.filter(i =>
        nodeInterests.some(ni => ni.toLowerCase() === i.toLowerCase())
      );

      if (sharedInterests.length > 0) {
        score += sharedInterests.length * 8;
        reasons.push(`${sharedInterests.length} shared interest${sharedInterests.length > 1 ? 's' : ''}`);
      }

      // Complementary skills (they have skills you don't)
      const complementarySkills = nodeSkills.filter(s =>
        !userSkills.some(us => us.toLowerCase() === s.toLowerCase())
      );

      if (complementarySkills.length >= 2) {
        score += 5;
        reasons.push('Complementary skills');
      }

      // Availability match
      if (node.availability && currentUserNode.availability) {
        if (node.availability === currentUserNode.availability) {
          score += 3;
          reasons.push('Similar availability');
        }
      }
    }

    // Calculate network distance (how many hops away)
    const pathDistance = findShortestPathDistance(currentUserId, node.id);

    // Bonus for 2nd-degree connections (friend-of-friend)
    if (pathDistance === 2) {
      score += 8;
      reasons.push('Friend of a friend');
    } else if (pathDistance === 3) {
      score += 3;
      reasons.push('Extended network');
    }

    // Only recommend if there's a meaningful score
    if (score > 10) {
      recommendations.push({
        userId: node.id,
        type: node.type || 'person',
        name: node.name || node.title,
        score,
        reason: reasons.join(' · '),
        matchedSkills,
        pathDistance,
        node
      });
    }
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  console.log(`💡 Generated ${recommendations.length} recommendations`);
  return recommendations.slice(0, 10); // Top 10
}

// ========================
// PATHFINDING ALGORITHM
// ========================

/**
 * Find shortest path between two nodes using Dijkstra's algorithm
 * Returns array of node IDs representing the path
 */
export function findShortestPath(sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];

  // Build adjacency list
  const graph = new Map();
  for (const node of nodes) {
    graph.set(node.id, []);
  }

  for (const link of links) {
    const srcId = link.source?.id || link.source;
    const tgtId = link.target?.id || link.target;

    // Only traverse accepted connections
    if (link.status === 'accepted' || link.status === 'connected') {
      graph.get(srcId)?.push(tgtId);
      graph.get(tgtId)?.push(srcId); // Bidirectional
    }
  }

  // Dijkstra's algorithm
  const distances = new Map();
  const previous = new Map();
  const unvisited = new Set(graph.keys());

  for (const nodeId of graph.keys()) {
    distances.set(nodeId, Infinity);
  }
  distances.set(sourceId, 0);

  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let current = null;
    let minDist = Infinity;
    for (const nodeId of unvisited) {
      const dist = distances.get(nodeId);
      if (dist < minDist) {
        minDist = dist;
        current = nodeId;
      }
    }

    if (current === null || minDist === Infinity) break;
    if (current === targetId) break; // Found target

    unvisited.delete(current);

    const neighbors = graph.get(current) || [];
    for (const neighbor of neighbors) {
      if (!unvisited.has(neighbor)) continue;

      const altDist = distances.get(current) + 1;
      if (altDist < distances.get(neighbor)) {
        distances.set(neighbor, altDist);
        previous.set(neighbor, current);
      }
    }
  }

  // Reconstruct path
  if (!previous.has(targetId)) {
    return null; // No path found
  }

  const path = [];
  let current = targetId;
  while (current !== undefined) {
    path.unshift(current);
    current = previous.get(current);
  }

  return path;
}

/**
 * Get shortest path distance (number of hops)
 */
export function findShortestPathDistance(sourceId, targetId) {
  const path = findShortestPath(sourceId, targetId);
  return path ? path.length - 1 : Infinity;
}

// ========================
// PATH VISUALIZATION
// ========================

/**
 * Animate a glowing pathway from source to target
 */
export function animatePathway(sourceId, targetId, options = {}) {
  const {
    color = '#00e0ff',
    duration = 2000,
    particleCount = 3,
    glowIntensity = 10,
    onComplete = null
  } = options;

  // Find path
  const path = findShortestPath(sourceId, targetId);
  if (!path || path.length < 2) {
    console.warn(`No path found from ${sourceId} to ${targetId}`);
    return null;
  }

  // Get node positions
  const pathNodes = path.map(id => nodes.find(n => n.id === id)).filter(Boolean);
  if (pathNodes.length !== path.length) {
    console.warn('Some nodes in path not found in graph');
    return null;
  }

  // Create pathway group
  const pathwayGroup = container.append('g')
    .attr('class', 'animated-pathway')
    .attr('data-source', sourceId)
    .attr('data-target', targetId);

  // Draw pathway segments
  const segments = [];
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const source = pathNodes[i];
    const target = pathNodes[i + 1];

    // Create curved path (Bezier)
    const path = pathwayGroup.append('path')
      .attr('class', 'pathway-segment')
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 4)
      .attr('opacity', 0)
      .attr('filter', `drop-shadow(0 0 ${glowIntensity}px ${color})`);

    segments.push({ path, source, target });
  }

  // Animate each segment sequentially
  let currentSegment = 0;
  const animateSegment = () => {
    if (currentSegment >= segments.length) {
      // All segments complete, add particles
      if (particleCount > 0) {
        animateParticles(pathwayGroup, pathNodes, color, particleCount);
      }
      if (onComplete) onComplete();
      return;
    }

    const { path, source, target } = segments[currentSegment];

    // Calculate control point for curve (add slight bend)
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(30, dist * 0.2);

    // Perpendicular offset
    const offsetX = -dy / dist * curvature;
    const offsetY = dx / dist * curvature;
    const controlX = midX + offsetX;
    const controlY = midY + offsetY;

    // Quadratic Bezier curve
    const pathData = `M ${source.x},${source.y} Q ${controlX},${controlY} ${target.x},${target.y}`;
    path.attr('d', pathData);

    // Fade in
    path.transition()
      .duration(duration / segments.length)
      .attr('opacity', 0.8)
      .on('end', () => {
        currentSegment++;
        animateSegment();
      });
  };

  animateSegment();

  // Store pathway for cleanup
  const pathwayData = {
    id: `${sourceId}-${targetId}`,
    group: pathwayGroup,
    segments,
    path
  };

  activePathways.push(pathwayData);
  return pathwayData;
}

/**
 * Animate particles flowing along the pathway
 */
function animateParticles(pathwayGroup, pathNodes, color, count) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const particle = pathwayGroup.append('circle')
        .attr('class', 'pathway-particle')
        .attr('r', 4)
        .attr('fill', color)
        .attr('filter', `drop-shadow(0 0 6px ${color})`)
        .attr('cx', pathNodes[0].x)
        .attr('cy', pathNodes[0].y);

      animateParticleAlongPath(particle, pathNodes, 3000);
    }, i * 200);
  }
}

function animateParticleAlongPath(particle, pathNodes, duration) {
  let currentIndex = 0;

  const moveToNext = () => {
    if (currentIndex >= pathNodes.length - 1) {
      particle.transition().duration(300).attr('opacity', 0).remove();
      return;
    }

    const target = pathNodes[currentIndex + 1];
    particle.transition()
      .duration(duration / pathNodes.length)
      .ease(d3.easeLinear)
      .attr('cx', target.x)
      .attr('cy', target.y)
      .on('end', () => {
        currentIndex++;
        moveToNext();
      });
  };

  moveToNext();
}

/**
 * Highlight recommended nodes with pulsing glow
 */
export function highlightRecommendedNodes(recommendations) {
  // Remove existing highlights
  clearHighlights();

  if (!svg || !container) return;

  // Add highlights to each recommended node
  for (const rec of recommendations) {
    const nodeElement = container.selectAll('.synapse-node')
      .filter(d => d.id === rec.userId);

    if (nodeElement.empty()) continue;

    // Add pulsing glow circle
    nodeElement.each(function(d) {
      const node = d3.select(this);

      // Determine radius based on node type
      const radius = d.type === 'project' ? 50 : (d.isCurrentUser ? 35 : 28);

      const glow = node.insert('circle', ':first-child')
        .attr('class', 'recommendation-glow')
        .attr('r', radius + 10)
        .attr('fill', 'none')
        .attr('stroke', rec.type === 'project' ? '#ff6b6b' : '#00e0ff')
        .attr('stroke-width', 3)
        .attr('opacity', 0.6);

      // Pulsing animation
      function pulse() {
        glow.transition()
          .duration(1000)
          .attr('r', radius + 15)
          .attr('opacity', 0.3)
          .transition()
          .duration(1000)
          .attr('r', radius + 10)
          .attr('opacity', 0.6)
          .on('end', pulse);
      }
      pulse();
    });
  }

  console.log(`✨ Highlighted ${recommendations.length} recommended nodes`);
}

/**
 * Clear all pathway highlights
 */
export function clearHighlights() {
  if (!container) return;
  container.selectAll('.recommendation-glow').remove();
}

/**
 * Clear all animated pathways
 */
export function clearAllPathways() {
  if (!container) return;
  container.selectAll('.animated-pathway').remove();
  activePathways = [];
  console.log('🧹 Cleared all pathways');
}

/**
 * Show pathways to top N recommendations
 */
export async function showRecommendationPathways(limit = 5) {
  clearAllPathways();

  const recommendations = await generateRecommendations();
  const currentUserId = getCurrentUserCommunityId();

  if (!currentUserId) {
    console.warn('No current user ID');
    return;
  }

  // Highlight all recommended nodes
  highlightRecommendedNodes(recommendations);

  // Show pathways to top recommendations
  const topRecs = recommendations.slice(0, limit);

  for (let i = 0; i < topRecs.length; i++) {
    const rec = topRecs[i];

    setTimeout(() => {
      animatePathway(currentUserId, rec.userId, {
        color: rec.type === 'project' ? '#ff6b6b' : '#00e0ff',
        duration: 2000,
        particleCount: 2,
        glowIntensity: 12
      });
    }, i * 400); // Stagger animations
  }

  console.log(`🌟 Showing pathways to top ${topRecs.length} recommendations`);
  return recommendations;
}

// ========================
// EXPORTS
// ========================
export default {
  initPathwayAnimations,
  updateGraphData,
  generateRecommendations,
  findShortestPath,
  findShortestPathDistance,
  animatePathway,
  highlightRecommendedNodes,
  clearHighlights,
  clearAllPathways,
  showRecommendationPathways
};
