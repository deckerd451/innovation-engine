-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ============================================
-- ORGANIZATIONS FEATURE SCHEMA
-- ============================================
-- This migration adds organizations, opportunities, and related tables
-- to CharlestonHacks Innovation Engine

-- ============================================
-- 1. ORGANIZATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- URL-friendly name
  description TEXT,
  website TEXT,
  logo_url TEXT,
  banner_url TEXT,
  industry TEXT[], -- e.g., ['Technology', 'Healthcare']
  size TEXT, -- 'startup', 'small', 'medium', 'large', 'enterprise'
  location TEXT,
  founded_year INTEGER,

  -- Social links
  linkedin_url TEXT,
  twitter_url TEXT,
  github_url TEXT,

  -- Engagement
  follower_count INTEGER DEFAULT 0,
  opportunity_count INTEGER DEFAULT 0,

  -- Status
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'pending'

  -- Metadata
  created_by UUID REFERENCES community(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations USING GIN(industry);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);

-- ============================================
-- 2. ORGANIZATION MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES community(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member', 'representative'
  title TEXT, -- Job title within organization
  bio TEXT, -- Member's role description

  -- Permissions
  can_post_opportunities BOOLEAN DEFAULT false,
  can_manage_members BOOLEAN DEFAULT false,
  can_edit_profile BOOLEAN DEFAULT false,

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'pending'

  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, community_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_community ON organization_members(community_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- ============================================
-- 3. OPPORTUNITIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic info
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL, -- 'job', 'internship', 'volunteer', 'contract', 'mentorship'

  -- Details
  location TEXT,
  remote_ok BOOLEAN DEFAULT false,
  compensation_type TEXT, -- 'paid', 'unpaid', 'stipend', 'equity'
  compensation_range TEXT, -- e.g., "$50k-$70k", "Unpaid"

  -- Requirements
  required_skills TEXT[],
  experience_level TEXT, -- 'entry', 'mid', 'senior', 'any'
  commitment TEXT, -- 'full-time', 'part-time', 'flexible', 'one-time'

  -- Application
  application_url TEXT,
  application_email TEXT,
  application_instructions TEXT,

  -- Engagement
  view_count INTEGER DEFAULT 0,
  application_count INTEGER DEFAULT 0,

  -- Related
  theme_id UUID REFERENCES theme_circles(id), -- Optional theme association
  project_id UUID REFERENCES projects(id), -- Optional project association

  -- Status
  status TEXT DEFAULT 'open', -- 'open', 'closed', 'filled', 'draft'
  expires_at TIMESTAMPTZ,

  -- Metadata
  posted_by UUID REFERENCES community(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(organization_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(type);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_theme ON opportunities(theme_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_skills ON opportunities USING GIN(required_skills);
CREATE INDEX IF NOT EXISTS idx_opportunities_expires ON opportunities(expires_at);

-- ============================================
-- 4. ORGANIZATION FOLLOWERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organization_followers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES community(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, community_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_followers_org ON organization_followers(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_followers_community ON organization_followers(community_id);

-- ============================================
-- 5. ORGANIZATION THEME SPONSORSHIPS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organization_theme_sponsorships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES theme_circles(id) ON DELETE CASCADE,

  -- Sponsorship details
  sponsorship_type TEXT, -- 'financial', 'resources', 'mentorship', 'prizes'
  description TEXT,
  amount DECIMAL(10,2), -- Optional monetary value

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'cancelled'

  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, theme_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_sponsorships_org ON organization_theme_sponsorships(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_sponsorships_theme ON organization_theme_sponsorships(theme_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Update Follower Count
CREATE OR REPLACE FUNCTION update_organization_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations
    SET follower_count = follower_count + 1
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations
    SET follower_count = GREATEST(follower_count - 1, 0)
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_org_follower_count ON organization_followers;
CREATE TRIGGER trigger_update_org_follower_count
AFTER INSERT OR DELETE ON organization_followers
FOR EACH ROW EXECUTE FUNCTION update_organization_follower_count();

-- Update Opportunity Count
CREATE OR REPLACE FUNCTION update_organization_opportunity_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    UPDATE organizations
    SET opportunity_count = opportunity_count + 1
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'open' AND NEW.status != 'open' THEN
      UPDATE organizations
      SET opportunity_count = GREATEST(opportunity_count - 1, 0)
      WHERE id = NEW.organization_id;
    ELSIF OLD.status != 'open' AND NEW.status = 'open' THEN
      UPDATE organizations
      SET opportunity_count = opportunity_count + 1
      WHERE id = NEW.organization_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'open' THEN
    UPDATE organizations
    SET opportunity_count = GREATEST(opportunity_count - 1, 0)
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_org_opportunity_count ON opportunities;
CREATE TRIGGER trigger_update_org_opportunity_count
AFTER INSERT OR UPDATE OR DELETE ON opportunities
FOR EACH ROW EXECUTE FUNCTION update_organization_opportunity_count();

-- ============================================
-- VIEWS
-- ============================================

-- Active Organizations Summary
CREATE OR REPLACE VIEW active_organizations_summary AS
SELECT
  o.id,
  o.name,
  o.slug,
  o.description,
  o.logo_url,
  o.industry,
  o.size,
  o.location,
  o.follower_count,
  o.opportunity_count,
  o.verified,
  COUNT(DISTINCT om.id) as member_count,
  COUNT(DISTINCT opp.id) as open_opportunities,
  ARRAY_AGG(DISTINCT tc.title) FILTER (WHERE tc.title IS NOT NULL) as sponsored_themes
FROM organizations o
LEFT JOIN organization_members om ON o.id = om.organization_id AND om.status = 'active'
LEFT JOIN opportunities opp ON o.id = opp.organization_id AND opp.status = 'open'
LEFT JOIN organization_theme_sponsorships ots ON o.id = ots.organization_id AND ots.status = 'active'
LEFT JOIN theme_circles tc ON ots.theme_id = tc.id
WHERE o.status = 'active'
GROUP BY o.id;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- All RLS policies are defined here AFTER all tables are created
-- to avoid circular dependency issues

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_theme_sponsorships ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ORGANIZATIONS TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Organizations are viewable by everyone" ON organizations;
CREATE POLICY "Organizations are viewable by everyone"
  ON organizations FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Organization admins can update" ON organizations;
CREATE POLICY "Organization admins can update"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
      AND organization_members.community_id IN (
        SELECT id FROM community WHERE user_id = auth.uid()
      )
      AND organization_members.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- ORGANIZATION MEMBERS TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Organization members are viewable by everyone" ON organization_members;
CREATE POLICY "Organization members are viewable by everyone"
  ON organization_members FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
CREATE POLICY "Organization admins can manage members"
  ON organization_members FOR ALL
  USING (
    -- Use a SECURITY DEFINER function to avoid recursion
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
    AND role IN ('owner', 'admin')
  );

-- ============================================
-- OPPORTUNITIES TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Open opportunities are viewable by everyone" ON opportunities;
CREATE POLICY "Open opportunities are viewable by everyone"
  ON opportunities FOR SELECT
  USING (status = 'open' AND (expires_at IS NULL OR expires_at > NOW()));

DROP POLICY IF EXISTS "Organization members can create opportunities" ON opportunities;
CREATE POLICY "Organization members can create opportunities"
  ON opportunities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = opportunities.organization_id
      AND organization_members.community_id IN (
        SELECT id FROM community WHERE user_id = auth.uid()
      )
      AND organization_members.can_post_opportunities = true
    )
  );

DROP POLICY IF EXISTS "Organization members can update opportunities" ON opportunities;
CREATE POLICY "Organization members can update opportunities"
  ON opportunities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = opportunities.organization_id
      AND organization_members.community_id IN (
        SELECT id FROM community WHERE user_id = auth.uid()
      )
      AND organization_members.can_post_opportunities = true
    )
  );

-- ============================================
-- ORGANIZATION FOLLOWERS TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view followers" ON organization_followers;
CREATE POLICY "Users can view followers"
  ON organization_followers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can follow organizations" ON organization_followers;
CREATE POLICY "Users can follow organizations"
  ON organization_followers FOR INSERT
  WITH CHECK (
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can unfollow organizations" ON organization_followers;
CREATE POLICY "Users can unfollow organizations"
  ON organization_followers FOR DELETE
  USING (
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- ORGANIZATION THEME SPONSORSHIPS TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Sponsorships are viewable by everyone" ON organization_theme_sponsorships;
CREATE POLICY "Sponsorships are viewable by everyone"
  ON organization_theme_sponsorships FOR SELECT
  USING (status = 'active');

-- ============================================
-- COMPLETE
-- ============================================
-- Migration complete. Organizations feature schema ready!
