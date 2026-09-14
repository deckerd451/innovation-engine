-- ================================================================
-- NEARIFY → INNOVATION ENGINE: Live Attendee Signals
-- (Best Connection enrichment while checked in)
-- ================================================================
-- Enriches Nearify's own live/checked-in "Best Connection" ranking with
-- Buildspace professional-relevance signals for a batch of attendees
-- Nearify has ALREADY determined are physically/live present.
--
-- Authority split (unchanged by this RPC):
--   Nearify remains exclusively authoritative for who is physically/live
--   eligible — this function never establishes, confirms, or implies
--   presence. It only scores candidates supplied by the caller; Nearify's
--   own live-attendee filter has already run before this is ever called.
--
-- Reuses the exact same shared_project / mutual_connections /
-- shared_organization / shared_skill weighting already used by
-- get_nearify_event_recommendations, minus that RPC's shared_event
-- baseline (+6) — there is no "same event" concept here, since eligibility
-- is already decided by the caller, not by this function.
--
-- Identity: resolved per-candidate via nearify_identity_map, which a plain
-- authenticated client cannot read for anyone but themselves (RLS: "Users
-- can view their own nearify link"). This SECURITY DEFINER function is the
-- only path that resolves *other* people's mappings, and only ever to
-- compute an aggregate score/reason set — never to return the mapping
-- itself.
--
-- Privacy: never returns community_id or any other durable identifier.
-- Also never exposes a separate "is this candidate linked" flag: a missing
-- key in the response means "no usable Buildspace enrichment" for that
-- candidate, and intentionally does not distinguish between "unlinked",
-- "hidden", "not authorized", or "resolves to the caller" — those are not
-- observable from the response. A candidate that IS linked, visible,
-- 'authorized' (see community_experience_authorizations.sql — a candidate
-- who is merely 'needs_reconfirmation' or 'revoked' is treated identically
-- to unresolved), and not the caller always gets an entry, even when every
-- count is zero ({"score": 0, "reasons": []}) — a resolvable-but-zero-
-- overlap result is not the same as "could not resolve", and callers
-- should not conflate them.
--
-- DEPENDENCY: requires public.community_experience_authorizations to
-- exist (see that file) — apply it before this revision of this file.
--
-- No exclusion of already-connected candidates: unlike
-- get_nearify_event_recommendations (which excludes accepted connections
-- because it is proposing new introductions), Best Connection already
-- surfaces reconnect scenarios with people the caller is connected to —
-- excluding connections here would silently contradict that existing,
-- intentional Nearify behavior. mutual_connections here measures shared
-- third-party connections, which is an independent signal from being
-- directly connected to the candidate.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_nearify_live_attendee_signals(
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
  v_result        JSONB;
BEGIN
  -- Identity resolved EXCLUSIVELY from auth.uid(), same as
  -- get_nearify_event_recommendations — this RPC only ever answers "how
  -- relevant are these candidates to the CALLING user."
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  -- Caller-side authorization gate. 'authorized' and
  -- 'needs_reconfirmation' are both allowed here: needs_reconfirmation
  -- exists specifically to preserve previously-disclosed
  -- personalization-FOR the caller during the migration window — see
  -- community_experience_authorizations.sql. 'revoked' or no row at
  -- all ('none') yields no enrichment, returned as a normal empty
  -- success rather than an error — identical, non-blocking shape to
  -- every other "nothing to enrich" outcome this RPC already produces.
  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'signals', '{}'::jsonb);
  END IF;

  IF p_nearify_user_ids IS NULL OR array_length(p_nearify_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'signals', '{}'::jsonb);
  END IF;

  -- Bound and sanitize the input: dedupe, drop blanks, hard-cap batch size.
  -- A live attendee roster is small by construction; this cap exists only
  -- to prevent an abusive arbitrarily-large request, not because a
  -- realistic roster would approach it.
  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(p_nearify_user_ids) AS x
  WHERE trim(x) <> '';

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'signals', '{}'::jsonb);
  END IF;

  IF array_length(v_ids, 1) > 50 THEN
    v_ids := v_ids[1:50];
  END IF;

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
  -- Resolve each candidate Nearify ID to a Buildspace identity, server-side.
  -- Silently excluded (no key emitted for that ID at all): no
  -- identity_map entry, a hidden profile, or a candidate that resolves
  -- back to the caller.
  candidates AS (
    SELECT DISTINCT nim.nearify_user_id, nim.community_id
    FROM nearify_identity_map nim
    JOIN community c ON c.id = nim.community_id
    -- Candidate-side authorization gate: ONLY an 'authorized' candidate
    -- may be enriched/explained to another Nearify participant.
    -- needs_reconfirmation, revoked, and no-row all behave identically
    -- to "no usable enrichment for this candidate" — no different than
    -- an unresolved identity, silently excluded (no key emitted) rather
    -- than surfaced with a distinguishing flag.
    JOIN community_experience_authorizations cea
      ON cea.community_id = nim.community_id
     AND cea.experience   = 'nearify'
     AND cea.status       = 'authorized'
    WHERE nim.nearify_user_id = ANY(v_ids)
      AND nim.community_id <> v_community_id
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  ),
  scored AS (
    SELECT
      cand.nearify_user_id,
      (
        SELECT count(*) FROM unnest(string_to_array(coalesce(c.skills, ''), ',')) s
        WHERE trim(lower(s)) IN (SELECT skill FROM my_skills) AND trim(s) <> ''
      ) AS shared_skill_count,
      (
        SELECT count(*) FROM project_members pm
        WHERE pm.user_id = cand.community_id AND pm.project_id IN (SELECT project_id FROM my_projects)
      ) AS shared_project_count,
      (
        SELECT count(*) FROM organization_members om
        WHERE om.community_id = cand.community_id AND om.organization_id IN (SELECT organization_id FROM my_orgs)
      ) AS shared_org_count,
      (
        SELECT count(*) FROM (
          SELECT DISTINCT CASE WHEN from_user_id = cand.community_id THEN to_user_id ELSE from_user_id END AS partner
          FROM connections
          WHERE status = 'accepted' AND (from_user_id = cand.community_id OR to_user_id = cand.community_id)
        ) their_partners
        WHERE their_partners.partner IN (SELECT partner FROM my_partners)
      ) AS mutual_connection_count
    FROM candidates cand
    JOIN community c ON c.id = cand.community_id
  ),
  ranked AS (
    SELECT
      nearify_user_id,
      shared_skill_count, shared_project_count, shared_org_count, mutual_connection_count,
      -- Same weighting as get_nearify_event_recommendations, minus its
      -- +6 shared_event baseline (no equivalent concept here).
      (shared_project_count > 0)::int * 5
      + (mutual_connection_count > 0)::int * 4
      + (shared_org_count > 0)::int * 4
      + LEAST(shared_skill_count, 3) * 2
      AS score
    FROM scored
  )
  SELECT jsonb_object_agg(
    nearify_user_id,
    jsonb_build_object(
      'score', score,
      'reasons', (
        SELECT COALESCE(jsonb_agg(reason), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('type', 'shared_skill', 'count', shared_skill_count) AS reason
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
  )
  INTO v_result
  FROM ranked;

  RETURN jsonb_build_object(
    'success', true,
    'signals', COALESCE(v_result, '{}'::jsonb)
  );
END;
$$;

-- This project has a schema-level default privilege that grants EXECUTE to
-- anon on new functions (observed: even the existing, already-approved
-- get_nearify_event_recommendations and link_nearify_account still show
-- anon EXECUTE despite an identical REVOKE ALL FROM PUBLIC). REVOKE FROM
-- PUBLIC alone does not undo a role-specific default grant, so anon is
-- revoked explicitly here to actually satisfy "authenticated only."
REVOKE ALL ON FUNCTION public.get_nearify_live_attendee_signals(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nearify_live_attendee_signals(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nearify_live_attendee_signals(TEXT[]) TO authenticated;

-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify live attendee signals deployed:';
  RAISE NOTICE '   ✓ get_nearify_live_attendee_signals(p_nearify_user_ids)';
END $$;
