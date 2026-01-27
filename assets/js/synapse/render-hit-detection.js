// assets/js/synapse/render.js
// Rendering helpers for links/nodes + project circles

// assets/js/synapse/render-hit-detection.js - Node and link rendering with hit detection

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
  if (link.type === "org-member") {
    return "rgba(168, 85, 247, 0.5)"; // Purple for org members
  }

  // Theme participant links
  if (link.type === "theme" || link.type === "theme-participant") {
    const themeId = typeof link.source === 'object' && link.source.theme_id
      ? link.source.theme_id
      : (typeof link.source === 'string' && link.source.startsWith('theme:'))
        ? link.source.replace('theme:', '')
        : null;

    if (themeId) {
      const themeColor = getThemeColor(themeId);
      const alpha = link.engagement_level === "leading" ? 0.9 :
                    link.engagement_level === "active" ? 0.7 : 0.5;
      return themeColor.replace(')', `, ${alpha})`).replace('#', 'rgba(').replace(/^rgba\(([\da-f]{2})([\da-f]{2})([\da-f]{2})/, (_, r, g, b) => {
        return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}`;
      });
    }

    if (link.engagement_level === "leading") return "rgba(255, 215, 0, 0.7)";
    if (link.engagement_level === "active") return "rgba(255, 170, 0, 0.6)";
    return "rgba(255, 170, 0, 0.4)";
  }

  // Person-to-person connection links
  if (link.type === "connection") {
    if (link.status === "accepted") {
      return COLORS.edgeAccepted; // Green for accepted connections
    } else if (link.status === "pending") {
      return "rgba(255, 255, 255, 0.15)"; // Subtle gray for pending
    }
  }

  // Fallback based on status
  switch (link.status) {
    case "accepted":
      return COLORS.edgeAccepted;
    case "pending":
      return COLORS.edgePending;
    case "suggested":
      return COLORS.edgeSuggested;
    default:
      return "rgba(255, 255, 255, 0.2)";
  }
}
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
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation();
      onNodeClick?.(event, d);
    });

  nodeEls.each(function (d) {
    const node = d3.select(this);

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
        .attr("fill", `rgba(168, 85, 247, 0.3)`)
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
    .attr("dy", (d) => (d.type === "organization" ? 42 : d.type === "project" ? 40 : d.isCurrentUser ? 60 : 35))
    .attr("text-anchor", "middle")
    .attr("fill", (d) => (d.type === "organization" ? "#a855f7" : d.type === "project" ? "#ff6b6b" : "#fff"))
    .attr("font-size", (d) => (d.type === "organization" ? "11px" : d.type === "project" ? "12px" : d.isCurrentUser ? "14px" : "11px"))
    .attr("font-family", "system-ui, sans-serif")
    .attr("font-weight", (d) => (d.type === "organization" ? "600" : d.type === "project" ? "bold" : d.isCurrentUser ? "bold" : "normal"))
    .attr("pointer-events", "none")
    .text((d) => truncateName(d.name));

  return nodeEls;
}

export function renderThemeCircles(container, themeNodes, { onThemeHover, onThemeClick } = {}) {
  console.log("🚀 CUSTOM renderThemeCircles function called with", themeNodes.length, "themes");
  console.log("🚀 Function location: assets/js/synapse/render.js - CUSTOM HIT DETECTION VERSION");
  
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

  // Sort themes by radius for proper rendering (largest first for backgrounds)
  const sortedThemes = [...themeNodes].sort((a, b) => {
    const radiusA = a.themeRadius || 250;
    const radiusB = b.themeRadius || 250;
    return radiusB - radiusA; // LARGEST radius first for background rendering
  });

  console.log("🎯 Theme rendering order (largest radius first):", 
    sortedThemes.map(t => ({ 
      title: t.title, 
      radius: t.themeRadius || 250 
    }))
  );

  // Create main themes group
  const themesGroup = container
    .insert("g", ":first-child")
    .attr("class", "theme-circles-group");

  // Create theme containers in order (largest first for proper background layering)
  const themeGroups = themesGroup
    .selectAll("g.theme-container")
    .data(sortedThemes, d => d.theme_id)
    .enter()
    .append("g")
    .attr("class", d => `theme-container theme-${d.theme_id}`)
    .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`);

  // Render visual elements (backgrounds and borders) - NO click handlers here
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

    // Background circle with gradient - NO POINTER EVENTS
    themeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", `url(#theme-influence-${d.theme_id})`)
      .attr("stroke", themeColor)
      .attr("stroke-width", userHasJoined ? 2 : 1)
      .attr("stroke-opacity", isDiscoverable ? 0.2 : (userHasJoined ? 0.4 : 0.2))
      .attr("stroke-dasharray", isDiscoverable ? "8,4" : "none")
      .attr("class", "theme-background")
      .attr("pointer-events", "none"); // CRITICAL: No pointer events on background

    // Visual border (non-interactive, just for display) - NO POINTER EVENTS
    themeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", "transparent")
      .attr("stroke", themeColor)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)
      .attr("class", "theme-interactive-border")
      .attr("pointer-events", "none"); // CRITICAL: No pointer events on border

    // Theme information displayed INSIDE the circle
    const labelGroup = themeGroup
      .append("g")
      .attr("class", "theme-labels")
      .attr("pointer-events", "none"); // CRITICAL: No pointer events on labels

    // Theme icon - positioned in center of circle
    const themeIcons = ["🚀", "💡", "🎨", "🔬", "🌟", "⚡"];
    const iconIndex = Math.abs(d.theme_id?.charCodeAt?.(0) || 0) % themeIcons.length;
    
    labelGroup
      .append("text")
      .attr("y", -15)
      .attr("text-anchor", "middle")
      .attr("fill", themeColor)
      .attr("font-size", "32px")
      .attr("opacity", isDiscoverable ? 0.7 : 1.0)
      .attr("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.8))")
      .text(themeIcons[iconIndex]);

    // Theme title
    labelGroup
      .append("text")
      .attr("y", 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "16px")
      .attr("font-weight", "700")
      .attr("opacity", isDiscoverable ? 0.7 : 1.0)
      .attr("filter", "drop-shadow(0 0 6px rgba(0,0,0,0.9))")
      .text(truncateName(d.title, 20));

    // Status text
    const statusText = isDiscoverable ? "🔍 Discover" : 
                      userHasJoined ? "👤 Joined" : 
                      `${participantCount} people • ${projectCount} projects`;

    labelGroup
      .append("text")
      .attr("y", 45)
      .attr("text-anchor", "middle")
      .attr("fill", themeColor)
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("opacity", isDiscoverable ? 0.6 : 0.9)
      .attr("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.8))")
      .text(statusText);

    // Semi-transparent background for better text readability
    const textBgRadius = Math.min(70, radius * 0.25);
    labelGroup
      .insert("circle", ":first-child")
      .attr("r", textBgRadius)
      .attr("fill", "rgba(0,0,0,0.6)")
      .attr("stroke", themeColor)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.4)
      .attr("class", "theme-info-background");
  });

  console.log("🎯 About to create hit detection overlay...");
  console.log("🎯 Theme nodes for overlay:", themeNodes.length, themeNodes.map(t => ({ title: t.title, x: t.x, y: t.y, radius: t.themeRadius })));

  // Safety check for empty theme nodes
  if (!themeNodes || themeNodes.length === 0) {
    console.error("❌ No theme nodes available for hit detection overlay");
    return d3.select(themesGroup.node());
  }

  // CRITICAL FIX: Create individual hit detection areas for each theme
  // This ensures proper click detection for themes at different positions
  console.log("🎯 Creating individual hit detection areas for each theme...");

  try {
    // Create hit detection group that will contain individual theme hit areas
    const hitDetectionGroup = themesGroup
      .append("g")
      .attr("class", "theme-hit-detection-group")
      .style("pointer-events", "all");

    // Create individual hit detection circles for each theme
    // Use a smaller hit area (center label region only) to avoid blocking person node clicks
    const hitDetectionAreas = hitDetectionGroup
      .selectAll("circle.theme-hit-area")
      .data(themeNodes, d => d.theme_id)
      .enter()
      .append("circle")
      .attr("class", d => `theme-hit-area theme-hit-${d.theme_id}`)
      .attr("cx", d => d.x || 0)
      .attr("cy", d => d.y || 0)
      .attr("r", 75) // Fixed small radius covering just the label area
      .attr("fill", "transparent") // Invisible but clickable
      .attr("stroke", "none")
      .style("cursor", "pointer")
      .style("pointer-events", "all");

    console.log("🎯 Created", hitDetectionAreas.size(), "individual hit detection areas");

    // Add event handlers to each hit detection area
    hitDetectionAreas
      .on("mouseenter", function(event, d) {
        console.log("🖱️ Mouse entering theme:", d.title);
        
        // Apply hover state to this theme
        const themeGroup = themesGroup.select(`.theme-${d.theme_id}`);
        const border = themeGroup.select(".theme-interactive-border");
        const background = themeGroup.select(".theme-background");
        
        border
          .transition()
          .duration(150)
          .attr("stroke-opacity", 1)
          .attr("stroke-width", 4)
          .style("filter", "drop-shadow(0 0 8px " + getThemeColor(d.theme_id) + ")");
          
        background
          .transition()
          .duration(150)
          .attr("stroke-opacity", 0.8)
          .attr("stroke-width", 3);
        
        // Call hover handler
        onThemeHover?.(event, d, true);
      })
      .on("mouseleave", function(event, d) {
        console.log("🖱️ Mouse leaving theme:", d.title);
        
        // Reset hover state for this theme
        const themeGroup = themesGroup.select(`.theme-${d.theme_id}`);
        const border = themeGroup.select(".theme-interactive-border");
        const background = themeGroup.select(".theme-background");
        
        const userHasJoined = d.user_is_participant === true;
        const isDiscoverable = d.isDiscoverable === true;
        
        border
          .transition()
          .duration(150)
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", 2)
          .style("filter", "none");
          
        background
          .transition()
          .duration(150)
          .attr("stroke-opacity", isDiscoverable ? 0.2 : (userHasJoined ? 0.4 : 0.2))
          .attr("stroke-width", userHasJoined ? 2 : 1);
        
        // Call hover handler
        onThemeHover?.(event, null, false);
      })
      .on("click", function(event, d) {
        event.stopPropagation();
        
        console.log("🖱️ Theme clicked:", d.title, "ID:", d.theme_id);
        
        // Add visual feedback to the clicked theme
        const themeGroup = themesGroup.select(`.theme-${d.theme_id}`);
        const border = themeGroup.select(".theme-interactive-border");
        const themeColor = getThemeColor(d.theme_id);
        
        border
          .transition()
          .duration(100)
          .attr("stroke-width", 6)
          .attr("stroke-opacity", 1)
          .style("filter", "drop-shadow(0 0 12px " + themeColor + ")")
          .transition()
          .delay(100)
          .duration(200)
          .attr("stroke-width", 4)
          .attr("stroke-opacity", 0.8);
        
        // Call the theme click handler
        try {
          onThemeClick?.(event, d);
          console.log("✅ Theme click handler called successfully");
        } catch (error) {
          console.error("❌ Theme click handler failed:", error);
        }
      });

    console.log("✅ Event handlers attached to individual hit detection areas");

  } catch (error) {
    console.error("❌ Failed to create hit detection areas:", error);
  }

  // Enhanced CSS animations for theme interaction
  if (!document.querySelector('#theme-interaction-styles')) {
    const style = document.createElement('style');
    style.id = 'theme-interaction-styles';
    style.textContent = `
      .theme-container {
        transition: transform 0.2s ease;
        will-change: transform;
      }
      
      .theme-container:hover {
        transform: scale(1.02);
      }
      
      .theme-hit-detection-overlay {
        transition: all 0.15s ease;
        will-change: opacity;
      }
      
      .theme-interactive-border {
        transition: all 0.15s ease;
        will-change: stroke-width, stroke-opacity, filter;
      }
      
      .theme-background {
        transition: all 0.15s ease;
        will-change: stroke-width, stroke-opacity;
      }
      
      .theme-container:hover .theme-background {
        filter: brightness(1.1);
      }
      
      .theme-container:hover .project-indicator {
        transform: scale(1.05);
      }
      
      .theme-container:hover .theme-labels text {
        opacity: 1.0 !important;
      }
      
      /* Enhanced pulse animation for selected themes */
      @keyframes theme-selected-pulse {
        0% { 
          stroke-width: 6px; 
          stroke-opacity: 1; 
          filter: drop-shadow(0 0 12px currentColor);
        }
        50% { 
          stroke-width: 8px; 
          stroke-opacity: 0.8; 
          filter: drop-shadow(0 0 16px currentColor);
        }
        100% { 
          stroke-width: 4px; 
          stroke-opacity: 0.8; 
          filter: drop-shadow(0 0 8px currentColor);
        }
      }
      
      .theme-selected .theme-interactive-border {
        animation: theme-selected-pulse 0.4s ease-out;
        stroke-width: 4px !important;
        stroke-opacity: 0.9 !important;
        filter: drop-shadow(0 0 12px currentColor) !important;
      }
      
      /* Improved hover feedback */
      .theme-container:hover .theme-interactive-border {
        stroke-width: 3px;
        stroke-opacity: 0.8;
        filter: drop-shadow(0 0 8px currentColor);
      }
      
      /* Better visual hierarchy for theme rings - CRITICAL FIX */
      .theme-container .theme-background {
        pointer-events: none;
      }
      
      .theme-container .theme-interactive-border {
        pointer-events: none;
      }
      
      .theme-hit-detection-overlay {
        pointer-events: all;
      }
      
      /* Ensure proper SVG layering - custom hit detection handles all interactions */
      .theme-circles-group {
        isolation: isolate;
      }
      
      .theme-container {
        position: relative;
      }
    `;
    document.head.appendChild(style);
  }

  return d3.select(themesGroup.node());
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
    .style("pointer-events", "none"); // CRITICAL: Let hit detection overlay handle all clicks

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
        .style("pointer-events", "none") // Let hit detection overlay handle clicks
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
        });
        // NOTE: Project clicks will be handled by the central hit detection overlay
    });
  });

  return projectsOverlayGroup;
}