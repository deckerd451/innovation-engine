# Theme-Project Integration Testing Guide

## 🎯 What Was Added

This integration allows:
- **Users** to assign new projects to theme circles when creating them
- **Admins** to manage which existing projects belong to which themes
- **Everyone** to see projects grouped by themes on the Synapse network

---

## 📋 Prerequisites

1. **Database migration applied**: Run `migrations/ADD_THEME_TO_PROJECTS.sql` in Supabase
2. **Active themes exist**: Have at least 1-2 demo themes from `DEMO_THEMES.sql`
3. **Projects exist OR ability to create**: Need projects to test with

---

## ✅ Testing Checklist

### Part 1: Database Migration (5 min)

#### Step 1: Apply Migration
```sql
-- In Supabase SQL Editor, run:
-- Copy/paste contents of migrations/ADD_THEME_TO_PROJECTS.sql
-- Click RUN
```

#### Step 2: Verify Schema
```sql
-- Check column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name = 'theme_id';

-- Expected result: 1 row showing theme_id, uuid, YES
```

#### Step 3: Test View
```sql
-- Check the helper view works
SELECT * FROM theme_projects_view LIMIT 5;

-- Expected: Shows themes with their projects (may be empty initially)
```

**✅ Pass Criteria**:
- [ ] theme_id column exists on projects table
- [ ] Foreign key to theme_circles is active
- [ ] theme_projects_view returns results without error

---

### Part 2: Creating Projects with Themes (10 min)

#### Test 2.1: Open Project Creation Form

1. Log in to dashboard
2. Click **Projects** button (or Menu → Projects)
3. Click **"+ New Project"** button
4. **Expected**: Form appears with all fields including theme dropdown

#### Test 2.2: Verify Theme Dropdown

1. Look for **"Associate with Theme Circle"** section
2. Open the dropdown
3. **Expected**:
   - First option: "No theme (standalone project)"
   - Followed by: List of active themes with tags
   - Example: "AI in Healthcare [ai, healthcare, machine-learning]"

Screenshot test:
```
✓ Dropdown shows active themes
✓ Each theme shows tags in brackets
✓ "No theme" option is first
```

#### Test 2.3: Create Project WITHOUT Theme

1. Fill in:
   - Name: "Standalone Project Test"
   - Description: "Testing unassigned project"
   - Skills: "testing"
   - Theme: *Leave as "No theme"*
2. Click **"Create Project"**
3. **Expected**:
   - Success message
   - Project appears in projects list
   - No theme association

**Verify in database:**
```sql
SELECT title, theme_id FROM projects WHERE title LIKE '%Standalone%';
-- Expected: theme_id should be NULL
```

#### Test 2.4: Create Project WITH Theme

1. Click "+ New Project" again
2. Fill in:
   - Name: "AI Diagnostic Tool"
   - Description: "Machine learning for medical diagnosis"
   - Skills: "python, tensorflow, healthcare"
   - Theme: **Select "AI in Healthcare"** (or any active theme)
3. Click **"Create Project"**
4. **Expected**:
   - Success message
   - Project created

**Verify in database:**
```sql
SELECT p.title, p.theme_id, tc.title as theme_title
FROM projects p
LEFT JOIN theme_circles tc ON p.theme_id = tc.id
WHERE p.title LIKE '%Diagnostic%';

-- Expected: Shows project with theme_id populated and theme_title visible
```

**✅ Pass Criteria**:
- [ ] Dropdown loads active themes
- [ ] Can create project without theme (theme_id = NULL)
- [ ] Can create project with theme (theme_id populated)
- [ ] Projects appear in projects list after creation

---

### Part 3: Admin Project Management (15 min)

#### Test 3.1: Open Theme Admin

1. As admin, open **Menu** (bottom-right or similar)
2. Click **"Manage Theme Circles"**
3. Switch to **"Manage Existing"** tab
4. **Expected**: See all themes with new "Projects" section

#### Test 3.2: View Project Count

1. Look at each theme card
2. Find the **Projects section** (with lightbulb icon 💡)
3. **Expected**:
   - Shows "Projects: X" count
   - Lists up to 3 project names
   - Shows "...and N more" if >3 projects
   - Shows "No projects assigned yet" if none

Screenshot test:
```
Theme card should show:
┌─────────────────────────────────┐
│ AI in Healthcare        14d left│
│ [tags here]                     │
│ ┌─────────────────────────────┐ │
│ │ 💡 Projects: 2      [Manage]│ │
│ │ • AI Diagnostic Tool        │ │
│ │ • Medical Chatbot           │ │
│ └─────────────────────────────┘ │
│ [Edit] [Extend] [Archive]       │
└─────────────────────────────────┘
```

