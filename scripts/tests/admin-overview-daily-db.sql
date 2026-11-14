-- Synthetic report fixtures only. Follows visitor-report-views-db.sql.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
DO $$ DECLARE c jsonb; mode text; BEGIN
 FOREACH mode IN ARRAY ARRAY['community','internal','all'] LOOP
  c := public.get_admin_site_visit_report(7,mode);
  ASSERT jsonb_array_length(c->'daily') = 8, 'Rolling seven days must include both partial UTC dates';
  ASSERT (SELECT sum((d->>'visits')::int) FROM jsonb_array_elements(c->'daily') d) = (c->>'visits')::int, 'Daily trend and selected view total differ';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(c->'daily') d WHERE (d->>'visits')::int=0) > 0, 'Empty dates not zero filled';
  c := public.get_admin_site_visit_report(0,mode);
  ASSERT (SELECT sum((d->>'visits')::int) FROM jsonb_array_elements(c->'daily') d) = (c->>'visits')::int, 'Hourly boundary inconsistent';
 END LOOP;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_site_visit_report(); RAISE EXCEPTION 'Anonymous report allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_site_visit_report(); RAISE EXCEPTION 'Member report allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
