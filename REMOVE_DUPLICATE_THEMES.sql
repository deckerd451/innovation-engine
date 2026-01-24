-- ============================================================================
-- Remove Duplicate Theme Circles
-- ============================================================================
-- This script identifies and removes duplicate themes based on title.
-- For each set of duplicates, it keeps the oldest one (earliest created_at)
-- and deletes the rest.
--
-- IMPORTANT: Review the duplicates before running the DELETE statements!
-- ============================================================================

-- Step 1: Identify duplicates
-- This query shows all themes that have duplicates
SELECT 
  LOWER(TRIM(title)) as normalized_title,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as theme_ids,
  STRING_AGG(created_at::text, ', ') as created_dates
FROM theme_circles
GROUP BY LOWER(TRIM(title))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 2: See detailed duplicate information
-- This shows each duplicate with its details
WITH duplicates AS (
  SELECT 
    LOWER(TRIM(title)) as normalized_title,
    COUNT(*) OVER (PARTITION BY LOWER(TRIM(title))) as duplicate_count
  FROM theme_circles
)
SELECT 
  tc.id,
  tc.title,
  tc.created_at,
  tc.status,
  tc.expires_at,
  d.duplicate_count,
  ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(tc.title)) ORDER BY tc.created_at ASC) as row_num
FROM theme_circles tc
JOIN duplicates d ON LOWER(TRIM(tc.title)) = d.normalized_title
WHERE d.duplicate_count > 1
ORDER BY LOWER(TRIM(tc.title)), tc.created_at;

-- Step 3: Preview what will be deleted
-- This shows which themes will be KEPT (row_num = 1) and which will be DELETED (row_num > 1)
WITH ranked_themes AS (
  SELECT 
    id,
    title,
    created_at,
    status,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as row_num,
    COUNT(*) OVER (PARTITION BY LOWER(TRIM(title))) as duplicate_count
  FROM theme_circles
)
SELECT 
  id,
  title,
  created_at,
  status,
  CASE 
    WHEN row_num = 1 THEN '✅ KEEP (oldest)'
    ELSE '🗑️ DELETE (duplicate)'
  END as action
FROM ranked_themes
WHERE duplicate_count > 1
ORDER BY LOWER(TRIM(title)), created_at;

-- ============================================================================
-- DANGER ZONE: Actual deletion
-- ============================================================================
-- ONLY RUN THIS AFTER REVIEWING THE ABOVE QUERIES!
-- ============================================================================

-- Step 4a: First, reassign projects from duplicate themes to the kept theme
-- This ensures no projects are orphaned
WITH ranked_themes AS (
  SELECT 
    id,
    LOWER(TRIM(title)) as normalized_title,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as row_num,
    COUNT(*) OVER (PARTITION BY LOWER(TRIM(title))) as duplicate_count
  FROM theme_circles
),
themes_to_keep AS (
  SELECT id, normalized_title
  FROM ranked_themes
  WHERE row_num = 1 AND duplicate_count > 1
),
themes_to_delete AS (
  SELECT id, normalized_title
  FROM ranked_themes
  WHERE row_num > 1 AND duplicate_count > 1
)
UPDATE projects
SET theme_id = (
  SELECT tk.id 
  FROM themes_to_keep tk
  JOIN themes_to_delete td ON tk.normalized_title = td.normalized_title
  WHERE td.id = projects.theme_id
)
WHERE theme_id IN (SELECT id FROM themes_to_delete);

-- Step 4b: Delete theme participants for duplicate themes
WITH ranked_themes AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as row_num,
    COUNT(*) OVER (PARTITION BY LOWER(TRIM(title))) as duplicate_count
  FROM theme_circles
)
DELETE FROM theme_participants
WHERE theme_id IN (
  SELECT id 
  FROM ranked_themes 
  WHERE row_num > 1 AND duplicate_count > 1
);

-- Step 4c: Delete the duplicate themes (keep only the oldest)
WITH ranked_themes AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as row_num,
    COUNT(*) OVER (PARTITION BY LOWER(TRIM(title))) as duplicate_count
  FROM theme_circles
)
DELETE FROM theme_circles
WHERE id IN (
  SELECT id 
  FROM ranked_themes 
  WHERE row_num > 1 AND duplicate_count > 1
);

-- Step 5: Verify duplicates are gone
SELECT 
  LOWER(TRIM(title)) as normalized_title,
  COUNT(*) as count
FROM theme_circles
GROUP BY LOWER(TRIM(title))
HAVING COUNT(*) > 1;
-- This should return 0 rows if successful

-- Step 6: Show remaining themes
SELECT 
  id,
  title,
  created_at,
  status,
  expires_at,
  (SELECT COUNT(*) FROM projects WHERE theme_id = theme_circles.id) as project_count
FROM theme_circles
ORDER BY title;
