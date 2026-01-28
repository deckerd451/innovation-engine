-- ============================================================================
-- CHECK ACTUAL THEME_CIRCLES AND ORGANIZATIONS TABLE STRUCTURE
-- Run this first to see what columns actually exist in your database
-- ============================================================================

-- Check theme_circles table structure
SELECT 
  'theme_circles columns' as info,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'theme_circles'
ORDER BY ordinal_position;

-- Check organizations table structure
SELECT 
  'organizations columns' as info,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'organizations'
ORDER BY ordinal_position;

-- Check if theme_participants table exists
SELECT 
  'theme_participants columns' as info,
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'theme_participants'
ORDER BY ordinal_position;

-- Check if organization_followers table exists
SELECT 
  'organization_followers columns' as info,
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'organization_followers'
ORDER BY ordinal_position;

-- Check what tables exist
SELECT 
  'existing tables' as info,
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%theme%' OR table_name LIKE '%org%'
ORDER BY table_name;
