# Opportunity Engine Refactor - Complete Summary

## ✅ What Was Delivered

### 1. New Modules Created

#### `/assets/js/opportunities/opportunityEngine.js` (400 lines)
- **OpportunityEngine class** - Singleton pattern
- **Data Sources**:
  - Projects with status: 'active', 'recruiting', 'open'
  - Organizations (verified=true)
  - Existing opportunities table (if present)
- **Momentum Calculation**: Client-side, last 7 days
  - Formula: `(joins × 5) + (bookmarks × 2) + (clicks × 1)`
- **Engagement Tracking**: 
  - `trackJoin(oppId, metadata)`
  - `trackBookmark(oppId, metadata)`
  - `trackClick(oppId, metadata)`
- **API Methods**:
  - `init(supabase, userId)` - Initialize engine
  - `getOpportunities()` - Get all opportunities
  - `getActiveCount()` - Count of active opportunities
  - `getTrending(limit)` - Get top trending opportunities
  - `getTopTrending()` - Get #1 trending opportunity
  - `refresh()` - Reload data

#### `/assets/js/opportunities/opportunityGraphRenderer.js` (300 lines)
- **renderOpportunityNodes()** - Renders hexagon-shaped opportunity nodes
- **Visual Features**:
  - Hexagon/diamond shape (distinct from circles)
  - Glow effect for visual distinction
  - Color-coded by source and urgency
  - Momentum indicator (🔥) for trending items
- **Interaction Handlers**:
  - Hover effects with smooth transitions
  - Click handlers for opportunity details
  - Hit area optimization
- **Helper Functions**:
  - `createOpportunityLinks()` - Links opps to projects/orgs
  - `updateOpportunityPositions()` - Update during simulation
  - `getOpportunityColor()` - Dynamic coloring
  - `getOpportunityIcon()` - Source-based icons (🚀🏢💡)

### 2. Files Modified

#### `/assets/js/synapse/render.js`
- **Line 480**: Disabled `renderThemeCircles()` function
- Added early return with log message
- Original code preserved in block comment
- Comment markers: `/* ORIGINAL THEME RENDERING CODE - DISABLED` ... `END OF DISABLED THEME RENDERING CODE */`

#### `/assets/js/synapse/core.js`
- **Line 606**: Changed `themeCount` to `opportunityCount`
- **Line 620**: Updated calculation to use `OpportunityEngine.getActiveCount()`
- Added comment: `// REPLACED: was themeCount`

### 3. Integration Guide Created

#### `/OPPORTUNITY_ENGINE_INTEGRATION.md`
Complete step-by-step integration instructions including:
- Load sequence
- Initialization code
- UI updates needed
- Database schema requirements
- Testing checklist
- Rollback plan


## 🔧 Exact Integration Code

### Step 1: Load Engine Script
Add to your HTML or main JS loader:

```html
<script src="/assets/js/opportunities/opportunityEngine.js"></script>
```

### Step 2: Initialize After Supabase Ready
In `assets/js/synapse/core.js` or your init file, after supabase is ready:

```javascript
// Initialize Opportunity Engine
if (window.OpportunityEngine) {
  try {
    await window.OpportunityEngine.init(supabase, currentUserCommunityId);
    console.log('✅ Opportunity Engine initialized with', 
                window.OpportunityEngine.getActiveCount(), 'opportunities');
  } catch (error) {
    console.error('❌ Failed to initialize Opportunity Engine:', error);
  }
}
```

### Step 3: Replace Sidebar Stats
Find where you display network stats (likely in a sidebar or dashboard):

```javascript
// OLD CODE:
const stats = {
  people: nodes.filter(n => n.type === 'person').length,
  projects: nodes.filter(n => n.type === 'project').length,
  themes: nodes.filter(n => n.type === 'theme').length  // ❌ REMOVE
};

// NEW CODE:
const stats = {
  people: nodes.filter(n => n.type === 'person').length,
  projects: nodes.filter(n => n.type === 'project').length,
  opportunities: window.OpportunityEngine?.getActiveCount() || 0  // ✅ ADD
};
```

### Step 4: Update Momentum Display
Find momentum/trending notifications:

