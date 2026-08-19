-- Admin analytics aggregate RPC + minimum photo-visibility control for Synapse.
--
-- Context: assets/js/admin-analytics.js previously computed network metrics
-- by downloading full `connections`, `messages`, and `activity_log` tables
-- to the browser (including raw message content) and relied solely on a
-- client-side hardcoded email allowlist for "admin" gating. This migration:
--   1. Adds `community.user_role = 'Admin'` as the server-side authority for
--      privileged analytics (the column already existed and is already the
--      source of truth adminPeopleService.js uses for role changes; this
--      just makes it authoritative for reads too, not only writes).
--   2. Backfills that role for the accounts the existing client-side
--      allowlist already trusts, so access is not silently revoked.
--   3. Adds a single narrow SECURITY DEFINER aggregate RPC that returns
--      counts/derived values only -- no raw connection, message, or
--      activity_log rows ever leave the database. Fails closed (raises)
--      for any caller who is not community.user_role = 'Admin'.
--   4. Adds `community.photo_visible` -- profile-photo exposure is
--      independent of "listed/searchable" (community.is_hidden, already
--      used consistently elsewhere) and had no existing field.
--
-- Apply manually via the Supabase Dashboard SQL editor or:
--   supabase db execute -f supabase/sql/migrations/20260819_admin_analytics_privacy.sql
-- (supabase/sql is not executed automatically -- see supabase/sql/README.md)

-- ---------------------------------------------------------------------------
-- 1 & 2. Server-side admin authority
-- ---------------------------------------------------------------------------

-- Idempotent: only raises accounts that exist and aren't already Admin.
-- Mirrors the allowlist in assets/js/dashboard-actions.js isAdminUser().
UPDATE public.community
SET user_role = 'Admin'
WHERE lower(email) IN (
  'dmhamilton1@live.com',
  'hojaaya@gmail.com',
  'deckerdb26354@gmail.com',
  'vramshesh@gmail.com',
  'bradleydaltonoates@gmail.com',
  'jody_stoehr@hotmail.com',
  'dave.a.ingram@gmail.com',
  'will@gdna.io'
)
AND (user_role IS DISTINCT FROM 'Admin');

-- ---------------------------------------------------------------------------
-- 3. Admin network analytics aggregate RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_network_analytics(p_active_window_days integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_total_members integer;
  v_active_members integer;
  v_total_connections integer;
  v_new_members integer;
  v_new_connections integer;
  v_total_projects integer;
  v_active_projects integer;
  v_open_opportunities integer;
  v_open_opportunities_no_apps integer;
  v_possible_connections numeric;
  v_network_density numeric;
  v_isolated_count integer;
  v_isolated_sample json;
  v_key_connectors json;
  v_top_skills json;
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

  IF p_active_window_days IS NULL OR p_active_window_days <= 0 THEN
    p_active_window_days := 30;
  END IF;

  SELECT count(*) INTO v_total_members FROM public.community;

  SELECT count(*) INTO v_active_members
  FROM public.community
  WHERE last_seen_at IS NOT NULL
    AND last_seen_at >= now() - (p_active_window_days || ' days')::interval;

  SELECT count(*) INTO v_total_connections
  FROM public.connections
  WHERE status = 'accepted';

  SELECT count(*) INTO v_new_members
  FROM public.community
  WHERE created_at >= now() - interval '30 days';

  SELECT count(*) INTO v_new_connections
  FROM public.connections
  WHERE status = 'accepted' AND created_at >= now() - interval '30 days';

  SELECT count(*) INTO v_total_projects FROM public.projects;
  SELECT count(*) INTO v_active_projects FROM public.projects WHERE status = 'active';

  SELECT count(*) INTO v_open_opportunities
  FROM public.opportunities WHERE status = 'open';

  SELECT count(*) INTO v_open_opportunities_no_apps
  FROM public.opportunities
  WHERE status = 'open' AND coalesce(application_count, 0) = 0;

  v_possible_connections := (v_total_members * (v_total_members - 1)) / 2.0;
  v_network_density := CASE
    WHEN v_possible_connections > 0
      THEN round((v_total_connections / v_possible_connections * 100)::numeric, 2)
    ELSE 0
  END;

  SELECT count(*) INTO v_isolated_count
  FROM public.community
  WHERE coalesce(connection_count, 0) = 0;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v_isolated_sample
  FROM (
    SELECT id, name, skills
    FROM public.community
    WHERE coalesce(connection_count, 0) = 0
    ORDER BY created_at DESC NULLS LAST
    LIMIT 10
  ) t;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v_key_connectors
  FROM (
    SELECT id, name, connection_count
    FROM public.community
    WHERE coalesce(connection_count, 0) > 0
    ORDER BY connection_count DESC
    LIMIT GREATEST(5, floor(v_total_members * 0.1)::int)
  ) t;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v_top_skills
  FROM (
    SELECT trim(skill) AS skill, count(*) AS members
    FROM public.community, unnest(string_to_array(skills, ',')) AS skill
    WHERE skills IS NOT NULL AND trim(skill) <> ''
    GROUP BY trim(skill)
    ORDER BY count(*) DESC
    LIMIT 10
  ) t;

  RETURN json_build_object(
    'generated_at', now(),
    'active_window_days', p_active_window_days,
    'total_members', v_total_members,
    'active_members', v_active_members,
    'total_connections', v_total_connections,
    'new_members_30d', v_new_members,
    'new_connections_30d', v_new_connections,
    'total_projects', v_total_projects,
    'active_projects', v_active_projects,
    'open_opportunities', v_open_opportunities,
    'open_opportunities_no_applications', v_open_opportunities_no_apps,
    'network_density_pct', v_network_density,
    'isolated_members_count', v_isolated_count,
    'isolated_members_sample', v_isolated_sample,
    'key_connectors', v_key_connectors,
    'top_skills', v_top_skills
  );
END;
$$;

-- Narrow grant: any authenticated user may CALL the function, but the
-- function itself denies everyone except user_role='Admin' (fail closed).
-- No broad RLS/admin-bypass policy is added on connections/messages/
-- activity_log -- this function is the only privileged read path.
REVOKE ALL ON FUNCTION public.get_admin_network_analytics(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_network_analytics(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Photo visibility
-- ---------------------------------------------------------------------------

ALTER TABLE public.community
  ADD COLUMN IF NOT EXISTS photo_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.community.photo_visible IS
  'Whether this member''s profile photo is shown to OTHER members across Synapse (graph, Explore -> People, Search, People Worth Knowing). Independent of is_hidden (listed/searchable/discoverable). Members always see their own photo regardless of this value.';
