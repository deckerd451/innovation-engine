// assets/js/synapse/render.js
// Rendering helpers for links/nodes + project circles

import { getInitials, truncateName } from "./ui.js";

export const COLORS = {
  nodeDefault: "#00e0ff",
  nodeCurrentUser: "#ffd700",
  edgeAccepted: "#00ff88",
  edgePending: "#ffaa00",
  edgeSuggested: "rgba(0, 224, 255, 0.4)",
  edgeDefault: "rgba(0, 224, 255, 0.08)",
};

// Enhanced theme color palette with more vibrant, distinct colors
const THEME_COLORS = [
  "#00e0ff", // Electric Cyan
  "#ff4757", // Vibrant Red
  "#ffd700", // Gold
  "#2ed573", // Emerald Green
  "#ff6b9d", // Pink
  "#ff7f50", // Coral
  "#7bed9f", // Mint Green
  "#70a1ff", // Sky Blue
  "#a4b0be", // Steel Blue
  "#ff6348", // Orange Red
  "#dda0dd", // Plum
  "#40e0d0", // Turquoise
];

// Get a consistent color for a theme based on its ID
export function getThemeColor(themeId) {
  if (!themeId) return COLORS.nodeDefault;

  // Convert theme ID to a number for consistent hashing
  let hash = 0;
  const idStr = String(themeId);
  for (let i = 0; i < idStr.length; i++) {
    hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  const index = Math.abs(hash) % THEME_COLORS.length;
  return THEME_COLORS[index];
}

// Convert hex color to RGB object
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 224, b: 255 }; // Default to cyan
}

// Create hexagon path for project nodes
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

export function setupDefs(svg) {
  const defs = svg.append("defs");

  const filter = defs
    .append("filter")
    .attr("id", "glow")
    .attr("x", "-50%")
    .attr("y", "-50%")
    .attr("width", "200%")
    .attr("height", "200%");

  filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");

  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");
}

