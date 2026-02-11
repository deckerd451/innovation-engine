-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- PHASE 3: START SEQUENCE REDESIGN - Database Migration
-- ================================================================
-- Adds tracking for onboarding progress and "what's new" features
-- Run this in Supabase SQL Editor
-- ================================================================

-- ================================================================
-- STEP 1: Add tracking columns to community table
-- ================================================================

-- Add onboarding tracking
ALTER TABLE community
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add login tracking
ALTER TABLE community
ADD COLUMN IF NOT EXISTS previous_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_start_view_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS start_view_count INTEGER DEFAULT 0;

-- ================================================================
-- STEP 2: Create function to update login timestamps
-- ================================================================

CREATE OR REPLACE FUNCTION update_login_timestamp(auth_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE community
  SET
    previous_login_at = last_login,
    last_login = NOW()
  WHERE user_id = auth_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 3: Update START sequence function to detect new users
-- ================================================================

DROP FUNCTION IF EXISTS get_start_sequence_data(UUID);

CREATE OR REPLACE FUNCTION get_start_sequence_data(auth_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  user_community_id UUID;
  user_skills TEXT[];
  is_new_user BOOLEAN;
  last_login_time TIMESTAMPTZ;
  previous_login_time TIMESTAMPTZ;
BEGIN
  -- Get community profile data
  SELECT
    id,
    COALESCE(skills, ARRAY[]::TEXT[]),
    NOT COALESCE(onboarding_completed, false),
    last_login,
    previous_login_at
  INTO
    user_community_id,
    user_skills,
    is_new_user,
    last_login_time,
    previous_login_time
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

  -- Update START view tracking
  UPDATE community
  SET
    last_start_view_at = NOW(),
    start_view_count = COALESCE(start_view_count, 0) + 1
  WHERE id = user_community_id;

  -- Build START sequence data
  SELECT json_build_object(
    'is_new_user', is_new_user,
    'last_login', last_login_time,
    'previous_login', previous_login_time,
    'has_updates', previous_login_time IS NOT NULL,

    'profile', json_build_object(
      'id', c.id,
      'name', c.name,
      'email', c.email,
      'image_url', c.image_url,
      'bio', c.bio,
      'skills', COALESCE(c.skills, ARRAY[]::TEXT[]),
      'interests', c.interests,
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

    'whats_new', CASE
      WHEN previous_login_time IS NULL THEN '{}'::json
      ELSE json_build_object(
        'new_connections', (
          SELECT COUNT(*)::int
          FROM connections
          WHERE to_user_id = user_community_id
          AND status = 'accepted'
          AND updated_at > previous_login_time
        ),
        'new_messages', (
          SELECT COUNT(*)::int
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          WHERE (conv.participant_1_id = user_community_id OR conv.participant_2_id = user_community_id)
          AND m.sender_id != user_community_id
          AND m.created_at > previous_login_time
        ),
        'new_connection_requests', (
          SELECT COUNT(*)::int
          FROM connections
          WHERE to_user_id = user_community_id
          AND status = 'pending'
          AND created_at > previous_login_time
        ),
        'new_projects_in_themes', (
          SELECT COUNT(*)::int
          FROM projects p
          JOIN theme_participants tp ON tp.theme_id = p.theme_id
          WHERE tp.community_id = user_community_id
          AND p.created_at > previous_login_time
        ),
        'new_theme_members', (
          SELECT COUNT(*)::int
          FROM theme_participants tp1
          WHERE tp1.theme_id IN (
            SELECT theme_id FROM theme_participants WHERE community_id = user_community_id
          )
          AND tp1.community_id != user_community_id
          AND tp1.joined_at > previous_login_time
        )
      )
    END,

    'opportunities', json_build_object(
      'skill_matched_projects', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM projects p
          WHERE p.status = 'open'
          AND p.required_skills && user_skills
        )
      ),

      'active_themes', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM theme_circles
          WHERE status = 'active'
        )
      ),

      'complementary_connections', json_build_object(
        'count', (
          SELECT COUNT(DISTINCT c2.id)::int
          FROM community c2
          JOIN connections conn ON (
            conn.from_user_id = user_community_id
            AND conn.to_user_id = c2.id
            AND conn.status = 'accepted'
          )
          WHERE c2.id != user_community_id
          AND c2.skills IS NOT NULL
          LIMIT 10
        )
      ),

      'open_opportunities', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM projects
          WHERE status = 'open'
        )
      )
    ),

    'momentum', json_build_object(
      'weekly_activity', (
        SELECT COUNT(*)::int
        FROM activity_log
        WHERE community_id = user_community_id
        AND created_at > NOW() - INTERVAL '7 days'
      ),

      'streak', json_build_object(
        'current', COALESCE(c.login_streak, 0),
        'is_at_risk', (c.last_login < NOW() - INTERVAL '1 day'),
        'best', COALESCE(c.best_streak, 0)
      ),

      'xp_progress', json_build_object(
        'current_xp', COALESCE(c.xp, 0),
        'current_level', COALESCE(c.level, 1),
        'next_level_xp', (COALESCE(c.level, 1) * 1000),
        'progress_percentage', ROUND((COALESCE(c.xp, 0)::numeric / NULLIF(COALESCE(c.level, 1) * 1000, 0)::numeric) * 100)
      )
    ),

    'network_insights', json_build_object(
      'connections', json_build_object(
        'total', COALESCE(c.connection_count, 0),
        'accepted', (
          SELECT COUNT(*)::int
          FROM connections
          WHERE (from_user_id = user_community_id OR to_user_id = user_community_id)
          AND status = 'accepted'
        )
      ),

      'active_projects', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM projects
          WHERE creator_id = user_community_id
          AND status IN ('open', 'active')
        )
      ),

      'participating_themes', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM theme_participants
          WHERE community_id = user_community_id
        )
      ),

      'growth', json_build_object(
        'new_connections', (
          SELECT COUNT(*)::int
          FROM connections
          WHERE (from_user_id = user_community_id OR to_user_id = user_community_id)
          AND status = 'accepted'
          AND updated_at > NOW() - INTERVAL '30 days'
        ),
        'new_projects', (
          SELECT COUNT(*)::int
          FROM projects
          WHERE creator_id = user_community_id
          AND created_at > NOW() - INTERVAL '30 days'
        ),
        'new_themes', (
          SELECT COUNT(*)::int
          FROM theme_participants
          WHERE community_id = user_community_id
          AND joined_at > NOW() - INTERVAL '30 days'
        )
      )
    )
  )
  INTO result
  FROM community c
  WHERE c.id = user_community_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 4: Create function to mark onboarding complete
