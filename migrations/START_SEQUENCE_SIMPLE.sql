-- ================================================================
-- SIMPLE START SEQUENCE QUERY (NO json_object_agg)
-- ================================================================
-- Simplified version that avoids json_object_agg issues
-- Returns basic actionable data for the START sequence
-- ================================================================

CREATE OR REPLACE FUNCTION get_start_sequence_data(auth_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  user_community_id UUID;
BEGIN
  -- Get the community profile ID for this auth user
  SELECT id INTO user_community_id 
  FROM community 
  WHERE user_id = auth_user_id 
  LIMIT 1;

  -- If no community profile exists, return minimal data
  IF user_community_id IS NULL THEN
    RETURN json_build_object(
      'error', 'No community profile found',
      'has_profile', false
    );
  END IF;

  -- Build comprehensive START sequence data
  SELECT json_build_object(
    -- ============================================================
    -- SECTION 1: USER PROFILE & PROGRESS
    -- ============================================================
    'profile', json_build_object(
      'id', c.id,
      'name', c.name,
      'email', c.email,
      'image_url', c.image_url,
      'bio', c.bio,
      'skills', c.skills,
      'interests', c.interests,
      'user_role', c.user_role,
      'profile_completed', c.profile_completed
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
    
    -- ============================================================
    -- SECTION 2: IMMEDIATE ACTIONS (High Priority)
    -- ============================================================
    'immediate_actions', json_build_object(
      -- Pending connection requests TO you
      'pending_requests', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', conn.id,
            'from_user_id', conn.from_user_id,
            'from_user_name', from_comm.name,
            'from_user_image', from_comm.image_url,
            'from_user_skills', from_comm.skills,
            'created_at', conn.created_at,
            'type', conn.type
          ) ORDER BY conn.created_at DESC), '[]'::json)
        )
        FROM connections conn
        JOIN community from_comm ON from_comm.id = conn.from_user_id
        WHERE conn.to_user_id = user_community_id 
        AND conn.status = 'pending'
      ),
      
      -- Unread messages
      'unread_messages', (
        SELECT json_build_object(
          'count', COUNT(DISTINCT m.conversation_id)::int,
          'conversations', COALESCE(json_agg(DISTINCT json_build_object(
            'conversation_id', conv.id,
            'partner_id', CASE 
              WHEN conv.participant_1_id = user_community_id THEN conv.participant_2_id 
              ELSE conv.participant_1_id 
            END,
            'partner_name', CASE 
              WHEN conv.participant_1_id = user_community_id THEN p2.name 
              ELSE p1.name 
            END,
            'partner_image', CASE 
              WHEN conv.participant_1_id = user_community_id THEN p2.image_url 
              ELSE p1.image_url 
            END,
            'last_message_preview', conv.last_message_preview,
            'last_message_at', conv.last_message_at
          )), '[]'::json)
        )
        FROM messages m
        JOIN conversations conv ON m.conversation_id = conv.id
        LEFT JOIN community p1 ON p1.id = conv.participant_1_id
        LEFT JOIN community p2 ON p2.id = conv.participant_2_id
        WHERE (conv.participant_1_id = user_community_id OR conv.participant_2_id = user_community_id)
        AND m.sender_id != user_community_id
        AND m.read = false
      ),
      
      -- Pending project bids (your bids awaiting review)
      'pending_bids', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', pb.id,
            'project_id', pb.project_id,
            'project_title', p.title,
            'pitch_message', pb.pitch_message,
            'proposed_role', pb.proposed_role,
            'created_at', pb.created_at,
            'status', pb.status
          ) ORDER BY pb.created_at DESC), '[]'::json)
        )
        FROM project_bids pb
        JOIN projects p ON p.id = pb.project_id
        WHERE pb.user_id = auth_user_id
        AND pb.status = 'pending'
      ),
      
      -- Bids on YOUR projects
      'bids_to_review', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', pb.id,
            'project_id', pb.project_id,
            'project_title', p.title,
            'bidder_id', pb.user_id,
            'bidder_name', bidder_comm.name,
            'bidder_image', bidder_comm.image_url,
            'bidder_skills', bidder_comm.skills,
            'pitch_message', pb.pitch_message,
            'proposed_role', pb.proposed_role,
            'created_at', pb.created_at
          ) ORDER BY pb.created_at DESC), '[]'::json)
        )
        FROM project_bids pb
        JOIN projects p ON p.id = pb.project_id
        LEFT JOIN community bidder_comm ON bidder_comm.user_id = pb.user_id
        WHERE p.creator_id = auth_user_id
        AND pb.status = 'pending'
      )
    ),
    
    -- ============================================================
    -- SECTION 3: OPPORTUNITIES (Medium Priority)
    -- ============================================================
    'opportunities', json_build_object(
      -- Projects that match YOUR skills
      'skill_matched_projects', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', p.id,
            'title', p.title,
            'description', p.description,
            'required_skills', p.required_skills,
            'tags', p.tags,
            'status', p.status,
            'creator_name', creator.name,
            'creator_image', creator.image_url,
            'created_at', p.created_at
          )), '[]'::json)
        )
        FROM (
          SELECT p.*, creator.name, creator.image_url
          FROM projects p
          JOIN community creator ON creator.user_id = p.creator_id
          WHERE p.status = 'open'
          AND EXISTS (
            SELECT 1 FROM unnest(p.required_skills) skill 
            WHERE skill = ANY(c.skills)
          )
          AND p.creator_id != auth_user_id
          ORDER BY p.created_at DESC
          LIMIT 10
        ) p
        JOIN community creator ON true
      ),
      
      -- Active theme circles
      'active_themes', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', tc.id,
            'title', tc.title,
            'description', tc.description,
            'tags', tc.tags,
            'status', tc.status,
            'created_at', tc.created_at
          )), '[]'::json)
        )
        FROM (
          SELECT tc.*
          FROM theme_circles tc
          WHERE tc.status = 'active'
          AND (tc.expires_at IS NULL OR tc.expires_at > NOW())
          ORDER BY tc.created_at DESC
          LIMIT 10
        ) tc
      ),
      
      -- Open opportunities
      'open_opportunities', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', opp.id,
            'title', opp.title,
            'description', opp.description,
            'type', opp.type,
            'location', opp.location,
            'remote_ok', opp.remote_ok,
            'required_skills', opp.required_skills,
            'created_at', opp.created_at
          )), '[]'::json)
        )
        FROM (
          SELECT opp.*
          FROM opportunities opp
          WHERE opp.status = 'open'
          AND (opp.expires_at IS NULL OR opp.expires_at > NOW())
          ORDER BY opp.created_at DESC
          LIMIT 10
        ) opp
      ),
      
      -- People to connect with
      'complementary_connections', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', other.id,
            'name', other.name,
            'image_url', other.image_url,
            'bio', other.bio,
            'skills', other.skills,
            'xp', COALESCE(other.xp, 0),
            'level', COALESCE(other.level, 1)
          )), '[]'::json)
        )
        FROM (
          SELECT other.*
          FROM community other
          WHERE other.id != user_community_id
          AND other.skills IS NOT NULL
          AND array_length(other.skills, 1) > 0
          AND NOT EXISTS (
            SELECT 1 FROM connections conn
            WHERE ((conn.from_user_id = user_community_id AND conn.to_user_id = other.id)
               OR (conn.from_user_id = other.id AND conn.to_user_id = user_community_id))
            AND conn.status = 'accepted'
          )
          ORDER BY COALESCE(other.xp, 0) DESC
          LIMIT 10
        ) other
      )
    ),
    
    -- ============================================================
    -- SECTION 4: ACTIVITY & MOMENTUM
    -- ============================================================
    'momentum', json_build_object(
      -- Recent activity count
      'weekly_activity', (
        SELECT COUNT(*)::int
        FROM activity_log 
        WHERE community_user_id = user_community_id 
        AND created_at > NOW() - INTERVAL '7 days'
      ),
      
      -- Streak status
      'streak', json_build_object(
        'current', COALESCE(c.login_streak, 0),
        'last_login', c.last_login,
        'is_at_risk', (c.last_login < NOW() - INTERVAL '20 hours')
      ),
      
      -- XP progress
      'xp_progress', json_build_object(
        'current_xp', COALESCE(c.xp, 0),
        'current_level', COALESCE(c.level, 1),
        'next_level_xp', (COALESCE(c.level, 1) + 1) * 1000,
        'xp_to_next_level', ((COALESCE(c.level, 1) + 1) * 1000) - COALESCE(c.xp, 0),
        'progress_percentage', ROUND((COALESCE(c.xp, 0)::numeric / ((COALESCE(c.level, 1) + 1) * 1000)) * 100, 1)
      ),
      
      -- Recent achievements
      'recent_achievements', (
        SELECT COALESCE(json_agg(json_build_object(
          'id', a.id,
          'code', a.code,
          'name', a.name,
          'description', a.description,
          'icon', a.icon,
          'xp_reward', a.xp_reward,
          'earned_at', ua.earned_at
        ) ORDER BY ua.earned_at DESC), '[]'::json)
        FROM user_achievements ua
        JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.community_id = user_community_id
        AND ua.earned_at > NOW() - INTERVAL '7 days'
      )
    ),
    
    -- ============================================================
    -- SECTION 5: NETWORK INSIGHTS
    -- ============================================================
    'network_insights', json_build_object(
      -- Connection count
      'connections', json_build_object(
        'total', COALESCE(c.connection_count, 0)
      ),
      
      -- Active projects
      'active_projects', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', p.id,
            'title', p.title,
            'description', p.description,
            'status', p.status,
            'your_role', pm.role,
            'created_at', p.created_at
          )), '[]'::json)
        )
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = auth_user_id
        AND pm.left_at IS NULL
        AND p.status IN ('open', 'in_progress')
      ),
      
      -- Participating themes
      'participating_themes', (
        SELECT json_build_object(
          'count', COUNT(*)::int,
          'items', COALESCE(json_agg(json_build_object(
            'id', tc.id,
            'title', tc.title,
            'engagement_level', tp.engagement_level,
            'last_seen_at', tp.last_seen_at
          )), '[]'::json)
        )
        FROM theme_participants tp
        JOIN theme_circles tc ON tc.id = tp.theme_id
        WHERE tp.community_id = user_community_id
        AND tc.status = 'active'
      ),
      
      -- Network growth
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
    
    -- ============================================================
    -- SECTION 6: RECOMMENDATIONS
    -- ============================================================
    'recommendations', json_build_object(
      'priority_actions', '[]'::json
    ),
    
    -- Metadata
    'generated_at', NOW(),
    'has_profile', true
    
  ) INTO result
  FROM community c
  WHERE c.id = user_community_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Test the function
-- SELECT get_start_sequence_data('your-user-id-here');