export function getLinkColor(link) {
  // Check type first, then status
  
  // Project-member links (person → project)
  if (link.type === "project-member") {
    if (link.status === "pending") {
      return "rgba(255, 107, 107, 0.4)"; // Light red for pending project requests
    }
    return "#ff6b6b"; // Red for approved project members
  }

  // Organization member links
  if (link.type === "organization") {
    return "rgba(168, 85, 247, 0.5)"; // Purple for org membership
  }

  // Handle person-to-person connection links
  if (link.type === "connection") {
    if (link.status === "accepted") {
      return COLORS.edgeAccepted; // Green for accepted connections
    } else if (link.status === "pending") {
      return "rgba(255, 170, 0, 0.5)"; // Orange for pending (more visible than gray)
    }
  }

  // Theme participation links
  if (link.status === "theme-participant") {
    // Per yellow instructions: Use theme color for visual relationship
    // Get the theme color from the source node (theme)
    const themeId = typeof link.source === 'object' && link.source.theme_id
      ? link.source.theme_id
      : (typeof link.source === 'string' && link.source.startsWith('theme:'))
        ? link.source.replace('theme:', '')
        : null;

    if (themeId) {
      const themeColor = getThemeColor(themeId);
      // Opacity based on engagement level
      const alpha = link.engagement_level === "leading" ? 0.9 :
                    link.engagement_level === "active" ? 0.7 : 0.5;
      return themeColor.replace(')', `, ${alpha})`).replace('#', 'rgba(').replace(/^rgba\(([\da-f]{2})([\da-f]{2})([\da-f]{2})/, (_, r, g, b) => {
        return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}`;
      });
    }

    // Fallback to engagement-based colors
    if (link.engagement_level === "leading") return "rgba(255, 215, 0, 0.7)";
    if (link.engagement_level === "active") return "rgba(0, 224, 255, 0.7)";
    return "rgba(0, 224, 255, 0.4)";
  }

  // Legacy status-based colors (fallback)
  switch (link.status) {
    case "accepted":
      return COLORS.edgeAccepted;
    case "pending":
      return COLORS.edgePending;
    case "suggested":
      return COLORS.edgeSuggested;
    default:
      return COLORS.edgeDefault;
  }
}

export function getLinkWidth(link) {
  // Check type first
  
  // Project-member links
  if (link.type === "project-member") {
    if (link.status === "pending") {
      return 1.5; // Thinner for pending project requests
    }
    return 2.5; // Medium thickness for approved project members
  }

  // Organization member links
  if (link.type === "organization") {
    return 2;
  }

  // Handle person-to-person connection links
  if (link.type === "connection") {
    if (link.status === "accepted") {
      return 2.5; // Thicker for accepted connections
    } else if (link.status === "pending") {
      return 1; // Thin for pending connections
    }
  }

  // Theme participation links
  if (link.status === "theme-participant") {
    // Width based on engagement level
    if (link.engagement_level === "leading") return 3;
    if (link.engagement_level === "active") return 2;
    return 1.5; // interested/observer
  }

  // Legacy status-based widths (fallback)
  switch (link.status) {
    case "accepted":
      return 3;
    case "pending":
      return 2;
    case "suggested":
      return 1;
    default:
      return 1;
  }
}

export function renderLinks(container, links) {
  // Simplified link rendering with single elements
  const linkEls = container
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links, d => d.id || `${d.source}-${d.target}`)
    .enter()
    .append("line")
    .attr("class", d => `synapse-link status-${d.status}`)
    .attr("stroke", d => getLinkColor(d))
    .attr("stroke-width", d => getLinkWidth(d))
    .attr("stroke-dasharray", d => d.status === "pending" ? "4,4" : "none")
    .attr("opacity", d => {
      // Project-member links
      if (d.type === "project-member") {
        if (d.status === "pending") return 0.5; // Semi-transparent for pending
        return 0.8; // More visible for approved
      }
      // Organization member links
      if (d.type === "organization") return 0.6;
      // Connection links (person-to-person)
      if (d.type === "connection") {
        if (d.status === "accepted") return 0.9; // Very visible for accepted
        if (d.status === "pending") return 0.6; // More visible for pending (was 0.3)
      }
      // Theme and other links
      if (d.status === "suggested") return 0.4;
      if (d.status === "theme-participant") return 0.6;
      return 0.7;
    });

  return linkEls;
}

export function renderNodes(container, nodes, { onNodeClick, connectionsData = [], currentUserCommunityId = null } = {}) {
  // Build a set of connected user IDs for quick lookup
  const connectedUserIds = new Set();
  const pendingUserIds = new Set(); // outgoing pending requests
  if (connectionsData && currentUserCommunityId) {
    connectionsData.forEach(conn => {
      const status = String(conn.status || "").toLowerCase();
      // Only mark as connected if accepted
      if (status === 'accepted' || status === 'active' || status === 'connected') {
        if (conn.from_user_id === currentUserCommunityId) {
          connectedUserIds.add(conn.to_user_id);
        }
        if (conn.to_user_id === currentUserCommunityId) {
          connectedUserIds.add(conn.from_user_id);
        }
      } else if (status === 'pending' && conn.from_user_id === currentUserCommunityId) {
        // Only show pending ring for outgoing requests (I sent the request)
        pendingUserIds.add(conn.to_user_id);
      }
    });
  }
  
  const nodeEls = container
    .append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "synapse-node")
    .on("click", (event, d) => {
      event.stopPropagation();
      onNodeClick?.(event, d);
    });

  nodeEls.each(function (d) {
    const node = d3.select(this);
    
    // Check if this person is connected to current user
    const isConnected = d.type === "person" && connectedUserIds.has(d.id);
    const isPending = d.type === "person" && !isConnected && !d.isCurrentUser && pendingUserIds.has(d.id);

    if (d.type === "organization") {
      const radius = 28;
      const orgColor = "#a855f7"; // Purple for organizations

      // Outer ring
      node
        .append("circle")
        .attr("r", radius + 5)
        .attr("fill", "none")
        .attr("stroke", orgColor)
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.5)
        .attr("stroke-dasharray", "6,3")
        .attr("class", "org-outer-ring");

      // Main circle
      node
        .append("circle")
        .attr("r", radius)
        .attr("fill", "rgba(168, 85, 247, 0.3)")
        .attr("stroke", orgColor)
        .attr("stroke-width", 2.5)
        .attr("filter", "url(#glow)")
        .attr("class", "node-circle");

      // Organization icon
      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", orgColor)
        .attr("font-size", "18px")
        .attr("pointer-events", "none")
        .text("🏢");

      return;
    }

    if (d.type === "project") {
      const size = Math.max(35, Math.min(60, 30 + (d.team_size * 4)));

      // Enhanced project visual design
      const projectColor = d.theme_id ? getThemeColor(d.theme_id) : "#ff6b6b";
      const projectColorRgb = hexToRgb(projectColor);

      // Add subtle glow background
      node
        .append("circle")
        .attr("r", size * 0.8)
        .attr("fill", `rgba(${projectColorRgb.r}, ${projectColorRgb.g}, ${projectColorRgb.b}, 0.1)`)
        .attr("stroke", "none")
        .attr("class", "project-glow-bg");

      // Main project shape - hexagon instead of rotated square
      const hexagonPath = createHexagonPath(size * 0.6);
      
      node
        .append("path")
        .attr("d", hexagonPath)
        .attr("fill", `rgba(${projectColorRgb.r}, ${projectColorRgb.g}, ${projectColorRgb.b}, ${d.status === "open" ? 0.3 : 0.4})`)
        .attr("stroke", projectColor)
        .attr("stroke-width", d.theme_id ? 3 : 2)
        .attr("filter", "url(#glow)")
        .attr("class", "node-project-shape");

      // Project status indicator
      const statusIcon = d.status === "open" ? "🚀" : d.status === "active" ? "⚡" : "💡";
      
      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", projectColor)
        .attr("font-size", "18px")
        .attr("pointer-events", "none")
        .attr("font-weight", "bold")
        .attr("class", "project-status-icon")
        .text(statusIcon);

      return;
    }

    // Enhanced people nodes with better visual hierarchy
    const radius = d.isCurrentUser ? 55 : d.shouldShowImage ? 32 : d.isSuggested ? 24 : 16;

    // Add connection indicator ring for connected people (not current user)
    if (isConnected && !d.isCurrentUser) {
      node
        .append("circle")
        .attr("r", radius + 6)
        .attr("fill", "none")
        .attr("stroke", "#00ff88") // Green for connected
        .attr("stroke-width", 2.5)
        .attr("stroke-opacity", 0.8)
        .attr("class", "connection-indicator-ring");
    }

    // Add dashed amber ring for pending outgoing connection requests
    if (isPending) {
      node
        .append("circle")
        .attr("r", radius + 6)
        .attr("fill", "none")
        .attr("stroke", "#ffaa00") // Amber for pending
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.8)
        .attr("stroke-dasharray", "4,4")
        .attr("class", "pending-connection-ring");
    }

    // Add outer ring for current user
    if (d.isCurrentUser) {
      node
        .append("circle")
        .attr("r", radius + 8)
        .attr("fill", "none")
        .attr("stroke", COLORS.nodeCurrentUser)
        .attr("stroke-width", 3)
        .attr("stroke-opacity", 0.6)
        .attr("stroke-dasharray", "8,4")
        .attr("filter", "url(#glow)")
        .attr("class", "user-outer-ring")
        .style("animation", "userPulse 2s ease-in-out infinite");
    }

    node
      .append("circle")
      .attr("r", radius)
      .attr("fill", () => {
        if (d.isCurrentUser) return COLORS.nodeCurrentUser;
        // Slightly different fill for connected vs unconnected
        if (isConnected) return d.shouldShowImage ? COLORS.nodeDefault : "rgba(0, 255, 136, 0.3)";
        return d.shouldShowImage ? COLORS.nodeDefault : "rgba(0, 224, 255, 0.4)";
      })
      .attr("stroke", () => {
        if (d.isCurrentUser) return "#fff";
        if (isConnected) return "#00ff88"; // Green stroke for connected
        return COLORS.nodeDefault; // Cyan stroke for unconnected
      })
      .attr("stroke-width", d.isCurrentUser ? 4 : isConnected ? 2.5 : 2)
      .attr("filter", "url(#glow)")
      .attr("class", "node-circle");
  });

  // Images / initials for people
  nodeEls.each(function (d) {
    if (d.type !== "person") return;
    const node = d3.select(this);

    if (d.image_url && d.shouldShowImage) {
      const radius = d.isCurrentUser ? 47 : 25;

      node
        .append("clipPath")
        .attr("id", `clip-${d.id}`)
        .append("circle")
        .attr("r", radius);

      node
        .append("image")
        .attr("xlink:href", d.image_url)
        .attr("x", -radius)
        .attr("y", -radius)
        .attr("width", radius * 2)
        .attr("height", radius * 2)
        .attr("clip-path", `url(#clip-${d.id})`)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .on("error", function () {
          d3.select(this).remove();
        });
    } else if (!d.shouldShowImage) {
      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#00e0ff")
        .attr("font-size", d.isSuggested ? "10px" : "8px")
        .attr("font-weight", "bold")
        .attr("pointer-events", "none")
        .text(getInitials(d.name));
    }
  });

  // Labels
  nodeEls
    .append("text")
    .attr("dy", (d) => (d.type === "organization" ? 42 : d.type === "project" ? 40 : d.isCurrentUser ? 60 : 35))
    .attr("text-anchor", "middle")
    .attr("fill", (d) => (d.type === "organization" ? "#a855f7" : d.type === "project" ? "#ff6b6b" : "#fff"))
    .attr("font-size", (d) => (d.type === "organization" ? "11px" : d.type === "project" ? "12px" : d.isCurrentUser ? "14px" : "11px"))
    .attr("font-family", "system-ui, sans-serif")
    .attr("font-weight", (d) => (d.type === "organization" ? "600" : d.type === "project" ? "bold" : d.isCurrentUser ? "bold" : "normal"))
    .attr("pointer-events", "none")
    .text((d) => truncateName(d.name));

  // Dispatch event for progressive disclosure system
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('synapse:nodes-rendered', {
      detail: { nodeEls, nodes }
    }));
  }, 100);

  return nodeEls;
}