```javascript
// OLD CODE:
const trendingTheme = themes.sort((a, b) => b.momentum - a.momentum)[0];
message = `Theme gaining momentum: "${trendingTheme.title}"`;

// NEW CODE:
const topOpp = window.OpportunityEngine?.getTopTrending();
message = topOpp 
  ? `Opportunity gaining momentum: "${topOpp.title}"` 
  : 'Check back for trending opportunities';
```

### Step 5: Track User Engagement
When user clicks JOIN, BOOKMARK, or views an opportunity:

```javascript
// Example: User clicks "Join" button on an opportunity
async function handleJoinOpportunity(opportunity) {
  const result = await window.OpportunityEngine.trackJoin(opportunity.id, {
    title: opportunity.title,
    source: opportunity.source,
    tags: opportunity.tags,
    deadline: opportunity.deadline
  });
  
  if (result.success) {
    console.log('✅ Engagement tracked');
    // Show success message to user
    showToast('You joined this opportunity!');
  } else {
    console.error('❌ Failed to track engagement:', result.error);
  }
}

// Example: User bookmarks an opportunity
async function handleBookmarkOpportunity(opportunity) {
  await window.OpportunityEngine.trackBookmark(opportunity.id, {
    title: opportunity.title
  });
}

// Example: User clicks to view opportunity details
async function handleViewOpportunity(opportunity) {
  await window.OpportunityEngine.trackClick(opportunity.id, {
    title: opportunity.title,
    source: opportunity.source
  });
  // Then show opportunity details modal
  showOpportunityDetailsModal(opportunity);
}
```


## 📊 Database Setup

### Required: opportunity_engagement Table

Run this SQL in your Supabase SQL editor:

```sql
-- Create opportunity_engagement table
CREATE TABLE IF NOT EXISTS public.opportunity_engagement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('join', 'bookmark', 'click')),
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate engagements
  UNIQUE(user_id, opportunity_id, action)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_opp_engagement_user 
  ON public.opportunity_engagement(user_id);
  
CREATE INDEX IF NOT EXISTS idx_opp_engagement_opp 
  ON public.opportunity_engagement(opportunity_id);
  
CREATE INDEX IF NOT EXISTS idx_opp_engagement_created 
  ON public.opportunity_engagement(created_at DESC);

-- Enable RLS
ALTER TABLE public.opportunity_engagement ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all engagements
CREATE POLICY "Users can view all engagements"
  ON public.opportunity_engagement
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can insert their own engagements
CREATE POLICY "Users can track their own engagements"
  ON public.opportunity_engagement
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.community WHERE id = user_id LIMIT 1));

-- Policy: Users can update their own engagements
CREATE POLICY "Users can update their own engagements"
  ON public.opportunity_engagement
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = (SELECT user_id FROM public.community WHERE id = user_id LIMIT 1));

COMMENT ON TABLE public.opportunity_engagement IS 
  'Tracks user engagement with opportunities (join, bookmark, click actions)';
```

### Optional: opportunities Table

If you want to seed custom opportunities (not just derived from projects/orgs):

```sql
-- Create opportunities table (optional)
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  tags JSONB DEFAULT '[]'::jsonb,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active opportunities
CREATE POLICY "Anyone can view active opportunities"
  ON public.opportunities
  FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Policy: Admins can manage opportunities
CREATE POLICY "Admins can manage opportunities"
  ON public.opportunities
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

COMMENT ON TABLE public.opportunities IS 
  'Custom opportunities seeded by admins (supplements project/org-derived opportunities)';
```


## 🎨 UI Terminology Updates

### Files That Need Text Updates

These files contain "Themes" or "Theme Circles" in user-facing text:

1. **assets/js/start-ui-enhanced.js** (Lines 596-632)
   - Change: "No active themes yet" → "No active opportunities yet"
   - Change: "Browse Themes" → "Browse Opportunities"

2. **assets/js/start-sequence-report.js** (Lines 297, 361)
   - Change: "active themes to explore" → "active opportunities to explore"
   - Change: "Browse Themes" → "Browse Opportunities"

3. **assets/js/start-onboarding.js** (Lines 302, 322)
   - Change: "Active Themes" → "Active Opportunities"
   - Change: "Browse Themes" → "Browse Opportunities"

4. **assets/js/theme-admin.js** (Line 295)
   - Change: "Active Themes" → "Active Opportunities"
   - Or consider renaming this entire admin panel

