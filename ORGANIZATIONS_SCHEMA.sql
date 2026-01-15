-- ================================================================
-- ORGANIZATIONS FEATURE - Database Schema
-- ================================================================
-- Adds organizations, opportunities, and sponsorships to CharlestonHacks
-- Run this after all existing migrations are complete
-- ================================================================

-- ================================================================
-- 1. ORGANIZATIONS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  website TEXT,
  logo_url TEXT,
  banner_url TEXT,
  industry TEXT[],
  size TEXT CHECK (size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  location TEXT,
  founded_year INTEGER,
  
  -- Social links
  linkedin_url TEXT,
  twitter_url TEXT,
  github_url TEXT,
  
  -- Engagement metrics
  follower_count INTEGER DEFAULT 0,
  opportunity_count INTEGER DEFAULT 0,
  
  -- Status
  verified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  
  -- Metadata
  created_by UUID REFERENCES community(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations USING GIN(industry);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_organizations_verified ON organizations(verified) WHERE verified = true;

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Organizations are viewable by everyone"
  ON organizations FOR SELECT
  USING (status = 'active');

CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

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

-- ================================================================
-- 2. ORGANIZATION MEMBERS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES community(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'representative')),
  title TEXT,
  bio TEXT,
  
  -- Permissions
  can_post_opportunities BOOLEAN DEFAULT false,
  can_manage_members BOOLEAN DEFAULT false,
  can_edit_profile BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, community_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_community ON organization_members(community_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);
CREATE INDEX IF NOT EXISTS idx_org_members_status ON organization_members(status);

-- Enable RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Organization members are viewable by everyone"
  ON organization_members FOR SELECT
  USING (status = 'active');

CREATE POLICY "Organization admins can manage members"
  ON organization_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.community_id IN (
        SELECT id FROM community WHERE user_id = auth.uid()
      )
      AND om.role IN ('owner', 'admin')
      AND om.can_manage_members = true
    )
  );

