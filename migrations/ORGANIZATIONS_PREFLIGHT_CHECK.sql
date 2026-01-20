-- ============================================
-- ORGANIZATIONS FEATURE - PRE-FLIGHT CHECK
-- ============================================
-- Run this script BEFORE running ORGANIZATIONS_SCHEMA.sql
-- It will verify all prerequisites and tell you what's missing

-- ============================================
-- COMPREHENSIVE SYSTEM CHECK
-- ============================================

DO $$
DECLARE
  check_passed BOOLEAN := true;
  issue_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '   ORGANIZATIONS FEATURE - PRE-FLIGHT CHECK';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';

  -- ============================================
  -- CHECK 1: UUID Extension
  -- ============================================
  RAISE NOTICE '📦 Checking PostgreSQL Extensions...';

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    RAISE NOTICE '   ✅ uuid-ossp extension is installed';
  ELSE
    RAISE NOTICE '   ❌ uuid-ossp extension is NOT installed';
    RAISE NOTICE '   → Fix: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";';
    check_passed := false;
    issue_count := issue_count + 1;
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK 2: Auth Schema
  -- ============================================
  RAISE NOTICE '🔐 Checking Authentication Setup...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    RAISE NOTICE '   ✅ auth.users table exists (Supabase Auth is configured)';
  ELSE
    RAISE NOTICE '   ⚠️  auth.users table not found';
    RAISE NOTICE '   → This is normal if not using Supabase Auth';
    RAISE NOTICE '   → RLS policies will need adjustment for custom auth';
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK 3: Community Table
  -- ============================================
  RAISE NOTICE '👥 Checking Community Table...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'community') THEN
    RAISE NOTICE '   ✅ community table exists';

    -- Check required columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community' AND column_name = 'id') THEN
      RAISE NOTICE '   ✅ community.id column exists';
    ELSE
      RAISE NOTICE '   ❌ community.id column is MISSING';
      check_passed := false;
      issue_count := issue_count + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community' AND column_name = 'user_id') THEN
      RAISE NOTICE '   ✅ community.user_id column exists';
    ELSE
      RAISE NOTICE '   ⚠️  community.user_id column not found';
      RAISE NOTICE '   → RLS policies assume this column exists for auth integration';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community' AND column_name = 'name') THEN
      RAISE NOTICE '   ✅ community.name column exists';
    ELSE
      RAISE NOTICE '   ⚠️  community.name column not found (recommended)';
    END IF;

  ELSE
    RAISE NOTICE '   ❌ community table does NOT exist';
    RAISE NOTICE '   → This table is REQUIRED for foreign key relationships';
    RAISE NOTICE '   → Organizations need to reference community members';
    check_passed := false;
    issue_count := issue_count + 1;
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK 4: Theme Circles Table
  -- ============================================
  RAISE NOTICE '🎨 Checking Theme Circles Table...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'theme_circles') THEN
    RAISE NOTICE '   ✅ theme_circles table exists';

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'theme_circles' AND column_name = 'id') THEN
      RAISE NOTICE '   ✅ theme_circles.id column exists';
    ELSE
      RAISE NOTICE '   ❌ theme_circles.id column is MISSING';
      check_passed := false;
      issue_count := issue_count + 1;
    END IF;

  ELSE
    RAISE NOTICE '   ⚠️  theme_circles table does NOT exist';
    RAISE NOTICE '   → This is OPTIONAL - only needed for theme sponsorships';
    RAISE NOTICE '   → You can still run the migration (foreign key will be nullable)';
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK 5: Projects Table
  -- ============================================
  RAISE NOTICE '📁 Checking Projects Table...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    RAISE NOTICE '   ✅ projects table exists';

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'id') THEN
      RAISE NOTICE '   ✅ projects.id column exists';
    ELSE
      RAISE NOTICE '   ❌ projects.id column is MISSING';
      check_passed := false;
      issue_count := issue_count + 1;
    END IF;

  ELSE
    RAISE NOTICE '   ⚠️  projects table does NOT exist';
    RAISE NOTICE '   → This is OPTIONAL - only needed for project-linked opportunities';
    RAISE NOTICE '   → You can still run the migration (foreign key will be nullable)';
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK 6: Existing Organizations Tables
  -- ============================================
  RAISE NOTICE '🏢 Checking for Existing Organizations Tables...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    RAISE NOTICE '   ⚠️  organizations table ALREADY EXISTS';
    RAISE NOTICE '   → Migration will skip table creation (using IF NOT EXISTS)';
    RAISE NOTICE '   → Existing data will be preserved';
  ELSE
    RAISE NOTICE '   ✅ No existing organizations table (clean install)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'opportunities') THEN
    RAISE NOTICE '   ⚠️  opportunities table ALREADY EXISTS';
  ELSE
    RAISE NOTICE '   ✅ No existing opportunities table (clean install)';
  END IF;

  RAISE NOTICE '';

  -- ============================================
  -- CHECK 7: Database Permissions
  -- ============================================
  RAISE NOTICE '🔑 Checking Database Permissions...';

  -- Check if current user can create tables (Supabase compatible)
  BEGIN
    IF has_database_privilege(current_database(), 'CREATE')
       OR has_schema_privilege('public', 'CREATE') THEN
      RAISE NOTICE '   ✅ Current user has CREATE permissions';
    ELSE
      RAISE NOTICE '   ⚠️  Current user may not have CREATE permissions';
      RAISE NOTICE '   → This is OK in Supabase - service role will be used';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '   ℹ️  Could not check permissions (this is normal in Supabase)';
    RAISE NOTICE '   → Continuing anyway...';
  END;

  RAISE NOTICE '';

  -- ============================================
  -- FINAL SUMMARY
  -- ============================================
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '   PRE-FLIGHT CHECK SUMMARY';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';

  IF check_passed THEN
    RAISE NOTICE '🎉 ALL CRITICAL CHECKS PASSED!';
    RAISE NOTICE '';
    RAISE NOTICE '✅ You are ready to run ORGANIZATIONS_SCHEMA.sql';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Run the migration: ORGANIZATIONS_SCHEMA.sql';
    RAISE NOTICE '2. Test by creating a sample organization';
    RAISE NOTICE '3. Verify RLS policies work with your auth setup';
  ELSE
    RAISE NOTICE '❌ FOUND % CRITICAL ISSUE(S)', issue_count;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Please fix the issues marked with ❌ before proceeding';
    RAISE NOTICE '';
    RAISE NOTICE 'Common fixes:';
    RAISE NOTICE '• Install uuid-ossp: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";';
    RAISE NOTICE '• Create community table (see below for script)';
    RAISE NOTICE '• Ensure all required columns exist in referenced tables';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';

