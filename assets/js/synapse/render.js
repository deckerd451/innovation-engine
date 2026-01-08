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
    .attr("stroke-dasharray", (d) => (d.status === "pending" ? "5,5" : "none"))
    .attr("opacity", (d) => (d.status === "suggested" ? 0.5 : 0.8));

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

      node
        .append("rect")
        .attr("width", size)
        .attr("height", size)
        .attr("x", -size / 2)
        .attr("y", -size / 2)
        .attr("transform", "rotate(45)")
        .attr("fill", d.status === "open" ? "rgba(255, 107, 107, 0.2)" : "rgba(255, 107, 107, 0.3)")
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 2)
        .attr("filter", "url(#glow)")
        .attr("class", "node-project");

      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#ff6b6b")
        .attr("font-size", "16px")
        .attr("pointer-events", "none")
        .attr("font-weight", "bold")
        .text("💡");

      return;
    }

    // People + themes (themes are re-styled in core.js)
    const radius = d.isCurrentUser ? 35 : d.shouldShowImage ? 28 : d.isSuggested ? 21 : 14;

    node
      .append("circle")
      .attr("r", radius)
      .attr("fill", () => {
        if (d.isCurrentUser) return COLORS.nodeCurrentUser;
        return d.shouldShowImage ? COLORS.nodeDefault : "rgba(0, 224, 255, 0.3)";
      })
      .attr("stroke", () => (d.isCurrentUser ? "#fff" : COLORS.nodeDefault))
      .attr("stroke-width", d.isCurrentUser ? 3 : 1.5)
      .attr("filter", "url(#glow)")
      .attr("class", "node-circle");
  });

  // Images / initials for people
  nodeEls.each(function (d) {
    if (d.type !== "person") return;
    const node = d3.select(this);

    if (d.image_url && d.shouldShowImage) {
      const radius = d.isCurrentUser ? 32 : 25;

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
    .attr("dy", (d) => (d.type === "project" ? 40 : d.isCurrentUser ? 40 : 35))
    .attr("text-anchor", "middle")
    .attr("fill", (d) => (d.type === "project" ? "#ff6b6b" : "#fff"))
    .attr("font-size", (d) => (d.type === "project" ? "12px" : "11px"))
    .attr("font-family", "system-ui, sans-serif")
    .attr("font-weight", (d) => (d.type === "project" ? "bold" : "normal"))
    .attr("pointer-events", "none")
    .text((d) => truncateName(d.name));

  return nodeEls;
}

export function renderThemeCircles(container, themeNodes, { onThemeHover, onThemeClick } = {}) {
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

    // Calculate visual properties based on lifecycle
    const radius = Math.max(60, 80 - (progress * 20)); // 80px to 60px
    const glowIntensity = Math.max(0.3, 1 - progress);
    const opacity = Math.max(0.4, 1 - (progress * 0.6));

    // Determine if emerging (new) or established
    const isEmerging = d.activity_score < 5;

    // Outer glow circle
    theme
      .append("circle")
      .attr("r", radius + 15)
      .attr("fill", `rgba(0, 224, 255, ${0.05 * glowIntensity})`)
      .attr("stroke", "none")
      .attr("class", "theme-glow");

    // Main circle with gradient
    theme
      .append("circle")
      .attr("r", radius)
      .attr("fill", `rgba(10, 14, 39, ${0.3})`)
      .attr("stroke", "#00e0ff")
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", isEmerging ? "10,5" : "none")
      .attr("opacity", opacity)
      .attr("filter", "url(#glow)")
      .attr("class", "theme-main-circle");

    // Icon/emoji at top
    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", -radius / 3)
      .attr("fill", "#00e0ff")
      .attr("font-size", "28px")
      .attr("pointer-events", "none")
      .text("✨");

    // Title text
    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 5)
      .attr("fill", "#fff")
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .attr("pointer-events", "none")
      .text(truncateName(d.title, 20));

    // Activity indicator (participant count)
    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 25)
      .attr("fill", "rgba(0, 224, 255, 0.7)")
      .attr("font-size", "11px")
      .attr("pointer-events", "none")
      .text(`${d.activity_score || 0} engaged`);

    // Time remaining indicator
    const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
    const daysRemaining = Math.floor(hoursRemaining / 24);
    const timeText = daysRemaining > 1 ? `${daysRemaining}d left` : `${hoursRemaining}h left`;

    theme
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", radius + 20)
      .attr("fill", "rgba(255, 255, 255, 0.5)")
      .attr("font-size", "10px")
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
