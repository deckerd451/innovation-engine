# How to Plug Opportunities Into Existing Synapse Load Cycle

## Quick Integration (5 Steps)

### Step 1: Add Script Tag to HTML
Find your main HTML file (likely `index.html` or similar) and add:

```html
<!-- Add before closing </body> tag, after other synapse scripts -->
<script src="/assets/js/opportunities/opportunityEngine.js"></script>
<script src="/assets/js/opportunities/opportunityGraphRenderer.js" type="module"></script>
```

### Step 2: Initialize in Synapse Core
In `assets/js/synapse/core.js`, find the `initSynapseView()` function.

Add this code AFTER supabase and currentUserCommunityId are set:

```javascript
// Around line 150-200, after this line:
// currentUserCommunityId = userInfo?.currentUserCommunityId || null;

// ADD THIS:
// ================================================================
// OPPORTUNITY ENGINE INITIALIZATION
// ================================================================
console.log('🎯 Initializing Opportunity Engine...');
try {
  if (window.OpportunityEngine) {
    await window.OpportunityEngine.init(supabase, currentUserCommunityId);
    const oppCount = window.OpportunityEngine.getActiveCount();
    console.log(`✅ Opportunity Engine initialized with ${oppCount} opportunities`);
    
    // Expose for debugging
    window.getOpportunities = () => window.OpportunityEngine.getOpportunities();
    window.getTrendingOpportunities = (limit) => window.OpportunityEngine.getTrending(limit);
  } else {
    console.warn('⚠️ OpportunityEngine not loaded - check script tag');
  }
} catch (error) {
  console.error('❌ Failed to initialize Opportunity Engine:', error);
}
```

### Step 3: Update getSynapseStats Function
In `assets/js/synapse/core.js`, find the `getSynapseStats()` function (around line 600).

The changes are already made, but verify:

```javascript
export function getSynapseStats() {
  const peopleCount = nodes.filter((n) => n.type === "person").length;
  const projectCount = nodes.filter((n) => n.type === "project").length;
  const opportunityCount = window.OpportunityEngine?.getActiveCount() || 0; // ✅ This line

  // ... rest of function
  
  return {
    peopleCount,
    projectCount,
    opportunityCount, // ✅ This line
    myConnectionCount: myAccepted.length || myConns.length || 0,
    currentUserCommunityId,
  };
}
```

### Step 4: Add Refresh Hook
In `assets/js/synapse/core.js`, find the `refreshSynapseConnections()` function.

Add opportunity refresh:

```javascript
export async function refreshSynapseConnections() {
  await reloadAllData();
  await rebuildGraph();
  
  // ADD THIS:
  // Refresh opportunities when graph refreshes
  if (window.OpportunityEngine) {
    await window.OpportunityEngine.refresh();
    console.log('🔄 Opportunities refreshed');
  }
}
```

### Step 5: Expose Opportunity API
At the end of `initSynapseView()` function, add to the window.synapseApi object:

```javascript
// Around line 400-500, find this block:
window.synapseApi = {
  open: () => { /* ... */ },
  focusNode: (nodeId, opts) => { /* ... */ },
  focusTheme: (themeId) => { /* ... */ },
  showActivity: () => { /* ... */ },
  
  // ADD THIS:
  opportunities: {
    getAll: () => window.OpportunityEngine?.getOpportunities() || [],
    getCount: () => window.OpportunityEngine?.getActiveCount() || 0,
    getTrending: (limit = 5) => window.OpportunityEngine?.getTrending(limit) || [],
    getTop: () => window.OpportunityEngine?.getTopTrending() || null,
    trackJoin: (oppId, meta) => window.OpportunityEngine?.trackJoin(oppId, meta),
    trackBookmark: (oppId, meta) => window.OpportunityEngine?.trackBookmark(oppId, meta),
    trackClick: (oppId, meta) => window.OpportunityEngine?.trackClick(oppId, meta),
    refresh: () => window.OpportunityEngine?.refresh()
  },
  
  debug: {
    getNodes: () => nodes,
    getLinks: () => links,
    isReady: () => _ready,
    getCore: () => synapseCore,
  },
};
```

