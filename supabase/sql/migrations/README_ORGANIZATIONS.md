# Organizations Feature - Database Migration Guide

This guide will help you safely install the Organizations feature database schema in your Supabase database.

## 📋 Migration Files

1. **ORGANIZATIONS_PREFLIGHT_CHECK.sql** - Checks prerequisites before installation
2. **ORGANIZATIONS_QUICK_FIX.sql** - Creates missing required tables
3. **ORGANIZATIONS_SCHEMA.sql** - Installs the organizations feature

## 🚀 Installation Steps

### Step 1: Run Pre-Flight Check

Open your **Supabase SQL Editor** and run:

```sql
-- Copy and paste the contents of ORGANIZATIONS_PREFLIGHT_CHECK.sql
```

**What it does:**
- ✅ Checks if UUID extension is installed
- ✅ Verifies `community`, `theme_circles`, and `projects` tables exist
- ✅ Validates required columns are present
- ✅ Checks database permissions
- ✅ Shows detailed table information

**Expected Output:**

If everything is ready:
```
🎉 ALL CRITICAL CHECKS PASSED!
✅ You are ready to run ORGANIZATIONS_SCHEMA.sql
```

If issues are found:
```
❌ FOUND X CRITICAL ISSUE(S)
⚠️  Please fix the issues marked with ❌ before proceeding
```

### Step 2: Fix Issues (if needed)

If the pre-flight check found missing tables, run:

```sql
-- Copy and paste the contents of ORGANIZATIONS_QUICK_FIX.sql
```

**What it does:**
- ✅ Installs UUID extension
- ✅ Creates `community` table (if missing)
- ✅ Creates `theme_circles` table (if missing)
- ✅ Creates `projects` table (if missing)
- ✅ Sets up RLS policies
- ✅ Creates performance indexes

**Then re-run Step 1** to verify everything is ready.

### Step 3: Install Organizations Schema

Once the pre-flight check passes, run:

```sql
-- Copy and paste the contents of ORGANIZATIONS_SCHEMA.sql
```

**What it creates:**

**Tables:**
- `organizations` - Organization profiles with branding
- `organization_members` - Team members with roles/permissions
- `opportunities` - Jobs, internships, volunteer positions
- `organization_followers` - Follow/unfollow tracking
- `organization_theme_sponsorships` - Theme sponsorship tracking

**Functions:**
- `update_organization_follower_count()` - Auto-update follower counts
- `update_organization_opportunity_count()` - Auto-update opportunity counts

**Views:**
- `active_organizations_summary` - Efficient querying with aggregated stats

**Triggers:**
- Automatic follower count updates
- Automatic opportunity count updates

### Step 4: Verify Installation

Run this query to verify all tables were created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE 'organization%' OR table_name = 'opportunities')
ORDER BY table_name;
```

**Expected output:**
- opportunities
- organization_followers
- organization_members
- organization_theme_sponsorships
- organizations

### Step 5: Test the Feature

Create a test organization:

```sql
-- First, make sure you're authenticated in Supabase
-- Then try creating an organization:

INSERT INTO organizations (
  name,
  slug,
  description,
  status
)
VALUES (
  'Test Organization',
  'test-org',
  'This is a test organization to verify the installation',
  'active'
)
RETURNING *;
```

If this succeeds, your installation is complete! ✅

## 🔧 Troubleshooting

### Error: `function uuid_generate_v4() does not exist`

**Fix:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Error: `relation "community" does not exist`

**Fix:** Run `ORGANIZATIONS_QUICK_FIX.sql` to create the community table.

### Error: `permission denied for table organizations`

**Cause:** Row Level Security (RLS) is blocking the insert.

**Fix Option 1 - Authenticate in Supabase:**
Make sure you're logged in to Supabase dashboard before running queries.

**Fix Option 2 - Temporarily disable RLS (TESTING ONLY):**
```sql
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
-- Re-enable after testing:
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
```

### Error: `duplicate key value violates unique constraint`

**Cause:** You're trying to create an organization with a slug that already exists.

**Fix:** Use a different slug value or query existing organizations:
```sql
SELECT * FROM organizations WHERE slug = 'test-org';
```

## 📊 Database Schema Overview

### Organizations Table
```
- id (UUID) - Primary key
- name (TEXT) - Organization name
- slug (TEXT) - URL-friendly identifier
- description (TEXT) - About the organization
- logo_url (TEXT) - Logo image URL
- banner_url (TEXT) - Banner image URL
- industry (TEXT[]) - Industry tags
- size (TEXT) - Organization size
- location (TEXT) - Primary location
- verified (BOOLEAN) - Verification status
- follower_count (INTEGER) - Number of followers
- opportunity_count (INTEGER) - Number of open opportunities
```

### Opportunities Table
```
- id (UUID) - Primary key
- organization_id (UUID) - Foreign key to organizations
- title (TEXT) - Opportunity title
- description (TEXT) - Detailed description
- type (TEXT) - job, internship, volunteer, contract, mentorship
- location (TEXT) - Location or "Remote"
- remote_ok (BOOLEAN) - Remote work allowed
- required_skills (TEXT[]) - Required skill tags
- experience_level (TEXT) - entry, mid, senior, any
- compensation_range (TEXT) - Salary/compensation info
- view_count (INTEGER) - Number of views
- application_count (INTEGER) - Number of applications
```

## 🔐 Row Level Security (RLS) Policies

The schema includes secure RLS policies:

### Organizations
- ✅ Everyone can VIEW active organizations
- ✅ Authenticated users can CREATE organizations
- ✅ Only organization admins/owners can UPDATE their organizations

### Opportunities
- ✅ Everyone can VIEW open opportunities
- ✅ Only authorized org members can CREATE opportunities
- ✅ Only authorized org members can UPDATE their opportunities

### Followers
- ✅ Everyone can VIEW follower lists
- ✅ Authenticated users can FOLLOW/UNFOLLOW organizations

## 🎯 Next Steps

After successful installation:

1. **Test the frontend** - Navigate to `/organizations.html`
2. **Create sample data** - Add a few test organizations
3. **Post opportunities** - Use `/organization-admin.html`
4. **Customize RLS policies** - Adjust for your specific auth setup
5. **Add seed data** - Populate with real organizations

## 📞 Need Help?

If you encounter issues:

1. Check the Supabase logs for detailed error messages
2. Verify all three migration scripts ran successfully
3. Ensure your Supabase project has the latest features enabled
4. Review the RLS policies match your authentication setup

## 🔄 Rolling Back

If you need to remove the organizations feature:

```sql
-- WARNING: This will delete all organizations data
DROP TABLE IF EXISTS organization_theme_sponsorships CASCADE;
DROP TABLE IF EXISTS organization_followers CASCADE;
DROP TABLE IF EXISTS opportunities CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

DROP VIEW IF EXISTS active_organizations_summary CASCADE;

DROP FUNCTION IF EXISTS update_organization_follower_count() CASCADE;
DROP FUNCTION IF EXISTS update_organization_opportunity_count() CASCADE;
```

---

**Installation Complete!** 🎉

Your CharlestonHacks Innovation Engine now has full organizations and opportunities support.
