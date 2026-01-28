-- ============================================================================
-- OPTIMIZED START SEQUENCE QUERIES
-- These queries use the summary views for better performance
-- ============================================================================

-- ============================================================================
-- THEMES QUERY
-- NOTE: active_themes_summary view may not exist yet
-- Using direct query with JOIN for participant count
-- ============================================================================

-- Direct query with participant count (RECOMMENDED)
SELECT 
  tc.id,
  tc.title,
  tc.description,
  tc.expires_at,
  tc.is_active,
  tc.created_at,
  COUNT(DISTINCT tp.id) as participant_count
FROM theme_circles tc
LEFT JOIN theme_participants tp ON tc.id = tp.theme_id
WHERE tc.is_active = true
  AND (tc.expires_at IS NULL OR tc.expires_at > NOW())
GROUP BY tc.id, tc.title, tc.description, tc.expires_at, tc.is_active, tc.created_at
ORDER BY participant_count DESC
LIMIT 5;

-- ============================================================================
-- ORGANIZATIONS QUERY - Using active_organizations_summary view
-- This view has pre-calculated counts (based on ORGANIZATIONS_SCHEMA.sql)
-- ============================================================================

-- Use the summary view (columns are NOT prefixed with org_)
SELECT 
  id,
  name,
  slug,
  description,
  logo_url,
  verified,
  follower_count,
  member_count,
  open_opportunities
FROM active_organizations_summary
ORDER BY follower_count DESC NULLS LAST
LIMIT 5;

-- Alternative: Direct query with JOIN (if summary view doesn't work)
SELECT 
  o.id,
  o.name,
  o.slug,
  o.description,
  o.logo_url,
  o.verified,
  o.status,
  o.created_at,
  COUNT(DISTINCT of.id) as follower_count
FROM organizations o
LEFT JOIN organization_followers of ON o.id = of.organization_id
WHERE o.status = 'active'
GROUP BY o.id, o.name, o.slug, o.description, o.logo_url, o.verified, o.status, o.created_at
ORDER BY follower_count DESC
LIMIT 5;

-- ============================================================================
-- DIAGNOSTIC QUERIES
-- ============================================================================

-- Check what columns are in active_themes_summary
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'active_themes_summary'
ORDER BY ordinal_position;

-- Check what columns are in active_organizations_summary
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'active_organizations_summary'
ORDER BY ordinal_position;

-- Check if views have data
SELECT 
  'active_themes_summary' as view_name,
  COUNT(*) as row_count
FROM active_themes_summary
UNION ALL
SELECT 
  'active_organizations_summary' as view_name,
  COUNT(*) as row_count
FROM active_organizations_summary;

-- ============================================================================
-- SAMPLE DATA QUERIES
-- ============================================================================

-- View sample themes from summary
SELECT * FROM active_themes_summary LIMIT 3;

-- View sample organizations from summary
SELECT * FROM active_organizations_summary LIMIT 3;

-- ============================================================================
-- CHECK USER PARTICIPATION
-- ============================================================================

-- Check if user is already interested in a theme
-- Replace 'YOUR_USER_ID' with actual user ID
/*
SELECT 
  tp.id,
  tc.title as theme_title,
  tp.engagement_level,
  tp.signals
FROM theme_participants tp
JOIN theme_circles tc ON tp.theme_id = tc.id
WHERE tp.community_id = 'YOUR_USER_ID';
*/

-- Check if user is already following an organization
-- Replace 'YOUR_USER_ID' with actual user ID
/*
SELECT 
  of.id,
  o.name as org_name,
  of.created_at as followed_at
FROM organization_followers of
JOIN organizations o ON of.organization_id = o.id
WHERE of.community_id = 'YOUR_USER_ID';
*/

-- ============================================================================
-- INSERT SAMPLE DATA (if needed)
-- ============================================================================

/*
-- Add sample themes
INSERT INTO theme_circles (title, description, is_active, expires_at)
VALUES 
  ('AI & Machine Learning', 'Explore artificial intelligence and ML projects', true, NOW() + INTERVAL '30 days'),
  ('Web Development', 'Build modern web applications', true, NOW() + INTERVAL '30 days'),
  ('Mobile Apps', 'Create iOS and Android applications', true, NOW() + INTERVAL '30 days'),
  ('Data Science', 'Analyze data and build insights', true, NOW() + INTERVAL '30 days'),
  ('Cybersecurity', 'Learn about security and ethical hacking', true, NOW() + INTERVAL '30 days');

-- Add sample organizations
INSERT INTO organizations (name, slug, description, is_active, verified)
VALUES 
  ('Tech Innovators Inc', 'tech-innovators', 'Leading technology innovation company', true, true),
  ('Data Analytics Corp', 'data-analytics', 'Data-driven insights and solutions', true, true),
  ('Mobile First Studios', 'mobile-first', 'Mobile app development experts', true, false),
  ('AI Research Lab', 'ai-research', 'Cutting-edge AI research and development', true, true),
  ('Startup Accelerator', 'startup-accelerator', 'Helping startups grow and succeed', true, true);
*/
