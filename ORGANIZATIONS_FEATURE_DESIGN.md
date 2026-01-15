# Organizations Feature - Design & Implementation

## Overview
Add organizations to CharlestonHacks Innovation Engine, allowing companies, nonprofits, and groups to have a presence, post opportunities, and connect with community members.

---

## Use Cases

### For Organizations:
- Create organization profiles with branding
- Post job opportunities, internships, and volunteer positions
- Sponsor themes and projects
- Connect with talented community members
- Track engagement and applications

### For Community Members:
- Discover organizations aligned with their interests
- Apply to opportunities
- Follow organizations for updates
- See which organizations are active in themes
- Network with organization representatives

---

## Database Schema

### 1. Organizations Table

```sql
CREATE TABLE organizations (
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
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_status ON organizations(status);
CREATE INDEX idx_organizations_industry ON organizations USING GIN(industry);
CREATE INDEX idx_organizations_created_by ON organizations(created_by);

-- RLS Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

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
```

### 2. Organization Members Table

```sql
CREATE TABLE organization_members (
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
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_community ON organization_members(community_id);
CREATE INDEX idx_org_members_role ON organization_members(role);

-- RLS Policies
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

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
    )
  );
```

### 3. Opportunities Table

```sql
CREATE TABLE opportunities (
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
CREATE INDEX idx_opportunities_org ON opportunities(organization_id);
CREATE INDEX idx_opportunities_type ON opportunities(type);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_theme ON opportunities(theme_id);
CREATE INDEX idx_opportunities_skills ON opportunities USING GIN(required_skills);
CREATE INDEX idx_opportunities_expires ON opportunities(expires_at);

-- RLS Policies
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

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
```

### 4. Organization Followers Table

```sql
CREATE TABLE organization_followers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES community(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, community_id)
);

-- Indexes
CREATE INDEX idx_org_followers_org ON organization_followers(organization_id);
CREATE INDEX idx_org_followers_community ON organization_followers(community_id);

-- RLS Policies
ALTER TABLE organization_followers ENABLE ROW LEVEL SECURITY;

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
```

### 5. Organization Theme Sponsorships Table

```sql
CREATE TABLE organization_theme_sponsorships (
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
CREATE INDEX idx_org_sponsorships_org ON organization_theme_sponsorships(organization_id);
CREATE INDEX idx_org_sponsorships_theme ON organization_theme_sponsorships(theme_id);

-- RLS Policies
ALTER TABLE organization_theme_sponsorships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sponsorships are viewable by everyone"
  ON organization_theme_sponsorships FOR SELECT
  USING (status = 'active');
```

---

## Helper Functions

### Update Follower Count

```sql
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

CREATE TRIGGER trigger_update_org_follower_count
AFTER INSERT OR DELETE ON organization_followers
FOR EACH ROW EXECUTE FUNCTION update_organization_follower_count();
```

### Update Opportunity Count

```sql
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

CREATE TRIGGER trigger_update_org_opportunity_count
AFTER INSERT OR UPDATE OR DELETE ON opportunities
FOR EACH ROW EXECUTE FUNCTION update_organization_opportunity_count();
```

---

## Views

### Active Organizations Summary

```sql
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
```

---

## Frontend Implementation

### File Structure

```
assets/js/
├── organizations/
│   ├── organization-manager.js    # CRUD operations
│   ├── organization-profile.js    # Profile display
│   ├── opportunities.js           # Opportunity management
│   └── organization-discovery.js  # Browse/search organizations
```

### Key Features to Implement

1. **Organization Profile Page**
   - Display organization info, logo, banner
   - Show team members
   - List open opportunities
   - Show sponsored themes
   - Follow/unfollow button

2. **Organization Discovery**
   - Browse all organizations
   - Filter by industry, size, location
   - Search by name or keywords
   - Show in synapse visualization

3. **Opportunity Board**
   - List all opportunities
   - Filter by type, skills, location
   - Apply to opportunities
   - Track applications

4. **Organization Admin Panel**
   - Create/edit organization profile
   - Manage team members
   - Post/edit opportunities
   - View analytics (views, applications, followers)
   - Sponsor themes

5. **Integration with Existing Features**
   - Show organizations in theme circles
   - Display opportunities in relevant themes
   - Add organizations to network visualization
   - Show organization connections

---

## UI Components

### Organization Card

```html
<div class="organization-card">
  <img src="logo_url" class="org-logo" />
  <h3>Organization Name</h3>
  <p class="org-industry">Industry Tags</p>
  <p class="org-description">Short description...</p>
  <div class="org-stats">
    <span>👥 X followers</span>
    <span>💼 Y opportunities</span>
  </div>
  <button class="follow-btn">Follow</button>
</div>
```

### Opportunity Card

```html
<div class="opportunity-card">
  <div class="opp-header">
    <img src="org_logo" class="org-logo-small" />
    <div>
      <h4>Opportunity Title</h4>
      <p class="org-name">Organization Name</p>
    </div>
  </div>
  <p class="opp-type">Type • Location • Compensation</p>
  <div class="opp-skills">
    <span class="skill-tag">Skill 1</span>
    <span class="skill-tag">Skill 2</span>
  </div>
  <button class="apply-btn">Apply</button>
</div>
```

---

## Next Steps

1. **Run Database Migration** - Create all tables and functions
2. **Create Organization Manager** - JavaScript module for CRUD operations
3. **Build Organization Profile UI** - Display organization information
4. **Implement Opportunity Board** - List and filter opportunities
5. **Add to Synapse Visualization** - Show organizations in network
6. **Create Admin Panel** - Organization management interface
7. **Add Analytics** - Track engagement and applications

---

## Migration File

Ready to create `ORGANIZATIONS_SCHEMA.sql` with all the above schema?
