# Quick Start Guide - Database Security Fix

## The Problem
Your database has RLS (Row Level Security) issues that need fixing. The error you got (`column "user_id" does not exist`) happened because I guessed the column names. We need to check your actual table structure first.

## Quick Fix Process

### 1. Run Step 1 (Safe - No Errors)
```sql
-- File: fix-database-security.sql
-- This only enables RLS on tables that already have policies
-- Safe to run immediately
```

### 2. Inspect Your Tables
```sql
-- File: inspect-table-schemas.sql
-- This shows you the actual column names in your tables
-- Copy the results - you'll need them for step 3
```

### 3. Update and Run Step 2
1. Open `fix-database-security-step2-template.sql`
2. Find lines with `COLUMN_NAME` 
3. Replace with actual column names from step 2 results
4. Common patterns to look for:
   - `user_id` or `profile_id` - user who owns the record
   - `created_by` or `owner_id` - user who created it
   - `id` - primary key (usually UUID)
5. Uncomment the policies you need
6. Run the updated script

### 4. Fix the Views
```sql
-- File: get-view-definitions.sql
-- Get your view definitions
```

Then update `recreate-views-template.sql` with the actual view SQL.

## Example: Fixing a Table

Let's say `inspect-table-schemas.sql` shows the `notes` table has these columns:
- `id` (uuid)
- `profile_id` (uuid) ← This is the user identifier!
- `content` (text)
- `created_at` (timestamp)

In `fix-database-security-step2-template.sql`, change this:
```sql
-- CREATE POLICY "Users can manage their own notes"
-- ON public.notes FOR ALL
-- TO authenticated
-- USING (auth.uid() = COLUMN_NAME)
-- WITH CHECK (auth.uid() = COLUMN_NAME);
```

To this:
```sql
CREATE POLICY "Users can manage their own notes"
ON public.notes FOR ALL
TO authenticated
USING (auth.uid() = profile_id)
WITH CHECK (auth.uid() = profile_id);
```

## Files Overview

- ✅ `fix-database-security.sql` - Step 1, safe to run now
- 📋 `inspect-table-schemas.sql` - Run this to see your table structure
- ✏️ `fix-database-security-step2-template.sql` - Edit this based on inspection results
- 📋 `get-view-definitions.sql` - Get view definitions
- ✏️ `recreate-views-template.sql` - Edit this with view definitions
- 📖 `DATABASE_SECURITY_FIX_README.md` - Full detailed guide

## Need Help?

If you're unsure about a table's policies:
1. Check if it's user-owned data (notes, cards, votes) → users should only access their own
2. Check if it's public data (leaderboards, achievements) → everyone can read
3. Check if it's system data (errors, backups) → only service_role access
4. Check if it's reference data (colors, categories) → public read, admin write