export function renderThemeCircles(container, themeNodes, { onThemeHover, onThemeClick } = {}) {
  // THEMES DISABLED - REPLACED BY OPPORTUNITIES
  // Theme circles are no longer rendered in the graph visualization
  // This function is kept for backward compatibility but does nothing
  console.log('ℹ️ Theme rendering disabled - opportunities system active');
  return;
}

// Function to highlight a selected theme
export function highlightSelectedTheme(themeId) {
  console.log("🎯 Highlighting theme:", themeId);
  
  // Remove previous selection
  d3.selectAll('.theme-container').classed('theme-selected', false);
  
  // Add selection to new theme
  if (themeId) {
    const themeSelector = `.theme-${themeId}`;
    const themeElement = d3.select(themeSelector);
    
    if (!themeElement.empty()) {
      themeElement.classed('theme-selected', true);
      console.log("✅ Theme highlighted successfully:", themeId);
    } else {
      console.warn("⚠️ Theme element not found for highlighting:", themeId, "selector:", themeSelector);
      // Try to find any theme containers for debugging
      const allThemes = d3.selectAll('.theme-container');
      console.log("🔍 Available theme containers:", allThemes.size());
      allThemes.each(function(d) {
        console.log("  - Theme container:", d?.theme_id, "class:", this.className.baseVal);
      });
    }
  }
}

