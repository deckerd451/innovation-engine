// Intelligence Layer - Making Invisible Momentum Visible

## Overview

The Intelligence Layer upgrades Innovation Engine from a passive state explorer into an active coordination system that detects emerging opportunities and surfaces who should act next, on what, and why.

## Core Principle

**Innovation Engine does not create opportunities. It makes existing opportunities impossible to miss.**

## What "Thinking" Means

The app infers situational awareness from existing data:

- "These people are converging around the same theme"
- "This opportunity has momentum over the last 2–4 weeks"
- "This user is the missing connector across roles"
- "This conversation/activity should probably turn into an action"

The output is **actionable suggestions with explanations**, not predictions.

## Architecture

### 1. Coordination Detector (`coordination-detector.js`)

The brain of the intelligence layer. Detects five types of coordination moments:

#### A. Theme Convergence
**What it detects**: Multiple people with complementary roles active around the same theme

**Signals**:
- 3+ people active in theme in last 3 weeks
- Multiple roles present (funder, organizer, builder, etc.)
- User is connected to participants

**Example insight**:
```
"Momentum building around 'AI in Healthcare'"
• 5 people active in last 3 weeks
• Multiple roles: funder, organizer
• 2 of your connections involved
→ Coordinate
```

#### B. Role Complementarity
**What it detects**: User connects people with complementary roles around shared interests

**Signals**:
- 2+ connections share an interest
- Complementary roles present (funder + builder, organizer + designer)
- User is the connector

**Example insight**:
```
"Team forming around 'Blockchain'"
• 3 connections share interest: Blockchain
• Complementary roles: funder, builder
• You are the connector
→ Introduce
```

#### C. Bridge Opportunities
**What it detects**: User connects two people who should know each other but don't

**Signals**:
- Two of user's connections aren't connected to each other
- They share interests or skills
- User is the only bridge

**Example insight**:
```
"Connect Sarah Johnson and Mike Chen"
• Both interested in: Web3
• Not yet connected
• You are the bridge
→ Introduce
```

#### D. Momentum Shifts
**What it detects**: Sudden increase in project or theme activity

**Signals**:
- Activity doubled in last 2 weeks vs previous 2 weeks
- Multiple recent actions
- User is involved

**Example insight**:
```
"'AI Healthcare Platform' gaining momentum"
• Activity doubled in last 2 weeks
• 12 recent actions
• Momentum building
→ Check In
```

#### E. Conversation → Action
**What it detects**: Active conversations ready to become concrete actions

**Signals**:
- 5+ messages in last week
- Action keywords detected ("should", "let's", "next step")
- High engagement

**Example insight**:
```
"Active conversation with Sarah Johnson"
• 8 messages in last week
• Action signals detected
• Time to move forward
→ Follow Up
```

### 2. Enhanced Suggestions Engine

The existing Daily Suggestions Engine now:

1. **Runs coordination detection first** (priority insights)
2. **Generates traditional suggestions** (people, projects, themes, orgs)
3. **Combines and ranks** by score (coordination moments score higher)
4. **Ensures minimum 5 insights** (never shows "0 insights")

### 3. Scoring System

**Coordination moments**: 50-70+ base score
- Theme convergence: 60 + (participants × 5) + (role diversity × 10)
- Role complementarity: 70 + (roles × 10)
- Bridge opportunities: 55 + (shared interests × 10)
- Momentum shifts: 65 + min(activity × 5, 30)
- Conversation to action: 50 + min(messages × 3, 30)

**Traditional suggestions**: 5-50 score
- Based on shared interests, skills, mutual connections, recent activity

**Priority**: Coordination moments naturally rise to the top due to higher scores

## Data Flow

```
1. User logs in
   ↓
2. Profile loaded
   ↓
3. Intelligence Layer initializes
   ↓
4. Check cache for today's insights
   ↓
5. If not cached, generate:
   
   A. Build context:
      - Get user's connections
      - Get user's projects
      - Get user's themes
      - Get user's organizations
   
   B. Run coordination detection:
      - Detect theme convergence
      - Detect role complementarity
      - Detect bridge opportunities
      - Detect momentum shifts
      - Detect conversation → action
   
   C. Generate traditional suggestions:
      - Score people by shared interests/skills
      - Score projects by skill match
      - Score themes by interest overlap
      - Score orgs by industry match
   
   D. Combine and rank:
      - Merge coordination + traditional
      - Sort by score (coordination first)
      - Take top 5-10
      - Store in cache
   
   ↓
6. START modal opens
   ↓
7. Insights rendered as cards
   ↓
8. User clicks → navigates to relevant view
```

