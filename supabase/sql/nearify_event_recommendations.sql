-- ================================================================
-- NEARIFY → INNOVATION ENGINE: Event Recommendations
-- ================================================================
-- "Who should I meet at this event?" — a Nearify-facing, event-scoped
-- recommendation surface. Deliberately NOT a SQL clone of the browser
-- Daily Brief engine (assets/js/intelligence/daily-brief-engine.js) —
-- that engine answers a broader question ("who's worth knowing across
-- everything I'm part of") using signals with no server-side runtime
-- to share (browser JS calling window.supabase). This RPC answers a
-- narrower, purpose-built question using the same underlying tables
-- and a compatible weighting philosophy, computed directly in SQL so
-- it can be called on-demand from a native client with no browser
-- session.
--
-- Identity: resolved EXCLUSIVELY from auth.uid() — no caller-supplied
-- community_id/auth_user_id/nearify_id parameters. This RPC only ever
-- answers "who should the CALLING user meet"; there is no legitimate
-- case for it to act on behalf of another identity, unlike
-- ingest_nearify_interaction (which records a relationship between two
-- arbitrary people and genuinely needs explicit from/to identity) or
-- ingest_nearify_event_presence (which mirrors that pattern for
-- consistency). Accepting a caller-supplied identity parameter here
-- would let any authenticated session request recommendations "as"
-- an arbitrary community_id — deliberately not offered.
--
-- Privacy: the response never includes the recommended person's
-- community_id or any other internal identifier — only display data
-- (name, avatar, role/skill text) and structured, machine-readable
-- reasons (type + count, no IDs). There is currently no "View profile"
-- action on the Nearify side, so no identifier is needed there; this
-- also means a compromised or buggy Nearify client can't harvest
-- Innovation Engine community IDs through this endpoint.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_nearify_event_recommendations(
  p_nearify_event_id TEXT,
  p_limit INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_limit INT;
  v_result JSONB;
BEGIN
  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  -- Identity resolved server-side from the caller's own authenticated
  -- session only — see header comment.
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  -- Hard server-side cap regardless of what the caller requests — this
  -- answers "who should I meet," not an attendee directory.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 3), 1), 5);

  WITH me AS (
    SELECT id, skills FROM community WHERE id = v_community_id
  ),
  my_skills AS (
    SELECT DISTINCT trim(lower(s)) AS skill
    FROM me, unnest(string_to_array(coalesce(me.skills, ''), ',')) AS s
    WHERE trim(s) <> ''
  ),
  my_projects AS (
    SELECT DISTINCT project_id FROM project_members WHERE user_id = v_community_id
  ),
  my_orgs AS (
    SELECT DISTINCT organization_id FROM organization_members WHERE community_id = v_community_id
  ),
  my_partners AS (
    SELECT DISTINCT CASE WHEN from_user_id = v_community_id THEN to_user_id ELSE from_user_id END AS partner
    FROM connections
    WHERE status = 'accepted' AND (from_user_id = v_community_id OR to_user_id = v_community_id)
  ),
  -- Candidate generation: other linked users currently joined to the
  -- same event. RLS on nearify_event_presence already scopes what a
  -- normal client query could see, but this RPC is SECURITY DEFINER
  -- and explicitly excludes self here regardless.
  co_attendees AS (
    SELECT DISTINCT community_id
    FROM nearify_event_presence
    WHERE nearify_event_id = p_nearify_event_id
      AND status = 'joined'
      AND community_id <> v_community_id
  ),
  -- Exclude anyone already meaningfully connected.
  eligible AS (
    SELECT ca.community_id
    FROM co_attendees ca
    WHERE NOT EXISTS (
      SELECT 1 FROM connections c
      WHERE c.status = 'accepted'
        AND ((c.from_user_id = v_community_id AND c.to_user_id = ca.community_id)
          OR (c.from_user_id = ca.community_id AND c.to_user_id = v_community_id))
    )
  ),
  candidate_profiles AS (
    SELECT c.id, c.name, c.image_url, c.skills, c.role, c.bio
    FROM community c
    WHERE c.id IN (SELECT community_id FROM eligible)
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  ),
  scored AS (
    SELECT
      cp.name, cp.image_url, cp.skills, cp.role, cp.bio,
      (
        SELECT count(*) FROM unnest(string_to_array(coalesce(cp.skills, ''), ',')) s
        WHERE trim(lower(s)) IN (SELECT skill FROM my_skills) AND trim(s) <> ''
      ) AS shared_skill_count,
      (
        SELECT count(*) FROM project_members pm
        WHERE pm.user_id = cp.id AND pm.project_id IN (SELECT project_id FROM my_projects)
      ) AS shared_project_count,
      (
        SELECT count(*) FROM organization_members om
        WHERE om.community_id = cp.id AND om.organization_id IN (SELECT organization_id FROM my_orgs)
      ) AS shared_org_count,
      (
        SELECT count(*) FROM (
          SELECT DISTINCT CASE WHEN from_user_id = cp.id THEN to_user_id ELSE from_user_id END AS partner
          FROM connections
          WHERE status = 'accepted' AND (from_user_id = cp.id OR to_user_id = cp.id)
        ) their_partners
        WHERE their_partners.partner IN (SELECT partner FROM my_partners)
      ) AS mutual_connection_count
    FROM candidate_profiles cp
  ),
  ranked AS (
    SELECT *,
      -- shared_nearify_event is a guaranteed baseline (true for every
      -- row by construction — this candidate is, definitionally, at
      -- the same event) plus additive weight per additional signal
      -- present, mirroring _buildPeopleWorthKnowing's weight table
      -- (shared_project:5, mutual_connections:4, shared_organization:4,
      -- shared_skill:2 per matching skill, capped).
      6
      + (shared_project_count > 0)::int * 5
      + (mutual_connection_count > 0)::int * 4
      + (shared_org_count > 0)::int * 4
      + LEAST(shared_skill_count, 3) * 2
      AS score
    FROM scored
  ),
  top_n AS (
    SELECT * FROM ranked ORDER BY score DESC, name ASC LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'success', true,
    'nearify_event_id', p_nearify_event_id,
    'recommendations', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', name,
          'avatar_url', image_url,
          'role', role,
          'headline', NULLIF(trim(coalesce(skills, '')), ''),
          'bio', bio,
          'score', score,
          'reasons', (
            SELECT jsonb_agg(reason) FROM (
              SELECT jsonb_build_object('type', 'shared_event') AS reason
              UNION ALL
              SELECT jsonb_build_object('type', 'shared_skill', 'count', shared_skill_count)
              WHERE shared_skill_count > 0
              UNION ALL
              SELECT jsonb_build_object('type', 'shared_project', 'count', shared_project_count)
              WHERE shared_project_count > 0
              UNION ALL
              SELECT jsonb_build_object('type', 'shared_organization', 'count', shared_org_count)
              WHERE shared_org_count > 0
              UNION ALL
              SELECT jsonb_build_object('type', 'mutual_connections', 'count', mutual_connection_count)
              WHERE mutual_connection_count > 0
            ) reasons
          )
        )
        ORDER BY score DESC, name ASC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM top_n;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearify_event_recommendations(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearify_event_recommendations(TEXT, INT) TO authenticated;


-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify event recommendations deployed:';
  RAISE NOTICE '   ✓ get_nearify_event_recommendations(p_nearify_event_id, p_limit)';
END $$;
