-- ============================================================================
-- CREATE MISSING USER PROFILE
-- ============================================================================
-- This script manually creates a community profile for a user who doesn't have one
-- Run this in your Supabase SQL Editor if automatic profile creation fails
-- ============================================================================

-- First, let's check what auth users exist without community profiles
SELECT 
  au.id as auth_user_id,
  au.email,
  au.created_at as auth_created_at,
  c.id as community_id,
  c.name as community_name
FROM auth.users au
LEFT JOIN community c ON c.user_id = au.id
WHERE c.id IS NULL
ORDER BY au.created_at DESC;

-- If you see your user in the results above, run this to create the profile:
-- (Replace the email with your actual email)

INSERT INTO community (
  user_id,
  email,
  name,
  skills,
  bio,
  image_url,
  interests,
  availability,
  profile_completed
)
SELECT 
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    split_part(au.email, '@', 1)
  ) as name,
  '' as skills,
  '' as bio,
  au.raw_user_meta_data->>'avatar_url' as image_url,
  '[]'::jsonb as interests,
  'Available' as availability,
  false as profile_completed
FROM auth.users au
LEFT JOIN community c ON c.user_id = au.id
WHERE c.id IS NULL
  AND au.email = 'YOUR_EMAIL_HERE@example.com'  -- REPLACE WITH YOUR EMAIL
ON CONFLICT (user_id) DO NOTHING;

-- Verify the profile was created
SELECT 
  c.id,
  c.user_id,
  c.email,
  c.name,
  c.created_at
FROM community c
JOIN auth.users au ON au.id = c.user_id
WHERE au.email = 'YOUR_EMAIL_HERE@example.com';  -- REPLACE WITH YOUR EMAIL

-- ============================================================================
-- ALTERNATIVE: Create profile for ALL users without profiles
-- ============================================================================
-- Uncomment and run this if you want to create profiles for all auth users
-- who don't have community profiles yet:

/*
INSERT INTO community (
  user_id,
  email,
  name,
  skills,
  bio,
  image_url,
  interests,
  availability,
  profile_completed
)
SELECT 
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    split_part(au.email, '@', 1)
  ) as name,
  '' as skills,
  '' as bio,
  au.raw_user_meta_data->>'avatar_url' as image_url,
  '[]'::jsonb as interests,
  'Available' as availability,
  false as profile_completed
FROM auth.users au
LEFT JOIN community c ON c.user_id = au.id
WHERE c.id IS NULL
ON CONFLICT (user_id) DO NOTHING;
*/