-- ================================================================
-- 3. OPPORTUNITIES TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('job', 'internship', 'volunteer', 'contract', 'mentorship')),
  
  -- Details
  location TEXT,
  remote_ok BOOLEAN DEFAULT false,
  compensation_type TEXT CHECK (compensation_type IN ('paid', 'unpaid', 'stipend', 'equity')),
  compensation_range TEXT,
  
  -- Requirements
  required_skills TEXT[],
  experience_level TEXT CHECK (experience_level IN ('entry', 'mid', 'senior', 'any')),
  commitment TEXT CHECK (commitment IN ('full-time', 'part-time', 'flexible', 'one-time')),
  
  -- Application
  application_url TEXT,
  application_email TEXT,
  application_instructions TEXT,
  
  -- Engagement
  view_count INTEGER DEFAULT 0,
  application_count INTEGER DEFAULT 0,
  
  -- Related
  theme_id UUID REFERENCES theme_circles(id),
  project_id UUID REFERENCES projects(id),
  
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'filled', 'draft')),
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
CREATE INDEX IF NOT EXISTS idx_opportunities_project ON opportunities(project_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_skills ON opportunities USING GIN(required_skills);
CREATE INDEX IF NOT EXISTS idx_opportunities_expires ON opportunities(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_posted_by ON opportunities(posted_by);

-- Enable RLS
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Open opportunities are viewable by everyone"
  ON opportunities FOR SELECT
  USING (status = 'open' AND (expires_at IS NULL OR expires_at > NOW()));

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

-- ================================================================
-- 4. ORGANIZATION FOLLOWERS TABLE
-- ================================================================

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

-- Enable RLS
ALTER TABLE organization_followers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view followers"
  ON organization_followers FOR SELECT
  USING (true);

CREATE POLICY "Users can follow organizations"
  ON organization_followers FOR INSERT
  WITH CHECK (
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can unfollow organizations"
  ON organization_followers FOR DELETE
  USING (
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- ================================================================
-- 5. ORGANIZATION THEME SPONSORSHIPS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS organization_theme_sponsorships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES theme_circles(id) ON DELETE CASCADE,
  
  -- Sponsorship details
  sponsorship_type TEXT CHECK (sponsorship_type IN ('financial', 'resources', 'mentorship', 'prizes')),
  description TEXT,
  amount DECIMAL(10,2),
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, theme_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_sponsorships_org ON organization_theme_sponsorships(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_sponsorships_theme ON organization_theme_sponsorships(theme_id);
CREATE INDEX IF NOT EXISTS idx_org_sponsorships_status ON organization_theme_sponsorships(status);

-- Enable RLS
ALTER TABLE organization_theme_sponsorships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Sponsorships are viewable by everyone"
  ON organization_theme_sponsorships FOR SELECT
  USING (status = 'active');

CREATE POLICY "Organization admins can manage sponsorships"
  ON organization_theme_sponsorships FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_theme_sponsorships.organization_id
      AND organization_members.community_id IN (
        SELECT id FROM community WHERE user_id = auth.uid()
      )
      AND organization_members.role IN ('owner', 'admin')
    )
  );

-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- Update follower count when someone follows/unfollows
CREATE OR REPLACE FUNCTION update_organization_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations
    SET follower_count = follower_count + 1,
        updated_at = NOW()
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations
    SET follower_count = GREATEST(follower_count - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_org_follower_count
AFTER INSERT OR DELETE ON organization_followers
FOR EACH ROW EXECUTE FUNCTION update_organization_follower_count();

-- Update opportunity count when opportunities change status
CREATE OR REPLACE FUNCTION update_organization_opportunity_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    UPDATE organizations
    SET opportunity_count = opportunity_count + 1,
        updated_at = NOW()
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'open' AND NEW.status != 'open' THEN
      UPDATE organizations
      SET opportunity_count = GREATEST(opportunity_count - 1, 0),
          updated_at = NOW()
      WHERE id = NEW.organization_id;
    ELSIF OLD.status != 'open' AND NEW.status = 'open' THEN
      UPDATE organizations
      SET opportunity_count = opportunity_count + 1,
          updated_at = NOW()
      WHERE id = NEW.organization_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'open' THEN
    UPDATE organizations
    SET opportunity_count = GREATEST(opportunity_count - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_org_opportunity_count
AFTER INSERT OR UPDATE OR DELETE ON opportunities
FOR EACH ROW EXECUTE FUNCTION update_organization_opportunity_count();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_organization_members_updated_at
BEFORE UPDATE ON organization_members
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_opportunities_updated_at
BEFORE UPDATE ON opportunities
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- VIEWS
-- ================================================================

-- Active organizations summary with aggregated data
CREATE OR REPLACE VIEW active_organizations_summary AS
SELECT 
  o.id,
  o.name,
  o.slug,
  o.description,
  o.logo_url,
  o.banner_url,
  o.industry,
  o.size,
  o.location,
  o.website,
  o.follower_count,
  o.opportunity_count,
  o.verified,
  o.created_at,
  COUNT(DISTINCT om.id) FILTER (WHERE om.status = 'active') as member_count,
  COUNT(DISTINCT opp.id) FILTER (WHERE opp.status = 'open') as open_opportunities,
  COUNT(DISTINCT ots.id) FILTER (WHERE ots.status = 'active') as active_sponsorships,
  ARRAY_AGG(DISTINCT tc.title) FILTER (WHERE tc.title IS NOT NULL) as sponsored_themes
FROM organizations o
LEFT JOIN organization_members om ON o.id = om.organization_id
LEFT JOIN opportunities opp ON o.id = opp.organization_id
LEFT JOIN organization_theme_sponsorships ots ON o.id = ots.organization_id
LEFT JOIN theme_circles tc ON ots.theme_id = tc.id
WHERE o.status = 'active'
GROUP BY o.id;

-- Opportunities with organization details
CREATE OR REPLACE VIEW opportunities_with_org AS
SELECT 
  opp.*,
  o.name as organization_name,
  o.slug as organization_slug,
  o.logo_url as organization_logo,
  o.verified as organization_verified,
  tc.title as theme_title,
  p.title as project_title
FROM opportunities opp
JOIN organizations o ON opp.organization_id = o.id
LEFT JOIN theme_circles tc ON opp.theme_id = tc.id
LEFT JOIN projects p ON opp.project_id = p.id
WHERE opp.status = 'open' 
AND (opp.expires_at IS NULL OR opp.expires_at > NOW());

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Check that all tables were created
DO $$
BEGIN
  RAISE NOTICE 'Verifying organizations schema...';
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
    RAISE NOTICE '✓ organizations table created';
  ELSE
    RAISE EXCEPTION '✗ organizations table missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_members') THEN
    RAISE NOTICE '✓ organization_members table created';
  ELSE
    RAISE EXCEPTION '✗ organization_members table missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opportunities') THEN
    RAISE NOTICE '✓ opportunities table created';
  ELSE
    RAISE EXCEPTION '✗ opportunities table missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_followers') THEN
    RAISE NOTICE '✓ organization_followers table created';
  ELSE
    RAISE EXCEPTION '✗ organization_followers table missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_theme_sponsorships') THEN
    RAISE NOTICE '✓ organization_theme_sponsorships table created';
  ELSE
    RAISE EXCEPTION '✗ organization_theme_sponsorships table missing';
  END IF;
  
  RAISE NOTICE 'All organizations tables created successfully!';
END $$;

-- ================================================================
-- COMPLETE
-- ================================================================

-- Display summary
SELECT 
  'Organizations Schema Migration Complete!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'organization%') as tables_created,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE '%org%') as triggers_created,
  (SELECT COUNT(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE '%organization%') as views_created;
