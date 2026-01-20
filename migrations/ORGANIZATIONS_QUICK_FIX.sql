-- ============================================
-- ORGANIZATIONS FEATURE - QUICK FIX SCRIPT
-- ============================================
-- Run this script if the pre-flight check found missing tables
-- This will create minimal versions of required tables

-- ============================================
-- FIX 1: Install UUID Extension
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- FIX 2: Create Community Table (if missing)
-- ============================================
-- This table is REQUIRED for organizations feature
-- Adjust as needed based on your existing user/profile system

CREATE TABLE IF NOT EXISTS community (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic profile info
  name TEXT NOT NULL,
  email TEXT,
  profile_pic TEXT,
  title TEXT,
  bio TEXT,

  -- Skills and interests
  skills TEXT[],
  interests TEXT[],

  -- Social links
  github_url TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  website TEXT,

  -- Engagement
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on user_id
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_community_user_id ON community(user_id);
CREATE INDEX IF NOT EXISTS idx_community_email ON community(email);

-- Enable RLS
ALTER TABLE community ENABLE ROW LEVEL SECURITY;

-- RLS Policies for community table
DROP POLICY IF EXISTS "Community profiles are viewable by everyone" ON community;
CREATE POLICY "Community profiles are viewable by everyone"
  ON community FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own community profile" ON community;
CREATE POLICY "Users can insert their own community profile"
  ON community FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own community profile" ON community;
CREATE POLICY "Users can update their own community profile"
  ON community FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- FIX 3: Create Theme Circles Table (if missing)
-- ============================================
-- This table is OPTIONAL but recommended for theme sponsorships

CREATE TABLE IF NOT EXISTS theme_circles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#00e0ff',
  icon TEXT,

  -- Settings
  max_members INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  is_temporary BOOLEAN DEFAULT true,

  -- Lifecycle
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Creator
  created_by UUID REFERENCES community(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_theme_circles_active ON theme_circles(is_active);
CREATE INDEX IF NOT EXISTS idx_theme_circles_created_by ON theme_circles(created_by);

-- Enable RLS
ALTER TABLE theme_circles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for theme_circles
DROP POLICY IF EXISTS "Theme circles are viewable by everyone" ON theme_circles;
CREATE POLICY "Theme circles are viewable by everyone"
  ON theme_circles FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users can create theme circles" ON theme_circles;
CREATE POLICY "Authenticated users can create theme circles"
  ON theme_circles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their own theme circles" ON theme_circles;
CREATE POLICY "Users can update their own theme circles"
  ON theme_circles FOR UPDATE
  USING (
    created_by IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- FIX 4: Create Projects Table (if missing)
-- ============================================
-- This table is OPTIONAL but recommended for project-linked opportunities

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  readme TEXT,

  -- Links
  github_url TEXT,
  demo_url TEXT,

  -- Technology
  tech_stack TEXT[],
  tags TEXT[],

  -- Team
  created_by UUID REFERENCES community(id),
  team_members UUID[],

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'archived'
  visibility TEXT DEFAULT 'public', -- 'public', 'private', 'team-only'

  -- Engagement
  view_count INTEGER DEFAULT 0,
  star_count INTEGER DEFAULT 0,

  -- Associated theme
  theme_id UUID REFERENCES theme_circles(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_theme ON projects(theme_id);
CREATE INDEX IF NOT EXISTS idx_projects_tech_stack ON projects USING GIN(tech_stack);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
DROP POLICY IF EXISTS "Public projects are viewable by everyone" ON projects;
CREATE POLICY "Public projects are viewable by everyone"
  ON projects FOR SELECT
  USING (visibility = 'public' OR visibility = 'team-only');

DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (
    created_by IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '   QUICK FIX COMPLETED';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Created/verified the following tables:';
  RAISE NOTICE '   • community';
  RAISE NOTICE '   • theme_circles';
  RAISE NOTICE '   • projects';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Installed UUID extension';
  RAISE NOTICE '✅ Created indexes for performance';
  RAISE NOTICE '✅ Enabled Row Level Security (RLS)';
  RAISE NOTICE '✅ Created basic RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Re-run ORGANIZATIONS_PREFLIGHT_CHECK.sql to verify';
  RAISE NOTICE '2. Run ORGANIZATIONS_SCHEMA.sql to create organizations tables';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
END $$;

-- Show what was created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count,
  (SELECT pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))) as table_size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('community', 'theme_circles', 'projects')
ORDER BY table_name;