## UI Integration

### Insight Card Format

```
┌─────────────────────────────────────────┐
│  🌐 Momentum building around "AI"    ? │
│     5 people active in last 3 weeks     │
│     Multiple roles: funder, organizer   │
│     2 of your connections involved      │
│                                         │
│     [Coordinate →]                      │
└─────────────────────────────────────────┘
```

### Visual Indicators

- **Coordination insights**: Red/orange color (#ff6b6b)
- **Traditional suggestions**: Type-specific colors
- **"?" button**: Shows detailed reasoning
- **Action CTA**: Clear next step

## Operating Constraints

✅ **Client-side only** - Runs entirely in browser  
✅ **Supabase RLS** - Respects all security policies  
✅ **No SQL execution** - Only reads via Supabase client  
✅ **No background jobs** - Runs on-demand when user opens START  
✅ **Deterministic per day** - Same insights all day (cached)  
✅ **Never 0 insights** - Always shows minimum 5  

## Momentum Detection Windows

- **Recent activity**: 14 days (2 weeks)
- **Momentum window**: 21 days (3 weeks)
- **Conversation window**: 7 days (1 week)
- **Cooldown period**: 7 days (no repeated suggestions)

## What Success Looks Like

### Before Intelligence Layer
- Opportunities rely on one person's memory
- Users miss convergence moments
- Connections happen by chance
- Momentum invisible until meetings

### After Intelligence Layer
- System notices what humans miss
- Convergence moments surfaced automatically
- User feels app is "paying attention"
- Momentum visible before it's obvious

## Example Scenarios

### Scenario 1: Theme Convergence
**Situation**: 5 people (including a funder, 2 builders, and an organizer) have all been active in the "AI in Healthcare" theme in the last 3 weeks. User is connected to 2 of them.

**Intelligence Layer detects**:
- Multiple actors converging
- Role diversity present
- User is connector

**Insight shown**:
```
"Momentum building around 'AI in Healthcare'"
• 5 people active in last 3 weeks
• Multiple roles: funder, organizer, builder
• 2 of your connections involved
→ Coordinate
```

**User action**: Opens theme, sees who's involved, initiates coordination

### Scenario 2: Bridge Opportunity
**Situation**: User is connected to both a funder interested in "Climate Tech" and a startup founder building a climate solution. They don't know each other.

**Intelligence Layer detects**:
- Shared interest
- Complementary roles
- User is the only bridge

**Insight shown**:
```
"Connect Sarah (Funder) and Mike (Founder)"
• Both interested in: Climate Tech
• Complementary roles
• You are the bridge
→ Introduce
```

**User action**: Makes introduction, potential partnership forms

### Scenario 3: Momentum Shift
**Situation**: A project had 3 updates in the previous 2 weeks, but 8 updates in the last 2 weeks. User is a member.

**Intelligence Layer detects**:
- Activity doubled
- Momentum building
- User involved

**Insight shown**:
```
"'Climate Dashboard' gaining momentum"
• Activity doubled in last 2 weeks
• 8 recent actions
• Momentum building
→ Check In
```

**User action**: Engages with project at the right time

## Technical Implementation

### Files Created/Modified

**New files**:
- `assets/js/intelligence/coordination-detector.js` - Core detection logic

**Modified files**:
- `assets/js/suggestions/engine.js` - Integrated coordination detection
- `assets/js/suggestions/ui.js` - Added coordination insight rendering

### Database Queries

All queries are **read-only** and respect RLS:

```javascript
// Theme participants (recent activity)
SELECT community_id, joined_at, last_seen_at, community(id, name, role)
FROM theme_participants
WHERE theme_id = ? AND last_seen_at >= ?

// Activity log (momentum detection)
SELECT id FROM activity_log
WHERE project_id = ? AND created_at >= ?

// Messages (conversation detection)
SELECT id, content FROM messages
WHERE conversation_id = ? AND created_at >= ?

// Connections (bridge detection)
SELECT from_user_id, to_user_id FROM connections
WHERE status = 'accepted'
```

### Caching Strategy

Same as Daily Suggestions Engine:
- **Supabase table** (preferred): `daily_suggestions`
- **localStorage** (fallback): `daily_suggestions_{userId}_{date}`
- **Cache key**: User ID + date (YYYY-MM-DD)
- **Cache duration**: 24 hours (regenerates next day)

## Configuration

### Tuning Detection Windows

Edit `assets/js/intelligence/coordination-detector.js`:

```javascript
constructor() {
  this.momentumWindow = 21;        // 3 weeks
  this.recentActivityWindow = 14;  // 2 weeks
}
```

### Adjusting Scores

Edit scoring in each detection method:

```javascript
// Example: Increase theme convergence score
score: 70 + (recentParticipants.length * 5) + (roles.size * 10)
// Change to:
score: 80 + (recentParticipants.length * 10) + (roles.size * 15)
```

### Adding New Detection Types

1. Add method to `CoordinationDetector` class
2. Call it in `detectCoordinationMoments()`
3. Return array of moment objects with required fields

## Verification Checklist

✅ **Coordination detection runs** - Check console for "🧠 Running coordination detection..."  
✅ **Moments are found** - Check console for "✨ Found X coordination moments"  
✅ **Insights appear in START** - Open START modal, see coordination cards  
✅ **Explanations are clear** - Click "?" button, see concrete reasons  
✅ **Actions work** - Click insight, navigates to relevant view  
✅ **Caching works** - Insights stable within same day  
✅ **Never 0 insights** - Always shows minimum 5  
✅ **No errors** - Console clean, no RLS violations  

## Testing

### Manual Testing

```javascript
// 1. Check coordination detector
console.log(window.DailySuggestionsEngine.coordinationDetector);

// 2. Generate insights
await window.DailySuggestionsEngine.ensureTodaysSuggestions();

// 3. View insights
const profile = window.currentUserProfile;
const today = window.DailySuggestionsEngine.getTodayKey();
const insights = await window.DailySuggestionsStore.getSuggestionsForDate(profile.id, today);

// 4. Filter coordination moments
const coordination = insights.filter(i => i.type === 'coordination');
console.log(`Found ${coordination.length} coordination moments`);
console.table(coordination);

// 5. Open START modal
window.EnhancedStartUI.open();
```

### Expected Output

```
🧠 Running coordination detection...
✨ Found 3 coordination moments
📊 Final mix: 3 coordination + 5 traditional
✅ Generated 8 suggestions for today
```

## Future Enhancements

### Potential Additions

1. **Timing Intelligence**: Detect best time to reach out based on activity patterns
2. **Network Effects**: Detect when connecting two people creates value for others
3. **Resource Matching**: Detect when someone needs something another person has
4. **Event Momentum**: Detect when multiple people should attend same event
5. **Skill Gaps**: Detect when a project needs a specific skill user has
6. **Follow-up Reminders**: Detect when a conversation went cold
7. **Cluster Detection**: Detect emerging sub-communities
8. **Trend Detection**: Detect rising topics across the network

### Analytics to Add

1. **Coordination success rate**: Track which moments lead to action
2. **Timing accuracy**: Measure if moments are detected at right time
3. **User engagement**: Track which coordination types get most clicks
4. **Network impact**: Measure connections formed from introductions

## Troubleshooting

### No coordination moments detected

**Possible causes**:
- Not enough recent activity in network
- User not connected to enough people
- No themes with multiple participants
- Activity log table empty

**Solutions**:
- Check if activity_log table has data
- Verify theme_participants has recent entries
- Lower momentum window threshold
- Add more detection types

### Coordination insights not appearing

**Check**:
1. Console for errors
2. Coordination detector initialized: `console.log(window.DailySuggestionsEngine.coordinationDetector)`
3. Insights generated: Check cache
4. UI rendering: Check START modal HTML

### Scores too low/high

**Adjust**:
- Base scores in each detection method
- Multipliers for activity counts
- Thresholds for detection (e.g., minimum participants)

## Support

For issues:
1. Check console logs for detection output
2. Verify activity data exists in tables
3. Test with manual API calls
4. Review coordination-detector.js logic
5. Check GitHub issues

---

**The Intelligence Layer makes invisible momentum visible, without automation or overwhelm.**
