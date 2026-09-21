-- Separate Nearify RSVP/commitment from explicit live check-in.
-- Existing rows remain non-live; this migration never reclassifies history.

ALTER TABLE public.nearify_event_presence
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_nep_event_live
  ON public.nearify_event_presence(nearify_event_id)
  WHERE is_live = true;

CREATE OR REPLACE FUNCTION public._my_active_nearify_event_ids()
RETURNS TABLE(nearify_event_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT nep.nearify_event_id
  FROM public.nearify_event_presence nep
  JOIN public.community c ON c.id = nep.community_id
  WHERE c.user_id = auth.uid() AND nep.status = 'joined' AND nep.is_live = true;
$$;

REVOKE ALL ON FUNCTION public._my_active_nearify_event_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._my_active_nearify_event_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_nearify_event_live_presence(
  p_nearify_event_id TEXT,
  p_event_name       TEXT DEFAULT NULL,
  p_event_starts_at  TIMESTAMPTZ DEFAULT NULL,
  p_is_live          BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_row_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found');
  END IF;

  SELECT status INTO v_status
  FROM public.nearify_event_presence
  WHERE community_id = v_community_id
    AND nearify_event_id = trim(p_nearify_event_id)
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event commitment not found');
  END IF;
  IF p_is_live AND v_status <> 'joined' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A left event cannot become live without rejoining');
  END IF;

  UPDATE public.nearify_event_presence
  SET is_live = COALESCE(p_is_live, false),
      event_name = COALESCE(p_event_name, event_name),
      event_starts_at = COALESCE(p_event_starts_at, event_starts_at),
      last_seen_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id
    AND nearify_event_id = trim(p_nearify_event_id)
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'success', true,
    'community_id', v_community_id,
    'presence_id', v_row_id,
    'is_live', COALESCE(p_is_live, false),
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_nearify_event_live_presence(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_nearify_event_live_presence(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;
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
  v_community_id  UUID;
  v_caller_status TEXT;
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

  IF NOT EXISTS (
    SELECT 1 FROM nearify_event_presence
    WHERE community_id = v_community_id
      AND nearify_event_id = trim(p_nearify_event_id)
      AND status = 'joined'
      AND is_live = true
  ) THEN
    RETURN jsonb_build_object('success', true, 'nearify_event_id', p_nearify_event_id, 'recommendations', '[]'::jsonb);
  END IF;

  -- Caller-side authorization gate — same semantics as
  -- get_nearify_live_attendee_signals: 'authorized' and
  -- 'needs_reconfirmation' both continue serving personalization FOR
  -- the caller (the latter exists to preserve what was already
  -- disclosed to existing links during the migration window);
  -- 'revoked' or no row ('none') yields no recommendations, returned
  -- as the same empty shape the client already treats as a normal
  -- cold-start/no-candidates outcome — never a distinct error.
  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'nearify_event_id', p_nearify_event_id, 'recommendations', '[]'::jsonb);
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
      AND is_live = true
      AND community_id <> v_community_id
  ),
  -- Exclude anyone already meaningfully connected, and require the
  -- candidate to be 'authorized' for the nearify experience — a
  -- candidate merely 'needs_reconfirmation' or 'revoked' (or with no
  -- authorization row at all) must never be recommended to, or
  -- explained via, another Nearify participant. This narrows
  -- candidate generation; it never broadens it beyond the existing
  -- co-attendee-and-not-already-connected set.
  eligible AS (
    SELECT ca.community_id
    FROM co_attendees ca
    JOIN community_experience_authorizations cea
      ON cea.community_id = ca.community_id
     AND cea.experience   = 'nearify'
     AND cea.status       = 'authorized'
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
