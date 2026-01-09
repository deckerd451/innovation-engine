-- ================================================================
-- Add Theme Assignment to Projects
-- ================================================================
-- This migration adds the ability to assign projects to theme circles
--
-- Features:
-- - Optional theme_id column on projects table
-- - Foreign key relationship with theme_circles
-- - Index for faster queries
-- - Helper view to see projects by theme
--
-- Run this AFTER theme_circles table exists
-- ================================================================

-- Add theme_id column to projects (optional relationship)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS theme_id UUID REFERENCES public.theme_circles(id) ON DELETE SET NULL;

-- Add index for theme-based project queries
CREATE INDEX IF NOT EXISTS idx_projects_theme
  ON public.projects(theme_id)
  WHERE theme_id IS NOT NULL;

-- Add tags column if it doesn't exist (for tag-based matching)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Update required_skills to be array if it's text
DO $$
BEGIN
  -- Check if required_skills is TEXT type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name = 'required_skills'
    AND data_type = 'text'
  ) THEN
    -- Convert TEXT to TEXT[]
    ALTER TABLE public.projects
    ALTER COLUMN required_skills TYPE TEXT[]
    USING string_to_array(required_skills, ',');

    RAISE NOTICE 'Converted required_skills from TEXT to TEXT[]';
  END IF;
END $$;

-- Create a helpful view for theme-project relationships
CREATE OR REPLACE VIEW theme_projects_view AS
SELECT
  tc.id as theme_id,
  tc.title as theme_title,
  tc.tags as theme_tags,
  tc.status as theme_status,
  tc.expires_at,
  p.id as project_id,
  p.title as project_title,
  p.description as project_description,
  p.status as project_status,
  p.creator_id,
  p.tags as project_tags,
  p.created_at as project_created_at,
  CASE
    WHEN p.theme_id = tc.id THEN 'explicit'
    ELSE 'tag_match'
  END as relationship_type
FROM theme_circles tc
LEFT JOIN projects p ON (
  -- Explicitly assigned
  p.theme_id = tc.id
  OR
  -- Tag-based relationship (any tag matches)
  (p.theme_id IS NULL AND p.tags && tc.tags)
)
WHERE tc.status = 'active'
  AND (p.status IN ('active', 'in-progress', 'open') OR p.id IS NULL)
ORDER BY tc.title, relationship_type, p.created_at DESC;

-- Comment on the view
COMMENT ON VIEW theme_projects_view IS
'Shows all projects related to active themes, either by explicit assignment (theme_id) or tag matching';

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Check if column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name = 'theme_id'
  ) THEN
    RAISE NOTICE '✅ theme_id column added to projects table';
  ELSE
    RAISE WARNING '❌ theme_id column NOT found in projects table';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name = 'tags'
  ) THEN
    RAISE NOTICE '✅ tags column exists on projects table';
  ELSE
    RAISE WARNING '❌ tags column NOT found in projects table';
  END IF;
END $$;

-- Show sample of theme-project relationships
SELECT
  theme_title,
  COUNT(project_id) as project_count,
  COUNT(CASE WHEN relationship_type = 'explicit' THEN 1 END) as explicit_assignments,
  COUNT(CASE WHEN relationship_type = 'tag_match' THEN 1 END) as tag_matches
FROM theme_projects_view
GROUP BY theme_id, theme_title
ORDER BY project_count DESC;

-- ================================================================
-- USAGE EXAMPLES
-- ================================================================

-- Example 1: Assign existing project to theme
/*
UPDATE projects
SET theme_id = (SELECT id FROM theme_circles WHERE title = 'AI in Healthcare' LIMIT 1)
WHERE title = 'Your Project Name';
*/

-- Example 2: Create new project assigned to theme
/*
INSERT INTO projects (title, description, creator_id, theme_id, tags, status)
VALUES (
  'Medical AI Chatbot',
  'Building an AI assistant for patient triage',
  'YOUR_COMMUNITY_ID_HERE',
  (SELECT id FROM theme_circles WHERE title = 'AI in Healthcare' LIMIT 1),
  ARRAY['ai', 'healthcare', 'chatbot'],
  'active'
);
*/

-- Example 3: Find all projects for a specific theme
/*
SELECT
  project_title,
  relationship_type,
  project_status,
  project_created_at
FROM theme_projects_view
WHERE theme_title = 'AI in Healthcare'
ORDER BY relationship_type, project_created_at DESC;
*/

-- Example 4: Remove theme assignment
/*
UPDATE projects
SET theme_id = NULL
WHERE title = 'Your Project Name';
*/

-- Example 5: Get counts of projects per theme
/*
SELECT
  tc.title,
  COUNT(DISTINCT p.id) FILTER (WHERE p.theme_id = tc.id) as explicit_count,
  COUNT(DISTINCT p2.id) FILTER (WHERE p2.theme_id IS NULL AND p2.tags && tc.tags) as tag_match_count
FROM theme_circles tc
LEFT JOIN projects p ON p.theme_id = tc.id
LEFT JOIN projects p2 ON p2.tags && tc.tags
WHERE tc.status = 'active'
GROUP BY tc.id, tc.title
ORDER BY explicit_count DESC;
*/

-- ================================================================
-- SUCCESS MESSAGE
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Theme-Project integration migration complete!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 What was added:';
  RAISE NOTICE '  - theme_id column on projects table';
  RAISE NOTICE '  - Foreign key to theme_circles';
  RAISE NOTICE '  - Index for performance';
  RAISE NOTICE '  - theme_projects_view for easy querying';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Next steps:';
  RAISE NOTICE '  1. Update project creation UI to show theme dropdown';
  RAISE NOTICE '  2. Update theme admin UI to manage project assignments';
  RAISE NOTICE '  3. Test assigning projects to themes';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Verify with: SELECT * FROM theme_projects_view;';
  RAISE NOTICE '';
END $$;
