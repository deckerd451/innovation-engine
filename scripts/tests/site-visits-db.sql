-- Disposable local fixture only; applied after the site-visits migration.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
INSERT INTO public.community(user_id, user_role) VALUES
 ('00000000-0000-4000-8000-000000000001', 'Admin'),
 ('00000000-0000-4000-8000-000000000002', 'Member');
SET ROLE anon;
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN PERFORM * FROM public.site_visit_sessions; RAISE EXCEPTION 'Anonymous table read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_admin_site_visits(); RAISE EXCEPTION 'Anonymous reporting allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
SET ROLE authenticated;
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN PERFORM public.get_admin_site_visits(); RAISE EXCEPTION 'Member reporting allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.site_visit_sessions; RAISE EXCEPTION 'Member table read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.site_visit_sessions) = 1, 'Reload/sign-in duplicated visit';
 ASSERT (SELECT auth_user_id FROM public.site_visit_sessions LIMIT 1) = '00000000-0000-4000-8000-000000000002'::uuid, 'Server auth identity missing';
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
-- Another account must not take over the existing signed-in session.
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002');
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
DO $$ DECLARE counts jsonb; BEGIN
 counts := public.get_admin_site_visits(30, true, '20000000-0000-4000-8000-000000000002');
 ASSERT (counts->>'visits')::int = 2, 'Account/browser exclusion wrong';
 ASSERT (counts->>'guests')::int = 1 AND (counts->>'members')::int = 1, 'Guest/member breakdown wrong';
 ASSERT (counts->>'browsers')::int = 2, 'Browser totals wrong';
 ASSERT (public.get_admin_site_visits(30, false)->>'visits')::int = 4, 'Include self wrong';
 BEGIN PERFORM public.get_admin_site_visits(999); RAISE EXCEPTION 'Unbounded report accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT auth_user_id FROM public.site_visit_sessions WHERE session_id = '10000000-0000-4000-8000-000000000001') = '00000000-0000-4000-8000-000000000002'::uuid, 'Session takeover allowed';
END $$;

INSERT INTO public.site_visit_sessions(session_id,browser_id,last_seen_at)
 VALUES ('10000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000099',now()-interval '91 days');
SET ROLE authenticated;
SELECT public.record_site_visit('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM public.site_visit_sessions WHERE last_seen_at < now()-interval '90 days'), 'Expired visit retained after recording';
END $$;
