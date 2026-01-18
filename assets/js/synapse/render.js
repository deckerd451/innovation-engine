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
  // Handle person-to-person connection links
  if (link.type === "connection") {
    if (link.status === "accepted") {
      return COLORS.edgeAccepted; // Green for accepted connections
    } else if (link.status === "pending") {
      return "rgba(255, 255, 255, 0.15)"; // Subtle gray for pending
    }
  }

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
  // Handle person-to-person connection links
  if (link.type === "connection") {
    if (link.status === "accepted") {
      return 2.5; // Thicker for accepted connections
    } else if (link.status === "pending") {
      return 1; // Thin for pending connections
    }
  }

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
      // Connection links (person-to-person)
      if (d.type === "connection") {
        if (d.status === "accepted") return 0.8; // More visible for accepted
        if (d.status === "pending") return 0.3; // Very subtle for pending
      }
      // Theme and other links
      if (d.status === "suggested") return 0.4;
      if (d.status === "theme-participant") return 0.6;
      return 0.7;
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
  // Performance optimization: Create gradients only once, reuse for similar themes
  let defs = container.select("defs");
  if (defs.empty()) {
    defs = container.append("defs");
  }

  // Create a shared gradient template and reuse it
  const gradientCache = new Map();
  
  themeNodes.forEach(theme => {
    const themeColor = getThemeColor(theme.theme_id);
    const gradientId = `theme-influence-${theme.theme_id}`;
    
    // Skip if gradient already exists
    if (gradientCache.has(themeColor)) return;
    gradientCache.set(themeColor, gradientId);

    // Remove existing gradient if it exists
    defs.select(`#${gradientId}`).remove();

    // Simplified gradient with fewer stops for better performance
    const gradient = defs.append("radialGradient")
      .attr("id", gradientId);

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0.06);

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0);
  });

  // Simplified theme rendering with embedded projects
  const themesGroup = container
    .insert("g", ":first-child")
    .attr("class", "theme-circles-group")
    .style("pointer-events", "none");

  // Use D3 data binding for better performance
  const themeGroups = themesGroup
    .selectAll(".theme-container")
    .data(themeNodes, d => d.theme_id)
    .enter()
    .append("g")
    .attr("class", d => `theme-container theme-${d.theme_id}`)
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`);

  themeGroups.each(function(d) {
    const themeGroup = d3.select(this);
    const themeColor = getThemeColor(d.theme_id);
    const themeColorRgb = hexToRgb(themeColor);
    const radius = d.themeRadius || 250;

    const userHasJoined = d.user_is_participant === true;
    const isUserTheme = d.isUserTheme === true;
    const isDiscoverable = d.isDiscoverable === true;
    const participantCount = d.participant_count || 0;
    const projectCount = d.project_count || 0;

    // Single background circle with gradient
    themeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", `url(#theme-influence-${d.theme_id})`)
      .attr("stroke", themeColor)
      .attr("stroke-width", userHasJoined ? 2 : 1)
      .attr("stroke-opacity", isDiscoverable ? 0.2 : (userHasJoined ? 0.4 : 0.2))
      .attr("stroke-dasharray", isDiscoverable ? "8,4" : "none")
      .attr("class", "theme-background")
      .attr("pointer-events", "none");

    // NOTE: Projects are now rendered as a separate overlay layer (see renderThemeProjectsOverlay)
    // This ensures they appear on top of theme circles and remain clickable

    // Single interactive border (clickable area)
    themeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", "transparent")
      .attr("stroke", themeColor)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)
      .attr("class", "theme-interactive-border")
      .style("cursor", "pointer")
      .style("pointer-events", "all")
      .on("mouseenter", function(event) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("stroke-opacity", 1)
          .attr("stroke-width", 3);
        onThemeHover?.(event, d, true);
      })
      .on("mouseleave", function(event) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", 2);
        onThemeHover?.(event, d, false);
      })
      .on("click", (event) => {
        event.stopPropagation();
        onThemeClick?.(event, d);
      });

    // Simplified progress indicator (only if significant progress)
    const now = Date.now();
    const expires = new Date(d.expires_at).getTime();
    const created = new Date(d.created_at).getTime();
    const progress = Math.max(0, Math.min(1, 1 - ((expires - now) / (expires - created))));
    
    if (progress > 0.2) {
      const progressRadius = radius - 10;
      const circumference = 2 * Math.PI * progressRadius;
      const strokeDasharray = `${circumference * (1 - progress)} ${circumference}`;

      themeGroup
        .append("circle")
        .attr("r", progressRadius)
        .attr("fill", "none")
        .attr("stroke", themeColor)
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.5)
        .attr("stroke-dasharray", strokeDasharray)
        .attr("stroke-linecap", "round")
        .attr("transform", "rotate(-90)")
        .attr("class", "theme-progress")
        .attr("pointer-events", "none");
    }

    // Theme information displayed INSIDE the circle (per yellow instructions)
    const labelGroup = themeGroup
      .append("g")
      .attr("class", "theme-labels")
      .attr("pointer-events", "none");

    // Theme icon - positioned in center of circle
    const themeIcons = ["🚀", "💡", "🎨", "🔬", "🌟", "⚡"];
    const iconIndex = Math.abs(d.theme_id?.charCodeAt?.(0) || 0) % themeIcons.length;
    
    labelGroup
      .append("text")
      .attr("y", -15) // Center of circle, slightly above
      .attr("text-anchor", "middle")
      .attr("fill", themeColor)
      .attr("font-size", "32px")
      .attr("opacity", isDiscoverable ? 0.7 : 1.0)
      .attr("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.8))")
      .text(themeIcons[iconIndex]);

    // Theme title - positioned in center of circle
    labelGroup
      .append("text")
      .attr("y", 10) // Center of circle, slightly below icon
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "16px")
      .attr("font-weight", "700")
      .attr("opacity", isDiscoverable ? 0.7 : 1.0)
      .attr("filter", "drop-shadow(0 0 6px rgba(0,0,0,0.9))")
      .text(truncateName(d.title, 20));

    // Enhanced status showing both participants and projects - positioned below title
    const statusText = isDiscoverable ? "🔍 Discover" : 
                      userHasJoined ? "👤 Joined" : 
                      `${participantCount} people • ${projectCount} projects`;

    labelGroup
      .append("text")
      .attr("y", 45) // Moved further down to avoid project overlap
      .attr("text-anchor", "middle")
      .attr("fill", themeColor)
      .attr("font-size", "11px") // Slightly smaller to fit better
      .attr("font-weight", "600")
      .attr("opacity", isDiscoverable ? 0.6 : 0.9)
      .attr("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.8))")
      .text(statusText);

    // Add semi-transparent background for better text readability
    const textBgRadius = Math.min(70, radius * 0.25); // Smaller background
    labelGroup
      .insert("circle", ":first-child") // Insert before text elements
      .attr("r", textBgRadius)
      .attr("fill", "rgba(0,0,0,0.6)") // More opaque background
      .attr("stroke", themeColor)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.4)
      .attr("class", "theme-info-background");
  });

  // Enhanced CSS animations for radial project positioning
  if (!document.querySelector('#theme-animations')) {
    const style = document.createElement('style');
    style.id = 'theme-animations';
    style.textContent = `
      .theme-container:hover .theme-background {
        filter: brightness(1.2);
        transition: filter 0.2s ease;
      }
      
      .theme-container:hover .project-indicator {
        transform: scale(1.1);
        transition: transform 0.2s ease;
      }
      
      .theme-container:hover .theme-info-background {
        fill: rgba(0,0,0,0.6);
        stroke-opacity: 0.5;
        transition: all 0.2s ease;
      }
      
      .theme-container:hover .theme-labels text {
        opacity: 1.0 !important;
        transition: opacity 0.2s ease;
      }
      
      .project-indicator {
        transition: transform 0.2s ease;
      }
      
      .project-indicator:hover {
        transform: scale(1.3) !important;
        filter: drop-shadow(0 0 8px rgba(255,255,255,0.3));
      }
      
      .project-shape {
        transition: all 0.2s ease;
      }
      
      .project-glow {
        transition: all 0.2s ease;
      }
      
      .project-title {
        transition: opacity 0.2s ease;
        filter: drop-shadow(0 0 4px rgba(0,0,0,0.8));
      }
      
      .theme-interactive-border {
        transition: stroke-opacity 0.15s ease, stroke-width 0.15s ease;
      }
      
      /* Animation for projects appearing */
      @keyframes projectAppear {
        from {
          opacity: 0;
          transform: scale(0.5);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      .project-indicator {
        animation: projectAppear 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  return d3.select(themesGroup.node());
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
      // Simple approach: distribute all projects evenly around the circle
      const angleStep = (2 * Math.PI) / projectCount;
      const projectAngle = index * angleStep;

      // If we have many projects, use rings
      const ring = Math.floor(index / maxProjectsPerRing);
      const ringDistance = baseDistance + (ring * 40);
      
      const projectX = (theme.x || 0) + Math.cos(projectAngle) * ringDistance;
      const projectY = (theme.y || 0) + Math.sin(projectAngle) * ringDistance;

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
