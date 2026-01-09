-- ================================================================
-- CharlestonHacks - Demo Theme Circles for Testing
-- ================================================================
--
-- This script creates 8 diverse, realistic theme circles to test
-- the complete theme system including:
-- - Different lifecycle stages (emerging, active, decaying)
-- - Various durations (1 day to 30 days)
-- - Different activity scores (0 to 15)
-- - Diverse topics and tags
--
-- Run this AFTER applying THEME_CIRCLES_SCHEMA_SAFE.sql
-- ================================================================

-- Clear existing demo themes (optional)
-- Uncomment this if you want to start fresh
-- DELETE FROM theme_circles WHERE origin_type = 'admin' AND description LIKE '%DEMO%';

-- ================================================================
-- DEMO THEME 1: High Activity, Established Theme
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status,
  cta_text,
  cta_link
) VALUES (
  '🤖 AI in Healthcare',
  'Exploring applications of artificial intelligence in medical diagnostics, patient care, and health data analysis. DEMO THEME - Active collaboration ongoing.',
  ARRAY['ai', 'healthcare', 'machine-learning', 'diagnostics', 'medical-tech'],
  NOW() + INTERVAL '14 days',
  'admin',
  15,  -- High activity (will show as solid circle)
  NOW() - INTERVAL '3 days',  -- Created 3 days ago
  NOW() - INTERVAL '2 hours', -- Recent activity
  'active',
  'Join our Slack channel',
  '#healthcare-ai'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 2: Moderate Activity, Popular Topic
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status
) VALUES (
  '🌱 Sustainable Technology',
  'Building tech solutions for environmental challenges: renewable energy systems, carbon tracking, and eco-friendly products. DEMO THEME - Growing interest.',
  ARRAY['sustainability', 'environment', 'clean-tech', 'green-energy', 'climate'],
  NOW() + INTERVAL '7 days',
  'admin',
  8,  -- Moderate activity
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 day',
  'active'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 3: Emerging, Brand New
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status
) VALUES (
  '🔗 Web3 & Decentralization',
  'Exploring decentralized applications, smart contracts, DAOs, and the future of internet infrastructure. DEMO THEME - Just getting started.',
  ARRAY['web3', 'blockchain', 'cryptocurrency', 'defi', 'smart-contracts', 'dao'],
  NOW() + INTERVAL '30 days',
  'admin',
  2,  -- Low activity (will show as dashed circle - emerging)
  NOW() - INTERVAL '4 hours',
  NOW() - INTERVAL '1 hour',
  'active'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 4: Niche Topic, Moderate Duration
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status,
  cta_text,
  cta_link
) VALUES (
  '🎮 Game Development & Unity',
  'Creating immersive gaming experiences with Unity, Unreal Engine, and indie game development techniques. DEMO THEME - Active community.',
  ARRAY['gamedev', 'unity', 'game-design', 'graphics', 'indie'],
  NOW() + INTERVAL '10 days',
  'admin',
  6,
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '6 hours',
  'active',
  'Weekly game jam',
  'https://itch.io/charlestongames'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 5: Data Science & Analytics
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status
) VALUES (
  '📊 Data Science & Visualization',
  'Analyzing complex datasets, building predictive models, and creating compelling data visualizations. DEMO THEME - Looking for collaborators.',
  ARRAY['data-science', 'analytics', 'visualization', 'python', 'machine-learning', 'statistics'],
  NOW() + INTERVAL '21 days',
  'admin',
  10,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '3 hours',
  'active'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 6: Near Expiration, Test Decay Visuals
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status
) VALUES (
  '🚀 Startup Ideas Workshop',
  'Rapid prototyping and validation of startup concepts. This week only! DEMO THEME - Expiring soon to test decay visuals.',
  ARRAY['startup', 'entrepreneurship', 'mvp', 'product-market-fit'],
  NOW() + INTERVAL '18 hours',  -- Expires very soon
  'admin',
  12,
  NOW() - INTERVAL '6 days',
  NOW() - INTERVAL '30 minutes',
  'active'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 7: Cybersecurity & Privacy
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status,
  cta_text
) VALUES (
  '🔒 Cybersecurity & Ethical Hacking',
  'Learning about security vulnerabilities, penetration testing, and building secure applications. DEMO THEME - CTF challenges available.',
  ARRAY['security', 'cybersecurity', 'ethical-hacking', 'pentesting', 'privacy'],
  NOW() + INTERVAL '14 days',
  'admin',
  7,
  NOW() - INTERVAL '4 days',
  NOW() - INTERVAL '12 hours',
  'active',
  'Join our CTF competition'
) RETURNING id, title, activity_score;

