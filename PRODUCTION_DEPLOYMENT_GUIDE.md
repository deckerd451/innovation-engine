# CharlestonHacks Innovation Engine - Production Deployment Guide

## 🚀 Deployment Checklist

This guide will take your CharlestonHacks platform from 95% to 100% production-ready.

---

## Prerequisites

- ✅ Supabase project created
- ✅ Domain configured
- ✅ OAuth providers configured (GitHub, Google)
- ✅ Database backups enabled

---

## Step 1: Run Database Migrations (CRITICAL)

These SQL scripts must be run **in order** in your Supabase SQL Editor.

### 1.1 Messaging System Setup

**File**: `supabase-messaging-setup.sql`
**Purpose**: Creates conversations and messages tables with correct schema and RLS policies

```bash
# What this creates:
- conversations table (participant_1_id, participant_2_id as community.id)
- messages table (sender_id as auth.users.id)
- RLS policies for conversations (SELECT, INSERT, UPDATE)
- RLS policies for messages (SELECT, INSERT, UPDATE)
- Helper functions: get_or_create_conversation(), get_unread_count()
- Triggers: auto-update conversation last_message
```

**Run in**: Supabase SQL Editor → New Query → Paste → Run

---

### 1.2 Engagement & Gamification System

**File**: `supabase-engagement-setup.sql`
**Purpose**: Adds XP, levels, streaks, quests, achievements, and leaderboards

```bash
# What this creates:
- Adds columns to community table (xp, level, login_streak, last_login, etc.)
- activity_log table (tracks all user actions)
- achievements table (11 pre-loaded badges)
- user_achievements table (earned achievements)
- daily_quests table (3 quests per day)
- leaderboard materialized view (top 100 users by XP)
- RLS policies for all new tables
- Functions: award_xp(), check_daily_login(), update_quest_progress()
- Triggers: auto-award XP for connections, endorsements, projects
```

**Run in**: Supabase SQL Editor → New Query → Paste → Run

---

### 1.3 Fix Existing Conversations (Data Migration)

**File**: `fix-conversations-complete.sql`
**Purpose**: Fixes any existing conversations that have wrong participant IDs

```bash
# What this fixes:
1. Drops old foreign key constraints
2. Converts participant IDs from auth.users(id) → community(id)
3. Deletes orphaned conversations
4. Recreates foreign key constraints correctly
5. Verifies all conversations are valid
```

**Run in**: Supabase SQL Editor → New Query → Paste → Run

**Note**: Safe to run even if you have no existing conversations. It will just skip the updates.

---

### 1.4 Fix RLS Policies (Final Fix)

**File**: `fix-conversations-rls.sql`
**Purpose**: Ensures RLS policies are correctly set up for conversations

```bash
# What this fixes:
- Drops and recreates all RLS policies on conversations table
- Ensures policies check community.id (not auth.users.id)
- Allows users to view/create/update conversations they're part of
```

**Run in**: Supabase SQL Editor → New Query → Paste → Run

---

## Step 2: Verify Database Schema

After running all migrations, verify your schema:

### 2.1 Check Tables Exist

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

**Expected tables**:
- achievements
- activity_log
- bbs_messages
- community
- connections
- conversations
- daily_quests
- endorsements
- leaderboard (materialized view)
- messages
- project_join_requests
- project_members
- projects
- user_achievements

---

### 2.2 Check Foreign Keys

```sql
SELECT
  con.conname AS constraint_name,
  rel.relname AS table_name,
  att.attname AS column_name,
  frel.relname AS references_table
FROM pg_constraint con
JOIN pg_class rel ON con.conrelid = rel.oid
JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
LEFT JOIN pg_class frel ON con.confrelid = frel.oid
WHERE rel.relname IN ('conversations', 'messages', 'activity_log', 'user_achievements')
  AND con.contype = 'f'
ORDER BY rel.relname, con.conname;
```

**Expected for conversations**:
- `conversations_participant_1_id_fkey` → `community`
- `conversations_participant_2_id_fkey` → `community`

**Expected for messages**:
- `messages_conversation_id_fkey` → `conversations`
- `messages_sender_id_fkey` → `auth.users` (NOTE: not community!)

---

