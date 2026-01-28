-- ============================================================================
-- START SEQUENCE TEST QUERIES
-- Use these queries in Supabase SQL Editor to test theme and organization data
-- ============================================================================

-- ============================================================================
-- THEMES QUERY
-- This query matches what the start sequence uses to load theme recommendations
-- NOTE: Adjusted for actual schema (no participant_count or status columns)
-- ============================================================================

-- Get active themes that haven't expired
-- Using is_active instead of status, and counting participants via JOIN
SELECT 
  tc.id,
  tc.title,
  tc.description,
  tc.expires_at,
  tc.is_active,
  tc.created_at,
  COUNT(tp.id) as participant_count
FROM theme_circles tc
LEFT JOIN theme_participants tp ON tc.id = tp.theme_id
WHERE tc.is_active = true
  AND (tc.expires_at IS NULL OR tc.expires_at > NOW())
GROUP BY tc.id, tc.title, tc.description, tc.expires_at, tc.is_active, tc.created_at
ORDER BY participant_count DESC
LIMIT 5;

-- Simpler version if theme_participants doesn't exist yet:
-- SELECT 
--   id,
--   title,
--   description,
--   expires_at,
--   is_active,
--   created_at
-- FROM theme_circles
-- WHERE is_active = true
--   AND (expires_at IS NULL OR expires_at > NOW())
-- ORDER BY created_at DESC
-- LIMIT 5;

-- ============================================================================
-- THEMES - Additional diagnostic queries
-- ============================================================================

-- Count total active themes
SELECT COUNT(*) as total_active_themes
FROM theme_circles
WHERE is_active = true
  AND (expires_at IS NULL OR expires_at > NOW());

-- See all themes (including inactive/expired) for debugging
SELECT 
  id,
  title,
  is_active,
  expires_at,
  CASE 
    WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 'EXPIRED'
    WHEN is_active = false THEN 'INACTIVE'
    ELSE 'VALID'
  END as validity_status,
  created_at
FROM theme_circles
ORDER BY created_at DESC;

-- Check if user is already interested in a theme (replace UUIDs with actual values)
-- SELECT id
-- FROM theme_participants
-- WHERE theme_id = 'YOUR_THEME_ID_HERE'
--   AND community_id = 'YOUR_USER_ID_HERE';

-- ============================================================================
-- ORGANIZATIONS QUERY
-- This query matches what the start sequence uses to load organization recommendations
-- ============================================================================

-- Get active organizations, ordered by follower count
SELECT 
  id,
  name,
  slug,
  description,
  logo_url,
  industry,
  follower_count,
  verified,
  is_active,
  created_at
FROM organizations
WHERE is_active = true
ORDER BY follower_count DESC NULLS LAST
LIMIT 5;

-- ============================================================================
-- ORGANIZATIONS - Additional diagnostic queries
-- ============================================================================

-- Count total active organizations
SELECT COUNT(*) as total_active_organizations
FROM organizations
WHERE is_active = true;

-- See all organizations (including inactive) for debugging
SELECT 
  id,
  name,
  is_active,
  follower_count,
  verified,
  industry,
  CASE 
    WHEN is_active = false THEN 'INACTIVE'
    ELSE 'ACTIVE'
  END as status
FROM organizations
ORDER BY created_at DESC;

-- Check if user is already following an organization (replace UUIDs with actual values)
-- SELECT id
-- FROM organization_followers
-- WHERE organization_id = 'YOUR_ORG_ID_HERE'
--   AND community_id = 'YOUR_USER_ID_HERE';

-- ============================================================================
-- COMBINED DIAGNOSTICS
-- Check if the tables exist and have data
-- ============================================================================

-- Table existence and row counts
SELECT 
  'theme_circles' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())) as active_valid_rows
FROM theme_circles
UNION ALL
SELECT 
  'organizations' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE is_active = true) as active_valid_rows
FROM organizations;

-- ============================================================================
-- SAMPLE DATA INSERTION (if tables are empty)
-- Uncomment and modify these if you need to add test data
-- ============================================================================

/*
-- Insert sample themes (adjusted for actual schema)
INSERT INTO theme_circles (title, description, is_active, expires_at)
VALUES 
  ('AI & Machine Learning', 'Explore artificial intelligence and ML projects', true, NOW() + INTERVAL '30 days'),
  ('Web Development', 'Build modern web applications', true, NOW() + INTERVAL '30 days'),
  ('Mobile Apps', 'Create iOS and Android applications', true, NOW() + INTERVAL '30 days'),
  ('Data Science', 'Analyze data and build insights', true, NOW() + INTERVAL '30 days'),
  ('Cybersecurity', 'Learn about security and ethical hacking', true, NOW() + INTERVAL '30 days');

-- Insert sample organizations
INSERT INTO organizations (name, slug, description, is_active, verified)
VALUES 
  ('Tech Innovators Inc', 'tech-innovators', 'Leading technology innovation company', true, true),
  ('Data Analytics Corp', 'data-analytics', 'Data-driven insights and solutions', true, true),
  ('Mobile First Studios', 'mobile-first', 'Mobile app development experts', true, false),
  ('AI Research Lab', 'ai-research', 'Cutting-edge AI research and development', true, true),
  ('Startup Accelerator', 'startup-accelerator', 'Helping startups grow and succeed', true, true);
*/

-- ============================================================================
-- TROUBLESHOOTING QUERIES
-- ============================================================================

-- Check theme_participants table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'theme_participants'
ORDER BY ordinal_position;

-- Check organization_followers table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_followers'
ORDER BY ordinal_position;

-- Check for any themes with NULL or invalid data
SELECT 
  id,
  title,
  CASE 
    WHEN title IS NULL THEN 'Missing title'
    WHEN is_active IS NULL THEN 'Missing is_active flag'
    ELSE 'OK'
  END as data_issue
FROM theme_circles
WHERE title IS NULL OR is_active IS NULL;

-- Check for any organizations with NULL or invalid data
SELECT 
  id,
  name,
  CASE 
    WHEN name IS NULL THEN 'Missing name'
    WHEN is_active IS NULL THEN 'Missing is_active flag'
    ELSE 'OK'
  END as data_issue
FROM organizations
WHERE name IS NULL OR is_active IS NULL;
