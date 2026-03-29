# Opportunity Engine Integration Guide

## Summary
This refactoring replaces Themes with Opportunities in the Innovation Engine while maintaining all existing functionality for People, Projects, Orgs, and Connections.

## Files Created

### 1. `/assets/js/opportunities/opportunityEngine.js`
- Lightweight engine that derives opportunities from existing data
- Sources: Projects (needing help), Organizations (requesting participation), existing opportunities table
- Tracks engagement via `opportunity_engagement` table (join, bookmark, click actions)
- Calculates momentum scores from last 7 days of engagement data
- Client-side trending logic: `(joins * 5) + (bookmarks * 2) + (clicks * 1)`

### 2. `/assets/js/opportunities/opportunityGraphRenderer.js`
- Renders opportunity nodes as hexagon/diamond shapes in the network graph
- Distinct visual style with glow effects
- Color-coded by source (project=red, org=purple, seed=cyan) and urgency
- Connects opportunities to related projects, orgs, and participants

## Files Modified

### 1. `/assets/js/synapse/render.js`
- **DISABLED** `renderThemeCircles()` function
- Added comment: `// THEMES DISABLED - REPLACED BY OPPORTUNITIES`
- Original code preserved in block comment for reversibility
- Graph still renders People, Projects, and Orgs normally

## Integration Steps

### Step 1: Load Opportunity Engine on Boot
Add to your main initialization file (likely `assets/js/synapse/core.js` or similar):

```javascript
// Load opportunity engine
const oppEngineScript = document.createElement('script');
oppEngineScript.src = '/assets/js/opportunities/opportunityEngine.js';
document.head.appendChild(oppEngineScript);
```


### Step 2: Initialize Engine After Supabase Ready
In your synapse initialization (after supabase client is ready):

```javascript
// Initialize opportunity engine
if (window.OpportunityEngine) {
  await window.OpportunityEngine.init(supabase, currentUserCommunityId);
  console.log('✅ Opportunity Engine initialized');
}
```

### Step 3: Replace Theme Count with Opportunity Count
Find sidebar/stats display code and replace:

```javascript
// OLD:
const themeCount = nodes.filter(n => n.type === 'theme').length;

// NEW:
const opportunityCount = window.OpportunityEngine?.getActiveCount() || 0;
```

### Step 4: Replace "Theme gaining momentum" with Opportunity
Find momentum display code and replace:

```javascript
// OLD:
message: `Theme gaining momentum: "${themeName}"`

// NEW:
const topOpp = window.OpportunityEngine?.getTopTrending();
message: topOpp ? `Opportunity gaining momentum: "${topOpp.title}"` : 'No trending opportunities';
```

### Step 5: Track Engagement Actions
When user interacts with opportunities:

```javascript
// On JOIN button click:
await window.OpportunityEngine.trackJoin(opportunityId, {
  title: opportunity.title,
  source: opportunity.source,
  tags: opportunity.tags,
  deadline: opportunity.deadline
});

// On BOOKMARK:
await window.OpportunityEngine.trackBookmark(opportunityId, metadata);

// On CLICK/VIEW:
await window.OpportunityEngine.trackClick(opportunityId, metadata);
```


## UI Terminology Changes Needed

Search and replace these terms in UI-facing files:

| Old Term | New Term | Files to Update |
|----------|----------|-----------------|
| "Themes" | "Opportunities" | All UI labels |
| "Theme Circles" | "Opportunities" | Graph labels |
| "Active Themes" | "Active Opportunities" | Sidebar, stats |
| "Browse Themes" | "Browse Opportunities" | Buttons, links |
| "Theme gaining momentum" | "Opportunity gaining momentum" | Notifications |
| `themeCount` | `opportunityCount` | Variable names (safe to rename) |

### Key Files to Update:
- `assets/js/start-ui-enhanced.js` - Lines 596-632 (openThemes handler)
- `assets/js/start-sequence-report.js` - Lines 297, 361 (theme messages)
- `assets/js/start-onboarding.js` - Lines 302, 322 (theme UI)
- `assets/js/synapse/core-cards.js` - Line 125 (themeCount variable)
- `assets/js/unified-notification-system.js` - Line 911 (active_themes)

## Database Requirements

### Required Table: `opportunity_engagement`
This table MUST exist with the following structure:

```sql
CREATE TABLE IF NOT EXISTS opportunity_engagement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES community(id),
  opportunity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('join', 'bookmark', 'click')),
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, opportunity_id, action)
);

CREATE INDEX idx_opp_engagement_user ON opportunity_engagement(user_id);
CREATE INDEX idx_opp_engagement_opp ON opportunity_engagement(opportunity_id);
CREATE INDEX idx_opp_engagement_created ON opportunity_engagement(created_at);
```

### Optional Table: `opportunities`
If you want to seed custom opportunities:

```sql
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  tags JSONB,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```


## Graph Rendering Integration

### Option A: Render Opportunities in Existing Graph
Add to your graph rendering code (after nodes are rendered):

```javascript
// Import the renderer
import { renderOpportunityNodes, createOpportunityLinks } from './opportunities/opportunityGraphRenderer.js';

// Get opportunities from engine
const opportunities = window.OpportunityEngine?.getOpportunities() || [];

// Convert to graph nodes
const oppNodes = opportunities.map(opp => ({
  ...opp,
  type: 'opportunity',
  x: Math.random() * width,  // Initial position
  y: Math.random() * height,
  fx: null,
  fy: null
}));

// Add to simulation
simulation.nodes([...nodes, ...oppNodes]);

// Create links between opportunities and related entities
const oppLinks = createOpportunityLinks(opportunities, nodes);
simulation.force('link').links([...links, ...oppLinks]);

// Render opportunity nodes
renderOpportunityNodes(container, oppNodes, {
  onOpportunityHover: (event, opp, isEntering) => {
    // Handle hover
    console.log('Opportunity hover:', opp.title);
  },
  onOpportunityClick: (event, opp) => {
    // Handle click - show opportunity details modal
    showOpportunityDetails(opp);
  }
});
```

### Option B: Separate Opportunity View
Create a dedicated opportunities view that doesn't interfere with the main graph.

## Testing Checklist

- [ ] Opportunity engine loads without errors
- [ ] Opportunities are derived from projects and orgs
- [ ] Engagement tracking works (join, bookmark, click)
- [ ] Momentum scores calculate correctly
- [ ] Theme circles no longer render in graph
- [ ] People, Projects, Orgs still render normally
- [ ] Sidebar shows "Active Opportunities" count
- [ ] Trending opportunity displays in notifications
- [ ] No database migrations were created
- [ ] No existing tables were modified

## Rollback Plan

If you need to revert:

1. Remove the comment block in `assets/js/synapse/render.js` to re-enable theme rendering
2. Remove opportunity engine script tags
3. Revert UI terminology changes
4. The `opportunity_engagement` table can remain (it won't interfere)

## Notes

- **Modular**: All opportunity code is in `/assets/js/opportunities/` directory
- **Reversible**: Theme rendering code is preserved in comments
- **Safe**: No database schema changes, no migrations
- **Lightweight**: Client-side logic only, no RPC functions
- **Compatible**: Doesn't break People, Projects, Orgs, or Connections