#### Test 3.3: Open Project Management

1. Click **"Manage"** button on a theme with 0 projects
2. **Expected**: Prompt dialog appears showing:
   ```
   Managing projects for: [Theme Name]

   ASSIGNED PROJECTS (0):
   (none)

   AVAILABLE PROJECTS (2):
   1. Standalone Project Test
   2. AI Diagnostic Tool

   Options:
   - Type "assign <number>" to assign an available project
   - Type "remove <number>" to unassign an assigned project
   - Click Cancel to close
   ```

#### Test 3.4: Assign Project to Theme

1. In the prompt, type: `assign 1`
2. Press OK/Enter
3. **Expected**:
   - Toast notification: "✓ Assigned: [Project Name]"
   - Theme card updates showing new project count
   - Project appears in assigned list

**Verify in database:**
```sql
SELECT p.title, tc.title as theme
FROM projects p
JOIN theme_circles tc ON p.theme_id = tc.id
WHERE p.title LIKE '%Standalone%';

-- Expected: Shows the project now linked to the theme
```

#### Test 3.5: Remove Project from Theme

1. Click "Manage" on a theme with assigned projects
2. See project listed under ASSIGNED PROJECTS
3. Type: `remove 1` (number of first assigned project)
4. Press OK
5. **Expected**:
   - Toast: "✓ Removed: [Project Name]"
   - Project count decreases
   - Project moves back to "available" list

**Verify in database:**
```sql
SELECT title, theme_id FROM projects WHERE title = '[Project Name]';
-- Expected: theme_id is NULL again
```

#### Test 3.6: Manage Multiple Projects

1. Assign 3-4 projects to one theme
2. **Expected**: Theme card shows "...and X more" if >3 projects
3. Click "Manage" - all assigned projects should be listed
4. Remove one project
5. Assign a different one
6. **Expected**: Changes reflect immediately

**✅ Pass Criteria**:
- [ ] Theme cards show project count
- [ ] "Manage" button opens project management prompt
- [ ] Can assign available projects
- [ ] Can remove assigned projects
- [ ] UI updates immediately after changes
- [ ] Database reflects assignment changes

---

### Part 4: Synapse Network Visualization (10 min)

#### Test 4.1: View Assigned Projects on Graph

1. Refresh dashboard (Ctrl+Shift+R)
2. Wait for Synapse graph to load
3. Find a theme circle with assigned projects
4. **Click the theme circle**
5. **Expected**:
   - Graph zooms/focuses on the theme
   - Explicitly assigned projects stay **bright/highlighted**
   - Tag-matched projects also shown (if any)
   - Theme panel opens showing project list

#### Test 4.2: Verify Explicit vs Tag-Match Priority

Setup:
- Have 1 project explicitly assigned to "AI in Healthcare"
- Have 1 project with AI tags but NOT assigned

Expected behavior when clicking theme:
- Explicitly assigned project: **Full brightness (opacity: 1.0)**
- Tag-matched project: Also visible but should be same brightness

Both should show because the code uses OR logic (explicit OR tag-match).

#### Test 4.3: Project with No Theme

1. Create a project with no theme and no matching tags
2. Click various themes
3. **Expected**:
   - Project stays dimmed (opacity: 0.2)
   - Never highlighted for any theme
   - Only visible when no theme is focused

**✅ Pass Criteria**:
- [ ] Clicking theme shows assigned projects
- [ ] Explicitly assigned projects are prioritized
- [ ] Tag-matching still works as fallback
- [ ] Unassigned projects with no tags stay dimmed

---

### Part 5: Edge Cases & Validation (10 min)

#### Edge Case 1: Deleting Theme
```sql
-- Test what happens to assigned projects
DELETE FROM theme_circles WHERE title = 'Test Theme';

-- Check projects:
SELECT title, theme_id FROM projects WHERE theme_id IS NOT NULL;

-- Expected: Projects with deleted theme now have theme_id = NULL (ON DELETE SET NULL)
```

#### Edge Case 2: Project Assigned to Expired Theme

1. Create theme expiring in 1 minute
2. Assign project to it
3. Wait for expiration
4. **Expected**:
   - Project still exists
   - theme_id still points to expired theme
   - Project won't show in active theme filters
   - Admin can reassign to active theme

#### Edge Case 3: Multiple Themes with Same Project?

Try to assign one project to two themes:
```sql
-- This should only be possible by manually setting theme_id
-- UI only allows one theme per project

UPDATE projects SET theme_id = '[theme2-id]' WHERE id = '[project-id]';

-- Project is now assigned to theme2, removed from theme1 (only 1 theme_id)
```

Expected: **One project can only be assigned to ONE theme** (by design).