## Usage Examples

### Get Opportunities in Your UI Code

```javascript
// Get all opportunities
const opportunities = window.synapseApi.opportunities.getAll();
console.log('Opportunities:', opportunities);

// Get count for sidebar
const count = window.synapseApi.opportunities.getCount();
document.getElementById('opp-count').textContent = count;

// Get trending for notifications
const trending = window.synapseApi.opportunities.getTrending(3);
trending.forEach(opp => {
  console.log(`🔥 ${opp.title} - Momentum: ${opp.momentumScore}`);
});

// Get top trending for "gaining momentum" message
const topOpp = window.synapseApi.opportunities.getTop();
if (topOpp) {
  showNotification(`Opportunity gaining momentum: "${topOpp.title}"`);
}
```

### Track Engagement

```javascript
// When user clicks "Join" button
async function onJoinClick(opportunity) {
  const result = await window.synapseApi.opportunities.trackJoin(
    opportunity.id,
    {
      title: opportunity.title,
      source: opportunity.source,
      tags: opportunity.tags
    }
  );
  
  if (result.success) {
    showToast('✅ You joined this opportunity!');
  }
}

// When user bookmarks
async function onBookmarkClick(opportunity) {
  await window.synapseApi.opportunities.trackBookmark(opportunity.id, {
    title: opportunity.title
  });
  showToast('🔖 Opportunity bookmarked!');
}

// When user views details
async function onOpportunityView(opportunity) {
  await window.synapseApi.opportunities.trackClick(opportunity.id, {
    title: opportunity.title,
    source: opportunity.source
  });
  // Then show modal
  showOpportunityModal(opportunity);
}
```

### Refresh Opportunities

```javascript
// Manually refresh opportunities (e.g., after creating a new project)
async function refreshOpportunities() {
  await window.synapseApi.opportunities.refresh();
  console.log('Opportunities refreshed');
  
  // Update UI
  updateOpportunityCount();
  updateTrendingDisplay();
}
```

## Verification

After integration, open browser console and run:

```javascript
// Check if engine loaded
console.log('Engine loaded:', !!window.OpportunityEngine);

// Check if initialized
console.log('Opportunities:', window.synapseApi.opportunities.getAll());

// Check count
console.log('Count:', window.synapseApi.opportunities.getCount());

// Check trending
console.log('Trending:', window.synapseApi.opportunities.getTrending(5));

// Test tracking (replace with real opportunity ID)
await window.synapseApi.opportunities.trackClick('project:123', { test: true });
```

Expected output:
```
Engine loaded: true
Opportunities: [Array of opportunity objects]
Count: 15
Trending: [Array of top 5 opportunities sorted by momentum]
✅ Tracked click for opportunity: project:123
```

## Troubleshooting

### "OpportunityEngine is not defined"
- Check that script tag is present in HTML
- Verify script loads before synapse initialization
- Check browser console for script loading errors

### "Cannot read property 'init' of undefined"
- OpportunityEngine script hasn't loaded yet
- Add script tag earlier in HTML
- Or wrap initialization in a check: `if (window.OpportunityEngine)`

### "No opportunities found"
- Check that projects table has data with status 'active', 'recruiting', or 'open'
- Check that organizations table has data with verified=true
- Verify supabase client has permissions to read these tables

### "Engagement tracking fails"
- Verify opportunity_engagement table exists
- Check RLS policies allow authenticated users to insert
- Verify currentUserCommunityId is valid
- Check browser console for detailed error messages

## Complete Integration Checklist

- [ ] Added script tags to HTML
- [ ] Added initialization code to initSynapseView()
- [ ] Updated getSynapseStats() to use opportunityCount
- [ ] Added refresh hook to refreshSynapseConnections()
- [ ] Exposed opportunity API in window.synapseApi
- [ ] Tested in browser console
- [ ] Verified opportunities load
- [ ] Verified engagement tracking works
- [ ] Updated UI text from "Themes" to "Opportunities"
- [ ] Tested that graph still renders People/Projects/Orgs correctly
