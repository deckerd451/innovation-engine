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
  switch (link.status) {
    case "accepted":
      return COLORS.edgeAccepted;
    case "pending":
      return COLORS.edgePending;
    case "suggested":
      return COLORS.edgeSuggested;
    case "project-member":
      return "#ff6b6b";
    case "theme-participant":
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
    default:
      return COLORS.edgeDefault;
  }
}

export function getLinkWidth(link) {
  switch (link.status) {
    case "accepted":
      return 3;
    case "pending":
      return 2;
    case "suggested":
      return 1;
    case "theme-participant":
      // Width based on engagement level
      if (link.engagement_level === "leading") return 3;
      if (link.engagement_level === "active") return 2;
      return 1.5; // interested/observer
    default:
      return 1;
  }
}

export function renderLinks(container, links) {
  const linkEls = container
    .append("g")
    .attr("class", "links")
    .selectAll("g")
    .data(links)
    .enter()
    .append("g")
    .attr("class", (d) => `synapse-link-group status-${d.status}`);

  // Add glow effect for important connections
  linkEls.each(function(d) {
    const group = d3.select(this);
    const linkColor = getLinkColor(d);
    const linkWidth = getLinkWidth(d);

    // Background glow line for accepted connections
    if (d.status === "accepted" || d.status === "theme-participant") {
      group
        .append("line")
        .attr("class", "link-glow")
        .attr("stroke", linkColor)
        .attr("stroke-width", linkWidth + 4)
        .attr("stroke-opacity", 0.2)
        .attr("filter", "url(#glow)");
    }

    // Main connection line
    group
      .append("line")
      .attr("class", "synapse-link")
      .attr("stroke", linkColor)
      .attr("stroke-width", linkWidth)
      .attr("stroke-dasharray", (d) => {
        if (d.status === "pending") return "5,5";
        return "none";
      })
      .attr("opacity", (d) => {
        if (d.status === "suggested") return 0.5;
        if (d.status === "theme-participant") return 0.7;
        return 0.8;
      });

    // Add connection strength indicators for theme participation
    if (d.status === "theme-participant" && d.engagement_level === "leading") {
      group
        .append("circle")
        .attr("class", "connection-strength-indicator")
        .attr("r", 3)
        .attr("fill", linkColor)
        .attr("opacity", 0.8);
    }
  });

  return linkEls;
}

export function renderNodes(container, nodes, { onNodeClick } = {}) {
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
        return d.shouldShowImage ? COLORS.nodeDefault : "rgba(0, 224, 255, 0.4)";
      })
      .attr("stroke", () => (d.isCurrentUser ? "#fff" : COLORS.nodeDefault))
      .attr("stroke-width", d.isCurrentUser ? 4 : 2)
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
    .attr("dy", (d) => (d.type === "project" ? 40 : d.isCurrentUser ? 60 : 35))
    .attr("text-anchor", "middle")
    .attr("fill", (d) => (d.type === "project" ? "#ff6b6b" : "#fff"))
    .attr("font-size", (d) => (d.type === "project" ? "12px" : d.isCurrentUser ? "14px" : "11px"))
    .attr("font-family", "system-ui, sans-serif")
    .attr("font-weight", (d) => (d.type === "project" ? "bold" : d.isCurrentUser ? "bold" : "normal"))
    .attr("pointer-events", "none")
    .text((d) => truncateName(d.name));

  return nodeEls;
}

