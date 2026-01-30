-- ================================================================
-- PHASE 3: MINIMAL START SEQUENCE FUNCTION
-- ================================================================
-- Simplified version that only uses guaranteed columns
-- Run this in Supabase SQL Editor
-- ================================================================

DROP FUNCTION IF EXISTS get_start_sequence_data(UUID);

CREATE OR REPLACE FUNCTION get_start_sequence_data(auth_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  user_community_id UUID;
BEGIN
  -- Get the community profile ID
  SELECT id INTO user_community_id
  FROM community 
  WHERE user_id = auth_user_id 
  LIMIT 1;

  -- If no community profile exists, return minimal data
  IF user_community_id IS NULL THEN
    RETURN json_build_object(
      'error', 'No community profile found',
      'has_profile', false,
      'is_new_user', true
    );
  END IF;

  -- Update START view tracking (if columns exist)
  UPDATE community
  SET
    last_start_view_at = NOW(),
    start_view_count = COALESCE(start_view_count, 0) + 1
  WHERE id = user_community_id;

  -- Build minimal START sequence data using only guaranteed columns
  SELECT json_build_object(
    'is_new_user', NOT COALESCE(c.onboarding_completed, false),
    'last_login', c.last_login,
    'previous_login', c.previous_login_at,
    'has_updates', c.previous_login_at IS NOT NULL,
    
    'profile', json_build_object(
      'id', c.id,
      'name', c.name,
      'email', c.email,
      'image_url', c.image_url,
      'bio', c.bio,
      'skills', ARRAY[]::TEXT[],
      'interests', c.interests,
      'user_role', c.user_role,
      'profile_completed', COALESCE(c.profile_completed, false),
      'onboarding_completed', COALESCE(c.onboarding_completed, false),
      'onboarding_step', COALESCE(c.onboarding_step, 0)
    ),
    
    'progress', json_build_object(
      'xp', COALESCE(c.xp, 0),
      'level', COALESCE(c.level, 1),
      'login_streak', COALESCE(c.login_streak, 0),
      'last_login', c.last_login,
      'connection_count', COALESCE(c.connection_count, 0),
      'projects_created', 0,
      'projects_joined', 0,
      'endorsements_given', 0,
      'endorsements_received', 0
    ),
    
    'immediate_actions', json_build_object(
      'pending_requests', json_build_object('count', 0, 'items', '[]'::json),
      'unread_messages', json_build_object('count', 0, 'conversations', '[]'::json),
      'pending_bids', json_build_object('count', 0, 'items', '[]'::json),
      'bids_to_review', json_build_object('count', 0, 'items', '[]'::json)
    ),
    
    'whats_new', json_build_object(
      'new_connections', 0,
      'new_messages', 0,
      'new_connection_requests', 0,
      'new_projects_in_themes', 0,
      'new_theme_members', 0
    ),
    
    'opportunities', json_build_object(
      'skill_matched_projects', json_build_object('count', 0),
      'active_themes', json_build_object('count', 0),
      'complementary_connections', json_build_object('count', 0),
      'open_opportunities', json_build_object('count', 0)
    ),
    
    'momentum', json_build_object(
      'weekly_activity', 0,
      'streak', json_build_object(
        'current', COALESCE(c.login_streak, 0),
        'is_at_risk', false,
        'best', COALESCE(c.login_streak, 0)
      ),
      'xp_progress', json_build_object(
        'current_xp', COALESCE(c.xp, 0),
        'current_level', COALESCE(c.level, 1),
        'next_level_xp', COALESCE(c.level, 1) * 1000,
        'progress_percentage', ROUND((COALESCE(c.xp, 0)::numeric / NULLIF(COALESCE(c.level, 1) * 1000, 0)::numeric) * 100)
      )
    ),
    
    'network_insights', json_build_object(
      'connections', json_build_object(
        'total', COALESCE(c.connection_count, 0),
        'accepted', 0
      ),
      'active_projects', json_build_object('count', 0),
      'participating_themes', json_build_object('count', 0),
      'growth', json_build_object(
        'new_connections', 0,
        'new_projects', 0,
        'new_themes', 0
      )
    )
  )
  INTO result
  FROM community c
  WHERE c.id = user_community_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_start_sequence_data(UUID) TO authenticated;

-- Test the function
-- SELECT get_start_sequence_data('your-user-id-here');
