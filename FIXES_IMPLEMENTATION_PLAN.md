# UI/UX Fixes Implementation Plan

## Summary of Issues & Solutions

### 1. UI/UX Bugs

#### ✅ Blue Bar on Profile Pages
**Issue**: Blue bar overlapping profile information
**Location**: Likely CSS issue in profile modal or engine.css
**Fix**: Remove/adjust z-index and positioning of overlapping elements

#### ✅ Projects Info Panel Not Scrollable
**Issue**: Project details panel in node-panel.js lacks scrolling
**Location**: `assets/js/node-panel.js` - project panel rendering
**Fix**: Add `overflow-y: auto` and `max-height` to project details container

#### ✅ Project Members Not Clickable
**Issue**: Project member names should open profiles
**Location**: `assets/js/node-panel.js` - member list rendering
**Fix**: Add onclick handlers to member names

#### ✅ Logout Button Missing
**Issue**: Logout button exists but may not be visible
**Location**: `dashboard.html` - dropdown menu has logout, but visibility issue
**Fix**: Ensure logout button is properly displayed in user dropdown

#### ✅ Notification Bell Not Working
**Issue**: No visual indicator for unread messages
**Location**: Dashboard header - notification bell needs badge
**Fix**: Add notification bell icon with unread count badge in header

### 2. Profile & Identity

#### ✅ Avatar Upload (JPEG not URL)
**Issue**: Currently using image_url text field
**Location**: `profile.js` - profile editor
**Fix**: Add file upload input with Supabase Storage integration

#### ✅ Level Calculation Fix
**Issue**: Hardcoded "Level 6 Leader" in node-panel.js
**Location**: `assets/js/node-panel.js` line 674, `assets/js/daily-engagement.js`
**Fix**: Calculate level from XP dynamically

#### ✅ Streak Calculation Fix
**Issue**: Hardcoded "25 Day Streak" in node-panel.js
**Location**: `assets/js/node-panel.js` line 682, `assets/js/daily-engagement.js`
**Fix**: Calculate streak from daily_engagement table

### 3. Recommendations & Discovery

#### ✅ START Recommendations Not Working
**Issue**: "Your focus today" not producing suggestions
**Location**: START sequence SQL function and UI
**Fix**: Verify SQL function returns data, fix UI rendering

#### ✅ Theme Circles Not Working
**Issue**: Theme circles not displaying/functioning
**Location**: `assets/js/synapse/themes.js` or core.js
**Fix**: Restore theme circle rendering in synapse view

#### ✅ Non-Admin Synapse View
**Issue**: Should show only recommended nodes for non-admins
**Location**: `assets/js/synapse/core.js` - data filtering
**Fix**: Add admin check and filter nodes based on recommendations

#### ✅ "Why Recommended" Icon
**Issue**: Missing explanation for recommendations
**Location**: Node rendering in synapse
**Fix**: Add info icon with tooltip explaining recommendation logic

#### ✅ Skill Click → People List
**Issue**: Clicking required skill should show people with that skill
**Location**: Project panel and skill rendering
**Fix**: Add onclick handler to skills that opens filtered people list

### 4. Projects

#### ✅ "View Full Details" → "Withdraw Request"
**Issue**: Button text and functionality mismatch
**Location**: `assets/js/node-panel.js` line 1048
**Fix**: Check if user has pending request, show appropriate button

#### ✅ "Created by" Clickable
**Issue**: Project creator name should open profile
**Location**: Project rendering in node-panel.js
**Fix**: Add onclick handler to creator name

### 5. Organizations

#### ✅ "Join Organization" → Request to Join
**Issue**: Currently auto-joins, should submit request
**Location**: `assets/js/dashboard-actions.js` line 2830
**Fix**: Change status to 'pending' instead of 'active'

#### ✅ Notify Organization Owner
**Issue**: Owner should be notified of join requests
**Location**: joinOrganization function
**Fix**: Create notification entry for organization owner

---

## Database Schema Changes Required

