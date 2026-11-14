-- Add daily aggregate buckets to the existing admin-only report. No new tracking or table access.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_admin_site_visit_report(
  p_days integer DEFAULT 30,
  p_view text DEFAULT 'community',
  p_excluded_browser_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community WHERE user_id = auth.uid() AND user_role = 'Admin'
  ) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days < 0 OR p_days > 90 THEN
    RAISE EXCEPTION 'Period must be 0 (last hour) or 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_view IS NULL OR p_view NOT IN ('community', 'internal', 'all') THEN
    RAISE EXCEPTION 'Unknown visitor view' USING ERRCODE = '22023';
  END IF;
  WITH admin_accounts AS (
    SELECT DISTINCT user_id FROM public.community
    WHERE user_role = 'Admin' AND user_id IS NOT NULL
  ), internal_browsers AS (
    -- Use all retained history, even when the admin login is outside this period.
    SELECT DISTINCT browser_id FROM public.site_visit_sessions
    WHERE auth_user_id IN (SELECT user_id FROM admin_accounts)
    UNION SELECT p_excluded_browser_id WHERE p_excluded_browser_id IS NOT NULL
  ), classified AS (
    SELECT v.*, (v.auth_user_id IN (SELECT user_id FROM admin_accounts)
      OR v.browser_id IN (SELECT browser_id FROM internal_browsers)) AS internal
    FROM public.site_visit_sessions v
    WHERE last_seen_at >= now() - CASE WHEN p_days = 0 THEN interval '1 hour' ELSE make_interval(days => p_days) END
  ), filtered AS (
    SELECT * FROM classified
    WHERE p_view = 'all' OR (p_view = 'internal' AND COALESCE(internal, false))
      OR (p_view = 'community' AND NOT COALESCE(internal, false))
  )
  SELECT jsonb_build_object(
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'visits', visits) ORDER BY day)
      FROM (
        SELECT days.day, count(v.session_id) AS visits
        FROM generate_series(
          date_trunc('day', (now() - CASE WHEN p_days = 0 THEN interval '1 hour' ELSE make_interval(days => p_days) END) AT TIME ZONE 'UTC'),
          date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day'
        ) AS days(day)
        LEFT JOIN filtered v ON v.last_seen_at AT TIME ZONE 'UTC' >= days.day
          AND v.last_seen_at AT TIME ZONE 'UTC' < days.day + interval '1 day'
        GROUP BY days.day
      ) buckets),
    'separation_version', 2,
    'internal_visits', (SELECT count(*) FROM classified WHERE internal),
    'community_visits', (SELECT count(*) FROM classified WHERE NOT COALESCE(internal, false)),
    'visits', count(*), 'browsers', count(DISTINCT browser_id),
    'guests', count(*) FILTER (WHERE auth_user_id IS NULL),
    'members', count(*) FILTER (WHERE auth_user_id IS NOT NULL),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.last_seen_at DESC) FROM (
      SELECT last_seen_at, auth_user_id IS NOT NULL AS signed_in, COALESCE(internal, false) AS internal
      FROM filtered ORDER BY last_seen_at DESC LIMIT 20
    ) r), '[]'::jsonb)
  ) INTO result FROM filtered;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_admin_site_visit_report(integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_site_visit_report(integer, text, uuid) TO authenticated;
COMMIT;
