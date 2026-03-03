// ================================================================
// OPPORTUNITY GRAPH RENDERER
// ================================================================
// Renders opportunity nodes in the network visualization

console.log('🎯 Opportunity Graph Renderer loading...');

/**
 * Render opportunity nodes in the graph
 * Opportunities are rendered as diamond/hexagon shapes with a distinct visual style
 */
export function renderOpportunityNodes(container, opportunityNodes, { onOpportunityHover, onOpportunityClick } = {}) {
  console.log(`🎯 Rendering ${opportunityNodes.length} opportunity nodes`);
  
  // Create opportunities group
  const oppsGroup = container
    .append("g")
    .attr("class", "opportunity-nodes-group")
    .style("pointer-events", "none");

  // Bind data
  const oppGroups = oppsGroup
    .selectAll(".opportunity-node")
    .data(opportunityNodes, d => d.id)
    .enter()
    .append("g")
    .attr("class", d => `opportunity-node opportunity-${d.id.replace(/:/g, '-')}`)
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`);

  oppGroups.each(function(d) {
    const oppGroup = d3.select(this);
    const oppColor = getOpportunityColor(d);
    const radius = 35;
    
    // Create hexagon path for opportunity shape
    const hexPath = createHexagonPath(radius);
    
    // Glow effect background
    oppGroup
      .append("path")
      .attr("d", hexPath)
      .attr("fill", oppColor)
      .attr("fill-opacity", 0.1)
      .attr("stroke", "none")
      .attr("class", "opportunity-glow")
      .attr("filter", "blur(8px)")
      .attr("pointer-events", "none");
    
    // Main hexagon shape
    oppGroup
      .append("path")
      .attr("d", hexPath)
      .attr("fill", `rgba(0, 0, 0, 0.6)`)
      .attr("stroke", oppColor)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.8)
      .attr("class", "opportunity-shape")
      .attr("pointer-events", "none");
    
    // Hit area for interaction
    oppGroup
      .append("path")
      .attr("d", createHexagonPath(radius + 10))
      .attr("fill", "transparent")
      .attr("stroke", "none")
      .attr("class", "opportunity-hit-area")
      .style("cursor", "pointer")
      .style("pointer-events", "all")
      .on("mouseenter", function(event) {
        // Enhance visual feedback
        oppGroup.select(".opportunity-shape")
          .transition()
          .duration(150)
          .attr("stroke-width", 3)
          .attr("stroke-opacity", 1)
          .attr("fill-opacity", 0.3);
        
        oppGroup.select(".opportunity-glow")
          .transition()
          .duration(150)
          .attr("fill-opacity", 0.3);
        
        onOpportunityHover?.(event, d, true);
      })
      .on("mouseleave", function(event) {
        // Reset visual state
        oppGroup.select(".opportunity-shape")
          .transition()
          .duration(150)
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.8)
          .attr("fill-opacity", 0);
        
        oppGroup.select(".opportunity-glow")
          .transition()
          .duration(150)
          .attr("fill-opacity", 0.1);
        
        onOpportunityHover?.(event, d, false);
      })
      .on("click", (event) => {
        event.stopPropagation();
        console.log("🎯 Opportunity clicked:", d.title, "ID:", d.id);
        
        // Visual feedback
        oppGroup.select(".opportunity-shape")
          .transition()
          .duration(100)
          .attr("stroke-width", 5)
          .transition()
          .delay(100)
          .duration(200)
          .attr("stroke-width", 3);
        
        onOpportunityClick?.(event, d);
      });
    
    // Icon based on source
    const icon = getOpportunityIcon(d.source);
    oppGroup
      .append("text")
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .attr("fill", oppColor)
      .attr("font-size", "20px")
      .attr("pointer-events", "none")
      .text(icon);
    
    // Momentum indicator (if trending)
    if (d.momentumScore > 10) {
      oppGroup
        .append("text")
        .attr("x", radius - 5)
        .attr("y", -radius + 10)
        .attr("text-anchor", "middle")
        .attr("fill", "#ffaa00")
        .attr("font-size", "16px")
        .attr("pointer-events", "none")
        .text("🔥");
    }
    
    // Label below
    oppGroup
      .append("text")
      .attr("y", radius + 20)
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text(truncateText(d.title, 20));
  });

  // Add CSS for opportunity nodes
  if (!document.querySelector('#opportunity-node-styles')) {
    const style = document.createElement('style');
    style.id = 'opportunity-node-styles';
    style.textContent = `
      .opportunity-node {
        transition: transform 0.2s ease;
      }
      
      .opportunity-node:hover {
        transform: scale(1.1);
      }
      
      .opportunity-shape {
        transition: all 0.15s ease;
      }
      
      .opportunity-glow {
        transition: all 0.15s ease;
      }
    `;
    document.head.appendChild(style);
  }

  return oppGroups;
}

/**
 * Get color for opportunity based on source and urgency
 */
function getOpportunityColor(opportunity) {
  // High urgency = red tones
  if (opportunity.urgencyScore > 0.8) return "#ff6b6b";
  
  // High momentum = gold
  if (opportunity.momentumScore > 20) return "#ffd700";
  
  // Source-based colors
  const sourceColors = {
    project: "#ff6b6b",
    org: "#a855f7",
    seed: "#00e0ff"
  };
  
  return sourceColors[opportunity.source] || "#00e0ff";
}

/**
 * Get icon for opportunity based on source
 */
function getOpportunityIcon(source) {
  const icons = {
    project: "🚀",
    org: "🏢",
    seed: "💡"
  };
  
  return icons[source] || "⭐";
}

/**
 * Create hexagon path for opportunity nodes
 */
function createHexagonPath(radius) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return `M${points.join('L')}Z`;
}

/**
 * Truncate text to max length
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

/**
 * Update opportunity node positions
 */
export function updateOpportunityPositions(container, opportunityNodes) {
  container
    .selectAll(".opportunity-node")
    .data(opportunityNodes, d => d.id)
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`);
}

/**
 * Create links between opportunities and related nodes
 */
export function createOpportunityLinks(opportunities, nodes) {
  const links = [];
  
  opportunities.forEach(opp => {
    // Link to source project
    if (opp.source === 'project') {
      const projectNode = nodes.find(n => n.type === 'project' && n.id === opp.sourceId);
      if (projectNode) {
        links.push({
          source: opp.id,
          target: projectNode.id,
          type: 'opportunity-project',
          strength: 0.5
        });
      }
    }
    
    // Link to source org
    if (opp.source === 'org') {
      const orgNode = nodes.find(n => n.type === 'organization' && n.id === opp.sourceId);
      if (orgNode) {
        links.push({
          source: opp.id,
          target: orgNode.id,
          type: 'opportunity-org',
          strength: 0.5
        });
      }
    }
    
    // Link to participants who joined
    if (opp.engagementCounts?.joins > 0) {
      // This would require fetching participant data from opportunity_engagement
      // For now, we'll skip this to keep it lightweight
    }
  });
  
  return links;
}

console.log('✅ Opportunity Graph Renderer loaded');
