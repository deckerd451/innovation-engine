-- ================================================================
-- ADD MISSING VIEW FOR START FLOW INTEGRATION
-- ================================================================
-- This adds the opportunities_with_org view that the redesigned START flow expects
-- Run this in your Supabase SQL editor after the main organizations schema
-- ================================================================

-- Opportunities with organization details view
CREATE OR REPLACE VIEW opportunities_with_org AS
SELECT 
  opp.*,
  o.name as organization_name,
  o.slug as organization_slug,
  o.logo_url as organization_logo,
  o.verified as organization_verified,
  o.banner_url as organization_banner,
  o.industry as organization_industry,
  tc.title as theme_title,
  p.title as project_title
FROM opportunities opp
JOIN organizations o ON opp.organization_id = o.id
LEFT JOIN theme_circles tc ON opp.theme_id = tc.id
LEFT JOIN projects p ON opp.project_id = p.id
WHERE opp.status = 'open' 
AND (opp.expires_at IS NULL OR opp.expires_at > NOW())
AND o.status = 'active';

-- Verify the view was created
SELECT 'opportunities_with_org view created successfully!' as status;