-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- SEED AI IN HEALTHCARE THEME
-- ================================================================
-- This script seeds the "AI in Healthcare" theme with:
-- 1. User dmhamilton1@live.com as a participant
-- 2. "maslow wearable" project linked to the theme
-- ================================================================

-- Step 1: Get the theme ID for "AI in Healthcare"
DO $$
DECLARE
  v_theme_id UUID;
  v_user_id UUID;
  v_project_id UUID;
BEGIN
  -- Find the AI in Healthcare theme (case insensitive)
  SELECT id INTO v_theme_id
  FROM theme_circles
  WHERE LOWER(title) LIKE '%ai%healthcare%'
     OR LOWER(title) LIKE '%healthcare%ai%'
  LIMIT 1;

  IF v_theme_id IS NULL THEN
    RAISE NOTICE 'AI in Healthcare theme not found. Please create it first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found AI in Healthcare theme: %', v_theme_id;

  -- Step 2: Find the user by email
  SELECT id INTO v_user_id
  FROM community
  WHERE email = 'dmhamilton1@live.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User dmhamilton1@live.com not found. Please ensure user is registered.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found user: %', v_user_id;

  -- Step 3: Add user as participant to the theme (if not already)
  INSERT INTO theme_participants (theme_id, community_id, engagement_level, signals)
  VALUES (v_theme_id, v_user_id, 'leading', 'leading')
  ON CONFLICT (theme_id, community_id)
  DO UPDATE SET
    engagement_level = 'leading',
    signals = 'leading',
    updated_at = NOW();

  RAISE NOTICE 'Added user as participant to AI in Healthcare theme';

  -- Step 4: Find the "maslow wearable" project
  SELECT id INTO v_project_id
  FROM projects
  WHERE LOWER(title) LIKE '%maslow%wearable%'
     OR LOWER(name) LIKE '%maslow%wearable%'
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Maslow wearable project not found. Please create it first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found maslow wearable project: %', v_project_id;

  -- Step 5: Link project to the theme
  UPDATE projects
  SET theme_id = v_theme_id
  WHERE id = v_project_id;

  RAISE NOTICE 'Linked maslow wearable project to AI in Healthcare theme';

  -- Step 6: Ensure user is creator/member of the project
  INSERT INTO project_members (project_id, user_id, community_id, role)
  VALUES (v_project_id, v_user_id, v_user_id, 'creator')
  ON CONFLICT (project_id, community_id)
  DO UPDATE SET
    role = CASE
      WHEN project_members.role = 'pending' THEN 'creator'
      ELSE project_members.role
    END;

  RAISE NOTICE 'Ensured user is creator of maslow wearable project';

  RAISE NOTICE '✅ Successfully seeded AI in Healthcare theme!';
  RAISE NOTICE '   - Theme: AI in Healthcare (%))', v_theme_id;
  RAISE NOTICE '   - User: dmhamilton1@live.com (%))', v_user_id;
  RAISE NOTICE '   - Project: maslow wearable (%))', v_project_id;
END $$;

-- Verify the seeding
SELECT
  'Theme Participants' as table_name,
  tc.title as theme_title,
  c.name as participant_name,
  c.email as participant_email,
  tp.engagement_level
FROM theme_participants tp
JOIN theme_circles tc ON tp.theme_id = tc.id
JOIN community c ON tp.community_id = c.id
WHERE tc.title ILIKE '%ai%healthcare%'
   OR tc.title ILIKE '%healthcare%ai%';

SELECT
  'Projects in Theme' as table_name,
  p.title as project_title,
  tc.title as theme_title,
  c.name as creator_name
FROM projects p
JOIN theme_circles tc ON p.theme_id = tc.id
JOIN community c ON p.creator_id = c.id
WHERE tc.title ILIKE '%ai%healthcare%'
   OR tc.title ILIKE '%healthcare%ai%';