5. **assets/js/synapse/theme-cards-strategy.js** (Lines 83, 115)
   - Change: "Active Theme Circles" → "Active Opportunities"
   - Change: "No Active Themes" → "No Active Opportunities"

6. **assets/js/unified-notification-system.js** (Line 915)
   - Change: "active theme circles" → "active opportunities"

### Search & Replace Commands

Use your editor's find-and-replace (case-sensitive):

```
Find: "Active Themes"
Replace: "Active Opportunities"

Find: "Browse Themes"
Replace: "Browse Opportunities"

Find: "Theme Circles"
Replace: "Opportunities"

Find: "theme circles"
Replace: "opportunities"

Find: "No active themes"
Replace: "No active opportunities"
```

**⚠️ Important**: Do NOT rename internal variables like `themeCount` in data structures unless you're sure they're not used elsewhere. The engine already handles the conversion.

## 🧪 Testing Checklist

### Functional Tests
- [ ] Opportunity engine loads without console errors
- [ ] Engine initializes with supabase and user ID
- [ ] Opportunities are derived from projects (status: active/recruiting/open)
- [ ] Opportunities are derived from organizations (verified: true)
- [ ] `getActiveCount()` returns correct number
- [ ] `getTrending()` returns sorted by momentum score
- [ ] `trackJoin()` inserts record into opportunity_engagement
- [ ] `trackBookmark()` inserts record into opportunity_engagement
- [ ] `trackClick()` inserts record into opportunity_engagement
- [ ] Duplicate engagements are handled gracefully
- [ ] Momentum scores calculate correctly (last 7 days)

### Visual Tests
- [ ] Theme circles no longer appear in graph
- [ ] People nodes still render correctly
- [ ] Project nodes still render correctly
- [ ] Organization nodes still render correctly
- [ ] Connection links still render correctly
- [ ] Graph simulation still works smoothly
- [ ] No visual glitches or errors

### UI Tests
- [ ] Sidebar shows "Active Opportunities" instead of "Active Themes"
- [ ] Opportunity count displays correctly
- [ ] Trending opportunity message displays (if any trending)
- [ ] "Browse Opportunities" button works (if implemented)
- [ ] No references to "themes" in user-facing text

### Database Tests
- [ ] opportunity_engagement table exists
- [ ] Can insert engagement records
- [ ] RLS policies allow authenticated users to read/write
- [ ] Unique constraint prevents duplicate engagements
- [ ] Indexes exist for performance

## 🔄 Rollback Instructions

If you need to revert to themes:

1. **Re-enable theme rendering**:
   - Edit `assets/js/synapse/render.js`
   - Remove the early return in `renderThemeCircles()`
   - Uncomment the original rendering code

2. **Revert core.js changes**:
   - Change `opportunityCount` back to `themeCount`
   - Change calculation back to `nodes.filter(n => n.type === 'theme').length`

3. **Revert UI text changes**:
   - Use find-and-replace to change "Opportunities" back to "Themes"

4. **Remove opportunity scripts** (optional):
   - Remove `<script>` tag for opportunityEngine.js
   - The opportunity_engagement table can remain (won't interfere)

## 📝 Notes

- **No migrations created** - All changes are code-only except for the new table
- **No existing tables modified** - theme_circles, theme_participants remain untouched
- **Modular design** - All opportunity code is in `/assets/js/opportunities/`
- **Reversible** - Original theme code preserved in comments
- **Lightweight** - No RPC functions, no SQL views, client-side logic only
- **Safe** - Doesn't break People, Projects, Orgs, or Connections functionality

## 🚀 Next Steps

1. Run the SQL scripts to create opportunity_engagement table
2. Add the opportunity engine script to your HTML
3. Initialize the engine in your boot sequence
4. Update UI terminology in the listed files
5. Test thoroughly using the checklist above
6. Monitor console for any errors during first load
7. Verify engagement tracking works by testing join/bookmark/click actions

## 📞 Support

If you encounter issues:
- Check browser console for errors
- Verify opportunity_engagement table exists and has correct permissions
- Ensure OpportunityEngine is initialized after supabase client is ready
- Confirm currentUserCommunityId is valid
- Check that projects/orgs tables have data to derive opportunities from