### 2.3 Check RLS Policies

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN ('conversations', 'messages', 'community', 'activity_log')
ORDER BY tablename, policyname;
```

**Expected policies**:
- **conversations**: `Users can view conversations they are part of` (SELECT)
- **conversations**: `Users can create conversations` (INSERT)
- **conversations**: `Users can update their conversations` (UPDATE)
- **messages**: `Users can view messages in their conversations` (SELECT)
- **messages**: `Users can send messages in their conversations` (INSERT)
- **messages**: `Users can update their own messages` (UPDATE)

---

## Step 3: Test Critical User Flows

### 3.1 Authentication Flow
1. Open incognito browser
2. Navigate to your domain
3. Click "Sign In with GitHub" (or Google)
4. Complete OAuth flow
5. **Expected**: Redirected to dashboard with profile created
6. **Check**: Console for errors
7. **Check**: Profile appears in community table

---

### 3.2 Onboarding Flow
1. As new user, land on dashboard
2. **Expected**: Onboarding modal appears with 5 steps
3. Click through all steps
4. **Expected**: Modal closes, onboarding marked complete in localStorage
5. Reload page
6. **Expected**: Onboarding does NOT appear again

---

### 3.3 Connection Flow
1. Click on a user node in the network graph
2. **Expected**: Node panel slides in from right
3. Click "Connect" button
4. **Expected**:
   - Button changes to "Withdraw"
   - Toast notification appears
   - XP awarded (+10 XP)
   - Quest progress updated (if daily quest active)
5. **Check**: Connection appears in database with status='pending'

---

### 3.4 Messaging Flow (CRITICAL)
1. Click "Messages" button in bottom stats bar
2. **Expected**: Messages modal opens
3. Click on a connection
4. **Expected**: Conversation loads (or creates new conversation)
5. Type message "Test message"
6. Click Send
7. **Expected**:
   - Message appears in conversation
   - No RLS errors in console
   - Message appears in database
8. **Check**: `messages` table has new row with correct `sender_id` (auth user ID)
9. **Check**: `conversations` table updated with `last_message_preview`

---

### 3.5 Daily Engagement Flow
1. Login in the morning (or set last_login to yesterday in DB)
2. **Expected**: Daily Check-In modal appears
3. **Check**:
   - Login streak incremented
   - XP awarded (+10 XP)
   - Daily quests displayed (3 quests)
4. Complete a quest (e.g., "View 3 profiles")
5. **Expected**: Quest progress updates in modal
6. **Check**: `daily_quests` table updated
7. **Check**: XP awarded when quest completed (+25 XP)

---

### 3.6 Project Flow
1. Click "Projects" button in bottom stats bar
2. Click "Create Project"
3. Fill in form:
   - Name: "Test Project"
   - Description: "Testing project creation"
   - Skills: "JavaScript, React"
4. Click Create
5. **Expected**:
   - Project created
   - You auto-added as creator and first member
   - XP awarded (+50 XP)
6. **Check**: `projects` and `project_members` tables updated

---

### 3.7 Endorsement Flow
1. Open a connection's profile
2. Click "Endorse" button
3. Select a skill from dropdown
4. Click "Endorse"
5. **Expected**:
   - Endorsement created
   - XP awarded to you (+5 XP) and them (+10 XP)
   - Quest progress updated
6. **Check**: `endorsements` table has new row

---

## Step 4: Performance & Security Checks

### 4.1 Console Errors
**Acceptance**: ≤ 3 non-critical warnings

Run through all flows and check browser console. Address any errors:
- ❌ Red errors = MUST FIX
- ⚠️ Yellow warnings = review and fix if possible
- ℹ️ Blue info = informational, OK to ignore

---

### 4.2 Database Query Performance

```sql
-- Check slow queries (run in Supabase Dashboard → Database → Logs)
SELECT
  calls,
  total_time,
  mean_time,
  query
FROM pg_stat_statements
WHERE mean_time > 100  -- queries taking > 100ms
ORDER BY mean_time DESC
LIMIT 20;
```

**Acceptance**: No queries > 500ms for basic operations

---

### 4.3 RLS Policy Verification

Test that RLS policies are working:

**Test 1: Cannot view other users' private data**
```sql
-- As User A, try to view User B's activity log
SELECT * FROM activity_log WHERE community_id = '<user_b_community_id>';
```
**Expected**: Empty result (RLS blocks it)

**Test 2: Cannot send messages in conversations you're not part of**
```sql
-- As User A, try to insert message in User B & C conversation
INSERT INTO messages (conversation_id, sender_id, content)
VALUES ('<conversation_bc_id>', '<user_a_auth_id>', 'Test');
```
**Expected**: RLS policy violation error

**Test 3: Cannot modify other users' achievements**
```sql
-- As User A, try to award achievement to User B
INSERT INTO user_achievements (user_id, community_id, achievement_id)
VALUES ('<user_b_auth_id>', '<user_b_community_id>', '<achievement_id>');
```
**Expected**: RLS policy violation error

---

## Step 5: Production Configuration

### 5.1 Environment Variables

Ensure these are set in production:

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# OAuth (set in Supabase Dashboard → Authentication → Providers)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Redirect URLs (set in OAuth provider settings)
GITHUB_REDIRECT=https://your-domain.com/dashboard.html
GOOGLE_REDIRECT=https://your-domain.com/dashboard.html
```

---

### 5.2 Supabase Configuration

**In Supabase Dashboard**:

