-- Paginated admin follow-up using the Analytics rule exactly:
-- coalesce(community.connection_count, 0) = 0 (including unclaimed/hidden rows).
-- Read-only; returns no email, image, message, or raw connection data.
BEGIN;
CREATE FUNCTION public.get_admin_unconnected_members(p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community WHERE user_id = auth.uid() AND user_role = 'Admin') THEN
    RAISE EXCEPTION 'not_authorized: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Invalid page' USING ERRCODE = '22023';
  END IF;
  WITH eligible AS MATERIALIZED (
    SELECT id, name, skills, created_at FROM public.community WHERE coalesce(connection_count, 0) = 0
  ), page AS (
    SELECT id, name, skills, created_at FROM eligible
    ORDER BY created_at DESC NULLS LAST, id LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object('total', (SELECT count(*) FROM eligible),
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'skills', skills)
      ORDER BY created_at DESC NULLS LAST, id) FROM page), '[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_unconnected_members(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_unconnected_members(integer, integer) TO authenticated;
COMMIT;