-- ================================================================
-- DEMO THEME 8: Very New, Minimal Activity
-- ================================================================
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  created_at,
  last_activity_at,
  status
) VALUES (
  '🎨 UI/UX Design Collaboration',
  'Improving user experiences through thoughtful design, prototyping, and user research. DEMO THEME - Looking for first participants.',
  ARRAY['design', 'ux', 'ui', 'figma', 'prototyping', 'user-research'],
  NOW() + INTERVAL '20 days',
  'admin',
  0,  -- No activity yet (truly emerging)
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '30 minutes',
  'active'
) RETURNING id, title, activity_score;

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- View all created themes
SELECT
  title,
  array_length(tags, 1) as tag_count,
  activity_score,
  EXTRACT(DAY FROM (expires_at - NOW())) as days_remaining,
  EXTRACT(HOUR FROM (expires_at - NOW())) as hours_remaining,
  status,
  CASE
    WHEN activity_score < 5 THEN 'emerging (dashed border)'
    ELSE 'established (solid border)'
  END as visual_state
FROM theme_circles
WHERE origin_type = 'admin'
  AND status = 'active'
ORDER BY activity_score DESC;

-- Check the active themes summary view
SELECT * FROM active_themes_summary
ORDER BY activity_score DESC;

-- ================================================================
-- OPTIONAL: Add Sample Participants
-- ================================================================
-- Uncomment and modify these to add yourself or test users as participants

-- First, get your community ID:
-- SELECT id, name, email FROM community WHERE email = 'your-email@example.com';

-- Then add yourself to themes (replace YOUR_COMMUNITY_ID):
/*
INSERT INTO theme_participants (theme_id, community_id, engagement_level, signals)
SELECT
  id,
  'YOUR_COMMUNITY_ID',  -- Replace with your actual community.id
  'interested',
  ARRAY['exploring', 'has-expertise']
FROM theme_circles
WHERE title IN ('AI in Healthcare', 'Data Science & Visualization', 'Web3 & Decentralization')
  AND status = 'active'
ON CONFLICT (theme_id, community_id) DO NOTHING;
*/

-- Add multiple users to the most popular theme:
/*
INSERT INTO theme_participants (theme_id, community_id, engagement_level, signals)
SELECT
  (SELECT id FROM theme_circles WHERE title = 'AI in Healthcare' LIMIT 1),
  c.id,
  'interested',
  ARRAY['interested']
FROM community c
LIMIT 5  -- Add 5 random users
ON CONFLICT (theme_id, community_id) DO NOTHING;
*/

-- ================================================================
-- CLEANUP (if needed)
-- ================================================================
-- To remove all demo themes:
-- DELETE FROM theme_circles WHERE description LIKE '%DEMO THEME%';

-- ================================================================
-- SUCCESS MESSAGE
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Demo themes created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '1. Refresh your dashboard (Ctrl+Shift+R)';
  RAISE NOTICE '2. Look for 8 theme circles on the Synapse graph';
  RAISE NOTICE '3. Hover over themes to see details';
  RAISE NOTICE '4. Click themes to interact';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Visual guide:';
  RAISE NOTICE '- Large circles with ✨ emoji = themes';
  RAISE NOTICE '- Dashed border = emerging (low activity)';
  RAISE NOTICE '- Solid border = established (high activity)';
  RAISE NOTICE '- "18h left" = about to expire (test decay visuals)';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Verify with: SELECT * FROM active_themes_summary;';
END $$;

-- Display final count
SELECT
  COUNT(*) as total_active_themes,
  COUNT(*) FILTER (WHERE activity_score >= 5) as established_themes,
  COUNT(*) FILTER (WHERE activity_score < 5) as emerging_themes,
  COUNT(*) FILTER (WHERE expires_at < NOW() + INTERVAL '1 day') as expiring_soon
FROM theme_circles
WHERE status = 'active'
  AND description LIKE '%DEMO THEME%';
