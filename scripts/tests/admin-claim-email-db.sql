SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000001'::uuid]); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000001'::uuid]); RAISE EXCEPTION 'member allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ DECLARE r jsonb; rid uuid; BEGIN
 r:=public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000001'::uuid]);
 IF jsonb_array_length(r)<>1 OR r->0->>'status'<>'reserved' OR r->0->>'email'<>'eligible@example.test' THEN RAISE EXCEPTION 'reservation/dedup wrong: %',r; END IF;
 rid:=(r->0->>'request_id')::uuid;
 r:=public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000001'::uuid]);
 IF r->0->>'status'<>'rate_limited' THEN RAISE EXCEPTION 'duplicate not limited'; END IF;
 BEGIN PERFORM public.finish_admin_claim_email(rid,true,'accepted'); RAISE EXCEPTION 'client finalized mail'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.admin_claim_email_requests; RAISE EXCEPTION 'client read private audit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=public.reserve_admin_claim_emails(ARRAY['10000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000003'::uuid,'20000000-0000-4000-8000-000000000004'::uuid]);
 IF r->0->>'status'<>'already_claimed' OR r->1->>'status'<>'missing_email' OR r->2->>'status'<>'disabled' OR r->3->>'status'<>'ambiguous_email' THEN RAISE EXCEPTION 'eligibility failed: %',r; END IF;
 BEGIN PERFORM public.reserve_admin_claim_emails(ARRAY[]::uuid[]); RAISE EXCEPTION 'empty allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.reserve_admin_claim_emails(array_fill(gen_random_uuid(),ARRAY[21])); RAISE EXCEPTION 'oversize allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
-- Service-only finalization and durable cooldown, even after a provider error.
SET ROLE service_role;
DO $$ BEGIN
 -- Audit IDs are intentionally unavailable to this caller without direct table grants;
 -- the Edge function receives its own IDs from the authorized reservation.
 PERFORM public.finish_admin_claim_email('99999999-0000-4000-8000-000000000001',false,'provider_rejected');
END $$;
RESET ROLE;
DO $$ DECLARE rid uuid; BEGIN
 SELECT id INTO rid FROM public.admin_claim_email_requests LIMIT 1;
 PERFORM public.finish_admin_claim_email(rid,true,'accepted');
 IF (SELECT status FROM public.admin_claim_email_requests WHERE id=rid)<>'accepted' THEN RAISE EXCEPTION 'finish failed'; END IF;
 PERFORM public.finish_admin_claim_email(rid,false,'late_failure');
 IF (SELECT status FROM public.admin_claim_email_requests WHERE id=rid)<>'accepted' THEN RAISE EXCEPTION 'finish not idempotent'; END IF;
END $$;
-- Cooldown expiry allows retry, but a recipient cannot receive >5/day.
DO $$ DECLARE r jsonb; i integer; BEGIN
 FOR i IN 1..4 LOOP
  UPDATE public.admin_claim_email_requests SET requested_at=now()-interval '6 minutes';
  r:=public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000001'::uuid]);
  IF r->0->>'status'<>'reserved' THEN RAISE EXCEPTION 'Retry after cooldown failed: %',r; END IF;
 END LOOP;
 UPDATE public.admin_claim_email_requests SET requested_at=now()-interval '6 minutes';
 r:=public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000001'::uuid]);
 IF r->0->>'status'<>'rate_limited' THEN RAISE EXCEPTION 'Daily cap failed'; END IF;
END $$;
INSERT INTO public.community(id,user_role,email) VALUES('20000000-0000-4000-8000-000000000006','Member','new@example.test');
INSERT INTO public.admin_claim_email_requests(person_id,requested_by,email_key)
 SELECT '20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001',md5(i::text) FROM generate_series(1,45)i;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.reserve_admin_claim_emails(ARRAY['20000000-0000-4000-8000-000000000006'::uuid]);
 IF r->0->>'status'<>'rate_limited' THEN RAISE EXCEPTION 'Admin hourly cap failed'; END IF;
END $$;
-- Deleting a profile must not erase throttle history.
DELETE FROM public.community WHERE id='20000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.admin_claim_email_requests WHERE email_key=md5('eligible@example.test'))<>5 THEN RAISE EXCEPTION 'Profile deletion erased throttle'; END IF;
END $$;
