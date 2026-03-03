# Final Execution Plan - All Files Ready

All SQL files are complete and ready to run. Execute them in this order:

## ✅ Step 1: Enable RLS on Tables with Existing Policies
**File:** `fix-database-security.sql`

**What it does:** Enables RLS on 15 tables that already have policies

**Tables affected:**
- bbs_channels
- bbs_messages
- cynq_team_members
- cynq_teams
- endorsements
- idea_comments
- idea_upvotes
- ideas
- profiles
- project_bids
- project_comments
- project_upvotes
- skills
- team_members
- zork_saves

**Status:** ✅ Ready to run - No errors expected

---

## ✅ Step 2: Enable RLS and Create Policies for Remaining Tables
**File:** `fix-database-security-step2.sql`

**What it does:** Enables RLS and creates policies for 14 tables without existing policies

**Tables affected:**
- signals (public read, service role manages)
- skill_colors (public read, service role manages)
- bbs_presence (public read, users manage by username)
- client_errors (anyone inserts, service role reads)
- community_backup_pre_oauth_migration (service role only)
- achievements (public read, service role manages)
- bbs_online (public read, users manage by username)
- feedback (anyone submits, service role reads)
- messages_backup (service role only)
- notes (users manage their own by user_id)
- cynq_cards (public read, users manage their own by user_id)
- swag_votes (public read, authenticated can vote)
- watchlists (users manage their own by user_id)
- zork_events (public read, users manage by username)

**Status:** ✅ Ready to run - Column names updated

**Important:** Tables using `username` (bbs_presence, bbs_online, zork_events) assume your `profiles` table has a `username` column. If not, these policies will fail.

---

## ✅ Step 3: Recreate Views with Security Invoker
**File:** `recreate-views-security-invoker.sql`

**What it does:** Drops and recreates 11 views with `security_invoker = true` instead of `security_definer`

**Views affected:**
1. connection_leaderboard
2. active_organizations_summary
3. theme_projects_view
4. admin_ideas_overview
5. recent_interactions_summary
6. xp_leaderboard
7. active_presence_sessions
8. active_themes_summary
9. opportunities_with_org
10. streak_leaderboard
11. bbs_online_active

**Status:** ✅ Ready to run - All view definitions populated

---

## Execution Order

```sql
-- 1. Run this first
-- File: fix-database-security.sql
-- Copy and paste into Supabase SQL Editor

-- 2. Run this second
-- File: fix-database-security-step2.sql
-- Copy and paste into Supabase SQL Editor

-- 3. Run this third
-- File: recreate-views-security-invoker.sql
-- Copy and paste into Supabase SQL Editor
```

---

## Verification After Running

After running all three files, verify everything is fixed:

```sql
-- 1. Check all tables have RLS enabled (should return 0 rows)
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false
ORDER BY tablename;

-- 2. Check no security definer views remain (should return 0 rows)
SELECT schemaname, viewname
FROM pg_views 
WHERE schemaname = 'public'
AND definition LIKE '%SECURITY DEFINER%';

-- 3. Count policies per table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 4. Verify views exist and work
SELECT viewname 
FROM pg_views 
WHERE schemaname = 'public'
AND viewname IN (
    'connection_leaderboard',
    'active_organizations_summary',
    'theme_projects_view',
    'admin_ideas_overview',
    'recent_interactions_summary',
    'xp_leaderboard',
    'active_presence_sessions',
    'active_themes_summary',
    'opportunities_with_org',
    'streak_leaderboard',
    'bbs_online_active'
)
ORDER BY viewname;
```

---

## Expected Results

After running all scripts:
- ✅ 44 tables will have RLS enabled
- ✅ All tables will have appropriate policies
- ✅ 11 views will use security_invoker instead of security_definer
- ✅ All Supabase linter errors should be resolved

---

## Potential Issues to Watch For

### 1. Username-based Policies
If your `profiles` table doesn't have a `username` column, these policies will fail:
- bbs_presence
- bbs_online
- zork_events

**Fix:** Either add a username column to profiles, or modify the policies to use a different lookup method.

### 2. View Dependencies
If any of the views have dependencies (other views or functions that depend on them), the CASCADE option will drop those too. Review the output carefully.

### 3. Application Testing
After running, test your application to ensure:
- Users can access their own data
- Users cannot access other users' data
- Public endpoints still work
- Leaderboards display correctly
- No unexpected permission errors

---

## Rollback Plan

If something goes wrong:

```sql
-- Disable RLS on a specific table
ALTER TABLE public.table_name DISABLE ROW LEVEL SECURITY;

-- Drop a specific policy
DROP POLICY "policy_name" ON public.table_name;

-- Restore a view to security definer (not recommended, but possible)
DROP VIEW IF EXISTS public.view_name CASCADE;
CREATE VIEW public.view_name AS
[original view definition];
```

---

## Summary

You now have three SQL files ready to execute:
1. ✅ `fix-database-security.sql` - RLS for 15 tables
2. ✅ `fix-database-security-step2.sql` - RLS + policies for 14 tables
3. ✅ `recreate-views-security-invoker.sql` - Fix 11 views

Run them in order, verify the results, and test your application. All Supabase database linter security issues should be resolved!