END $$;

-- ============================================
-- DETAILED TABLE INFORMATION
-- ============================================

-- Show structure of existing tables
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 DETAILED TABLE INFORMATION';
  RAISE NOTICE '────────────────────────────────────────────────────────';
END $$;

-- Community table details
SELECT
  'community' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'community'
ORDER BY ordinal_position;

-- Theme circles table details
SELECT
  'theme_circles' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'theme_circles'
ORDER BY ordinal_position;

-- Projects table details
SELECT
  'projects' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projects'
ORDER BY ordinal_position;

-- ============================================
-- QUICK FIX SCRIPTS (if needed)
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 QUICK FIX SCRIPTS';
  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE '';
  RAISE NOTICE 'If you need to create missing tables, run these scripts:';
  RAISE NOTICE '';
  RAISE NOTICE '-- Fix 1: Install UUID extension';
  RAISE NOTICE 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";';
  RAISE NOTICE '';
  RAISE NOTICE '-- Fix 2: Create minimal community table (if missing)';
  RAISE NOTICE 'CREATE TABLE IF NOT EXISTS community (';
  RAISE NOTICE '  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),';
  RAISE NOTICE '  user_id UUID REFERENCES auth.users(id),';
  RAISE NOTICE '  name TEXT NOT NULL,';
  RAISE NOTICE '  email TEXT,';
  RAISE NOTICE '  profile_pic TEXT,';
  RAISE NOTICE '  skills TEXT[],';
  RAISE NOTICE '  created_at TIMESTAMPTZ DEFAULT NOW()';
  RAISE NOTICE ');';
  RAISE NOTICE '';
  RAISE NOTICE '-- Fix 3: Create minimal theme_circles table (if missing)';
  RAISE NOTICE 'CREATE TABLE IF NOT EXISTS theme_circles (';
  RAISE NOTICE '  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),';
  RAISE NOTICE '  title TEXT NOT NULL,';
  RAISE NOTICE '  description TEXT,';
  RAISE NOTICE '  created_at TIMESTAMPTZ DEFAULT NOW()';
  RAISE NOTICE ');';
  RAISE NOTICE '';
  RAISE NOTICE '-- Fix 4: Create minimal projects table (if missing)';
  RAISE NOTICE 'CREATE TABLE IF NOT EXISTS projects (';
  RAISE NOTICE '  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),';
  RAISE NOTICE '  title TEXT NOT NULL,';
  RAISE NOTICE '  description TEXT,';
  RAISE NOTICE '  created_at TIMESTAMPTZ DEFAULT NOW()';
  RAISE NOTICE ');';
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;
