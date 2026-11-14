-- Runs after site-visits-db.sql; all data is synthetic.
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.community VALUES ('00000000-0000-4000-8000-000000000003','Admin');
INSERT INTO public.site_visit_sessions(session_id,browser_id,auth_user_id,last_seen_at) VALUES
 ('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000003',now()-interval '15 days'),
 ('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000005',NULL,now()),
 ('10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002',now());
INSERT INTO public.site_visit_sessions(session_id,browser_id,last_seen_at) VALUES
 ('10000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000008',now()-interval '2 hours');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
DO $$ DECLARE c jsonb; BEGIN
 c := public.get_admin_site_visits(7,true,NULL);
 ASSERT (c->>'visits')::int = 3, 'Other admin browser activity leaked into community totals';
 ASSERT (c->>'internal_visits')::int = 4, 'Admin/browser activity missing';
 ASSERT (c->>'community_visits')::int = 3, 'Community subtotal wrong';
 ASSERT (c->>'guests')::int = 2 AND (c->>'members')::int = 1, 'Community breakdown wrong';
 ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c->'recent') v WHERE (v->>'internal')::boolean), 'Admin activity leaked into recent community visits';
 c := public.get_admin_site_visits(7,false,NULL);
 ASSERT (c->>'visits')::int = 7 AND (c->>'internal_visits')::int = 4, 'Combined view wrong';
 c := public.get_admin_site_visits(7,true,'20000000-0000-4000-8000-000000000003');
 ASSERT (c->>'visits')::int = 2 AND (c->>'internal_visits')::int = 5, 'Current signed-out browser not separated';
 ASSERT (public.get_admin_site_visits(0,true,NULL)->>'visits')::int = 2, 'Last hour failed';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_site_visits(); RAISE EXCEPTION 'Member reporting allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