// Function to clear all theme selections
export function clearThemeSelection() {
  console.log("🧹 Clearing all theme selections");
  const cleared = d3.selectAll('.theme-container').classed('theme-selected', false);
  console.log("✅ Cleared selections from", cleared.size(), "theme containers");
}

/**
 * Optimized project circles with minimal DOM elements
 */
export function drawProjectCircles(container, projectNodes) {
  const projectCircleRadius = 40;

  const circles = container
    .insert("g", ":first-child")
    .attr("class", "project-circles")
    .style("pointer-events", "none")
    .selectAll("g")
    .data(projectNodes.filter(n => n.type === 'project'), d => d.id)
    .enter()
    .append("g")
    .attr("class", "project-circle-group");

  // Simplified single circle per project
  circles.each(function(d) {
    const group = d3.select(this);
    const projectColor = d.theme_id ? getThemeColor(d.theme_id) : "#ff6b6b";
    const projectColorRgb = hexToRgb(projectColor);

    // Single circle combining all visual elements
    group
      .append("circle")
      .attr("class", "project-circle")
      .attr("fill", `rgba(${projectColorRgb.r}, ${projectColorRgb.g}, ${projectColorRgb.b}, 0.02)`)
      .attr("stroke", projectColor)
      .attr("stroke-width", d.team_size > 2 ? 2 : 1)
      .attr("stroke-dasharray", "4,2")
      .attr("stroke-opacity", 0.3)
      .attr("r", projectCircleRadius);
  });

  function update() {
    circles.attr("transform", d => `translate(${d.x}, ${d.y})`);
  }

  update();
  return { update };
}

/**
 * Render projects as a separate overlay layer on top of theme circles
 * This ensures projects are clickable and appear above theme backgrounds
 */
