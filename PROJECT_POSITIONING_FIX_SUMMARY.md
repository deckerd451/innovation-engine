# Project Positioning Fix Summary
**Date:** January 27, 2026
**Issue:** Projects were fixed in place relative to theme circles and not moving freely toward connected users

## Root Cause
Projects were being rendered as independent nodes (correct), but the force simulation wasn't properly configured to pull them toward connected users. Additionally, link colors and widths weren't being applied correctly for project-member links.

## Changes Made

### 1. Force Simulation Updates (`assets/js/synapse/core.js`)

#### Link Distance and Strength
Added explicit handling for project-member links in the force simulation:

```javascript
.distance((d) => {
  // Project-member links should pull projects toward users
  if (d.type === "project-member") return 120;
  // Theme participation links
  if (d.type === "theme" || d.status === "theme-participant") return 40;
  // Connection links between people
  if (d.type === "connection") return 80;
  // ... other cases
})
.strength((d) => {
  // Strong pull for project-member links so projects move toward users
  if (d.type === "project-member") return 0.4;
  // Stronger attraction to themes
  if (d.type === "theme" || d.status === "theme-participant") return 0.3;
  // Weaker for person-to-person connections
  if (d.type === "connection") return 0.2;
  // ... other cases
})
```

#### Collision Radius
Added collision radius for project nodes:

```javascript
.radius((d) => {
  if (d.type === "theme") return 0;
  if (d.type === "project") return 30; // Projects need collision radius
  if (d.isCurrentUser) return 35;
  return 25;
})
```

### 2. Link Rendering Updates (`assets/js/synapse/render.js`)

#### Link Color
Fixed `getLinkColor()` to check `link.type` BEFORE `link.status`:

```javascript
// Check type first, then status

// Project-member links (person → project)
if (link.type === "project-member") {
  if (link.status === "pending") {
    return "rgba(255, 107, 107, 0.4)"; // Light red for pending
  }
  return "#ff6b6b"; // Red for approved
}
```

#### Link Width
Updated `getLinkWidth()` to handle project-member links:

```javascript
// Project-member links
if (link.type === "project-member") {
  if (link.status === "pending") {
    return 1.5; // Thinner for pending
  }
  return 2.5; // Medium thickness for approved
}
```

#### Link Opacity
Updated link opacity in `renderLinks()`:

```javascript
.attr("opacity", d => {
  // Project-member links
  if (d.type === "project-member") {
    if (d.status === "pending") return 0.5; // Semi-transparent for pending
    return 0.8; // More visible for approved
  }
  // ... other cases
})
```

## Expected Behavior

### Projects
- ✅ Start near their theme but have no parent constraint (`parentTheme: null`)
- ✅ Are pulled toward connected users via force-directed links (strength: 0.4, distance: 120)
- ✅ Move freely in the force simulation (no containment force)
- ✅ Have collision detection (radius: 30)

### Project-Member Links
- ✅ **Pending requests:** Light red (`rgba(255, 107, 107, 0.4)`), dotted line, width 1.5, opacity 0.5
- ✅ **Approved members:** Red (`#ff6b6b`), solid line, width 2.5, opacity 0.8

### Person-to-Person Connection Links
- ✅ **Accepted:** Green (`#00ff88`), solid line, width 2.5, opacity 0.8
- ✅ **Pending:** Gray (`rgba(255, 255, 255, 0.15)`), dotted line, width 1, opacity 0.3

## Files Modified
1. `assets/js/synapse/core.js` - Force simulation configuration
2. `assets/js/synapse/render.js` - Link rendering (color, width, opacity)

## Testing Checklist
- [ ] Projects appear as hexagons near their themes
- [ ] When joining a project, a red line appears connecting user to project
- [ ] Pending project requests show dotted red lines
- [ ] Approved project members show solid red lines
- [ ] Projects move toward connected users (not fixed to themes)
- [ ] Person-to-person connections show green lines (accepted) or gray lines (pending)
- [ ] No green lines appear for project connections
- [ ] Manage requests button works in project panel

## Notes
- Projects are positioned initially near their theme using `calculateNestedPosition()` but with `parentTheme: null`
- The force simulation then pulls them toward connected users via the link force
- The containment force explicitly skips projects: `if (node.type === "project") return;`
- Projects are rendered as independent nodes using `renderNodes()`, not as overlays
