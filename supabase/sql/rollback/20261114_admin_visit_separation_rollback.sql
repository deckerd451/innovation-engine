-- Restore the previous report. Roll back the matching UI as well.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_admin_site_visits(
  p_days integer DEFAULT 30,
  p_exclude_self boolean DEFAULT true,
  p_excluded_browser_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community WHERE user_id = auth.uid() AND user_role = 'Admin'
  ) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'Period must be 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  WITH filtered AS (
    SELECT * FROM public.site_visit_sessions
    WHERE last_seen_at >= now() - make_interval(days => p_days)
      AND (NOT COALESCE(p_exclude_self, true) OR (
        auth_user_id IS DISTINCT FROM auth.uid()
        AND browser_id IS DISTINCT FROM p_excluded_browser_id
      ))
  )
  SELECT jsonb_build_object(
    'visits', count(*), 'browsers', count(DISTINCT browser_id),
    'guests', count(*) FILTER (WHERE auth_user_id IS NULL),
    'members', count(*) FILTER (WHERE auth_user_id IS NOT NULL),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.last_seen_at DESC) FROM (
      SELECT last_seen_at, auth_user_id IS NOT NULL AS signed_in
      FROM filtered ORDER BY last_seen_at DESC LIMIT 20
    ) r), '[]'::jsonb)
  ) INTO result FROM filtered;
  RETURN result;
END $$;
COMMIT;
