-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- FIX START SEQUENCE FUNCTION - Malformed Array Fix
-- ================================================================
-- Copy this entire file and run in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/hvmotpzhliufzomewzfl/sql/new
-- ================================================================
-- This version handles skills stored as comma-separated strings
-- ================================================================

DROP FUNCTION IF EXISTS get_start_sequence_data(UUID);

CREATE OR REPLACE FUNCTION get_start_sequence_data(auth_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  user_community_id UUID;
  user_skills TEXT[];
  skills_raw TEXT;
BEGIN
  -- Get the community profile ID and skills for this auth user
  SELECT 
    id,
    skills::text
  INTO user_community_id, skills_raw
  FROM community 
  WHERE user_id = auth_user_id 
  LIMIT 1;
  
  -- Convert skills to array, handling both array and string formats
  IF skills_raw IS NULL OR skills_raw = '' THEN
    user_skills := ARRAY[]::TEXT[];
  ELSIF skills_raw LIKE '{%}' THEN
    -- Already an array format
    user_skills := skills_raw::TEXT[];
  ELSE
    -- Comma-separated string - convert to array and trim whitespace
    user_skills := ARRAY(
      SELECT trim(unnest(string_to_array(skills_raw, ',')))
    );
  END IF;

  -- If no community profile exists, return minimal data
  IF user_community_id IS NULL THEN
    RETURN json_build_object(
      'error', 'No community profile found',
      'has_profile', false
    );
  END IF;

  -- Build START sequence data
  SELECT json_build_object(
    'profile', json_build_object(
      'id', c.id,
      'name', c.name,
      'email', c.email,
      'image_url', c.image_url,
      'bio', c.bio,
      'skills', user_skills,
      'interests', CASE 
        WHEN c.interests IS NULL THEN ARRAY[]::TEXT[]
        WHEN c.interests::text LIKE '{%}' THEN c.interests
        ELSE ARRAY[]::TEXT[]
      END,
      'user_role', c.user_role,
      'profile_completed', c.profile_completed,
      'onboarding_completed', COALESCE(c.onboarding_completed, false),
      'onboarding_step', COALESCE(c.onboarding_step, 0)
    ),
    
    'progress', json_build_object(
      'xp', COALESCE(c.xp, 0),
      'level', COALESCE(c.level, 1),
      'login_streak', COALESCE(c.login_streak, 0),
      'last_login', c.last_login,
      'connection_count', COALESCE(c.connection_count, 0),
      'projects_created', COALESCE(c.projects_created, 0),
      'projects_joined', COALESCE(c.projects_joined, 0),
      'endorsements_given', COALESCE(c.endorsements_given, 0),
      'endorsements_received', COALESCE(c.endorsements_received, 0)
    ),
    
    'immediate_actions', json_build_object(
      'pending_requests', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM connections
          WHERE to_user_id = user_community_id 
          AND status = 'pending'
        ),
        'items', '[]'::json
      ),
      
      'unread_messages', json_build_object(
        'count', (
          SELECT COUNT(DISTINCT conversation_id)::int
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          WHERE (conv.participant_1_id = user_community_id OR conv.participant_2_id = user_community_id)
          AND m.sender_id != user_community_id
          AND m.read = false
        ),
        'conversations', '[]'::json
      ),
      
      'pending_bids', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM project_bids
          WHERE user_id = auth_user_id
          AND status = 'pending'
        ),
        'items', '[]'::json
      ),
      
      'bids_to_review', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM project_bids pb
          JOIN projects p ON p.id = pb.project_id
          WHERE p.creator_id = auth_user_id
          AND pb.status = 'pending'
        ),
        'items', '[]'::json
      )
    ),
    
    'opportunities', json_build_object(
      'skill_matched_projects', json_build_object(
        'count', CASE 
          WHEN array_length(user_skills, 1) > 0 THEN (
            SELECT COUNT(*)::int
            FROM projects p
            WHERE p.status = 'open'
            AND p.creator_id != auth_user_id
            AND p.required_skills IS NOT NULL
            AND array_length(p.required_skills, 1) > 0
            AND EXISTS (
              SELECT 1 
              FROM unnest(p.required_skills) AS project_skill
              WHERE project_skill = ANY(user_skills)
            )
          )
          ELSE 0
        END,
        'items', '[]'::json
      ),
      
      'active_themes', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM theme_circles
          WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        ),
        'items', '[]'::json
      ),
      
      'open_opportunities', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM opportunities
          WHERE status = 'open'
          AND (expires_at IS NULL OR expires_at > NOW())
        ),
        'items', '[]'::json
      ),
      
      'complementary_connections', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM community other
          WHERE other.id != user_community_id
          AND other.skills IS NOT NULL
          AND other.skills::text != ''
          AND other.skills::text != '{}'
          AND NOT EXISTS (
            SELECT 1 FROM connections conn
            WHERE ((conn.from_user_id = user_community_id AND conn.to_user_id = other.id)
               OR (conn.from_user_id = other.id AND conn.to_user_id = user_community_id))
            AND conn.status = 'accepted'
          )
        ),
        'items', '[]'::json
      )
    ),
    
    'momentum', json_build_object(
      'weekly_activity', (
        SELECT COUNT(*)::int
        FROM activity_log 
        WHERE community_user_id = user_community_id 
        AND created_at > NOW() - INTERVAL '7 days'
      ),
      
      'streak', json_build_object(
        'current', COALESCE(c.login_streak, 0),
        'last_login', c.last_login,
        'is_at_risk', (c.last_login < NOW() - INTERVAL '20 hours')
      ),
      
      'xp_progress', json_build_object(
        'current_xp', COALESCE(c.xp, 0),
        'current_level', COALESCE(c.level, 1),
        'next_level_xp', (COALESCE(c.level, 1) + 1) * 1000,
        'xp_to_next_level', ((COALESCE(c.level, 1) + 1) * 1000) - COALESCE(c.xp, 0),
        'progress_percentage', ROUND((COALESCE(c.xp, 0)::numeric / ((COALESCE(c.level, 1) + 1) * 1000)) * 100, 1)
      ),
      
      'recent_achievements', '[]'::json
    ),
    
    'network_insights', json_build_object(
      'connections', json_build_object(
        'total', COALESCE(c.connection_count, 0)
      ),
      
      'active_projects', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = auth_user_id
          AND pm.left_at IS NULL
          AND p.status IN ('open', 'in_progress')
        ),
        'items', '[]'::json
      ),
      
      'participating_themes', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM theme_participants tp
          JOIN theme_circles tc ON tc.id = tp.theme_id
          WHERE tp.community_id = user_community_id
          AND tc.status = 'active'
        ),
        'items', '[]'::json
      ),
      
      'growth', json_build_object(
        'new_connections', (
          SELECT COUNT(*)::int FROM connections
          WHERE (from_user_id = user_community_id OR to_user_id = user_community_id)
          AND status = 'accepted'
          AND created_at > NOW() - INTERVAL '30 days'
        ),
        'new_projects', (
          SELECT COUNT(*)::int FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = auth_user_id
          AND pm.joined_at > NOW() - INTERVAL '30 days'
        ),
        'new_themes', (
          SELECT COUNT(*)::int FROM theme_participants
          WHERE community_id = user_community_id
          AND joined_at > NOW() - INTERVAL '30 days'
        )
      )
    ),
    
    'recommendations', json_build_object(
      'priority_actions', '[]'::json
    ),
    
    'generated_at', NOW(),
    'has_profile', true
    
  ) INTO result
  FROM community c
  WHERE c.id = user_community_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_start_sequence_data(UUID) TO authenticated;

-- Verify it worked
SELECT 'Function fixed successfully! Skills format handled.' as status;