export function renderThemeCircles(container, themeNodes, { onThemeHover, onThemeClick } = {}) {
  // Create defs section for gradients if it doesn't exist
  let defs = container.select("defs");
  if (defs.empty()) {
    defs = container.append("defs");
  }

  // Enhanced gradients with more dynamic visual effects
  themeNodes.forEach(theme => {
    const themeColor = getThemeColor(theme.theme_id);
    const themeColorRgb = hexToRgb(themeColor);
    const gradientId = `theme-influence-${theme.theme_id}`;

    // Remove existing gradient if it exists
    defs.select(`#${gradientId}`).remove();

    // Create animated radial gradient with pulsing effect
    const gradient = defs.append("radialGradient")
      .attr("id", gradientId);

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0.25);

    gradient.append("stop")
      .attr("offset", "30%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0.15);

    gradient.append("stop")
      .attr("offset", "70%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0.05);

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0);
  });

  // Create theme groups with enhanced visual hierarchy
  const themesGroup = container
    .append("g")
    .attr("class", "theme-circles-group");

  themeNodes.forEach((d) => {
    const themeColor = getThemeColor(d.theme_id);
    const themeColorRgb = hexToRgb(themeColor);
    const radius = d.themeRadius || 250;

    // Calculate lifecycle progress for visual feedback
    const now = Date.now();
    const expires = new Date(d.expires_at).getTime();
    const created = new Date(d.created_at).getTime();
    const lifetime = expires - created;
    const remaining = expires - now;
    const progress = Math.max(0, Math.min(1, 1 - (remaining / lifetime)));

    const userHasJoined = d.user_is_participant === true;
    const isUserTheme = d.isUserTheme === true;
    const participantCount = d.participant_count || 0;

    // Create theme container group for easier manipulation
    const themeGroup = themesGroup
      .append("g")
      .attr("class", `theme-container theme-${d.theme_id}`)
      .attr("transform", `translate(${d.x || 0}, ${d.y || 0})`);

    // Animated background pulse for active themes
    if (participantCount > 3) {
      themeGroup
        .append("circle")
        .attr("r", radius + 20)
        .attr("fill", "none")
        .attr("stroke", themeColor)
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.3)
        .attr("class", "theme-pulse")
        .style("animation", "themePulse 3s ease-in-out infinite");
    }

    // Main influence field with gradient
    themeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", `url(#theme-influence-${d.theme_id})`)
      .attr("stroke", "none")
      .attr("class", "theme-influence-field")
      .attr("pointer-events", "none");

    // Outer decorative ring
    themeGroup
      .append("circle")
      .attr("r", radius + 8)
      .attr("fill", "none")
      .attr("stroke", themeColor)
      .attr("stroke-width", userHasJoined ? 4 : 2)
      .attr("stroke-opacity", userHasJoined ? 0.6 : 0.3)
      .attr("stroke-dasharray", userHasJoined ? "none" : "8,4")
      .attr("filter", "url(#glow)")
      .attr("class", "theme-outer-ring")
      .attr("pointer-events", "none");

    // Main interactive border
    themeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", isUserTheme ? `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.08)` : "none")
      .attr("stroke", themeColor)
      .attr("stroke-width", userHasJoined ? 3 : 2)
      .attr("stroke-opacity", userHasJoined ? 0.9 : 0.6)
      .attr("filter", "url(#glow)")
      .attr("class", "theme-main-border")
      .style("cursor", "pointer")
      .on("mouseenter", (event) => {
        // Enhanced hover effects
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("stroke-width", (userHasJoined ? 3 : 2) + 1)
          .attr("stroke-opacity", 1);
        
        onThemeHover?.(event, d, true);
      })
      .on("mouseleave", (event) => {
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("stroke-width", userHasJoined ? 3 : 2)
          .attr("stroke-opacity", userHasJoined ? 0.9 : 0.6);
        
        onThemeHover?.(event, d, false);
      })
      .on("click", (event) => {
        event.stopPropagation();
        onThemeClick?.(event, d);
      });

    // Progress indicator for theme lifecycle
    if (progress > 0.1) {
      const progressRadius = radius - 15;
      const circumference = 2 * Math.PI * progressRadius;
      const strokeDasharray = `${circumference * (1 - progress)} ${circumference}`;

      themeGroup
        .append("circle")
        .attr("r", progressRadius)
        .attr("fill", "none")
        .attr("stroke", themeColor)
        .attr("stroke-width", 3)
        .attr("stroke-opacity", 0.4)
        .attr("stroke-dasharray", strokeDasharray)
        .attr("stroke-linecap", "round")
        .attr("transform", "rotate(-90)")
        .attr("class", "theme-progress-ring")
        .attr("pointer-events", "none");
    }

    // Enhanced label positioning and styling
    const labelY = -radius - 30;

    // Theme category icon (more varied icons based on theme type)
    const themeIcons = ["🚀", "💡", "🎨", "🔬", "🌟", "⚡", "🎯", "🔥", "💎", "🌈"];
    const iconIndex = Math.abs(d.theme_id?.charCodeAt?.(0) || 0) % themeIcons.length;
    
    themeGroup
      .append("text")
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("fill", themeColor)
      .attr("font-size", "28px")
      .attr("pointer-events", "none")
      .attr("opacity", 0.9)
      .attr("class", "theme-icon")
      .text(themeIcons[iconIndex]);

    // Enhanced title with better typography
    themeGroup
      .append("text")
      .attr("y", labelY + 30)
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "16px")
      .attr("font-weight", "700")
      .attr("font-family", "system-ui, -apple-system, sans-serif")
      .attr("pointer-events", "none")
      .attr("opacity", 0.95)
      .attr("class", "theme-title")
      .text(truncateName(d.title, 20));

    // Enhanced participant count with activity indicator
    const activityLevel = participantCount > 10 ? "🔥" : participantCount > 5 ? "⚡" : participantCount > 0 ? "✨" : "💤";
    
    themeGroup
      .append("text")
      .attr("y", labelY + 48)
      .attr("text-anchor", "middle")
      .attr("fill", themeColor)
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .attr("opacity", 0.8)
      .attr("class", "theme-stats")
      .text(`${activityLevel} ${participantCount} engaged`);

    // User participation indicator
    if (userHasJoined) {
      themeGroup
        .append("text")
        .attr("y", labelY + 65)
        .attr("text-anchor", "middle")
        .attr("fill", "#ffd700")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .attr("pointer-events", "none")
        .attr("opacity", 0.9)
        .attr("class", "user-participation")
        .text("👤 You're in!");
    }
  });

  // Add CSS animations for enhanced effects
  const style = document.createElement('style');
  style.textContent = `
    @keyframes themePulse {
      0%, 100% { 
        stroke-opacity: 0.1; 
        transform: scale(1); 
      }
      50% { 
        stroke-opacity: 0.4; 
        transform: scale(1.02); 
      }
    }
    
    @keyframes userPulse {
      0%, 100% { 
        stroke-opacity: 0.4; 
        transform: scale(1); 
      }
      50% { 
        stroke-opacity: 0.8; 
        transform: scale(1.05); 
      }
    }
    
    .theme-container:hover .theme-influence-field {
      filter: brightness(1.2);
      transition: filter 0.3s ease;
    }
    
    .theme-container:hover .theme-icon {
      transform: scale(1.15);
      transition: transform 0.2s ease;
    }
    
    .synapse-node:hover .project-glow-bg {
      filter: brightness(1.5);
      transition: filter 0.2s ease;
    }
    
    .synapse-node:hover .project-status-icon {
      transform: scale(1.2);
      transition: transform 0.2s ease;
    }
    
    .synapse-node:hover .node-circle {
      filter: brightness(1.2) drop-shadow(0 0 15px currentColor);
      transition: filter 0.2s ease;
    }
  `;
  document.head.appendChild(style);

  return d3.select(themesGroup.node());
}

