-- Synthetic records from the preceding visitor separation suite.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
DO $$ DECLARE c jsonb; BEGIN
 c := public.get_admin_site_visit_report(7,'community');
 ASSERT (c->>'visits')::int = 3, 'Community view includes internal activity';
 c := public.get_admin_site_visit_report(7,'internal');
 ASSERT (c->>'visits')::int = 4, 'Internal view wrong';
 ASSERT (c->>'browsers')::int = 2, 'Internal unique browser count wrong';
 ASSERT (c->>'guests')::int = 2 AND (c->>'members')::int = 2, 'Internal breakdown wrong';
 ASSERT jsonb_array_length(c->'recent') = 4, 'Internal recent list wrong';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'recent') v WHERE NOT (v->>'internal')::boolean), 'Community activity leaked into internal view';
 ASSERT (public.get_admin_site_visit_report(7,'all')->>'visits')::int = 7, 'Combined view wrong';
 ASSERT (public.get_admin_site_visit_report(0,'community')->>'visits')::int = 2, 'Last hour wrong';
 BEGIN PERFORM public.get_admin_site_visit_report(7,'unknown'); RAISE EXCEPTION 'Invalid view accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_site_visit_report(); RAISE EXCEPTION 'Member access allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_site_visit_report(); RAISE EXCEPTION 'Anonymous access allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