1. **Authentication → URL Configuration**
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/*`

2. **Authentication → Email Templates**
   - Customize email templates with your branding

3. **Database → Backups**
   - Enable daily backups
   - Set retention to 30 days

4. **API → Settings**
   - Enable auto-refresh for materialized views (leaderboard)

5. **Storage → New Bucket** (for user avatars)
   - Name: `avatars`
   - Public: Yes
   - File size limit: 5MB
   - Allowed MIME types: `image/png, image/jpeg, image/webp`

---

## Step 6: Monitoring & Analytics

### 6.1 Set Up Monitoring

**Key Metrics to Track**:
- Daily Active Users (DAU)
- New signups per day
- Connection requests sent
- Messages sent
- Projects created
- Average session duration
- User retention (Day 1, Day 7, Day 30)

**Query for DAU**:
```sql
SELECT
  date_trunc('day', last_login) as date,
  COUNT(DISTINCT user_id) as daily_active_users
FROM community
WHERE last_login >= NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;
```

---

### 6.2 Error Tracking

Set up error tracking service (optional but recommended):
- Sentry
- LogRocket
- Rollbar

Add snippet to `dashboard.html` before `</body>`:

```html
<!-- Error Tracking -->
<script src="https://js.sentry-cdn.com/your-dsn.min.js" crossorigin="anonymous"></script>
<script>
  Sentry.init({
    dsn: 'https://your-dsn@sentry.io/project-id',
    environment: 'production',
    release: 'v1.0.0'
  });
</script>
```

---

## Step 7: Launch Preparation

### 7.1 Pre-Launch Checklist

- [ ] All SQL migrations run successfully
- [ ] All critical user flows tested
- [ ] Console has ≤ 3 non-critical warnings
- [ ] RLS policies verified
- [ ] OAuth providers configured
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Database backups enabled
- [ ] Error tracking configured
- [ ] Analytics configured
- [ ] Email templates customized
- [ ] Terms of Service page created
- [ ] Privacy Policy page created
- [ ] Help/Support page created

---

### 7.2 Soft Launch (Day 1-7)

**Invite 10-20 beta users**:
1. Monitor console for errors
2. Watch Supabase logs for RLS violations
3. Track user behavior (which features used most)
4. Gather feedback via in-app feedback button
5. Fix any critical bugs within 24 hours

---

### 7.3 Public Launch (Day 8+)

**Announce to full community**:
1. Send email blast to waitlist
2. Post on social media
3. Monitor for 48 hours continuously
4. Scale Supabase plan if needed (check Database tab for performance)

---

## Step 8: Post-Launch Maintenance

### 8.1 Daily Tasks
- Check error logs (Supabase Dashboard → Logs)
- Monitor user signups
- Respond to support requests

---

### 8.2 Weekly Tasks
- Review analytics dashboard
- Check query performance
- Update leaderboard materialized view:
  ```sql
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard;
  ```
- Database vacuum (Supabase does this automatically)

---

### 8.3 Monthly Tasks
- Review and optimize slow queries
- Clean up orphaned data
- Update dependencies
- Security audit

---

## Common Issues & Fixes

### Issue 1: "Row violates RLS policy for table 'messages'"

**Cause**: RLS policies not set up correctly
**Fix**: Run `fix-conversations-rls.sql`

---

### Issue 2: "Table 'activity_log' does not exist"

**Cause**: Engagement migration not run
**Fix**: Run `supabase-engagement-setup.sql`

---

### Issue 3: "Duplicate key value violates unique constraint"

**Cause**: User trying to perform action twice
**Fix**: Already handled in code with `.maybeSingle()` and error catching

---

### Issue 4: OAuth redirect fails

**Cause**: Redirect URL not whitelisted
**Fix**: Add to Supabase Dashboard → Authentication → URL Configuration

---

### Issue 5: XP not awarded after action

**Cause**: Database trigger not fired or activity_log insert failed
**Fix**: Check `activity_log` table for errors, verify triggers exist:
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public';
```

---

## Rollback Plan

If critical issues arise after deployment:

### Step 1: Immediate Response
1. **Disable new signups**: Supabase Dashboard → Authentication → Disable Sign-ups
2. **Show maintenance page**: Add banner to `dashboard.html`

---

### Step 2: Rollback Database
```sql
-- Rollback engagement tables (if needed)
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS daily_quests CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP MATERIALIZED VIEW IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;

-- Remove engagement columns from community
ALTER TABLE community
  DROP COLUMN IF EXISTS xp,
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS login_streak,
  DROP COLUMN IF EXISTS last_login;
```

---

### Step 3: Rollback Code
```bash
# Revert to previous commit
git revert <commit-hash>
git push origin main --force
```

---

## Support & Contact

For deployment issues:
- **Supabase Support**: support@supabase.io
- **CharlestonHacks Team**: [your-email]
- **GitHub Issues**: https://github.com/Charlestonhacks/charlestonhacks.github.io/issues

---

## Summary

After completing all steps, your CharlestonHacks Innovation Engine will be:

✅ **Fully functional** with all 15+ features working
✅ **Production-ready** with proper security (RLS policies)
✅ **Scalable** with optimized queries and indexes
✅ **Monitored** with error tracking and analytics
✅ **Maintainable** with clear documentation

**Estimated deployment time**: 2-3 hours
**Recommended deployment window**: Off-peak hours (late night/weekend)

Good luck with your launch! 🚀
