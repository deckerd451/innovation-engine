# Theme Circles - End-to-End Testing Guide

## 🎯 Purpose
This guide will walk you through testing the complete Theme Circles system from database setup to visual interaction on the Synapse graph.

---

## ✅ Pre-Testing Checklist

### 1. Database Schema Status
- [ ] Supabase project is accessible
- [ ] You have SQL Editor access
- [ ] You know your admin email (should be `dmhamilton1@live.com` or configured in code)

### 2. Application Status
- [ ] Dashboard loads at `charlestonhacks.github.io` or local dev server
- [ ] You can log in successfully
- [ ] Synapse graph is visible on dashboard
- [ ] Network visualization shows your profile

---

## 📋 Testing Phases

### **PHASE 1: Database Schema Setup** (5-10 minutes)

#### Step 1.1: Check if Schema Exists

Go to Supabase Dashboard → SQL Editor and run:

```sql
-- Check if theme tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'theme%'
ORDER BY table_name;
```

**Expected Result:**
- If you see 3 tables (`theme_actions`, `theme_circles`, `theme_participants`), schema is already applied → **Skip to Phase 2**
- If you see 0-2 tables or errors → Continue to Step 1.2

#### Step 1.2: Apply Schema

**Choose the right SQL file:**

| Situation | File to Use |
|-----------|-------------|
| Fresh start / No theme tables | `THEME_CIRCLES_SCHEMA_SAFE.sql` |
| Got "column does not exist" error | `THEME_CIRCLES_QUICKFIX.sql` |
| Partial tables exist | `THEME_CIRCLES_SCHEMA_SAFE.sql` |

**Execute:**
1. Open the chosen SQL file
2. Copy ALL contents (Ctrl+A, Ctrl+C)
3. Paste into Supabase SQL Editor
4. Click **RUN** (or Ctrl+Enter)
5. Wait for "Success" message

#### Step 1.3: Verify Installation

```sql
-- Should return 3 rows
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN ('theme_circles', 'theme_participants', 'theme_actions');

-- Check the view works (should return empty result initially)
SELECT * FROM active_themes_summary;
```

**Expected Result:**
```
theme_actions          (6 columns)
theme_circles          (13 columns)
theme_participants     (6 columns)
active_themes_summary  (0 rows initially)
```

✅ **Phase 1 Complete** if all tables exist with correct column counts.

---

### **PHASE 2: Create Demo Themes** (10 minutes)

#### Method A: Using SQL (Quick & Reliable)

Run this script to create 3 diverse demo themes:

```sql
-- Demo Theme 1: AI in Healthcare
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at
) VALUES (
  'AI in Healthcare',
  'Exploring applications of artificial intelligence in medical diagnostics, patient care, and health data analysis.',
  ARRAY['ai', 'healthcare', 'machine-learning', 'diagnostics'],
  NOW() + INTERVAL '14 days',
  'admin',
  3,
  NOW()
);

-- Demo Theme 2: Sustainable Technology
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at
) VALUES (
  'Sustainable Technology',
  'Building tech solutions for environmental challenges: renewable energy systems, carbon tracking, and eco-friendly products.',
  ARRAY['sustainability', 'environment', 'clean-tech', 'green-energy'],
  NOW() + INTERVAL '7 days',
  'admin',
  5,
  NOW()
);

-- Demo Theme 3: Web3 & Blockchain
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at
) VALUES (
  'Web3 & Blockchain',
  'Decentralized applications, smart contracts, NFTs, and the future of internet infrastructure.',
  ARRAY['web3', 'blockchain', 'cryptocurrency', 'defi', 'smart-contracts'],
  NOW() + INTERVAL '30 days',
  'admin',
  8,
  NOW()
);

-- Verify themes were created
SELECT id, title, tags,
       EXTRACT(DAY FROM (expires_at - NOW())) as days_remaining,
       activity_score,
       origin_type
FROM theme_circles
WHERE status = 'active'
ORDER BY created_at DESC;
```

**Expected Result:**
```
3 rows returned with:
- AI in Healthcare (14 days remaining, score: 3)
- Sustainable Technology (7 days remaining, score: 5)
- Web3 & Blockchain (30 days remaining, score: 8)
```

#### Method B: Using Admin UI

