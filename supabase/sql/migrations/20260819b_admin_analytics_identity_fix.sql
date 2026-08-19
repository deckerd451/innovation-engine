-- Fixes a counting/identity defect in get_admin_network_analytics(), shipped
-- earlier today in 20260819_admin_analytics_privacy.sql, found during a
-- correctness review of the newly deployed Ecosystem Analytics.
--
-- DEMONSTRATED DEFECT (evidenced directly against this codebase, not
-- hypothetical):
--
--  1. Duplicate community rows for one real person. commit 35c2b871 ("fix
--     person deduplication and self-recommendation in Synapse") documents,
--     and specifically guards against, "a duplicate/legacy community row
--     for the same human -- same auth user_id, different community id".
--     The RPC's `count(*) FROM community` counted such rows as separate
--     members, and its isolated-members check counted the duplicate row
--     as isolated even when the person's real connections are attached to
--     their other (canonical) row.
--
--  2. Reciprocal duplicate connection rows. `connections` has no unique
--     constraint on the unordered (from_user_id, to_user_id) pair (verified:
--     no such constraint exists anywhere in supabase/sql). assets/js/
--     connections.js's sendConnectionRequest() checks for an existing row
--     via getConnectionBetween() before inserting, but that check-then-
--     insert has no DB-level guard against a race: if two people send each
--     other a request at close to the same time, both checks can pass
--     before either insert lands, producing two rows (A->B and B->A) for
--     one relationship, each independently acceptable. commit 35c2b871's
--     own comment confirms this has been observed in this codebase's
--     actual data ("an accepted row exists in both directions").
--
--     This inflated THREE independent things that were supposed to agree,
--     each by a different, uncorrelated amount depending on how many pairs
--     happened to have a duplicate row:
--       - get_admin_network_analytics()'s total_connections: counted
--         connection ROWS (`count(*) WHERE status='accepted'`), so a
--         reciprocal pair counted as 2.
--       - community.connection_count (trigger-maintained, see
--         fix-connection-count-trigger.sql): for a duplicated pair, BOTH
--         rows satisfy `from_user_id = X OR to_user_id = X` for a given
--         person X, so their own degree double-counts that one peer.
--         This is the same figure shown on a person's own profile card
--         (assets/js/node-panel.js:1486, "${profile.connection_count}
--         connections").
--       - assets/js/connections.js's getAcceptedConnections(): returns raw
--         rows via the same OR-both-directions filter, so
--         start-ui-enhanced.js's `allConnections.length` inherits the same
--         inflation independently.
--     None of the three is deduped against the others, so an apparent
--     "12 connections on one profile vs. 14 total network-wide" reading
--     cannot be trusted either way until computed from unique pairs -- it
--     is not proof of a hub-and-spoke network, nor proof of a bug on its
--     own; it is two numbers from two admittedly-unreliable sources.
--
-- FIX (this RPC only -- the underlying node-panel.js / connections.js
-- display paths, and the missing DB constraint, are unchanged; scope is
-- Ecosystem Analytics correctness, not a wider redesign):
--   - A canonical-identity mapping (coalesce(user_id, id), matching the
--     exact "id OR user_id" rule already established and tested in
--     35c2b871 -- rows with no user_id are never merged with each other,
--     only rows that SHARE a non-null user_id are the same person).
--   - Every accepted relationship deduped to one row per unordered
--     (canonical peer, canonical peer) pair, self-pairs excluded.
--   - total_members, active_members, new_members_30d: counted over
--     canonical identities, not raw rows.
--   - total_connections, new_connections_30d, network_density_pct,
--     isolated_members_count/sample, key_connectors: computed from the
--     deduped pair list (a real per-person degree), not from
--     community.connection_count or a raw row count.
--   - top_skills: counted once per canonical identity.
--
-- The RPC's JSON response shape is unchanged (same field names), so no
-- client-side change is required.

CREATE OR REPLACE FUNCTION public.get_admin_network_analytics(p_active_window_days integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_window integer;
  v_result json;
BEGIN
  -- Fail closed: only a caller whose own community row is user_role='Admin'
  -- may proceed. No aggregate is computed or returned otherwise.
  SELECT (user_role = 'Admin') INTO v_is_admin
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized: admin role required'
      USING ERRCODE = '42501';
  END IF;

  v_window := p_active_window_days;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 30;
  END IF;

  WITH canon AS (
    -- Canonical identity per real person. Rows sharing the same non-null
    -- user_id are duplicate/legacy rows for one human; rows with no
    -- user_id are each their own identity (two different unclaimed rows
    -- are two different people, never merged).
    SELECT
      id,
      coalesce(user_id::text, id::text) AS canonical_id,
      name,
      skills,
      last_seen_at,
      created_at,
      row_number() OVER (
        PARTITION BY coalesce(user_id::text, id::text)
        ORDER BY (user_id IS NULL) ASC, created_at ASC
      ) AS rn
    FROM public.community
  ),
  members AS (
    -- One row per canonical identity, preferring the claimed row
    -- (user_id IS NOT NULL) as the representative for display fields.
    SELECT * FROM canon WHERE rn = 1
  ),
  pairs AS (
    -- Every accepted relationship, mapped to canonical identities and
    -- collapsed to one row per unordered pair -- this is what removes
    -- both reciprocal duplicate connection rows AND duplicate-community-
    -- row pairs. Self-pairs (two rows of the same person connected to
    -- each other) are excluded.
    SELECT
      least(ca.canonical_id, cb.canonical_id) AS peer_a,
      greatest(ca.canonical_id, cb.canonical_id) AS peer_b,
      min(c.created_at) AS formed_at
    FROM public.connections c
    JOIN canon ca ON ca.id = c.from_user_id
    JOIN canon cb ON cb.id = c.to_user_id
    WHERE c.status = 'accepted'
      AND ca.canonical_id <> cb.canonical_id
    GROUP BY least(ca.canonical_id, cb.canonical_id), greatest(ca.canonical_id, cb.canonical_id)
  ),
  degree AS (
    -- True per-person degree from the deduped pair list -- NOT from
    -- community.connection_count, which inherits the reciprocal-row bug.
    SELECT canonical_id, count(*) AS n
    FROM (
      SELECT peer_a AS canonical_id FROM pairs
      UNION ALL
      SELECT peer_b AS canonical_id FROM pairs
    ) x
    GROUP BY canonical_id
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM members) AS total_members,
      (SELECT count(*) FROM members
        WHERE last_seen_at IS NOT NULL
          AND last_seen_at >= now() - (v_window || ' days')::interval) AS active_members,
      (SELECT count(*) FROM pairs) AS total_connections,
      (SELECT count(*) FROM members WHERE created_at >= now() - interval '30 days') AS new_members_30d,
      (SELECT count(*) FROM pairs WHERE formed_at >= now() - interval '30 days') AS new_connections_30d,
      (SELECT count(*) FROM public.projects) AS total_projects,
      (SELECT count(*) FROM public.projects WHERE status = 'active') AS active_projects,
      (SELECT count(*) FROM public.opportunities WHERE status = 'open') AS open_opportunities,
      (SELECT count(*) FROM public.opportunities
        WHERE status = 'open' AND coalesce(application_count, 0) = 0) AS open_opportunities_no_apps,
      (SELECT count(*) FROM members m LEFT JOIN degree d ON d.canonical_id = m.canonical_id
        WHERE coalesce(d.n, 0) = 0) AS isolated_count
  ),
  isolated_sample AS (
    SELECT json_agg(row_to_json(t)) AS j FROM (
      SELECT m.id, m.name, m.skills
      FROM members m LEFT JOIN degree d ON d.canonical_id = m.canonical_id
      WHERE coalesce(d.n, 0) = 0
      ORDER BY m.created_at DESC NULLS LAST
      LIMIT 10
    ) t
  ),
  key_connectors AS (
    SELECT json_agg(row_to_json(t)) AS j FROM (
      SELECT m.id, m.name, d.n AS connection_count
      FROM members m JOIN degree d ON d.canonical_id = m.canonical_id
      WHERE d.n > 0
      ORDER BY d.n DESC
      LIMIT GREATEST(5, floor((SELECT total_members FROM totals) * 0.1)::int)
    ) t
  ),
  top_skills AS (
    SELECT json_agg(row_to_json(t)) AS j FROM (
      SELECT trim(skill) AS skill, count(*) AS members
      FROM members m, unnest(string_to_array(m.skills, ',')) AS skill
      WHERE m.skills IS NOT NULL AND trim(skill) <> ''
      GROUP BY trim(skill)
      ORDER BY count(*) DESC
      LIMIT 10
    ) t
  )
  SELECT json_build_object(
    'generated_at', now(),
    'active_window_days', v_window,
    'total_members', totals.total_members,
    'active_members', totals.active_members,
    'total_connections', totals.total_connections,
    'new_members_30d', totals.new_members_30d,
    'new_connections_30d', totals.new_connections_30d,
    'total_projects', totals.total_projects,
    'active_projects', totals.active_projects,
    'open_opportunities', totals.open_opportunities,
    'open_opportunities_no_applications', totals.open_opportunities_no_apps,
    'network_density_pct', CASE
      WHEN totals.total_members > 1
        THEN round((totals.total_connections / ((totals.total_members * (totals.total_members - 1)) / 2.0) * 100)::numeric, 2)
      ELSE 0
    END,
    'isolated_members_count', totals.isolated_count,
    'isolated_members_sample', coalesce(isolated_sample.j, '[]'::json),
    'key_connectors', coalesce(key_connectors.j, '[]'::json),
    'top_skills', coalesce(top_skills.j, '[]'::json)
  ) INTO v_result
  FROM totals, isolated_sample, key_connectors, top_skills;

  RETURN v_result;
END;
$$;

-- Grants are unaffected by CREATE OR REPLACE on an unchanged signature, but
-- restated for safety/idempotency.
REVOKE ALL ON FUNCTION public.get_admin_network_analytics(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_network_analytics(integer) TO authenticated;
