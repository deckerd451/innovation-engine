# Opportunity Engine - Quick Reference Card

## 🚀 Quick Start (Copy & Paste)

### 1. HTML Script Tags
```html
<script src="/assets/js/opportunities/opportunityEngine.js"></script>
```

### 2. Initialize (in synapse core init)
```javascript
await window.OpportunityEngine.init(supabase, currentUserCommunityId);
```

### 3. Get Count for Sidebar
```javascript
const count = window.OpportunityEngine?.getActiveCount() || 0;
```

### 4. Get Trending for Notifications
```javascript
const topOpp = window.OpportunityEngine?.getTopTrending();
const message = topOpp ? `Opportunity gaining momentum: "${topOpp.title}"` : null;
```

### 5. Track User Actions
```javascript
// Join
await window.OpportunityEngine.trackJoin(oppId, { title, source, tags });

// Bookmark
await window.OpportunityEngine.trackBookmark(oppId, { title });

// Click/View
await window.OpportunityEngine.trackClick(oppId, { title, source });
```

## 📊 SQL (Run Once)

```sql
CREATE TABLE public.opportunity_engagement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.community(id),
  opportunity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('join', 'bookmark', 'click')),
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, opportunity_id, action)
);

CREATE INDEX idx_opp_engagement_user ON opportunity_engagement(user_id);
CREATE INDEX idx_opp_engagement_opp ON opportunity_engagement(opportunity_id);
CREATE INDEX idx_opp_engagement_created ON opportunity_engagement(created_at DESC);

ALTER TABLE public.opportunity_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all engagements"
  ON public.opportunity_engagement FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can track their own engagements"
  ON public.opportunity_engagement FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.community WHERE id = user_id LIMIT 1));
```

## 🔍 Debug Commands

```javascript
// Check if loaded
console.log('Loaded:', !!window.OpportunityEngine);

// Get all opportunities
console.log(window.OpportunityEngine.getOpportunities());

// Get count
console.log('Count:', window.OpportunityEngine.getActiveCount());

// Get trending
console.log('Trending:', window.OpportunityEngine.getTrending(5));

// Get top
console.log('Top:', window.OpportunityEngine.getTopTrending());

// Test tracking
await window.OpportunityEngine.trackClick('project:123', { test: true });
```

## 📝 UI Text Changes

```
"Active Themes" → "Active Opportunities"
"Browse Themes" → "Browse Opportunities"
"Theme Circles" → "Opportunities"
"theme gaining momentum" → "opportunity gaining momentum"
```

## 🎯 API Methods

```javascript
// Initialization
OpportunityEngine.init(supabase, userId)

// Data Access
OpportunityEngine.getOpportunities()      // All
OpportunityEngine.getActiveCount()        // Count
OpportunityEngine.getTrending(limit)      // Top N
OpportunityEngine.getTopTrending()        // #1

// Tracking
OpportunityEngine.trackJoin(id, meta)
OpportunityEngine.trackBookmark(id, meta)
OpportunityEngine.trackClick(id, meta)

// Refresh
OpportunityEngine.refresh()
```

## 📦 Opportunity Object

```javascript
{
  id: "project:123",
  title: "Build AI Assistant",
  description: "...",
  source: "project" | "org" | "seed",
  sourceId: "123",
  tags: ["AI", "Python"],
  deadline: "2024-12-31" | null,
  urgencyScore: 0.8,        // 0-1
  momentumScore: 45,        // (joins×5)+(bookmarks×2)+(clicks×1)
  engagementCounts: {
    joins: 5,
    bookmarks: 10,
    clicks: 20
  }
}
```

## ✅ Integration Checklist

- [ ] SQL table created
- [ ] Script tag added to HTML
- [ ] Engine initialized in boot
- [ ] Stats updated (opportunityCount)
- [ ] Trending message updated
- [ ] Engagement tracking added
- [ ] UI text updated
- [ ] Tested in console
- [ ] Verified graph still works

## 🔄 Rollback (3 Steps)

1. Uncomment theme rendering in `render.js`
2. Change `opportunityCount` back to `themeCount` in `core.js`
3. Revert UI text changes

## 📚 Full Documentation

- `OPPORTUNITY_ENGINE_INTEGRATION.md` - Integration guide
- `OPPORTUNITY_REFACTOR_SUMMARY.md` - Technical details
- `PLUG_OPPORTUNITIES_INTO_SYNAPSE.md` - Code snippets
- `REFACTOR_COMPLETE.md` - Executive summary

## 🎉 Success Indicators

✅ Console shows: "✅ Opportunity Engine initialized with N opportunities"
✅ No theme circles in graph
✅ People/Projects/Orgs still render
✅ Sidebar shows "Active Opportunities"
✅ Engagement tracking works
✅ No console errors