1. Log in to dashboard as admin (`dmhamilton1@live.com`)
2. Look for **Menu** button (bottom-right corner or similar)
3. Click **"Create Theme Circle"** or **"Theme Admin"**
4. Fill out the form:
   - **Title:** "AI in Healthcare"
   - **Description:** "Exploring AI applications in medical diagnostics"
   - **Tags:** "ai, healthcare, machine-learning"
   - **Duration:** 14 days
5. Click **Create**
6. Repeat for other demo themes

**Note:** If the UI uses prompts instead of a modal, that's the old version. SQL method is more reliable.

#### Step 2.2: Add Yourself as Participant (Optional but Recommended)

This helps test the visual connections:

```sql
-- First, find your community ID
SELECT id, name, email FROM community WHERE email = 'your-email@example.com';

-- Then add yourself to a theme (replace YOUR_ID and THEME_ID)
INSERT INTO theme_participants (
  theme_id,
  community_id,
  engagement_level,
  signals
) VALUES (
  'THEME_ID_HERE',  -- Use ID from previous query
  'YOUR_ID_HERE',   -- Your community.id
  'interested',
  ARRAY['exploring', 'has-expertise']
);
```

✅ **Phase 2 Complete** when you have 3 active themes in the database.

---

### **PHASE 3: Visual Verification on Dashboard** (10 minutes)

#### Step 3.1: Refresh Dashboard

1. Open `https://charlestonhacks.github.io/dashboard.html` (or your local URL)
2. **Hard refresh:** Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
3. Wait for Synapse graph to fully load

#### Step 3.2: Locate Theme Circles

