-- ============================================================================
-- START SEQUENCE WORKING QUERIES
-- These queries match your actual database schema and should work
-- ============================================================================

-- ============================================================================
-- 1. TEST THEMES QUERY
-- ============================================================================

-- Get active themes with participant counts
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
-- 2. TEST ORGANIZATIONS QUERY (Using Summary View)
-- ============================================================================

-- Use the active_organizations_summary view (RECOMMENDED - fastest)
-- Note: Columns are NOT prefixed (id, name, not org_id, org_name)
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

-- ============================================================================
-- 3. TEST ORGANIZATIONS QUERY (Direct - Fallback)
-- ============================================================================

-- Direct query if summary view doesn't work
-- Note: organizations table uses 'status' not 'is_active'
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
-- 4. DIAGNOSTIC QUERIES
-- ============================================================================

-- Count active themes
SELECT COUNT(*) as active_theme_count
FROM theme_circles
WHERE is_active = true
  AND (expires_at IS NULL OR expires_at > NOW());

-- Count active organizations (using summary view)
SELECT COUNT(*) as active_org_count
FROM active_organizations_summary;

-- Count active organizations (direct)
SELECT COUNT(*) as active_org_count
FROM organizations
WHERE status = 'active';

-- ============================================================================
-- 5. CHECK IF USER IS ALREADY PARTICIPATING
-- Replace 'YOUR_USER_ID' with actual community_id
-- ============================================================================

/*
-- Check theme participation
SELECT 
  tp.id,
  tc.title as theme_title,
  tp.engagement_level,
  tp.created_at
FROM theme_participants tp
JOIN theme_circles tc ON tp.theme_id = tc.id
WHERE tp.community_id = 'YOUR_USER_ID'
ORDER BY tp.created_at DESC;

-- Check organization following
SELECT 
  of.id,
  o.name as org_name,
  of.created_at as followed_at
FROM organization_followers of
JOIN organizations o ON of.organization_id = o.id
WHERE of.community_id = 'YOUR_USER_ID'
ORDER BY of.created_at DESC;
*/

-- ============================================================================
-- 6. INSERT SAMPLE DATA (if needed)
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
INSERT INTO organizations (name, slug, description, status, verified)
VALUES 
  ('Tech Innovators Inc', 'tech-innovators', 'Leading technology innovation company', 'active', true),
  ('Data Analytics Corp', 'data-analytics', 'Data-driven insights and solutions', 'active', true),
  ('Mobile First Studios', 'mobile-first', 'Mobile app development experts', 'active', false),
  ('AI Research Lab', 'ai-research', 'Cutting-edge AI research and development', 'active', true),
  ('Startup Accelerator', 'startup-accelerator', 'Helping startups grow and succeed', 'active', true);
*/

-- ============================================================================
-- 7. VIEW ACTUAL TABLE STRUCTURES
-- ============================================================================

-- See theme_circles columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'theme_circles'
ORDER BY ordinal_position;

-- See organizations columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organizations'
ORDER BY ordinal_position;

-- See active_organizations_summary columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'active_organizations_summary'
ORDER BY ordinal_position;
