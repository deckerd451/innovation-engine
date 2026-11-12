-- First-party aggregate visits. Apply manually; never run against production from tests.
BEGIN;
CREATE TABLE public.site_visit_sessions (
  session_id uuid PRIMARY KEY,
  browser_id uuid NOT NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_visit_sessions_recent_idx ON public.site_visit_sessions(last_seen_at);
ALTER TABLE public.site_visit_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_visit_sessions FROM anon, authenticated;

CREATE FUNCTION public.record_site_visit(p_session_id uuid, p_browser_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_session_id IS NULL OR p_browser_id IS NULL THEN
    RAISE EXCEPTION 'Missing visit identity' USING ERRCODE = '22023';
  END IF;
  -- Bounded housekeeping: remove at most 100 expired visits per recording call.
  DELETE FROM public.site_visit_sessions WHERE session_id IN (
    SELECT session_id FROM public.site_visit_sessions
    WHERE last_seen_at < now() - interval '90 days'
    ORDER BY last_seen_at LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  INSERT INTO public.site_visit_sessions AS visit(session_id, browser_id, auth_user_id)
    VALUES(p_session_id, p_browser_id, auth.uid())
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen_at = now(), auth_user_id = COALESCE(visit.auth_user_id, auth.uid())
    WHERE visit.browser_id = p_browser_id
      AND (visit.auth_user_id IS NULL OR visit.auth_user_id = auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.record_site_visit(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_site_visit(uuid, uuid) TO anon, authenticated;

CREATE FUNCTION public.get_admin_site_visits(
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
REVOKE ALL ON FUNCTION public.get_admin_site_visits(integer, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_site_visits(integer, boolean, uuid) TO authenticated;
COMMIT;
