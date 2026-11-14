-- Separate allowlisted aggregate report for signed-in, enabled members.
-- Sensitive admin reports are not exposed or reused here.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_community_pulse()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.community WHERE user_id=auth.uid() AND is_disabled IS NOT TRUE) THEN RAISE EXCEPTION 'Enabled community membership required' USING ERRCODE='42501'; END IF;
 WITH visible AS (
  SELECT * FROM public.community WHERE is_hidden IS NOT TRUE AND is_disabled IS NOT TRUE AND user_role IS DISTINCT FROM 'Admin' AND coalesce(name,'')!~*'(^|[^a-z])(test|tester|fixture)([^a-z]|$)'
 ), edges AS (
  SELECT c.* FROM public.connections c JOIN visible a ON a.id=c.from_user_id JOIN visible b ON b.id=c.to_user_id WHERE c.status='accepted'
 ), skills AS (
  SELECT lower(btrim(s.skill)) AS skill,count(DISTINCT v.id) AS n
  FROM visible v CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(v)->'skills')='array' THEN to_jsonb(v)->'skills' ELSE to_jsonb(string_to_array(coalesce(to_jsonb(v)->>'skills',''),',')) END) s(skill)
  WHERE length(btrim(s.skill)) BETWEEN 1 AND 80 GROUP BY lower(btrim(s.skill)) HAVING count(DISTINCT v.id)>=5
 )
 SELECT jsonb_build_object('generated_at',now(),'privacy_threshold',5,
  'member_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM visible),
  'connection_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM edges),
  'active_projects',(SELECT count(*) FROM public.projects p WHERE p.status='active' AND coalesce((to_jsonb(p)->>'is_hidden')::boolean,false)=false AND (NOT (to_jsonb(p)?'is_public') OR to_jsonb(p)->>'is_public'='true')),
  'open_opportunities',(SELECT count(*) FROM public.opportunities o WHERE o.status='open' AND o.is_public IS TRUE AND (o.application_deadline IS NULL OR o.application_deadline>now())),
  'new_profiles_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM visible WHERE created_at>=now()-interval '30 days'),
  'new_connections_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM edges WHERE created_at>=now()-interval '30 days'),
  'popular_skills',coalesce((SELECT jsonb_agg(jsonb_build_object('skill',skill,'members_band',(n/5)*5)) FROM (SELECT * FROM skills ORDER BY n DESC,skill LIMIT 8) s),'[]'::jsonb),
  'monthly', (SELECT jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),'profiles_band',CASE WHEN n>=5 THEN (n/5)*5 END) ORDER BY month) FROM (
   SELECT m.month,count(v.id) n FROM generate_series(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '5 months',date_trunc('month',now() AT TIME ZONE 'UTC'),interval '1 month') m(month)
   LEFT JOIN visible v ON v.created_at AT TIME ZONE 'UTC'>=m.month AND v.created_at AT TIME ZONE 'UTC'<m.month+interval '1 month' GROUP BY m.month
  ) months)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_community_pulse() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_community_pulse() TO authenticated;
COMMIT;