/**
 * Enhanced project circles with better visual design
 * Project circles contain users who are part of those projects
 */
export function drawProjectCircles(container, projectNodes) {
  const projectCircleRadius = 40; // Slightly larger for better visibility

  const circles = container
    .insert("g", ":first-child")
    .attr("class", "project-circles")
    .selectAll("g")
    .data(projectNodes.filter(n => n.type === 'project'))
    .enter()
    .append("g")
    .attr("class", "project-circle-group");

  // Add multiple visual layers for each project circle
  circles.each(function(d) {
    const group = d3.select(this);
    const projectColor = d.theme_id ? getThemeColor(d.theme_id) : "#ff6b6b";
    const projectColorRgb = hexToRgb(projectColor);

    // Outer glow ring
    group
      .append("circle")
      .attr("class", "project-circle-glow")
      .attr("fill", "none")
      .attr("stroke", projectColor)
      .attr("stroke-width", 8)
      .attr("stroke-opacity", 0.1)
      .attr("r", projectCircleRadius + 12)
      .attr("filter", "url(#glow)");

    // Main circle with gradient fill
    group
      .append("circle")
      .attr("class", "project-circle-main")
      .attr("fill", `rgba(${projectColorRgb.r}, ${projectColorRgb.g}, ${projectColorRgb.b}, 0.08)`)
      .attr("stroke", projectColor)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "6,3")
      .attr("stroke-opacity", 0.6)
      .attr("r", projectCircleRadius);

    // Inner activity indicator
    if (d.team_size > 2) {
      group
        .append("circle")
        .attr("class", "project-activity-ring")
        .attr("fill", "none")
        .attr("stroke", projectColor)
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.4)
        .attr("r", projectCircleRadius - 8)
        .style("animation", "projectActivity 4s ease-in-out infinite");
    }
  });

  function update() {
    circles
      .attr("transform", d => `translate(${d.x}, ${d.y})`);
  }

  // Initial update to set positions
  update();

  // Add project activity animation
  const existingStyle = document.querySelector('#project-animations');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'project-animations';
    style.textContent = `
      @keyframes projectActivity {
        0%, 100% { 
          stroke-opacity: 0.2; 
          transform: scale(1); 
        }
        50% { 
          stroke-opacity: 0.6; 
          transform: scale(1.1); 
        }
      }
    `;
    document.head.appendChild(style);
  }

  return { update };
}
