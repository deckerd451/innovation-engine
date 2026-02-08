-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ================================================================
-- START SEQUENCE INITIALIZATION QUERY
-- ================================================================
-- Comprehensive query to gather actionable data for the START sequence
-- Returns personalized insights, opportunities, and network intelligence
-- ================================================================

-- Main query: Get user's current state and actionable opportunities
-- Usage: Replace $1 with the authenticated user's UUID
-- Example: SELECT * FROM get_start_sequence_data('user-uuid-here');

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
      'xp', c.xp,
      'level', c.level,
      'login_streak', c.login_streak,
      'last_login', c.last_login,
      'connection_count', c.connection_count,
      'projects_created', c.projects_created,
      'projects_joined', c.projects_joined,
      'endorsements_given', c.endorsements_given,
      'endorsements_received', c.endorsements_received
    ),
    
    -- ============================================================
    -- SECTION 2: IMMEDIATE ACTIONS (High Priority)
    -- ============================================================
    'immediate_actions', json_build_object(
      -- Pending connection requests TO you
      'pending_requests', (
        SELECT json_build_object(
          'count', COUNT(*),
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
          'count', COUNT(*),
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
            'last_message_at', conv.last_message_at,
            'unread_count', (
              SELECT COUNT(*) FROM messages m2 
              WHERE m2.conversation_id = conv.id 
              AND m2.sender_id != user_community_id 
              AND m2.read = false
            )
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
          'count', COUNT(*),
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
      
      -- Bids on YOUR projects (if you're a project creator)
      'bids_to_review', (
        SELECT json_build_object(
          'count', COUNT(*),
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
          'count', COUNT(*) OVER(),
          'items', COALESCE(json_agg(json_build_object(
            'id', p.id,
            'title', p.title,
            'description', p.description,
            'required_skills', p.required_skills,
            'matched_skills', (
              SELECT array_agg(skill)
              FROM unnest(p.required_skills) skill
              WHERE skill = ANY(c.skills)
            ),
            'tags', p.tags,
            'status', p.status,
            'creator_name', creator.name,
            'creator_image', creator.image_url,
            'bid_count', p.bid_count,
            'created_at', p.created_at
          )), '[]'::json)
        )
        FROM (
          SELECT p.*, creator.name as creator_name, creator.image_url as creator_image
          FROM projects p
          JOIN community creator ON creator.user_id = p.creator_id
          WHERE p.status = 'open'
          AND EXISTS (
            SELECT 1 FROM unnest(p.required_skills) skill 
            WHERE skill = ANY(c.skills)
          )
          AND p.creator_id != auth_user_id
          ORDER BY (
            SELECT COUNT(*)
            FROM unnest(p.required_skills) skill
            WHERE skill = ANY(c.skills)
          ) DESC
          LIMIT 10
        ) p
      ),
      
      -- Active theme circles
      'active_themes', (
        SELECT json_build_object(
          'count', COUNT(*) OVER(),
          'items', COALESCE(json_agg(json_build_object(
            'id', tc.id,
            'title', tc.title,
            'description', tc.description,
            'tags', tc.tags,
            'status', tc.status,
            'origin_type', tc.origin_type,
            'activity_score', tc.activity_score,
            'expires_at', tc.expires_at,
            'participant_count', (
              SELECT COUNT(*) FROM theme_participants tp 
              WHERE tp.theme_id = tc.id
            ),
            'is_participating', EXISTS (
              SELECT 1 FROM theme_participants tp 
              WHERE tp.theme_id = tc.id 
              AND tp.community_id = user_community_id
            ),
            'created_at', tc.created_at
          )), '[]'::json)
        )
        FROM (
          SELECT tc.*
          FROM theme_circles tc
          WHERE tc.status = 'active'
          AND tc.expires_at > NOW()
          ORDER BY tc.activity_score DESC, tc.created_at DESC
          LIMIT 10
        ) tc
      ),
      
      -- Open opportunities (jobs, internships, etc.)
      'open_opportunities', (
        SELECT json_build_object(
          'count', COUNT(*) OVER(),
          'items', COALESCE(json_agg(json_build_object(
            'id', opp.id,
            'title', opp.title,
            'description', opp.description,
            'type', opp.type,
            'organization_name', opp.org_name,
            'organization_logo', opp.org_logo_url,
            'location', opp.location,
            'remote_ok', opp.remote_ok,
            'required_skills', opp.required_skills,
            'matched_skills', (
              SELECT array_agg(skill)
              FROM unnest(opp.required_skills) skill
              WHERE skill = ANY(c.skills)
            ),
            'experience_level', opp.experience_level,
            'compensation_type', opp.compensation_type,
            'expires_at', opp.expires_at,
            'created_at', opp.created_at
          )), '[]'::json)
        )
        FROM (
          SELECT opp.*, org.name as org_name, org.logo_url as org_logo_url
          FROM opportunities opp
          LEFT JOIN organizations org ON org.id = opp.organization_id
          WHERE opp.status = 'open'
          AND (opp.expires_at IS NULL OR opp.expires_at > NOW())
          ORDER BY (
            SELECT COUNT(*)
            FROM unnest(opp.required_skills) skill
            WHERE skill = ANY(c.skills)
          ) DESC
          LIMIT 10
        ) opp
      ),
      
      -- People with complementary skills
      'complementary_connections', (
        SELECT json_build_object(
          'count', COUNT(*) OVER(),
          'items', COALESCE(json_agg(json_build_object(
            'id', other.id,
            'name', other.name,
            'image_url', other.image_url,
            'bio', other.bio,
            'skills', other.skills,
            'complementary_skills', (
              SELECT array_agg(DISTINCT skill)
              FROM unnest(other.skills) skill
              WHERE NOT (skill = ANY(c.skills))
            ),
            'connection_count', other.connection_count,
            'xp', other.xp,
            'level', other.level,
            'already_connected', EXISTS (
              SELECT 1 FROM connections conn
              WHERE ((conn.from_user_id = user_community_id AND conn.to_user_id = other.id)
                 OR (conn.from_user_id = other.id AND conn.to_user_id = user_community_id))
              AND conn.status = 'accepted'
            )
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
          ORDER BY other.connection_count DESC, other.xp DESC
          LIMIT 10
        ) other
      )
    ),
    
    -- ============================================================
    -- SECTION 4: ACTIVITY & MOMENTUM
    -- ============================================================
    'momentum', json_build_object(
      -- Recent activity (last 7 days)
      'weekly_activity', (
        SELECT COUNT(*) 
        FROM activity_log 
        WHERE community_user_id = user_community_id 
        AND created_at > NOW() - INTERVAL '7 days'
      ),
      
      -- Activity breakdown by type
      'activity_breakdown', (
        SELECT COALESCE(json_object_agg(action_type::text, count), '{}'::json)
        FROM (
          SELECT action_type, COUNT(*)::int as count
          FROM activity_log
          WHERE community_user_id = user_community_id
          AND created_at > NOW() - INTERVAL '7 days'
          GROUP BY action_type
        ) breakdown
      ),
      
      -- Streak status
      'streak', json_build_object(
        'current', c.login_streak,
        'last_login', c.last_login,
        'is_at_risk', (c.last_login < NOW() - INTERVAL '20 hours')
      ),
      
      -- XP progress to next level
      'xp_progress', json_build_object(
        'current_xp', c.xp,
        'current_level', c.level,
        'next_level_xp', (c.level + 1) * 1000, -- Assuming 1000 XP per level
        'xp_to_next_level', ((c.level + 1) * 1000) - c.xp,
        'progress_percentage', ROUND((c.xp::numeric / ((c.level + 1) * 1000)) * 100, 1)
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
      -- Your connections
      'connections', json_build_object(
        'total', c.connection_count,
        'by_type', (
          SELECT COALESCE(json_object_agg(type::text, count), '{}'::json)
          FROM (
            SELECT type, COUNT(*)::int as count
            FROM connections
            WHERE (from_user_id = user_community_id OR to_user_id = user_community_id)
            AND status = 'accepted'
            GROUP BY type
          ) type_breakdown
        )
      ),
      
      -- Active projects you're in
      'active_projects', (
        SELECT json_build_object(
          'count', COUNT(*),
          'items', COALESCE(json_agg(json_build_object(
            'id', p.id,
            'title', p.title,
            'description', p.description,
            'status', p.status,
            'your_role', pm.role,
            'team_size', (
              SELECT COUNT(*) FROM project_members pm2 
              WHERE pm2.project_id = p.id AND pm2.left_at IS NULL
            ),
            'created_at', p.created_at
          )), '[]'::json)
        )
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = auth_user_id
        AND pm.left_at IS NULL
        AND p.status IN ('open', 'in_progress')
      ),
      
      -- Themes you're participating in
      'participating_themes', (
        SELECT json_build_object(
          'count', COUNT(*),
          'items', COALESCE(json_agg(json_build_object(
            'id', tc.id,
            'title', tc.title,
            'engagement_level', tp.engagement_level,
            'participant_count', (
              SELECT COUNT(*) FROM theme_participants tp2 
              WHERE tp2.theme_id = tc.id
            ),
            'last_seen_at', tp.last_seen_at
          )), '[]'::json)
        )
        FROM theme_participants tp
        JOIN theme_circles tc ON tc.id = tp.theme_id
        WHERE tp.community_id = user_community_id
        AND tc.status = 'active'
      ),
      
      -- Network growth (last 30 days)
      'growth', json_build_object(
        'new_connections', (
          SELECT COUNT(*) FROM connections
          WHERE (from_user_id = user_community_id OR to_user_id = user_community_id)
          AND status = 'accepted'
          AND created_at > NOW() - INTERVAL '30 days'
        ),
        'new_projects', (
          SELECT COUNT(*) FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = auth_user_id
          AND pm.joined_at > NOW() - INTERVAL '30 days'
        ),
        'new_themes', (
          SELECT COUNT(*) FROM theme_participants
          WHERE community_id = user_community_id
          AND joined_at > NOW() - INTERVAL '30 days'
        )
      )
    ),
    
    -- ============================================================
    -- SECTION 6: PERSONALIZED RECOMMENDATIONS
    -- ============================================================
    'recommendations', json_build_object(
      -- Top 3 recommended actions based on user state
      'priority_actions', (
        SELECT json_agg(action ORDER BY priority)
        FROM (
          -- Pending requests (highest priority)
          SELECT 1 as priority, json_build_object(
            'type', 'pending_requests',
            'title', 'Review Connection Requests',
            'description', COUNT(*) || ' people want to connect with you',
            'action', 'Review Requests',
            'icon', 'user-plus',
            'count', COUNT(*)
          ) as action
          FROM connections
          WHERE to_user_id = user_community_id AND status = 'pending'
          HAVING COUNT(*) > 0
          
          UNION ALL
          
          -- Unread messages
          SELECT 2 as priority, json_build_object(
            'type', 'unread_messages',
            'title', 'Respond to Messages',
            'description', COUNT(*) || ' unread messages waiting',
            'action', 'View Messages',
            'icon', 'envelope',
            'count', COUNT(*)
          ) as action
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          WHERE (conv.participant_1_id = user_community_id OR conv.participant_2_id = user_community_id)
          AND m.sender_id != user_community_id
          AND m.read = false
          HAVING COUNT(*) > 0
          
          UNION ALL
          
          -- Skill-matched projects
          SELECT 3 as priority, json_build_object(
            'type', 'skill_matches',
            'title', 'Projects Need Your Skills',
            'description', COUNT(*) || ' projects match your expertise',
            'action', 'View Projects',
            'icon', 'lightbulb',
            'count', COUNT(*)
          ) as action
          FROM projects p
          WHERE p.status = 'open'
          AND EXISTS (
            SELECT 1 FROM unnest(p.required_skills) skill 
            WHERE skill = ANY(c.skills)
          )
          AND p.creator_id != auth_user_id
          HAVING COUNT(*) > 0
          
          UNION ALL
          
          -- Active themes to join
          SELECT 4 as priority, json_build_object(
            'type', 'active_themes',
            'title', 'Join Active Themes',
            'description', COUNT(*) || ' themes are actively collaborating',
            'action', 'Explore Themes',
            'icon', 'bullseye',
            'count', COUNT(*)
          ) as action
          FROM theme_circles tc
          WHERE tc.status = 'active'
          AND tc.expires_at > NOW()
          AND NOT EXISTS (
            SELECT 1 FROM theme_participants tp 
            WHERE tp.theme_id = tc.id AND tp.community_id = user_community_id
          )
          HAVING COUNT(*) > 0
          
          UNION ALL
          
          -- Complementary connections
          SELECT 5 as priority, json_build_object(
            'type', 'complementary_connections',
            'title', 'Expand Your Network',
            'description', 'Connect with people who have complementary skills',
            'action', 'Find People',
            'icon', 'users',
            'count', (
              SELECT COUNT(*) FROM community other
              WHERE other.id != user_community_id
              AND other.skills IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM connections conn
                WHERE ((conn.from_user_id = user_community_id AND conn.to_user_id = other.id)
                   OR (conn.from_user_id = other.id AND conn.to_user_id = user_community_id))
                AND conn.status = 'accepted'
              )
            )
          ) as action
          WHERE (
            SELECT COUNT(*) FROM community other
            WHERE other.id != user_community_id
            AND other.skills IS NOT NULL
          ) > 0
          
        ) all_actions
        LIMIT 5
      )
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

-- ================================================================
-- USAGE EXAMPLES
-- ================================================================

-- Example 1: Get START sequence data for a user
-- SELECT get_start_sequence_data('your-auth-user-uuid-here');

-- Example 2: Get just the immediate actions
-- SELECT (get_start_sequence_data('your-auth-user-uuid-here')::json)->'immediate_actions';

-- Example 3: Get just the recommendations
-- SELECT (get_start_sequence_data('your-auth-user-uuid-here')::json)->'recommendations';

-- ================================================================
-- PERFORMANCE NOTES
-- ================================================================
-- This function uses multiple subqueries for clarity and maintainability.
-- For production, consider:
-- 1. Adding indexes on frequently queried columns
-- 2. Caching results for 5-10 minutes
-- 3. Running as a materialized view that refreshes periodically
-- 4. Using EXPLAIN ANALYZE to identify slow queries

-- Recommended indexes:
-- CREATE INDEX IF NOT EXISTS idx_connections_to_user_status ON connections(to_user_id, status);
-- CREATE INDEX IF NOT EXISTS idx_connections_from_user_status ON connections(from_user_id, status);
-- CREATE INDEX IF NOT EXISTS idx_messages_conversation_read ON messages(conversation_id, read, sender_id);
-- CREATE INDEX IF NOT EXISTS idx_project_bids_user_status ON project_bids(user_id, status);
-- CREATE INDEX IF NOT EXISTS idx_project_bids_project_status ON project_bids(project_id, status);
-- CREATE INDEX IF NOT EXISTS idx_theme_participants_community ON theme_participants(community_id, theme_id);
-- CREATE INDEX IF NOT EXISTS idx_activity_log_community_created ON activity_log(community_user_id, created_at);
-- CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
-- CREATE INDEX IF NOT EXISTS idx_opportunities_status_expires ON opportunities(status, expires_at);
-- CREATE INDEX IF NOT EXISTS idx_theme_circles_status_expires ON theme_circles(status, expires_at);