**What to look for:**
- **Larger circles** (80-140px radius) among the smaller person nodes
- **Translucent cyan color** (#00e0ff with glow effect)
- **Dashed or solid borders** (dashed = emerging, solid = established)
- **Emoji/icon at top** (✨ by default)
- **Title text** in white, centered
- **Engagement count** below title (e.g., "3 engaged")
- **Time remaining** at bottom (e.g., "14d left")

**Positioning:**
- Themes should be near the center of the graph
- People nodes should be scattered around
- If you added yourself as participant, you should see a **cyan line** connecting you to the theme

#### Step 3.3: Test Hover Interaction

1. **Hover over a theme circle**
   - Border should brighten
   - Glow effect should intensify
   - Cursor should change to pointer

2. **Expected hover card/tooltip:**
   - Theme title (larger)
   - Description text
   - Tags as pills/badges
   - Participant count
   - Time remaining
   - "Signal Interest" button (if not participated yet)

#### Step 3.4: Test Click Interaction

1. **Click on a theme circle**
2. **Expected modal/card opens:**
   - Full theme details
   - List of participants with avatars
   - Engagement level options:
     - Interested 👀
     - Active 🔥
     - Proposing 💡
   - Signal buttons:
     - Available this week
     - Seeking collaborators
     - Has expertise
   - Close button (X)

#### Step 3.5: Test Gravity Effect (Advanced)

If you have 5+ users in your community:

1. Check your profile's skills/interests
2. Find a theme with overlapping tags
3. Observe if your node is **slightly closer** to that theme than to non-relevant themes
4. The pull should be subtle (2-6% force)

**How to test:**
- Open browser DevTools → Console
- Type: `window.synapseSimulation.nodes()`
- Look for `vx`, `vy` values (velocity toward themes)

---

### **PHASE 4: Interaction Testing** (15 minutes)

#### Test 4.1: Signal Interest

1. Click a theme you're **not** participating in
2. Click **"Signal Interest"** button
3. **Expected:**
   - Button changes to "Interested ✓"
   - Engagement count increases by 1
   - Connection line appears from your node to theme
   - Console shows: `✅ Signaled interest in theme`

**Verify in database:**
```sql
SELECT tp.engagement_level, tp.signals, c.name
FROM theme_participants tp
JOIN community c ON tp.community_id = c.id
JOIN theme_circles tc ON tp.theme_id = tc.id
WHERE tc.title = 'AI in Healthcare';
```

#### Test 4.2: Upgrade Engagement

1. Open a theme you're already interested in
2. Click **"Upgrade Engagement"** button
3. Select: **"Active"** or **"Leading"**
4. **Expected:**
   - Connection line color changes (gold for leading, bright cyan for active)
   - Engagement level updates
   - Activity score increases

#### Test 4.3: Admin Functions (Admin Only)

If logged in as admin:

1. Open **Menu** → **Theme Admin**
2. **Create new theme:**
   - Title: "Test Theme Delete Me"
   - Duration: 1 day
   - Tags: "test"
   - Click Create
3. **Expected:** Theme appears on graph within 2 seconds

4. Switch to **"Manage Existing"** tab
5. Find your test theme
6. Click **Archive** button
7. **Expected:** Theme fades out and disappears

**Verify:**
```sql
SELECT title, status FROM theme_circles WHERE title LIKE '%Test%';
-- Should show status = 'archived'
```

---

### **PHASE 5: Edge Case Testing** (10 minutes)

#### Test 5.1: Expired Theme Handling

Create a theme that expires in 1 minute:

```sql
INSERT INTO theme_circles (
  title, tags, expires_at, origin_type
) VALUES (
  'Test Expiring Theme',
  ARRAY['test'],
  NOW() + INTERVAL '1 minute',
  'admin'
);
```

Wait 2 minutes, then run:

```sql
SELECT decay_theme_circles();
```

**Expected:** Theme status changes to `'dissipated'` and disappears from graph.

#### Test 5.2: Multiple Participants

Add 2-3 users to same theme:

```sql
-- Replace IDs with real community.id values
INSERT INTO theme_participants (theme_id, community_id, engagement_level)
SELECT
  (SELECT id FROM theme_circles WHERE title = 'AI in Healthcare'),
  id,
  'interested'
FROM community
WHERE email IN ('user1@example.com', 'user2@example.com', 'user3@example.com')
ON CONFLICT (theme_id, community_id) DO NOTHING;
```

**Expected:**
- All 3 users show connection lines to theme
- Engagement count shows "6 engaged" (if it was 3 before)
- Hover card shows all participant avatars

#### Test 5.3: Theme with No Participants

Verify a brand new theme displays correctly:
- Should have dashed border (emerging state)
- "0 engaged" text
- Smaller radius (60-80px)
- Slightly dimmer glow

---

## 📊 Success Criteria Checklist

Mark each as complete when verified:

### Database Layer
- [ ] All 3 tables exist with correct schema
- [ ] Can insert themes via SQL successfully
- [ ] Can query `active_themes_summary` view
- [ ] Auto-decay function exists and runs
- [ ] RLS policies are in place (check `pg_policies`)

### JavaScript Layer
- [ ] Theme modules load without errors (check Console)
- [ ] Themes fetch from database on page load
- [ ] Theme nodes appear in `window.synapseSimulation.nodes()`
- [ ] Theme-participant links are created

### Visual Layer
- [ ] Theme circles render on Synapse graph
- [ ] Circles have correct styling (glow, border, colors)
- [ ] Time remaining and engagement count visible
- [ ] Lifecycle states display correctly (emerging vs established)

### Interaction Layer
- [ ] Hover shows tooltip/card
- [ ] Click opens detailed modal
- [ ] Signal interest button works
- [ ] Engagement upgrade works
- [ ] Connection lines appear/update

### Admin Layer
- [ ] Can create themes via admin UI or SQL
- [ ] Can view all themes in admin modal
- [ ] Can archive/delete themes
- [ ] Changes reflect immediately on graph

---

## 🐛 Troubleshooting

### Issue: "Table does not exist"
**Solution:** Run `THEME_CIRCLES_SCHEMA_SAFE.sql` from scratch.

### Issue: Themes don't appear on graph
**Checks:**
1. Console errors? (F12 → Console tab)
2. Network tab shows successful fetch from `theme_circles` table?
3. Run in console: `window.synapseSimulation?.nodes().filter(n => n.type === 'theme')`
4. Should return array with theme objects

**Common causes:**
- RLS policies blocking anonymous reads → Check policies
- Themes expired → Check `expires_at > NOW()`
- JavaScript error in render → Check Console

### Issue: "Permission denied" when querying
**Solution:** Check RLS policies:
```sql
-- View existing policies
SELECT * FROM pg_policies WHERE tablename = 'theme_circles';

-- If missing, add read policy:
CREATE POLICY "Allow public read" ON theme_circles FOR SELECT USING (true);
```

### Issue: Click does nothing
**Checks:**
1. Console: `typeof window.openThemeCard` → should be "function"
2. Event listeners attached? Inspect element → Event Listeners tab
3. Try: `window.openThemeCard({ title: 'Test' })` in console

### Issue: Gravity physics not working
**Expected behavior:** Very subtle! Only 2-6% force.
**Test:** Create theme with YOUR exact skills, should be slightly closer.

---

## 📈 Performance Benchmarks

| Metric | Target | How to Test |
|--------|--------|-------------|
| Theme load time | < 500ms | Network tab → `theme_circles` fetch |
| Render frame rate | 30+ FPS | Console: `window.synapseSimulation.fps` |
| Max themes on screen | 20+ | Add 20 themes, check performance |
| Physics simulation stable | No jitter | Observe node movement for 10s |

---

## 🎓 What You Should See

### Successful Test Summary:
- ✅ **3+ demo themes** visible as large circles on Synapse graph
- ✅ **Hover effects** working (glow, tooltip)
- ✅ **Click opens modal** with full details
- ✅ **Signal interest** creates connection line
- ✅ **Admin panel** loads and allows creation
- ✅ **Real-time updates** when themes change
- ✅ **No console errors** related to themes

### Visual Reference:

```
┌─────────────────────────────────────────────┐
│                 SYNAPSE GRAPH               │
│                                             │
│    👤 ←─────┐                              │
│              ┆    ╭─────────────────╮      │
│    👤 ←─────┼───→ │  ✨              │      │
│              ┆    │  AI in Healthcare │      │
│    👤 ←─────┘    │  3 engaged        │      │
│                   │  14d left         │      │
│                   ╰─────────────────╯      │
│                                             │
│         ╭─────────────────╮                │
│         │  ✨              │   👤           │
│         │  Web3 & Blockchain │             │
│         │  8 engaged        │              │
│         │  30d left         │              │
│         ╰─────────────────╯                │
└─────────────────────────────────────────────┘

Legend:
  👤 = User nodes
  ╭─╮ = Theme circles (larger, glowing)
  ←→ = Connection lines (cyan)
  ┆  = Dashed line (emerging theme)
  ─  = Solid line (established theme)
```

---

## 🚀 Next Steps After Testing

Once all tests pass:

1. **Create real themes** for your community
2. **Document for admins** - how to create/manage themes
3. **Monitor engagement** - check which themes get traction
4. **Iterate on tags** - refine to match community interests
5. **Enable auto-decay** - set up scheduled function
6. **Analytics** - track conversion rates

---

## 📝 Test Log Template

Copy this to track your testing session:

```
Date: ___________
Tester: ___________
Environment: [Production / Local]

PHASE 1 - Database Setup: [ PASS / FAIL ]
- Schema applied: [ YES / NO ]
- Tables count: ___ / 3
- Views working: [ YES / NO ]
- Issues: ___________

PHASE 2 - Demo Data: [ PASS / FAIL ]
- Themes created: ___ / 3
- SQL method: [ USED / SKIPPED ]
- UI method: [ USED / SKIPPED ]
- Issues: ___________

PHASE 3 - Visual Check: [ PASS / FAIL ]
- Themes visible: [ YES / NO ]
- Count on graph: ___
- Styling correct: [ YES / NO ]
- Issues: ___________

PHASE 4 - Interactions: [ PASS / FAIL ]
- Hover: [ WORKS / BROKEN ]
- Click: [ WORKS / BROKEN ]
- Signal interest: [ WORKS / BROKEN ]
- Admin functions: [ WORKS / BROKEN / NOT TESTED ]
- Issues: ___________

PHASE 5 - Edge Cases: [ PASS / FAIL ]
- Expiration: [ WORKS / BROKEN / NOT TESTED ]
- Multiple participants: [ WORKS / BROKEN / NOT TESTED ]
- Empty theme: [ WORKS / BROKEN / NOT TESTED ]
- Issues: ___________

OVERALL: [ PASS / FAIL ]
Notes: ___________
```

---

**Last Updated:** 2026-01-09
**Version:** 1.0
**Contact:** Check GitHub issues if you encounter problems