#### Edge Case 4: Non-Admin Trying to Manage

1. Log in as non-admin user
2. Open Menu
3. **Expected**: "Manage Theme Circles" button is **NOT visible** or shows "Admin access required"

**✅ Pass Criteria**:
- [ ] Projects gracefully handle theme deletion
- [ ] Can reassign projects from expired themes
- [ ] Projects limited to one theme at a time
- [ ] Non-admins cannot access theme management

---

## 🐛 Troubleshooting

### Issue: Dropdown doesn't show themes

**Check:**
1. Are there active themes? Run: `SELECT COUNT(*) FROM theme_circles WHERE status = 'active' AND expires_at > NOW();`
2. Console errors? Open F12 → Console
3. Supabase RLS policies allow reading theme_circles?

**Fix:**
```sql
-- Add read policy if missing
CREATE POLICY "Allow public read" ON theme_circles
FOR SELECT USING (true);
```

### Issue: "column theme_id does not exist"

**Fix:** Run the migration again:
```bash
migrations/ADD_THEME_TO_PROJECTS.sql
```

### Issue: Can't assign projects (nothing happens)

**Check:**
1. Admin access granted? Look for "Admin access granted" in console
2. Projects exist and are active?
3. Network tab shows successful POST to projects table?

**Debug:**
```javascript
// In browser console:
window.supabase.from('projects').update({ theme_id: null }).eq('id', 'PROJECT_ID');
```

### Issue: Theme shows wrong project count

**Fix:** Reload themes in admin:
1. Close and reopen "Manage Theme Circles"
2. Or refresh page (Ctrl+R)

---

## 📊 Success Metrics

| Test | Expected Behavior | Status |
|------|-------------------|--------|
| DB Migration | theme_id column exists | ⬜ |
| Create without theme | theme_id = NULL | ⬜ |
| Create with theme | theme_id populated | ⬜ |
| Admin view count | Shows correct number | ⬜ |
| Assign project | Updates in DB | ⬜ |
| Remove project | Sets theme_id = NULL | ⬜ |
| Synapse highlights | Assigned projects bright | ⬜ |
| Tag fallback | Tag-matched also shown | ⬜ |

---

## 🎯 Complete Test Scenario

**End-to-End Flow:**

1. **Setup** (Admin):
   - Run migration
   - Create theme: "AI in Healthcare"
   - Verify in admin panel

2. **User Creates Project**:
   - User opens Projects modal
   - Creates "Medical AI Chatbot"
   - Selects "AI in Healthcare" theme
   - Submits

3. **Admin Manages**:
   - Opens theme admin
   - Sees "AI in Healthcare" has 1 project
   - Clicks "Manage"
   - Creates another project (standalone)
   - Assigns it to the theme
   - Now shows 2 projects

4. **Network View**:
   - User refreshes dashboard
   - Clicks "AI in Healthcare" theme circle
   - Both projects highlight
   - Panel shows both in list

5. **Cleanup**:
   - Admin removes one project assignment
   - Project returns to unassigned state
   - Still visible in general projects list

**✅ If all steps work: Integration is successful!**

---

## 📝 SQL Queries for Manual Testing

### View all theme-project relationships:
```sql
SELECT
  tc.title as theme,
  p.title as project,
  p.status as project_status
FROM theme_circles tc
LEFT JOIN projects p ON p.theme_id = tc.id
WHERE tc.status = 'active'
ORDER BY tc.title, p.title;
```

### Find unassigned projects:
```sql
SELECT title, status, created_at
FROM projects
WHERE theme_id IS NULL
  AND status IN ('active', 'in-progress', 'open')
ORDER BY created_at DESC;
```

### Count projects per theme:
```sql
SELECT
  tc.title,
  tc.status,
  COUNT(p.id) as project_count
FROM theme_circles tc
LEFT JOIN projects p ON p.theme_id = tc.id
GROUP BY tc.id, tc.title, tc.status
ORDER BY project_count DESC;
```

### Assign project manually:
```sql
-- Replace IDs with actual values
UPDATE projects
SET theme_id = '[THEME_UUID]'
WHERE id = '[PROJECT_UUID]';
```

### Remove assignment manually:
```sql
UPDATE projects
SET theme_id = NULL
WHERE id = '[PROJECT_UUID]';
```

---

## 🚀 Next Steps After Testing

Once all tests pass:

1. **Document for users**: Add guide on how to use theme selection
2. **Train admins**: Show them project management interface
3. **Monitor usage**: Track which themes get the most projects
4. **Iterate**: Gather feedback on the assignment workflow

---

**Testing Version:** 1.0
**Last Updated:** 2026-01-09
**Compatible With:** Theme Circles v2.0+
