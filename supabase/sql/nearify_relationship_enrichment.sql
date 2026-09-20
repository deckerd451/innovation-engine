-- ================================================================
-- NEARIFY → INNOVATION ENGINE: Relationship Enrichment
-- (Between-events "why this relationship may matter" context)
-- ================================================================
-- Source-of-truth definition for the deployed relationship-enrichment
-- RPC. Repository metadata does not encode its deployment timestamp/order.
--
-- Answers a narrower, differently-scoped question than the existing
-- get_nearify_live_attendee_signals: "for a person Nearify has
-- ALREADY independently selected as worth continuing a relationship
-- with (its Continue With hero), what truthful Buildspace context may
-- I show alongside that already-made selection?" This is deliberately
-- a NEW function rather than an extension of the existing live-signal
-- RPC — the existing RPC backs the shipped, physically-validated HERE
-- experience and must not be modified or risked for an unrelated,
-- unshipped surface. Both functions may coexist indefinitely; nothing
-- about this file changes the existing one's behavior, signature, or
-- grants.
--
-- Authority split (unchanged by this RPC, identical to every other
-- Nearify-facing RPC in this project): Nearify remains exclusively
-- authoritative for who is eligible/selected/relevant between events.
-- This function never discovers additional candidates — it only ever
-- resolves and scores the exact Nearify profile IDs the caller
-- supplies, mirroring get_nearify_live_attendee_signals's own
-- contract exactly.
--
-- Tier A (shared/mutual signals — shared_skills, shared_projects,
-- shared_organizations, mutual_connection_count): identical
-- authorization/visibility posture to the existing live-signals RPC.
--
-- Tier B (their_projects, their_organizations, their_themes,
-- related_active_opportunities — true about the candidate but not
-- necessarily shared with the caller): verified against the LIVE
-- database (pg_policies, live columns/constraints — not tracked
-- migration files, which were found to be stale in places) before
-- inclusion. Each field's filter is chosen to match the narrowest,
-- clearly-intentional SELECT policy for that table, even where a
-- second, broader/redundant permissive policy also exists on the
-- live table (those redundant policies are a pre-existing Innovation
-- Engine RLS hygiene issue, not something this function should rely
-- on or widen its own exposure to match):
--   - projects:       intentional policy is status IN ('open','active','completed')
--                      (matches the live projects_status_check CHECK
--                      constraint's non-terminal values); applied to
--                      BOTH their_projects and shared_projects.
--   - project_members: USING (true) — no additional filter needed.
--   - organizations:   intentional policy is status = 'active'; applied
--                      to BOTH their_organizations and shared_organizations.
--   - organization_members: read only to compute membership, never
--                      returned as raw rows.
--   - theme_circles:   intentional policy is status = 'active' (or
--                      created_by = caller, not applicable here since
--                      this is about the CANDIDATE, not the caller);
--                      applied to their_themes.
--   - theme_participants: USING (true) — no additional filter needed.
--   - opportunities:   the live SELECT policy is in fact unconditional
--                      (USING (true), not scoped by status at all,
--                      despite older tracked-file comments claiming
--                      otherwise) — this function nonetheless
--                      self-restricts to status = 'open', not past
--                      application_deadline, AND is_public IS NULL OR
--                      is_public = true. This is a deliberately
--                      stricter-than-required choice: is_public exists
--                      specifically to mark an opportunity non-public,
--                      and the live RLS policy does not yet enforce it
--                      — this function respects that evident intent
--                      regardless.
-- This RPC does not grant any visibility beyond what a linked,
-- authenticated Buildspace user could already see by browsing that
-- candidate's public profile/projects/organizations/opportunities
-- directly — if anything, it is stricter than several of the live,
-- redundant "allow all" policies found during review. It only
-- pre-selects and explains it for a Nearify-chosen candidate; it
-- never expands what is visible.
--
-- Opportunity relationship is restricted to exactly ONE explicit,
-- unambiguous schema edge — never inferred from text/bio/semantics:
--   'posted' — opportunities.posted_by = candidate
-- A "candidate is on the project this opportunity is for" edge was
-- considered and REMOVED: live verification confirmed
-- public.opportunities has no project_id column at all (only
-- organization_id and theme_id) — there is no schema-backed link from
-- an opportunity to a project, so that relationship cannot be
-- expressed truthfully and is not attempted.
-- Interest/engagement/application tables (opportunity_interests,
-- opportunity_engagement, etc.) are deliberately NOT used here — their
-- semantics ("expressed interest") were not verified as a genuine
-- "participant" claim and are out of scope for this revision.
--
-- Identity: resolved per-candidate via nearify_identity_map, exactly
-- as get_nearify_live_attendee_signals. Caller identity resolved
-- EXCLUSIVELY from auth.uid() — no caller-supplied identity parameter.
--
-- Privacy: never returns community_id or any other durable Buildspace
-- identifier, never returns email/phone/auth IDs, never returns a
-- hidden profile's data, never distinguishes "unlinked" from "hidden"
-- from "not authorized" from "resolves to the caller" in the response
-- shape — all four are simply absent from the returned map, identical
-- to get_nearify_live_attendee_signals's own contract.
--
-- DEPENDENCY: requires public.community_experience_authorizations and
-- public.nearify_identity_map to exist (already applied — see
-- community_experience_authorizations.sql / nearify_identity_bridge.sql).
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_nearify_relationship_enrichment(
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
  -- Identity resolved EXCLUSIVELY from auth.uid() — this RPC only ever
  -- answers "what may I show about these candidates to the CALLING user."
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  -- Caller-side authorization gate — identical semantics to the
  -- existing live-signals RPC.
  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'enrichment', '{}'::jsonb);
  END IF;

  IF p_nearify_user_ids IS NULL OR array_length(p_nearify_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'enrichment', '{}'::jsonb);
  END IF;

  -- Bound and sanitize input. A between-events caller supplies exactly
  -- one already-selected Continue With person in practice; this cap
  -- exists only to prevent an abusive arbitrarily-large request.
  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(p_nearify_user_ids) AS x
  WHERE trim(x) <> '';

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'enrichment', '{}'::jsonb);
  END IF;

  IF array_length(v_ids, 1) > 10 THEN
    v_ids := v_ids[1:10];
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
  -- Resolve each candidate Nearify ID to a Buildspace identity,
  -- server-side, exactly as get_nearify_live_attendee_signals.
  candidates AS (
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
  SELECT jsonb_object_agg(
    cand.nearify_user_id,
    jsonb_build_object(
      -- ---- Tier A: shared/mutual ----
      'shared_skills', (
        SELECT COALESCE(jsonb_agg(DISTINCT s), '[]'::jsonb)
        FROM unnest(string_to_array(coalesce(c.skills, ''), ',')) s
        WHERE trim(lower(s)) IN (SELECT skill FROM my_skills) AND trim(s) <> ''
      ),
      'shared_projects', (
        SELECT COALESCE(jsonb_agg(DISTINCT p.title), '[]'::jsonb)
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = cand.community_id
          AND pm.project_id IN (SELECT project_id FROM my_projects)
          AND p.status IN ('open', 'active', 'completed')
      ),
      'shared_organizations', (
        SELECT COALESCE(jsonb_agg(DISTINCT o.name), '[]'::jsonb)
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.community_id = cand.community_id
          AND om.organization_id IN (SELECT organization_id FROM my_orgs)
          AND o.status = 'active'
      ),
      'mutual_connection_count', (
        SELECT count(*) FROM (
          SELECT DISTINCT CASE WHEN from_user_id = cand.community_id THEN to_user_id ELSE from_user_id END AS partner
          FROM connections
          WHERE status = 'accepted' AND (from_user_id = cand.community_id OR to_user_id = cand.community_id)
        ) their_partners
        WHERE their_partners.partner IN (SELECT partner FROM my_partners)
      ),
      -- ---- Tier B: true about them, publicly visible under existing policy ----
      'their_projects', (
        SELECT COALESCE(jsonb_agg(DISTINCT p.title), '[]'::jsonb)
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = cand.community_id AND p.status IN ('open', 'active', 'completed')
      ),
      'their_organizations', (
        SELECT COALESCE(jsonb_agg(DISTINCT o.name), '[]'::jsonb)
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.community_id = cand.community_id AND om.status = 'active' AND o.status = 'active'
      ),
      'their_themes', (
        SELECT COALESCE(jsonb_agg(DISTINCT tc.title), '[]'::jsonb)
        FROM theme_participants tp
        JOIN theme_circles tc ON tc.id = tp.theme_id
        WHERE tp.community_id = cand.community_id AND tc.status = 'active'
      ),
      -- Only the 'posted' relationship is schema-supportable — see
      -- header comment. No project_team_member type: opportunities has
      -- no project_id column at all.
      'related_active_opportunities', (
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
          'title', opp.title,
          'organization_name', org.name,
          'relationship', 'posted'
        )), '[]'::jsonb)
        FROM opportunities opp
        LEFT JOIN organizations org ON org.id = opp.organization_id
        WHERE opp.posted_by = cand.community_id
          AND opp.status = 'open'
          AND (opp.application_deadline IS NULL OR opp.application_deadline > now())
          AND (opp.is_public IS NULL OR opp.is_public = true)
      )
    )
  )
  INTO v_result
  FROM candidates cand
  JOIN community c ON c.id = cand.community_id;

  RETURN jsonb_build_object(
    'success', true,
    'enrichment', COALESCE(v_result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearify_relationship_enrichment(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nearify_relationship_enrichment(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nearify_relationship_enrichment(TEXT[]) TO authenticated;

-- ================================================================
-- COMPLETION
-- ================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Nearify relationship enrichment deployed:';
  RAISE NOTICE '   ✓ get_nearify_relationship_enrichment(p_nearify_user_ids)';
END $$;
