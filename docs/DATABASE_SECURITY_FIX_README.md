# Database Security Fix Guide

This guide will help you fix all the Supabase database linter security issues.

## Issues Summary

- **15 tables** have RLS policies but RLS is not enabled
- **29 tables** don't have RLS enabled at all
- **11 views** are using SECURITY DEFINER instead of SECURITY INVOKER

## Step-by-Step Instructions

### Step 1: Backup Your Database

Before making any changes, create a backup:

```sql
-- In Supabase Dashboard: Settings > Database > Backups
-- Or use pg_dump if you have direct access
```

### Step 2: Enable RLS on Tables with Existing Policies

Run the first fix script in your Supabase SQL Editor:

```bash
# File: fix-database-security.sql
```

This will enable RLS on the 15 tables that already have policies defined. This is safe because the policies already exist.

### Step 3: Inspect Table Schemas

Run the inspection script to see the actual column names:

```bash
# File: inspect-table-schemas.sql
```

This will show you the column structure for each table, especially the user identifier columns (user_id, profile_id, created_by, etc.).

### Step 4: Create Policies for Remaining Tables

1. Open `fix-database-security-step2-template.sql`
2. Review the output from Step 3
3. Update the `COLUMN_NAME` placeholders with actual column names from your tables
4. Uncomment the policies that apply to your tables
5. Run the completed script

### Step 5: Get View Definitions

Run the queries in `get-view-definitions.sql` to retrieve the current view definitions:

```bash
# File: get-view-definitions.sql
```

Copy each result - you'll need them for the next step.

### Step 6: Recreate Views with Security Invoker

1. Open `recreate-views-template.sql`
2. For each view, replace the placeholder `SELECT 1;` with the actual view definition from Step 5
3. Run the completed script in Supabase SQL Editor

### Step 7: Verify the Fixes

Run these verification queries:

```sql
-- Check all tables have RLS enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false
ORDER BY tablename;
-- Should return 0 rows

-- Check no security definer views remain
SELECT schemaname, viewname
FROM pg_views 
WHERE schemaname = 'public'
AND definition LIKE '%SECURITY DEFINER%';
-- Should return 0 rows

-- Check all tables have policies
SELECT t.tablename, COUNT(p.policyname) as policy_count
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename
HAVING COUNT(p.policyname) = 0
ORDER BY t.tablename;
-- Review any tables with 0 policies
```

## Policy Customization

The policies in `fix-database-security-step2-template.sql` are templates that need to be customized based on your actual table schemas. Here are common patterns to use:

### Common Policy Patterns

**Public Read, Authenticated Write:**
```sql
CREATE POLICY "Public read" ON table_name FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated insert" ON table_name FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
```

**User Owns Record:**
```sql
CREATE POLICY "Users manage own records" ON table_name FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**Team/Organization Access:**
```sql
CREATE POLICY "Team members access" ON table_name FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_members.team_id = table_name.team_id 
    AND team_members.user_id = auth.uid()
  )
);
```

**Admin Only:**
```sql
CREATE POLICY "Admin only" ON table_name FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
```

## Tables Requiring Special Attention

Review these tables and adjust policies as needed:

1. **backup tables** (`messages_backup`, `community_backup_pre_oauth_migration`)
   - Currently restricted to service_role only
   - Consider if these should be accessible at all via API

2. **client_errors** 
   - Users can insert, only service_role can read
   - Adjust if you need different error tracking access

3. **achievements**
   - Currently public read, service_role write
   - Adjust if users should be able to earn achievements directly

4. **feedback**
   - Users can only see their own feedback
   - Adjust if you want public feedback visibility

## Testing Checklist

After applying fixes, test these scenarios:

- [ ] Anonymous users can read public data (leaderboards, profiles, etc.)
- [ ] Authenticated users can create their own records
- [ ] Users cannot access other users' private data
- [ ] Users can update/delete only their own records
- [ ] Team members can access team resources
- [ ] Admin functions work correctly
- [ ] Views return expected data
- [ ] No unexpected permission errors in application

## Rollback Plan

If issues occur:

1. Disable RLS on affected tables:
   ```sql
   ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
   ```

2. Restore from backup if needed

3. Review and adjust policies before re-enabling

## Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter)

## Notes

- The `security_invoker` option for views requires PostgreSQL 15+
- Test thoroughly in a development environment first
- Monitor application logs for permission errors after deployment
- Some policies may need adjustment based on your specific use cases
