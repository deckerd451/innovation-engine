-- ================================================================
-- AUTO-ASSIGN THEME_ID TO PROJECTS
-- ================================================================
-- This migration ensures all projects have a theme_id
-- Projects without a theme are assigned to a "General" theme

-- Step 1: Create a "General" theme if it doesn't exist
INSERT INTO theme_circles (
  id,
  title,
  description,
  tags,
  status,
  origin_type,
  expires_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  'General Projects',
  'Projects that don''t fit into a specific theme circle. A place for diverse ideas and collaborations.',
  ARRAY['general', 'miscellaneous', 'open'],
  'active',
  'system',
  (NOW() + INTERVAL '1 year')::timestamptz,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM theme_circles WHERE title = 'General Projects'
);

-- Step 2: Get the ID of the General theme
DO $$
DECLARE
  general_theme_id UUID;
BEGIN
  -- Get the General theme ID
  SELECT id INTO general_theme_id
  FROM theme_circles
  WHERE title = 'General Projects'
  LIMIT 1;

  -- Update projects without theme_id
  UPDATE projects
  SET 
    theme_id = general_theme_id,
    updated_at = NOW()
  WHERE theme_id IS NULL;

  -- Log the result
  RAISE NOTICE '✅ Updated % projects with General theme', 
    (SELECT COUNT(*) FROM projects WHERE theme_id = general_theme_id);
END $$;

-- Step 3: Add a trigger to auto-assign new projects to General theme if no theme specified
CREATE OR REPLACE FUNCTION auto_assign_general_theme()
RETURNS TRIGGER AS $$
DECLARE
  general_theme_id UUID;
BEGIN
  -- Only assign if theme_id is NULL
  IF NEW.theme_id IS NULL THEN
    -- Get the General theme ID
    SELECT id INTO general_theme_id
    FROM theme_circles
    WHERE title = 'General Projects'
    LIMIT 1;
    
    -- Assign it
    IF general_theme_id IS NOT NULL THEN
      NEW.theme_id := general_theme_id;
      RAISE NOTICE '🎯 Auto-assigned project "%" to General theme', NEW.title;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_assign_general_theme ON projects;

-- Create trigger
CREATE TRIGGER trigger_auto_assign_general_theme
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_general_theme();

-- Verification query
SELECT 
  'Projects with theme_id' as status,
  COUNT(*) as count
FROM projects
WHERE theme_id IS NOT NULL
UNION ALL
SELECT 
  'Projects without theme_id' as status,
  COUNT(*) as count
FROM projects
WHERE theme_id IS NULL;

-- Show General theme info
SELECT 
  id,
  title,
  description,
  (SELECT COUNT(*) FROM projects WHERE theme_id = theme_circles.id) as project_count
FROM theme_circles
WHERE title = 'General Projects';

RAISE NOTICE '✅ Theme auto-assignment configured successfully!';
