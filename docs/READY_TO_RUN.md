# Ready to Run - Database Security Fix

All SQL files have been updated with your actual column names and are ready to execute.

## Run These Files in Order

### 1. fix-database-security.sql ✅
**What it does:** Enables RLS on 15 tables that already have policies

**Safe to run:** Yes - these tables already have policies defined

**Run now:** Copy and paste into Supabase SQL Editor

---

### 2. fix-database-security-step2.sql ✅
**What it does:** Enables RLS and creates policies for 14 remaining tables

**Tables covered:**
- ✅ `signals` - Public read, service role manages
- ✅ `skill_colors` - Public read, service role manages  
- ✅ `bbs_presence` - Public read, users manage by username
- ✅ `client_errors` - Anyone inserts, service role reads
- ✅ `community_backup_pre_oauth_migration` - Service role only
- ✅ `achievements` - Public read, service role manages
- ✅ `bbs_online` - Public read, users manage by username
- ✅ `feedback` - Anyone submits, service role reads
- ✅ `messages_backup` - Service role only
- ✅ `notes` - Users manage their own (by user_id)
- ✅ `cynq_cards` - Public read, users manage their own (by user_id)
- ✅ `swag_votes` - Public read, authenticated can vote
- ✅ `watchlists` - Users manage their own (by user_id)
- ✅ `zork_events` - Public read, users manage by username

**Special notes:**
- Tables using `username` (bbs_presence, bbs_online, zork_events) have policies that join with the profiles table
- Make sure your profiles table has a `username` column that matches

**Run now:** Copy and paste into Supabase SQL Editor

---

### 3. get-view-definitions.sql
**What it does:** Retrieves the SQL definitions for your 11 security definer views

**Run now:** Copy and paste into Supabase SQL Editor, save the results

---

### 4. recreate-views-template.sql
**What it does:** Recreates views with security_invoker instead of security_definer

**Before running:** 
1. Get results from step 3
2. Replace each `SELECT 1;` placeholder with the actual view definition
3. Then run

---

## Important Notes

### Tables Using Username Instead of user_id

These tables use `username` and need to join with your `profiles` table:
- `bbs_presence`
- `bbs_online`  
- `zork_events`

The policies assume your `profiles` table has:
- `id` column (UUID matching auth.uid())
- `username` column (text)

If your profiles table structure is different, you may need to adjust these policies.

### Tables Without User Ownership

Some tables don't have user_id columns:
- `signals` - Treated as system/reference data
- `skill_colors` - Reference data
- `achievements` - System-managed
- `feedback` - Anonymous submissions allowed
- `swag_votes` - Anonymous voting allowed

These are configured with appropriate public/service role access.

### Backup Tables

These are restricted to service_role only:
- `community_backup_pre_oauth_migration`
- `messages_backup`

They won't be accessible via your API, only through direct database access.

## Verification After Running

Run these queries to verify everything is fixed:

```sql
-- Should return 0 rows (all tables have RLS enabled)
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false
ORDER BY tablename;

-- Check policy counts
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Should return 0 rows after fixing views
SELECT schemaname, viewname
FROM pg_views 
WHERE schemaname = 'public'
AND definition LIKE '%SECURITY DEFINER%';
```

## If Something Goes Wrong

To disable RLS on a specific table:
```sql
ALTER TABLE public.table_name DISABLE ROW LEVEL SECURITY;
```

To drop a policy:
```sql
DROP POLICY "policy_name" ON public.table_name;
```

## Next Steps After Running

1. Test your application thoroughly
2. Check for any permission errors in logs
3. Verify users can access their own data
4. Verify users cannot access other users' data
5. Check that public endpoints still work

## Questions to Consider

1. **profiles.username** - Does your profiles table have a username column? If not, the username-based policies will fail.

2. **swag_votes** - Should votes be tied to users? Currently allows anonymous voting.

3. **feedback** - Should feedback be tied to users? Currently allows anonymous submissions.

4. **signals** - What is this table for? Currently set as public read, service role write.

If any of these don't match your requirements, let me know and I can adjust the policies.
