/**
 * Synapse Focus System
 * Handles centering on nodes and distance-based dimming
 */

let currentFocalNode = null;

/**
 * Center the view on a specific node
 * @param {Object} node - The node to center on
 * @param {Object} svg - D3 SVG selection
 * @param {Object} container - D3 container selection
 * @param {Object} zoomBehavior - D3 zoom behavior
 */
export function centerOnNode(node, svg, container, zoomBehavior) {
  if (!node || !svg || !container) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  // Calculate transform to center on this node
  const scale = 1.2; // Zoom in slightly
  const x = -node.x * scale + width / 2;
  const y = -node.y * scale + height / 2;

  // Smoothly transition to the new position
  svg
    .transition()
    .duration(750)
    .call(
      zoomBehavior.transform,
      window.d3.zoomIdentity.translate(x, y).scale(scale)
    );

  console.log(`🎯 Centered on node: ${node.name || node.title}`);
}

/**
 * Apply distance-based dimming from a focal point
 * @param {Object} focalNode - The node to use as focal point
 * @param {Object} nodeEls - D3 selection of all nodes
 * @param {Object} linkEls - D3 selection of all links
 * @param {Array} allNodes - Array of all node data
 */
export function applyDistanceBasedDimming(focalNode, nodeEls, linkEls, allNodes) {
  if (!focalNode || !nodeEls) return;

  currentFocalNode = focalNode;

  // Calculate distance from focal node to all other nodes
  nodeEls.each(function (d) {
    if (!d.x || !d.y || !focalNode.x || !focalNode.y) return;

    // Calculate Euclidean distance
    const dx = d.x - focalNode.x;
    const dy = d.y - focalNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate opacity based on distance
    // Close nodes (0-200px): Full opacity (1.0)
    // Medium distance (200-500px): Fade (1.0 → 0.4)
    // Far nodes (500+px): Very dim (0.2)
    let opacity = 1.0;

    if (d.id === focalNode.id) {
      // Focal node itself - always full brightness
      opacity = 1.0;
    } else if (distance < 200) {
      // Very close - full brightness
      opacity = 1.0;
    } else if (distance < 500) {
      // Medium distance - linear fade
      opacity = 1.0 - ((distance - 200) / 300) * 0.6;
    } else {
      // Far away - very dim
      opacity = 0.2;
    }

    // Apply opacity with smooth transition
    window.d3.select(this)
      .transition()
      .duration(300)
      .style('opacity', opacity);
  });

  // Dim links based on whether they connect to focal node or nearby nodes
  if (linkEls) {
    linkEls.each(function (d) {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;

      // Full opacity if connected to focal node
      if (sourceId === focalNode.id || targetId === focalNode.id) {
        window.d3.select(this)
          .transition()
          .duration(300)
          .style('opacity', 0.8);
        return;
      }

      // Otherwise, dim based on distance of endpoints
      const sourceNode = allNodes.find(n => n.id === sourceId);
      const targetNode = allNodes.find(n => n.id === targetId);

      if (!sourceNode || !targetNode) return;

      const sourceDist = Math.hypot(sourceNode.x - focalNode.x, sourceNode.y - focalNode.y);
      const targetDist = Math.hypot(targetNode.x - focalNode.x, targetNode.y - focalNode.y);
      const avgDist = (sourceDist + targetDist) / 2;

      let linkOpacity = 0.3;
      if (avgDist < 200) {
        linkOpacity = 0.6;
      } else if (avgDist < 500) {
        linkOpacity = 0.6 - ((avgDist - 200) / 300) * 0.4;
      } else {
        linkOpacity = 0.1;
      }

      window.d3.select(this)
        .transition()
        .duration(300)
        .style('opacity', linkOpacity);
    });
  }

  console.log(`🌟 Applied distance-based dimming from: ${focalNode.name || focalNode.title}`);
}

/**
 * Clear all focus effects and return to normal view
 * @param {Object} nodeEls - D3 selection of all nodes
 * @param {Object} linkEls - D3 selection of all links
 */
export function clearFocusEffects(nodeEls, linkEls) {
  currentFocalNode = null;

  // Reset all nodes to normal opacity
  if (nodeEls) {
    nodeEls
      .transition()
      .duration(400)
      .style('opacity', 1.0);
  }

  // Reset all links to normal opacity
  if (linkEls) {
    linkEls
      .transition()
      .duration(400)
      .style('opacity', d => {
        // Return to default opacity based on link type
        if (d.status === 'accepted') return 0.6;
        if (d.status === 'pending') return 0.3;
        return 0.4;
      });
  }

  console.log('🔄 Cleared focus effects');
}

/**
 * Set focus on a node (center + dim)
 * @param {Object} node - The node to focus on
 * @param {Object} svg - D3 SVG selection
 * @param {Object} container - D3 container selection
 * @param {Object} zoomBehavior - D3 zoom behavior
 * @param {Object} nodeEls - D3 selection of all nodes
 * @param {Object} linkEls - D3 selection of all links
 * @param {Array} allNodes - Array of all node data
 */
export function setFocusOnNode(node, svg, container, zoomBehavior, nodeEls, linkEls, allNodes) {
  if (!node) {
    clearFocusEffects(nodeEls, linkEls);
    return;
  }

  // Center on the node
  centerOnNode(node, svg, container, zoomBehavior);

  // Apply distance-based dimming
  setTimeout(() => {
    applyDistanceBasedDimming(node, nodeEls, linkEls, allNodes);
  }, 400); // Wait for centering animation to start
}

/**
 * Get the current focal node
 */
export function getCurrentFocalNode() {
  return currentFocalNode;
}

/**
 * Find the current user's node in the node array
 * @param {Array} nodes - Array of all nodes
 * @param {String} currentUserId - The current user's community ID
 */
export function findCurrentUserNode(nodes, currentUserId) {
  if (!nodes || !currentUserId) return null;

  return nodes.find(n => n.id === currentUserId && n.type === 'person');
}