```sql
-- 1. Add avatar storage column (if not exists)
ALTER TABLE community ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

-- 2. Add XP and level tracking (if not exists)
ALTER TABLE community ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;
ALTER TABLE community ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- 3. Add streak tracking (if not exists)
ALTER TABLE community ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE community ADD COLUMN IF NOT EXISTS last_activity_date DATE;

-- 4. Add project request tracking
CREATE TABLE IF NOT EXISTS project_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES community(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- 5. Update organization_members to support pending status
-- (Already has status column, just ensure it's used correctly)

-- 6. Add notifications table (if not exists)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES community(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'connection_request', 'project_invite', 'org_join_request', etc.
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
```

---

## Frontend Logic Changes by File

### `profile.js`
- Add file upload input for avatar
- Integrate with Supabase Storage
- Upload to `avatars/{user_id}/{filename}`
- Store path in `avatar_storage_path` column
- Fallback to `image_url` for backward compatibility

### `assets/js/node-panel.js`
- Line 674: Replace hardcoded level with dynamic calculation
- Line 682: Replace hardcoded streak with dynamic calculation
- Line 1048: Change "View Full Details" to "Withdraw Request" conditionally
- Add onclick handlers to project creator names
- Add onclick handlers to project member names
- Add onclick handlers to required skills
- Add scrolling to project details panel

### `assets/js/dashboard-actions.js`
- Line 2830: Modify `joinOrganization` to set status='pending'
- Add notification creation for organization owner
- Add toast feedback for request submission

### `dashboard.html`
- Add notification bell icon in header
- Ensure logout button is visible in dropdown
- Add unread count badge to notification bell

### `assets/js/synapse/core.js`
- Add admin check for node filtering
- Filter nodes based on user recommendations for non-admins
- Add "why recommended" tooltip to nodes

### `assets/js/start-sequence-report.js`
- Verify recommendation logic
- Ensure SQL function returns proper data
- Fix UI rendering of recommendations

### `assets/css/engine.css` or `dashboard.css`
- Remove blue bar overlay from profile pages
- Fix z-index conflicts

---

## Edge Cases to Test

1. **Avatar Upload**
   - Large file sizes (>5MB)
   - Invalid file types (non-images)
   - Upload failures
   - Missing Supabase Storage bucket

2. **Level/Streak Calculation**
   - New users with 0 XP
   - Users with no activity history
   - Streak breaks (missed days)

3. **Organization Join Requests**
   - Organization with no owner
   - Multiple pending requests
   - Request after being rejected
   - Notification delivery failures

4. **Project Requests**
   - Project creator viewing own project
   - Multiple requests to same project
   - Project deleted while request pending

5. **Recommendations**
   - Users with no skills/interests
   - Empty recommendation results
   - Admin vs non-admin views

6. **Notification Bell**
   - No unread notifications
   - Large unread counts (>99)
   - Real-time updates

7. **Clickable Elements**
   - Deleted users/projects
   - Missing profile data
   - Circular navigation loops

---

## Implementation Priority

### Phase 1: Critical Fixes (Do First)
1. ✅ Logout button visibility
2. ✅ Notification bell with unread count
3. ✅ Blue bar removal
4. ✅ Projects panel scrolling

### Phase 2: Profile & Identity
5. ✅ Avatar upload (JPEG)
6. ✅ Level calculation
7. ✅ Streak calculation

### Phase 3: Interactions
8. ✅ Project members clickable
9. ✅ "Created by" clickable
10. ✅ Skills clickable
11. ✅ "View Full Details" → "Withdraw Request"

### Phase 4: Organizations
12. ✅ Join organization → request
13. ✅ Notify organization owner

### Phase 5: Recommendations
14. ✅ START recommendations fix
15. ✅ Theme circles restore
16. ✅ Non-admin synapse filtering
17. ✅ "Why recommended" icon

---

## Testing Checklist

- [ ] Logout button visible and functional
- [ ] Notification bell shows unread count
- [ ] No blue bar on profile pages
- [ ] Projects panel scrolls properly
- [ ] Avatar upload works (JPEG)
- [ ] Level displays correctly
- [ ] Streak displays correctly
- [ ] Project members open profiles
- [ ] Project creator opens profile
- [ ] Skills show people list
- [ ] "Withdraw Request" shows when applicable
- [ ] Join organization creates request
- [ ] Organization owner receives notification
- [ ] START shows recommendations
- [ ] Theme circles display
- [ ] Non-admin sees filtered nodes
- [ ] Recommendation explanations visible
