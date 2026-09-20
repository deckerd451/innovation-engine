-- ============================================================================
-- THEME PARTICIPATION V1
-- Explicit interested/participating state with server-controlled freshness.
-- Apply only after implementation/security review.
-- ============================================================================

ALTER TABLE public.theme_participants
  ADD COLUMN IF NOT EXISTS participation_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS participation_expires_at TIMESTAMPTZ;

ALTER TABLE public.theme_participants
  DROP CONSTRAINT IF EXISTS theme_participants_engagement_level_check;

ALTER TABLE public.theme_participants
  ADD CONSTRAINT theme_participants_engagement_level_check CHECK (
    engagement_level = ANY (ARRAY[
      'hover'::text,
      'exploring'::text,
      'interested'::text,
      'active'::text,
      'leading'::text,
      'proposing'::text,
      'participating'::text
    ])
  );

ALTER TABLE public.theme_participants
  DROP CONSTRAINT IF EXISTS theme_participants_participation_state_check;

ALTER TABLE public.theme_participants
  ADD CONSTRAINT theme_participants_participation_state_check CHECK (
    (engagement_level = 'participating'
      AND participation_confirmed_at IS NOT NULL
      AND participation_expires_at IS NOT NULL
      AND participation_expires_at > participation_confirmed_at)
    OR
    (engagement_level <> 'participating'
      AND participation_confirmed_at IS NULL
      AND participation_expires_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_theme_participants_current_participation
  ON public.theme_participants(theme_id, engagement_level, participation_expires_at);

-- Only the SECURITY DEFINER confirmation/stop functions may write the
-- participating state or its server-owned timestamps.
DROP POLICY IF EXISTS "Users can join themes" ON public.theme_participants;
CREATE POLICY "Users can join themes"
  ON public.theme_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    engagement_level <> 'participating'
    AND community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their participation" ON public.theme_participants;
CREATE POLICY "Users can update their participation"
  ON public.theme_participants FOR UPDATE
  TO authenticated
  USING (community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()))
  WITH CHECK (
    engagement_level <> 'participating'
    AND community_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

-- ================================================================
-- CONFIRM CURRENT THEME PARTICIPATION
-- ================================================================
-- Explicit user intent only. The server owns the confirmation window;
-- clients cannot supply confirmation or expiry timestamps.

CREATE OR REPLACE FUNCTION public.confirm_theme_participation(p_theme_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_status TEXT;
  v_theme_expires_at TIMESTAMPTZ;
  v_confirmed_at TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT status, expires_at
    INTO v_status, v_theme_expires_at
  FROM theme_circles
  WHERE id = p_theme_id;

  IF v_status IS DISTINCT FROM 'active'
     OR (v_theme_expires_at IS NOT NULL AND v_theme_expires_at <= v_confirmed_at) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Theme is no longer current');
  END IF;

  v_expires_at := v_confirmed_at + interval '30 days';
  IF v_theme_expires_at IS NOT NULL AND v_theme_expires_at < v_expires_at THEN
    v_expires_at := v_theme_expires_at;
  END IF;

  INSERT INTO theme_participants (
    theme_id,
    community_id,
    engagement_level,
    participation_confirmed_at,
    participation_expires_at
  )
  VALUES (
    p_theme_id,
    v_community_id,
    'participating',
    v_confirmed_at,
    v_expires_at
  )
  ON CONFLICT (theme_id, community_id)
  DO UPDATE SET
    engagement_level = 'participating',
    participation_confirmed_at = EXCLUDED.participation_confirmed_at,
    participation_expires_at = EXCLUDED.participation_expires_at;

  RETURN jsonb_build_object(
    'success', true,
    'engagement_level', 'participating',
    'participation_confirmed_at', v_confirmed_at,
    'participation_expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_theme_participation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_theme_participation(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_theme_participation(UUID) TO authenticated;
-- ================================================================
-- STOP CURRENT THEME PARTICIPATION
-- ================================================================
-- Stopping is explicit and preserves the lightweight interested state.

CREATE OR REPLACE FUNCTION public.stop_theme_participation(p_theme_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  UPDATE theme_participants
  SET engagement_level = 'interested',
      participation_confirmed_at = NULL,
      participation_expires_at = NULL
  WHERE theme_id = p_theme_id
    AND community_id = v_community_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_updated > 0, 'engagement_level', 'interested');
END;
$$;

REVOKE ALL ON FUNCTION public.stop_theme_participation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_theme_participation(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.stop_theme_participation(UUID) TO authenticated;
-- ================================================================
-- NEARIFY → INNOVATION ENGINE: Between-Events Intelligence
-- (Aggregation across a Nearify-established relationship set)
-- ================================================================
-- Source-of-truth definition for the deployed Between Intelligence RPC.
-- Repository metadata does not encode its deployment timestamp/order.
--
-- Answers a different question than get_nearify_relationship_enrichment
-- (which enriches ONE already-selected Continue With person):
-- "across the set of people Nearify already knows I have real-world
-- history with, is there a project/organization/opportunity that
-- connects several of them, or that one of them posted?" This is
-- aggregation around a caller-supplied set, never discovery.
--
-- NOT a discovery endpoint: identical contract to
-- get_nearify_relationship_enrichment — the caller supplies the exact
-- Nearify profile IDs to consider (Nearify's own bounded, real-world-
-- evidence-established set — see BetweenIntelligenceEligibility.swift
-- in the Nearify repo for exactly how that set is built: talk_self_
-- confirmed, encounterCount > 0, accepted connection, or an existing
-- conversation — never arbitrary profile views, never Contacts-only,
-- never future co-attendees). This function never queries `community`
-- or `nearify_identity_map` for anyone outside that supplied set, and
-- never returns a person who isn't already resolvable from it.
--
-- Same identity/authorization/privacy discipline as
-- get_nearify_relationship_enrichment: authenticated linked+authorized
-- caller; each candidate independently linked, authorized, and not
-- hidden; unmapped/unauthorized/hidden candidates silently omitted;
-- no community_id, email, phone, or auth ID ever returned. The only
-- identifiers returned for OTHER people are their own Nearify profile
-- IDs — which is safe specifically because they are a SUBSET of the
-- IDs the caller already supplied, not a new identity being disclosed.
--
-- Visibility filters use the same authorization posture as
-- get_nearify_relationship_enrichment (verified against the live schema,
-- not tracked-file comments). Between Intelligence additionally excludes
-- themes whose explicit expiry has passed:
--   projects:       status IN ('open','active','completed')
--   organizations:  status = 'active', membership status = 'active'
--   theme_circles:  status = 'active', and (expires_at is null or in the future)
--   opportunities:  status = 'open', application_deadline not passed,
--                   is_public IS NULL OR is_public = true, and ONLY the
--                   'posted_by' edge — opportunities has no project_id
--                   column, so a project-linked opportunity relationship
--                   remains unsupported and is not attempted here either.
--
-- Object identifiers returned (id / slug) are the same identifiers
-- already visible to any authenticated user browsing these
-- already-public objects directly in Buildspace (organizations.slug,
-- opportunities.id) — included so Nearify can deep-link to the real,
-- existing charlestonhacks.com pages rather than inventing a
-- destination. No comparable dedicated page was found for a single
-- project or theme, so this function still returns them (for
-- completeness/future use) but the Nearify client does not treat them
-- as an actionable Home winner in V1 — see BetweenIntelligenceCandidate
-- .swift's selection function for that client-side scope decision.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_nearify_between_intelligence(
  p_nearify_user_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id  UUID;
  v_caller_status TEXT;
  v_ids           TEXT[];
  v_empty         JSONB := jsonb_build_object(
    'success', true,
    'projects', '[]'::jsonb,
    'themes', '[]'::jsonb,
    'organizations', '[]'::jsonb,
    'opportunities', '[]'::jsonb
  );
  v_projects      JSONB;
  v_themes        JSONB;
  v_orgs          JSONB;
  v_opportunities JSONB;
BEGIN
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN v_empty;
  END IF;

  IF p_nearify_user_ids IS NULL OR array_length(p_nearify_user_ids, 1) IS NULL THEN
    RETURN v_empty;
  END IF;

  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(p_nearify_user_ids) AS x
  WHERE trim(x) <> '';

  IF v_ids IS NULL THEN
    RETURN v_empty;
  END IF;

  -- Bound: this is Nearify's whole real-world-established relationship
  -- set, larger by design than the single-person enrichment RPC's cap,
  -- but still bounded against an abusive request.
  IF array_length(v_ids, 1) > 25 THEN
    v_ids := v_ids[1:25];
  END IF;

  WITH candidates AS (
    SELECT DISTINCT nim.nearify_user_id, nim.community_id
    FROM nearify_identity_map nim
    JOIN community c ON c.id = nim.community_id
    JOIN community_experience_authorizations cea
      ON cea.community_id = nim.community_id
     AND cea.experience   = 'nearify'
     AND cea.status       = 'authorized'
    WHERE nim.nearify_user_id = ANY(v_ids)
      AND nim.community_id <> v_community_id
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  )
  -- Every array below is explicitly ordered — jsonb_agg has no guaranteed
  -- element order without ORDER BY, and database/JSON iteration order must
  -- never be allowed to make a Home decision unstable. Objects are
  -- ordered by grounded_count DESC then title ASC (opportunities by title
  -- ASC only, since they aggregate exactly one poster each); each
  -- object's own grounded_nearify_user_ids array is ordered by ID text
  -- for the same reason. The Nearify client separately re-derives its
  -- own cross-type winner from this data using Nearify-side evidence
  -- (see BuildspaceBetweenIntelligenceSelection) — this ordering only
  -- guarantees the RPC's own output is stable, not the final Home choice.
  SELECT
    (
      SELECT COALESCE(jsonb_agg(row ORDER BY grounded_count DESC, title ASC), '[]'::jsonb) FROM (
        SELECT
          p.title AS title,
          count(DISTINCT bc.nearify_user_id) AS grounded_count,
          jsonb_build_object(
            'title', p.title,
            'status', p.status,
            'grounded_count', count(DISTINCT bc.nearify_user_id),
            'grounded_nearify_user_ids', jsonb_agg(DISTINCT bc.nearify_user_id ORDER BY bc.nearify_user_id)
          ) AS row
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
        JOIN candidates bc ON bc.community_id = pm.user_id
        WHERE p.status IN ('open', 'active', 'completed')
        GROUP BY p.id, p.title, p.status
      ) x
    ),
    (
      SELECT COALESCE(jsonb_agg(row ORDER BY grounded_count DESC, title ASC), '[]'::jsonb) FROM (
        SELECT
          tc.title AS title,
          count(DISTINCT bc.nearify_user_id) AS grounded_count,
          jsonb_build_object(
            'title', tc.title,
            'grounded_count', count(DISTINCT bc.nearify_user_id),
            'grounded_nearify_user_ids', jsonb_agg(DISTINCT bc.nearify_user_id ORDER BY bc.nearify_user_id),
            'participating_count', count(DISTINCT bc.nearify_user_id) FILTER (
              WHERE tp.engagement_level = 'participating'
                AND tp.participation_expires_at > now()
            ),
            'participating_nearify_user_ids', COALESCE(
              jsonb_agg(DISTINCT bc.nearify_user_id ORDER BY bc.nearify_user_id) FILTER (
                WHERE tp.engagement_level = 'participating'
                  AND tp.participation_expires_at > now()
              ),
              '[]'::jsonb
            )
          ) AS row
        FROM theme_circles tc
        JOIN theme_participants tp ON tp.theme_id = tc.id
        JOIN candidates bc ON bc.community_id = tp.community_id
        WHERE tc.status = 'active'
          AND (tc.expires_at IS NULL OR tc.expires_at > now())
        GROUP BY tc.id, tc.title
      ) x
    ),
    (
      SELECT COALESCE(jsonb_agg(row ORDER BY grounded_count DESC, title ASC), '[]'::jsonb) FROM (
        SELECT
          o.name AS title,
          count(DISTINCT bc.nearify_user_id) AS grounded_count,
          jsonb_build_object(
            'name', o.name,
            'slug', o.slug,
            'grounded_count', count(DISTINCT bc.nearify_user_id),
            'grounded_nearify_user_ids', jsonb_agg(DISTINCT bc.nearify_user_id ORDER BY bc.nearify_user_id)
          ) AS row
        FROM organizations o
        JOIN organization_members om ON om.organization_id = o.id
        JOIN candidates bc ON bc.community_id = om.community_id
        WHERE o.status = 'active' AND om.status = 'active'
        GROUP BY o.id, o.name, o.slug
      ) x
    ),
    (
      SELECT COALESCE(jsonb_agg(row ORDER BY title ASC), '[]'::jsonb) FROM (
        SELECT
          opp.title AS title,
          jsonb_build_object(
            'id', opp.id,
            'title', opp.title,
            'organization_name', org.name,
            'posted_by_nearify_user_id', bc.nearify_user_id
          ) AS row
        FROM opportunities opp
        JOIN candidates bc ON bc.community_id = opp.posted_by
        LEFT JOIN organizations org ON org.id = opp.organization_id
        WHERE opp.status = 'open'
          AND (opp.application_deadline IS NULL OR opp.application_deadline > now())
          AND (opp.is_public IS NULL OR opp.is_public = true)
      ) x
    )
  INTO v_projects, v_themes, v_orgs, v_opportunities;

  RETURN jsonb_build_object(
    'success', true,
    'projects', v_projects,
    'themes', v_themes,
    'organizations', v_orgs,
    'opportunities', v_opportunities
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearify_between_intelligence(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nearify_between_intelligence(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nearify_between_intelligence(TEXT[]) TO authenticated;

-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify between-events intelligence deployed:';
  RAISE NOTICE '   ✓ get_nearify_between_intelligence(p_nearify_user_ids)';
END $$;
