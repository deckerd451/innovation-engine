# Theme/Idea Circles - Implementation Plan

## Status: PARTIAL IMPLEMENTATION

### ✅ Completed
1. **Database Schema** - See `THEME_CIRCLES_SCHEMA.sql`
   - Tables created for `theme_circles`, `theme_participants`, `theme_actions`
   - Auto-decay function
   - Activity tracking
   - RLS policies

2. **Basic Admin Creation** - In `assets/js/dashboard-actions.js`
   - Admin can create themes from menu
   - Currently uses simple prompts (line 65-115)

### 🚧 In Progress / TODO

#### Phase 1: Enhanced Admin UI (PRIORITY)
**File:** `assets/js/dashboard-actions.js`

Replace the simple prompt flow (lines 65-115) with a proper modal:
```javascript
// Features needed:
- Modal form with title, description, tags, duration
- Duration presets (2, 7, 14, 30 days)
- Visual feedback during creation
- Auto-refresh synapse after creation
```

#### Phase 2: Visual Representation (HIGH PRIORITY)
**Files:** `assets/js/synapse/render.js`, `assets/js/synapse/themes.js`

**What themes should look like:**
- **Shape:** Larger, translucent circles (not nodes)
- **No profile image** - Just text/icon
- **Glow effect** - Soft, pulsing glow
- **Dashed boundary** for new themes
- **Solid boundary** for established themes

**Visual states by lifecycle:**
```
Emergence (new):
  - Soft glow
  - Dashed outline
  - Slight wobble animation
  - Smaller radius

Attraction (people joining):
  - Glow brightens
  - People drift toward it (2-6% closer)
  - Lines to theme brighten

Convergence (active):
  - Solid outline
  - Larger radius
  - Stable position
  - Action buttons visible on hover

Decay (expiring):
  - Edges blur
  - Glow dims
  - Slight fade animation
```

**Rendering code location:**
- Add to `renderThemeCircles()` in `assets/js/synapse/render.js`
- Update `loadSynapseData()` in `assets/js/synapse/data.js` to load themes

#### Phase 3: Gravity & Attraction Physics
**File:** `assets/js/synapse/core.js`

**Implement subtle gravitational pull:**
```javascript
// In simulation force calculation:
1. Find nearby people (within ~150px)
2. Calculate shared tags/interests
3. Apply gentle force toward theme (2-6% of normal force)
4. Deform personal circles slightly toward theme
```

**Visual effects when inside theme:**
```javascript
- Person node slightly flattens toward center
- Connections inside theme glow stronger (+20% opacity)
- Outside connections dim slightly (-15% opacity)
```

#### Phase 4: Interaction Layer
**File:** `assets/js/synapse/ui.js` or new `theme-interactions.js`

**User Actions:**

1. **Hover State**
   ```javascript
   // Show on hover:
   - Theme title
   - Participant count
   - Time remaining
   - "Signal Interest" button (if not participated)
   ```

2. **Click/Engagement**
   ```javascript
   // Open Theme Card showing:
   - Full description
   - List of participants (with avatars)
   - Tags
   - Engagement level selector
   - Quick actions (if threshold met)
   ```

3. **Signal Interest**
   ```javascript
   // One-click signals (no commitment):
   signals = [
     'interested',
     'available-this-week',
     'seeking-collaborators',
     'has-expertise'
   ]

   // On signal:
   INSERT INTO theme_participants (
     theme_id,
     community_id,
     engagement_level,
     signals
   )
   ```

4. **Progressive Actions** (appear when thresholds met)
   ```javascript
   // Thresholds:
   - 3+ interested → "See who's exploring"
   - 5+ engaged → "Propose working session"
   - 8+ active → "Start project"

   // Actions:
   - Schedule meetup (calendar integration)
   - Draft project outline
   - Create working group
   ```

#### Phase 5: Auto-Creation from Behavior
**File:** New `assets/js/theme-detector.js`

**Signals to track:**
```javascript
const DETECTION_SIGNALS = {
  search_terms: {},      // search term → count in 24h
  filter_usage: {},      // filter combo → count
  node_dwell: {},        // node type → avg dwell time
  repeated_views: {},    // profile_id → view count
  connection_attempts: {}// skill/tag → attempt count
}

// Threshold for auto-creation:
const AUTO_CREATE_THRESHOLD = {
  search_count: 8,       // 8 users search same term in 24h
  time_window: 86400000, // 24 hours
  min_relevance: 0.7     // 70% keyword match
}
```

**Auto-creation flow:**
```javascript
1. Detect signal cluster
2. Generate theme title from common keywords
3. Create with:
   - origin_type: 'behavior'
   - expires_at: NOW() + 48 hours
   - status: 'emerging'
4. Render faintly on synapse
5. Label: "Emerging: [title]"
6. NO notification (just presence)
```

#### Phase 6: Time Decay & Lifecycle
**File:** `assets/js/synapse/themes.js`

**Client-side decay visualization:**
```javascript
function calculateDecayVisuals(theme) {
  const now = Date.now();
  const expires = new Date(theme.expires_at).getTime();
  const created = new Date(theme.created_at).getTime();

  const lifetime = expires - created;
  const remaining = expires - now;
  const progress = 1 - (remaining / lifetime);

  return {
    glowIntensity: Math.max(0.3, 1 - progress),
    edgeBlur: progress * 5,
    opacity: Math.max(0.4, 1 - (progress * 0.6)),
    pulseSpeed: Math.max(2000, 4000 * progress)
  };
}

// Apply in render loop:
themeCircle
  .style('opacity', d => calculateDecayVisuals(d).opacity)
  .style('filter', d => `blur(${calculateDecayVisuals(d).edgeBlur}px)`)
```

