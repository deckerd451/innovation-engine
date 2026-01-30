# Enhanced START Sequence - Integration Guide

## Overview

The enhanced START sequence replaces static counts with actionable, data-driven insights that integrate directly with your synapse visualization. This guide shows you how to integrate all the components.

## Components Created

### 1. Database Function (`migrations/START_SEQUENCE_QUERY.sql`)
- **Purpose**: Fetches comprehensive user data from the database
- **Returns**: JSON with 6 major sections (profile, immediate actions, opportunities, momentum, network insights, recommendations)
- **Status**: ✅ Already deployed to Supabase

### 2. Report Generator (`assets/js/start-sequence-report.js`)
- **Purpose**: Calls the SQL function and transforms data into actionable insights
- **Features**: 5-minute caching, summary generation, synapse formatting
- **Dependencies**: Supabase client

### 3. Synapse Integration (`assets/js/start-synapse-integration.js`)
- **Purpose**: Maps START data to visual elements in the synapse
- **Features**: Node highlighting, animations, badges, priority-based styling
- **Dependencies**: Synapse visualization (D3.js or similar)

### 4. Enhanced UI (`assets/js/start-ui-enhanced.js`)
- **Purpose**: Renders the new START modal with actionable insights
- **Features**: Dynamic insights, network status report, action handlers
- **Dependencies**: All above components

## Integration Steps

### Step 1: Add Script Tags to `dashboard.html`

Add these scripts **before** the closing `</body>` tag, in this order:

```html
<!-- START Sequence Enhancement -->
<script src="assets/js/start-sequence-report.js"></script>
<script src="assets/js/start-synapse-integration.js"></script>
<script src="assets/js/start-ui-enhanced.js"></script>
```

**Important**: Add them AFTER your existing scripts (Supabase, dashboard.js, etc.)

### Step 2: Verify Supabase Connection

The report generator needs the Supabase client. Ensure you have:

```javascript
// Should already exist in your dashboard.html
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### Step 3: Test the Integration

1. **Open your dashboard** in a browser
2. **Check the console** for these messages:
   ```
   📊 START Sequence Report Generator - Loading
   🧠 START-Synapse Integration - Loading
   🎨 Enhanced START UI - Loading
   ✅ START Sequence Report Generator ready
   ✅ START-Synapse Integration ready
   ✅ Enhanced START UI ready
   ```

3. **Click the START button** - You should see:
   - Loading animation
   - Network status report with real counts
   - Actionable insights (if you have pending requests, messages, etc.)
   - Synapse nodes highlighted based on priority

### Step 4: Optional Indexes (Performance)

For better performance with large datasets, run these in Supabase SQL Editor:

```sql
CREATE INDEX IF NOT EXISTS idx_connections_to_user_status ON connections(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_from_user_status ON connections(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_read ON messages(conversation_id, read, sender_id);
CREATE INDEX IF NOT EXISTS idx_project_bids_user_status ON project_bids(user_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_log_community_created ON activity_log(community_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_status_expires ON opportunities(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_theme_circles_status_expires ON theme_circles(status, expires_at);
```

## Features

### Immediate Actions (High Priority)
- **Pending Connection Requests**: Shows who wants to connect
- **Unread Messages**: Displays unread message count and partners
- **Pending Bids**: Your bids awaiting review
- **Bids to Review**: Bids on your projects

### Opportunities (Medium Priority)
- **Skill-Matched Projects**: Projects that need YOUR skills
- **Active Themes**: Themes you can join
- **Open Opportunities**: Jobs, internships, etc.
- **Complementary Connections**: People with skills you don't have

### Network Insights
- **Current Status**: People, themes, organizations, connections
- **Growth Metrics**: New connections, projects, themes (last 30 days)
- **Activity Breakdown**: What you've been doing
- **Streak Status**: Login streak and XP progress

### Synapse Integration
- **Node Highlighting**: Pending requests pulse, unread messages glow
- **Priority Styling**: High priority = bright colors, medium = subtle
- **Badges**: Unread counts displayed on nodes
- **Animations**: Pulse, glow, highlight effects

## API Reference

### Global Functions

```javascript
// Get START sequence data
const data = await getStartSequenceData(forceRefresh = false);

// Generate summary for report panel
const summary = await generateStartSummary();

// Generate actionable insights
const insights = await generateStartInsights();

// Get synapse visualization data
const synapseData = await getStartSynapseData();

// Apply highlights to synapse
await applyStartHighlights();

// Clear highlights
clearStartHighlights();

// Refresh highlights (clears cache and reapplies)
await refreshStartHighlights();

// Clear cache (call after user actions)
clearStartSequenceCache();
```

### Data Structure

```javascript
{
  profile: { id, name, email, skills, ... },
  progress: { xp, level, login_streak, ... },
  immediate_actions: {
    pending_requests: { count, items: [...] },
    unread_messages: { count, conversations: [...] },
    pending_bids: { count, items: [...] },
    bids_to_review: { count, items: [...] }
  },
  opportunities: {
    skill_matched_projects: { count, items: [...] },
    active_themes: { count, items: [...] },
    open_opportunities: { count, items: [...] },
    complementary_connections: { count, items: [...] }
  },
  momentum: {
    weekly_activity: 23,
    streak: { current: 25, is_at_risk: false },
    xp_progress: { current_xp: 2173, next_level_xp: 5000, ... }
  },
  network_insights: {
    connections: { total: 42, by_type: {...} },
    active_projects: { count, items: [...] },
    participating_themes: { count, items: [...] },
    growth: { new_connections: 5, new_projects: 2, ... }
  },
  recommendations: {
    priority_actions: [...]
  }
}
```

## Customization

### Change Cache Duration

In `assets/js/start-sequence-report.js`:

```javascript
this.cache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000 // Change this (milliseconds)
};
```

### Add Custom Action Handlers

In `assets/js/start-ui-enhanced.js`, add to the `handlers` object:

```javascript
const handlers = {
  openConnectionRequests: () => {
    // Your implementation
  },
  myCustomAction: () => {
    // Your custom handler
  }
};
```

### Customize Highlight Colors

In `assets/js/start-synapse-integration.js`, modify `getHighlightStyle()`:

```javascript
const styles = {
  high: {
    pending_request: {
      stroke: '#00e0ff', // Change this
      strokeWidth: 4,
      fill: 'rgba(0, 224, 255, 0.3)',
      filter: 'drop-shadow(0 0 10px rgba(0, 224, 255, 0.8))'
    }
  }
};
```

## Troubleshooting

### "No data returned from database"
- Check that the SQL function was deployed successfully
- Verify user has a community profile
- Check Supabase logs for errors

### "Synapse highlights not appearing"
- Ensure synapse is fully loaded before applying highlights
- Check that nodes have proper `data-node-id` attributes
- Verify `synapse-ready` event is being dispatched

### "START button not working"
- Check console for script loading errors
- Verify script tags are in correct order
- Ensure Supabase client is initialized

### "Cache not clearing after actions"
- Call `clearStartSequenceCache()` after user actions
- Example: After accepting a connection request

## Next Steps

1. **Add script tags** to dashboard.html
2. **Test the START button** to see the new UI
3. **Customize colors/styling** to match your brand
4. **Add custom action handlers** for your specific modals
5. **Monitor performance** and add indexes if needed

## Support

For issues or questions:
- Check browser console for error messages
- Review Supabase logs for database errors
- Verify all dependencies are loaded in correct order
