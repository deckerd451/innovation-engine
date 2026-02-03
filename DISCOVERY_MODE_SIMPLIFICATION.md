# Discovery Mode Simplification

## Summary
Removed the Discovery/My Network toggle and made Discovery Mode the default (and only) view. Visual indicators now show which nodes you're already connected to.

## Changes Made

### 1. Always Show Full Community
- `showFullCommunity` is now always `true` in `synapse/core.js`
- Removed `toggleFullCommunityView()` function
- All users see the entire community by default

### 2. Visual Connection Indicators
Added visual indicators to show connection status on person nodes:

**Connected People (Accepted Connections):**
- Green outer ring around the node
- Green stroke on the main circle
- Slightly different fill color (green tint)

**Unconnected People:**
- Standard cyan stroke
- No outer ring
- Standard fill color

**Current User:**
- Keeps the special pulsing ring animation
- Always clearly identifiable

### 3. UI Changes
- Removed Discovery Mode toggle button from dashboard
- Removed all toggle-related code from `dashboard-actions.js`
- Simplified the category filter buttons (People, Projects, Themes, Organizations)

### 4. Performance Benefits
- Discovery Mode is more performant (no filtering needed)
- Single data load instead of toggling between filtered/unfiltered views
- Simpler state management

### 5. START Integration
- Removed auto-toggle logic from START suggestions
- Discovery Mode is always on, so suggestions work immediately
- No delay waiting for mode switch

## User Experience

### Before:
- Users had to toggle between "My Network" and "Discovery Mode"
- Confusing which mode they were in
- Had to switch modes to see suggested people/themes

### After:
- One unified view showing everyone
- Clear visual indicators show who you're connected to
- Green rings = already connected
- No rings = potential new connections
- Search and filter still work perfectly

## Technical Details

### renderNodes() Function
Updated to accept connection data and mark connected nodes:
```javascript
renderNodes(container, nodes, { 
  onNodeClick,
  connectionsData,      // NEW: Connection data
  currentUserCommunityId // NEW: Current user ID
})
```

### Connection Detection
- Builds a Set of connected user IDs from `connectionsData`
- Only counts "accepted", "active", or "connected" status
- Applies visual indicators during node rendering

### Filter Functionality
- Category filters (People, Projects, Themes, Orgs) still work
- Search functionality unchanged
- All filtering happens on the visual layer, not data layer

## Benefits

1. **Simpler UX**: One view, no mode confusion
2. **Better Performance**: No toggle overhead
3. **Clear Indicators**: Visual feedback shows connection status
4. **Easier Discovery**: See everyone, identify connections at a glance
5. **Less Code**: Removed ~200 lines of toggle logic

## Files Modified

- `assets/js/synapse/core.js` - Removed toggle, always show full community
- `assets/js/synapse/render.js` - Added connection indicators
- `assets/js/dashboard-actions.js` - Removed toggle button wiring
- `assets/js/suggestions/start-integration.js` - Removed auto-toggle
- `dashboard.html` - Removed toggle button

## Testing Checklist

- [ ] All nodes visible on dashboard load
- [ ] Connected people show green rings
- [ ] Unconnected people show cyan (no ring)
- [ ] Current user node clearly identifiable
- [ ] Category filters work (People, Projects, Themes, Orgs)
- [ ] Search functionality works
- [ ] START suggestions navigate correctly
- [ ] No console errors related to toggle functions
- [ ] Performance is smooth with full community visible

## Future Enhancements

Possible additions:
- Hover tooltip showing connection status
- Filter by connection status (connected/unconnected)
- Connection strength indicators (mutual connections, shared projects)
- Pending connection requests shown with different color (yellow/orange)