export function renderThemeProjectsOverlay(container, themeNodes) {
  const projectsOverlayGroup = container
    .append("g")
    .attr("class", "theme-projects-overlay")
    .style("pointer-events", "all");

  themeNodes.forEach(theme => {
    if (!theme.projects || theme.projects.length === 0) return;

    const themeColor = getThemeColor(theme.theme_id);
    const themeColorRgb = hexToRgb(themeColor);
    const radius = theme.themeRadius || 250;

    const projectCount = theme.projects.length;
    const baseDistance = Math.min(radius * 0.35, 80);
    const maxProjectsPerRing = 8;

    theme.projects.forEach((project, index) => {
      // FIXED: Add theme-specific offset to prevent overlap between themes
      const themeOffset = (theme.theme_id || '').slice(-2); // Use last 2 chars of theme ID
      const themeOffsetAngle = parseInt(themeOffset, 16) || 0; // Convert to number
      const themeAngleOffset = (themeOffsetAngle / 255) * Math.PI * 0.5; // 0 to π/2 offset
      
      // FIXED: Ensure even distribution around the circle
      const angleStep = (2 * Math.PI) / projectCount;
      const projectAngle = (index * angleStep) + themeAngleOffset; // Add theme offset
      
      // If we have many projects, use rings
      const ring = Math.floor(index / maxProjectsPerRing);
      const ringDistance = baseDistance + (ring * 40);
      
      // FIXED: Use proper trigonometry for even spacing
      const projectX = (theme.x || 0) + Math.cos(projectAngle) * ringDistance;
      const projectY = (theme.y || 0) + Math.sin(projectAngle) * ringDistance;

      // Debug logging for project positioning
      console.log(`🎯 Project "${project.title}" positioned:`, {
        themeId: theme.theme_id,
        index,
        angle: (projectAngle * 180 / Math.PI).toFixed(1) + '°',
        themeOffset: themeAngleOffset.toFixed(2),
        x: projectX.toFixed(1),
        y: projectY.toFixed(1),
        ring,
        distance: ringDistance
      });

      // Project visual indicator
      const projectGroup = projectsOverlayGroup
        .append("g")
        .attr("class", `project-overlay project-${project.id}`)
        .attr("transform", `translate(${projectX}, ${projectY})`)
        .style("cursor", "pointer")
        .datum({ ...project, theme_id: theme.theme_id, theme_x: theme.x, theme_y: theme.y, ring, index });

      const hexSize = 16;
      const hexPath = createHexagonPath(hexSize);

      // Project background glow
      projectGroup
        .append("path")
        .attr("d", createHexagonPath(hexSize + 4))
        .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.2)`)
        .attr("stroke", "none")
        .attr("class", "project-glow");

      // Main project hexagon
      projectGroup
        .append("path")
        .attr("d", hexPath)
        .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.8)`)
        .attr("stroke", themeColor)
        .attr("stroke-width", 2)
        .attr("class", "project-shape");

      // Project status icon
      const statusIcon = project.status === "open" ? "🚀" : project.status === "active" ? "⚡" : "💡";
      projectGroup
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("class", "project-icon")
        .text(statusIcon);

      // Project title (shown on hover)
      projectGroup
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "25")
        .attr("fill", themeColor)
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .attr("class", "project-title")
        .attr("opacity", 0)
        .text(truncateName(project.title, 15));

      // Hover effects
      projectGroup
        .on("mouseenter", function() {
          d3.select(this).select(".project-shape")
            .transition().duration(200)
            .attr("stroke-width", 3)
            .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 1.0)`);

          d3.select(this).select(".project-glow")
            .transition().duration(200)
            .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.4)`);

          d3.select(this).select(".project-title")
            .transition().duration(200)
            .attr("opacity", 1);
        })
        .on("mouseleave", function() {
          d3.select(this).select(".project-shape")
            .transition().duration(200)
            .attr("stroke-width", 2)
            .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.8)`);

          d3.select(this).select(".project-glow")
            .transition().duration(200)
            .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.2)`);

          d3.select(this).select(".project-title")
            .transition().duration(200)
            .attr("opacity", 0);
        })
        .on("click", function(event) {
          event.stopPropagation();
          console.log("Project clicked:", project.title);

          // Try multiple methods to open project details
          if (typeof window.openProjectDetails === 'function') {
            window.openProjectDetails(project);
          } else if (typeof window.openNodePanel === 'function') {
            // Fallback: open node panel with project data
            window.openNodePanel({
              ...project,
              type: 'project',
              id: project.id,
              name: project.title
            });
          } else {
            console.warn("⚠️ No project details handler available");
            // Last resort: show alert with project info
            alert(`Project: ${project.title}\n\nStatus: ${project.status}\n\nDescription: ${project.description || 'No description'}`);
          }
        });
    });
  });

  return projectsOverlayGroup;
}