-- ================================================================

CREATE OR REPLACE FUNCTION complete_onboarding(auth_user_id UUID)
RETURNS JSON AS $$
DECLARE
  user_community_id UUID;
BEGIN
  -- Get community ID
  SELECT id INTO user_community_id
  FROM community
  WHERE user_id = auth_user_id
  LIMIT 1;

  IF user_community_id IS NULL THEN
    RETURN json_build_object('error', 'Profile not found', 'success', false);
  END IF;

  -- Mark onboarding as complete
  UPDATE community
  SET
    onboarding_completed = true,
    onboarding_completed_at = NOW(),
    onboarding_step = 100
  WHERE id = user_community_id;

  RETURN json_build_object('success', true, 'message', 'Onboarding completed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 5: Create function to update onboarding progress
-- ================================================================

CREATE OR REPLACE FUNCTION update_onboarding_step(auth_user_id UUID, step_number INTEGER)
RETURNS JSON AS $$
DECLARE
  user_community_id UUID;
BEGIN
  -- Get community ID
  SELECT id INTO user_community_id
  FROM community
  WHERE user_id = auth_user_id
  LIMIT 1;

  IF user_community_id IS NULL THEN
    RETURN json_build_object('error', 'Profile not found', 'success', false);
  END IF;

  -- Update step
  UPDATE community
  SET
    onboarding_step = step_number,
    onboarding_started_at = COALESCE(onboarding_started_at, NOW())
  WHERE id = user_community_id;

  RETURN json_build_object('success', true, 'step', step_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 6: Grant execute permissions
-- ================================================================

GRANT EXECUTE ON FUNCTION get_start_sequence_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_login_timestamp(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_onboarding(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_onboarding_step(UUID, INTEGER) TO authenticated;

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Check new columns exist
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'community'
AND column_name IN (
  'onboarding_completed',
  'onboarding_step',
  'previous_login_at',
  'last_start_view_at',
  'onboarding_started_at',
  'onboarding_completed_at'
)
ORDER BY column_name;

-- Test the function (replace with your actual auth user ID)
-- SELECT get_start_sequence_data('your-auth-user-id-here');

-- ================================================================
-- COMPLETE
-- ================================================================
-- Migration complete! Next steps:
-- 1. Test the get_start_sequence_data() function
-- 2. Update frontend to handle is_new_user flag
-- 3. Update frontend to show "what's new" data
-- ================================================================
