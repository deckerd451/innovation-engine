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

// Theme color palette - visual relationships per yellow instructions
const THEME_COLORS = [
  "#00e0ff", // Cyan
  "#ff6b6b", // Red
  "#ffd700", // Gold
  "#00ff88", // Green
  "#ff88ff", // Pink
  "#ffaa00", // Orange
  "#88ff00", // Lime
  "#00ffff", // Aqua
  "#ff00ff", // Magenta
  "#00aaff", // Sky Blue
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
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("class", (d) => `synapse-link status-${d.status}`)
    .attr("stroke", (d) => getLinkColor(d))
    .attr("stroke-width", (d) => getLinkWidth(d))
    .attr("stroke-dasharray", (d) => {
      if (d.status === "pending") return "5,5";
      // Per yellow instructions: Make lines solid when themes are joined
      // Theme participant lines are now ALWAYS solid
      return "none";
    })
    .attr("opacity", (d) => {
      if (d.status === "suggested") return 0.5;
      if (d.status === "theme-participant") return 0.6;
      return 0.8;
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
      const size = Math.max(30, Math.min(50, 25 + (d.team_size * 3)));

      // Per yellow instructions: Use theme color if project belongs to a theme
      const projectColor = d.theme_id ? getThemeColor(d.theme_id) : "#ff6b6b";
      const projectColorRgb = hexToRgb(projectColor);

      node
        .append("rect")
        .attr("width", size)
        .attr("height", size)
        .attr("x", -size / 2)
        .attr("y", -size / 2)
        .attr("transform", "rotate(45)")
        .attr("fill", `rgba(${projectColorRgb.r}, ${projectColorRgb.g}, ${projectColorRgb.b}, ${d.status === "open" ? 0.2 : 0.3})`)
        .attr("stroke", projectColor)
        .attr("stroke-width", d.theme_id ? 3 : 2)  // Thicker border if belongs to theme
        .attr("filter", "url(#glow)")
        .attr("class", "node-project");

      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", projectColor)
        .attr("font-size", "16px")
        .attr("pointer-events", "none")
        .attr("font-weight", "bold")
        .text("💡");

      return;
    }

    // People nodes - current user is larger as center of hierarchy
    const radius = d.isCurrentUser ? 50 : d.shouldShowImage ? 28 : d.isSuggested ? 21 : 14;

    node
      .append("circle")
      .attr("r", radius)
      .attr("fill", () => {
        if (d.isCurrentUser) return COLORS.nodeCurrentUser;
        return d.shouldShowImage ? COLORS.nodeDefault : "rgba(0, 224, 255, 0.3)";
      })
      .attr("stroke", () => (d.isCurrentUser ? "#fff" : COLORS.nodeDefault))
      .attr("stroke-width", d.isCurrentUser ? 4 : 1.5)
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

  // Create radial gradients for each theme's influence field
  themeNodes.forEach(theme => {
    const themeColor = getThemeColor(theme.theme_id);
    const themeColorRgb = hexToRgb(themeColor);
    const gradientId = `theme-influence-${theme.theme_id}`;

    // Remove existing gradient if it exists
    defs.select(`#${gradientId}`).remove();

    // Create new radial gradient
    const gradient = defs.append("radialGradient")
      .attr("id", gradientId);

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0.15);

    gradient.append("stop")
      .attr("offset", "50%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0.08);

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", themeColor)
      .attr("stop-opacity", 0);
  });

  const themeEls = container
    .append("g")
    .attr("class", "theme-circles")
    .selectAll("g")
    .data(themeNodes)
    .enter()
    .append("g")
    .attr("class", "theme-circle")
    .on("mouseenter", (event, d) => onThemeHover?.(event, d, true))
    .on("mouseleave", (event, d) => onThemeHover?.(event, d, false))
    .on("click", (event, d) => {
      event.stopPropagation();
      onThemeClick?.(event, d);
    });

  themeEls.each(function (d) {
    const theme = d3.select(this);

    // Calculate lifecycle progress (0 = new, 1 = expired)
    const now = Date.now();
    const expires = new Date(d.expires_at).getTime();
    const created = new Date(d.created_at).getTime();
    const lifetime = expires - created;
    const remaining = expires - now;
    const progress = Math.max(0, Math.min(1, 1 - (remaining / lifetime)));

    // Hierarchical layout: Themes are LARGER and more prominent in the inner ring
    const radius = Math.max(80, 100 - (progress * 15)); // Larger: 100px to 80px
    const glowIntensity = Math.max(0.3, 1 - progress);
    const opacity = Math.max(0.5, 1 - (progress * 0.5));

    // Determine if user has joined
    const userHasJoined = d.user_is_participant === true;

    // Get theme color
    const themeColor = getThemeColor(d.theme_id);
    const themeColorRgb = hexToRgb(themeColor);

    // INFLUENCE FIELD - Extends outward to connect with middle ring (projects)
    // In hierarchical layout, this helps show relationship to project ring
    theme
      .append("circle")
      .attr("r", radius + 80) // Larger influence field to reach toward projects
      .attr("fill", `url(#theme-influence-${d.theme_id})`)
      .attr("opacity", userHasJoined ? 1.0 : 0.6)
      .attr("class", "theme-influence-field")
      .attr("pointer-events", "none");

    // Main circle - Solid fill with distinct styling for hierarchy
    theme
      .append("circle")
      .attr("r", radius)
      .attr("fill", `rgba(${themeColorRgb.r}, ${themeColorRgb.g}, ${themeColorRgb.b}, 0.15)`)
      .attr("stroke", themeColor)
      .attr("stroke-width", userHasJoined ? 4 : 3) // Thicker border for prominence
      .attr("stroke-dasharray", userHasJoined ? "none" : "8,8") // Solid if joined, dashed otherwise
      .attr("opacity", opacity)
      .attr("filter", "url(#glow)")
      .attr("class", "theme-well-border");

    // Icon/emoji - larger and more prominent
    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", -10) // Centered near top
      .attr("fill", themeColor)
      .attr("font-size", "36px") // Larger icon
      .attr("pointer-events", "none")
      .text("✨");

    // Title text - larger and centered
    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 25) // Below icon
      .attr("fill", "#fff")
      .attr("font-size", "15px") // Larger text
      .attr("font-weight", "700") // Bolder
      .attr("pointer-events", "none")
      .text(truncateName(d.title, 20));

    // Participant count - more prominent
    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 45)
      .attr("fill", themeColor)
      .attr("font-size", "13px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text(`${d.participant_count || 0} engaged`);

    // Time remaining indicator - below
    const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
    const daysRemaining = Math.floor(hoursRemaining / 24);
    const timeText = daysRemaining > 1 ? `${daysRemaining}d` : `${hoursRemaining}h`;

    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", radius + 20)
      .attr("fill", "rgba(255, 255, 255, 0.5)")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text(timeText);
  });

  return themeEls;
}

export function drawProjectCircles(container, peopleNodes) {
  // Group people by project id
  const projectGroups = {};
  peopleNodes.forEach((n) => {
    (n.projects || []).forEach((pid) => {
      projectGroups[pid] ||= [];
      projectGroups[pid].push(n);
    });
  });

  const circles = container
    .insert("g", ":first-child")
    .attr("class", "project-circles")
    .selectAll("circle")
    .data(Object.entries(projectGroups))
    .enter()
    .append("circle")
    .attr("class", "project-circle")
    .attr("fill", "none")
    .attr("stroke", "rgba(0, 224, 255, 0.6)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "10,5")
    .attr("opacity", 0.7);

  function update() {
    circles.each(function ([_, group]) {
      if (!group.length) return;

      let cx = 0,
        cy = 0;
      group.forEach((n) => {
        cx += n.x;
        cy += n.y;
      });
      cx /= group.length;
      cy /= group.length;

      let maxD = 0;
      group.forEach((n) => {
        const d = Math.hypot(n.x - cx, n.y - cy);
        if (d > maxD) maxD = d;
      });

      d3.select(this).attr("cx", cx).attr("cy", cy).attr("r", maxD + 80);
    });
  }

  return { update };
}