**Server-side auto-archiving:**
```javascript
// Run every hour via cron or webhook:
SELECT decay_theme_circles();

// Or client-side check on load:
async function archiveExpiredThemes() {
  const { data } = await supabase
    .from('theme_circles')
    .select('id, activity_score')
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString());

  for (const theme of data) {
    const newStatus = theme.activity_score >= 10
      ? 'archived'
      : 'dissipated';

    await supabase
      .from('theme_circles')
      .update({ status: newStatus })
      .eq('id', theme.id);
  }
}
```

#### Phase 7: Nudge System
**File:** New `assets/js/theme-nudges.js`

**Nudge escalation stages:**
```javascript
const NUDGE_STAGES = {
  AWARENESS: {
    condition: 'theme exists',
    visual: 'proximity + glow',
    action: null
  },

  LIGHT_ENGAGEMENT: {
    condition: '≥3 interested OR ≥2 linger >5s',
    visual: 'brighten connections',
    action: '"See others exploring" button'
  },

  COORDINATION: {
    condition: '≥5 engaged AND (admin OR ≥2 reciprocal)',
    visual: 'action buttons',
    actions: [
      'Propose working session',
      'Draft project outline',
      'Signal availability'
    ]
  }
};

function determineNudgeStage(theme, participants) {
  const interestedCount = participants.filter(
    p => p.engagement_level !== 'hover'
  ).length;

  const activeCount = participants.filter(
    p => ['active', 'proposing'].includes(p.engagement_level)
  ).length;

  if (activeCount >= 5) return 'COORDINATION';
  if (interestedCount >= 3) return 'LIGHT_ENGAGEMENT';
  return 'AWARENESS';
}
```

### 🎨 CSS Needed

**File:** Create `assets/css/theme-circles.css`

```css
/* Theme Circle hover card */
.theme-circle-card {
  position: fixed;
  background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
  border: 2px solid rgba(0,224,255,0.4);
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 350px;
  z-index: 9999;
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

.theme-circle-card h3 {
  color: #00e0ff;
  margin: 0 0 0.75rem 0;
  font-size: 1.25rem;
}

.theme-participants {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 1rem 0;
}

.participant-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid rgba(0,224,255,0.4);
}

.theme-signal-btn {
  padding: 0.5rem 1rem;
  background: rgba(0,224,255,0.1);
  border: 1px solid rgba(0,224,255,0.3);
  border-radius: 8px;
  color: #00e0ff;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-signal-btn:hover {
  background: rgba(0,224,255,0.2);
  border-color: rgba(0,224,255,0.5);
}

.theme-signal-btn.active {
  background: rgba(0,224,255,0.3);
  border-color: #00e0ff;
}

.theme-decay-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #666;
  font-size: 0.75rem;
  margin-top: 0.5rem;
}

.theme-decay-bar {
  flex: 1;
  height: 4px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}

.theme-decay-fill {
  height: 100%;
  background: linear-gradient(90deg, #00e0ff, #ff6b6b);
  transition: width 0.3s ease;
}
```

### 📊 Analytics to Track

```javascript
// In theme_participants or separate analytics table:
- Signal adoption rate
- Time to first participant
- Participant dwell time inside theme
- Conversion to projects
- Admin vs. auto-created success rates
- Peak participation time
- Decay time vs. activity correlation
```

### 🚫 Anti-Patterns to Avoid

1. **Never notify** - Discovery through motion only
2. **No permanent groups** - Everything expires
3. **No feeds** - No thread discussions
4. **No complex workflows** - Max 2 clicks to act
5. **No forced participation** - All signals optional
6. **No clutter** - Max 1-2 active themes per user view

### 🔄 Next Steps (Priority Order)

1. ✅ Apply `THEME_CIRCLES_SCHEMA.sql` to Supabase
2. 🔧 Enhance admin creation modal (dashboard-actions.js)
3. 🎨 Add theme rendering to synapse (render.js)
4. 🧲 Implement gravity physics (core.js)
5. 👆 Add interaction layer (theme-interactions.js)
6. 🤖 Build auto-detection (theme-detector.js)
7. ⏱️ Implement decay visuals
8. 📈 Add analytics

### 💡 Testing Scenarios

1. **Admin creates theme** → Should appear on synapse
2. **User hovers theme** → Should show info card
3. **User signals interest** → Count updates, slight drift toward theme
4. **5+ users engaged** → Action buttons appear
5. **Theme expires** → Fades out gracefully
6. **8 users search "AI radiology"** → Auto-theme appears

### 📝 Notes for Future Development

- Consider integration with existing Projects system (resolve → project)
- Theme "graduation" - successful themes become projects
- Archive view for past themes
- Notification settings (optional email summary)
- Mobile-responsive theme cards
- Accessibility: keyboard navigation, screen reader support

---

## Quick Start Guide

To continue implementation:

1. **Database setup:**
   ```bash
   # In Supabase SQL Editor:
   # Copy contents of THEME_CIRCLES_SCHEMA.sql and execute
   ```

2. **Test admin creation:**
   ```javascript
   // Login as admin, click Menu → Create Theme Circle
   // Should insert into theme_circles table
   ```

3. **Verify in Supabase:**
   ```sql
   SELECT * FROM theme_circles;
   SELECT * FROM active_themes_summary;
   ```

4. **Next: Render themes on synapse**
   - Edit `assets/js/synapse/data.js` loadSynapseData()
   - Edit `assets/js/synapse/render.js` add renderThemeCircles()

---

*Last updated: 2026-01-08*
*Implementation by: Claude (Sonnet 4.5)*
