SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.admin_email_campaign('list'); RAISE EXCEPTION 'Member campaign access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.email_campaign_recipients; RAISE EXCEPTION 'Member email audit exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.reserve_email_campaign_batch(gen_random_uuid(),auth.uid(),'test'); RAISE EXCEPTION 'Member service RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.admin_email_campaign('list'); RAISE EXCEPTION 'Anonymous campaign access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_community_pulse(); RAISE EXCEPTION 'Anonymous pulse access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
CREATE TEMP TABLE test_campaign(id uuid);
INSERT INTO test_campaign SELECT (public.admin_email_campaign('create',NULL,'{"audience":"unclaimed","subject":"Community update","message":"Help build something useful.","destination":"projects"}') ->> 'id')::uuid;
DO $$ DECLARE p jsonb; BEGIN
 p:=public.admin_email_campaign('preview',NULL,'{"audience":"all"}');
 ASSERT (p->'excluded'->>'admin')::int=2, 'Admin not excluded';
 ASSERT (p->'excluded'->>'test_profile')::int=1, 'Test not excluded';
 ASSERT (p->'excluded'->>'ambiguous_claim')::int=2, 'Ambiguous claims included';
 ASSERT (p->'excluded'->>'disabled')::int=1, 'Disabled included';
 ASSERT (public.admin_email_campaign('preview',NULL,'{"audience":"active"}')->>'eligible')::int=1, 'Active audience wrong';
 ASSERT (public.admin_email_campaign('preview',NULL,'{"audience":"inactive"}')->>'eligible')::int=0, 'Inactive audience wrong';
 ASSERT (public.admin_email_campaign('preview',NULL,'{"audience":"all","excluded_ids":["30000000-0000-4000-8000-000000000001"]}')->'excluded'->>'manually_excluded')::int=1, 'Manual exclusion ignored';
 p:=public.admin_email_campaign('report',(SELECT id FROM test_campaign));
 ASSERT (p->>'total')::int=9, 'Unclaimed snapshot wrong';
 ASSERT NOT ((p::text) LIKE '%unsubscribe_token%'), 'Report leaked unsubscribe tokens';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (public.admin_email_campaign('report',(SELECT id FROM test_campaign))->>'can_send')::boolean=false,'Other admin can send owner campaign';
 BEGIN PERFORM public.admin_email_campaign('cancel',(SELECT id FROM test_campaign)); RAISE EXCEPTION 'Other admin cancelled campaign'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
GRANT SELECT ON test_campaign TO service_role;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.reserve_email_campaign_batch((SELECT id FROM test_campaign),'00000000-0000-4000-8000-000000000001','pilot'); RAISE EXCEPTION 'Pilot before test allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
CREATE TEMP TABLE reserved AS SELECT public.reserve_email_campaign_batch((SELECT id FROM test_campaign),'00000000-0000-4000-8000-000000000001','test') AS rows;
DO $$ BEGIN ASSERT (SELECT rows->0->>'email' FROM reserved)='admin@example.test','Test not sent to verified actor'; END $$;
SELECT public.finish_email_campaign_recipient((rows->0->>'id')::uuid,'accepted','provider-test') FROM reserved;
TRUNCATE reserved;
INSERT INTO reserved SELECT public.reserve_email_campaign_batch((SELECT id FROM test_campaign),'00000000-0000-4000-8000-000000000001','pilot');
DO $$ BEGIN ASSERT (SELECT jsonb_array_length(rows) FROM reserved)=5,'Pilot not bounded to five'; END $$;
DO $$ DECLARE rid uuid; BEGIN
 SELECT (rows->0->>'id')::uuid INTO rid FROM reserved;
 PERFORM public.record_email_campaign_event('event-early','provider-pilot','email.bounced');
 PERFORM public.finish_email_campaign_recipient(rid,'accepted','provider-pilot');
 PERFORM public.record_email_campaign_event('event-late','provider-pilot','email.delivered');
END $$;
-- Remaining accepted pilot rows permit continuing only after explicit review.
SELECT public.finish_email_campaign_recipient((v->>'id')::uuid,'accepted','provider-'||(v->>'id')) FROM reserved,jsonb_array_elements(rows) WITH ORDINALITY e(v,n) WHERE n>1;
DO $$ BEGIN
 BEGIN PERFORM public.reserve_email_campaign_batch((SELECT id FROM test_campaign),'00000000-0000-4000-8000-000000000001','batch',false); RAISE EXCEPTION 'Unreviewed continuation allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT status FROM public.email_campaign_recipients WHERE provider_id='provider-pilot')='bounced','Early bounce lost or late delivery downgraded it';
 ASSERT EXISTS(SELECT 1 FROM public.email_campaign_suppressions WHERE reason='email.bounced'),'Bounce did not suppress';
END $$;
-- Recipient unsubscribes without authentication. This must suppress all future queues.
SELECT unsubscribe_token AS preference_token FROM public.email_campaign_recipients WHERE NOT is_test AND status='accepted' ORDER BY id LIMIT 1 \gset
SET ROLE anon;
SELECT public.unsubscribe_campaign_email(:'preference_token');
SELECT public.unsubscribe_campaign_email('invalid');
RESET ROLE;
SET ROLE service_role;
TRUNCATE reserved;
INSERT INTO reserved SELECT public.reserve_email_campaign_batch((SELECT id FROM test_campaign),'00000000-0000-4000-8000-000000000001','batch',true);
DO $$ BEGIN ASSERT (SELECT jsonb_array_length(rows) FROM reserved)<=4,'Batch exceeded remaining recipients'; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT public.admin_email_campaign('cancel',(SELECT id FROM test_campaign));
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.reserve_email_campaign_batch((SELECT id FROM test_campaign),'00000000-0000-4000-8000-000000000001','batch',true); RAISE EXCEPTION 'Cancelled campaign sent'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Re-check snapshots, frequency limits, ownership and bounded throttles.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
CREATE TEMP TABLE second_campaign AS SELECT (public.admin_email_campaign('create',NULL,'{"audience":"unclaimed","subject":"Second campaign","message":"Another update","destination":"home"}') ->> 'id')::uuid AS id;
RESET ROLE;
GRANT SELECT ON second_campaign TO service_role;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.reserve_email_campaign_batch((SELECT id FROM second_campaign),'00000000-0000-4000-8000-000000000003','test'); RAISE EXCEPTION 'Other admin owner spoof accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
TRUNCATE reserved;
INSERT INTO reserved SELECT public.reserve_email_campaign_batch((SELECT id FROM second_campaign),'00000000-0000-4000-8000-000000000001','test');
SELECT public.finish_email_campaign_recipient((rows->0->>'id')::uuid,'accepted','provider-second-test') FROM reserved;
RESET ROLE;
UPDATE public.email_campaign_recipients SET id='00000000-0000-4000-8000-000000000099' WHERE campaign_id=(SELECT id FROM second_campaign) AND id=(SELECT id FROM public.email_campaign_recipients WHERE campaign_id=(SELECT id FROM second_campaign) AND NOT is_test ORDER BY id LIMIT 1);
UPDATE public.community SET is_disabled=true WHERE id=(SELECT person_id FROM public.email_campaign_recipients WHERE id='00000000-0000-4000-8000-000000000099');
SET ROLE service_role;
TRUNCATE reserved;
INSERT INTO reserved SELECT public.reserve_email_campaign_batch((SELECT id FROM second_campaign),'00000000-0000-4000-8000-000000000001','pilot');
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT code FROM public.email_campaign_recipients WHERE id='00000000-0000-4000-8000-000000000099')='eligibility_changed','Disabled recipient was not rechecked';
 ASSERT EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=(SELECT id FROM second_campaign) AND code='weekly_frequency_limit'),'Weekly recipient cap ignored';
END $$;
-- All-account snapshots switch the CTA if a profile is claimed before send.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('00000000-0000-4000-8000-000000000077','new-person@example.test',now());
INSERT INTO public.community(id,name,email,user_role) VALUES('30000000-0000-4000-8000-000000000077','New participant','new-person@example.test','Member');
SET ROLE authenticated;
CREATE TEMP TABLE all_campaign AS SELECT (public.admin_email_campaign('create',NULL,'{"audience":"all","subject":"All community","message":"A community update","destination":"home"}') ->> 'id')::uuid AS id;
RESET ROLE;
GRANT SELECT ON all_campaign TO service_role;
UPDATE public.community SET user_id='00000000-0000-4000-8000-000000000077' WHERE id='30000000-0000-4000-8000-000000000077';
UPDATE public.email_campaign_recipients SET id='00000000-0000-4000-8000-000000000077' WHERE campaign_id=(SELECT id FROM all_campaign) AND person_id='30000000-0000-4000-8000-000000000077';
SET ROLE service_role;
TRUNCATE reserved;
INSERT INTO reserved SELECT public.reserve_email_campaign_batch((SELECT id FROM all_campaign),'00000000-0000-4000-8000-000000000001','test');
SELECT public.finish_email_campaign_recipient((rows->0->>'id')::uuid,'accepted','provider-all-test') FROM reserved;
TRUNCATE reserved;
INSERT INTO reserved SELECT public.reserve_email_campaign_batch((SELECT id FROM all_campaign),'00000000-0000-4000-8000-000000000001','pilot');
DO $$ BEGIN
 ASSERT (SELECT (v->>'needs_claim')::boolean FROM reserved,jsonb_array_elements(rows) v WHERE v->>'email'='new-person@example.test')=false,'Already claimed profile received a claim CTA';
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT public.admin_email_campaign('cancel',(SELECT id FROM second_campaign));
RESET ROLE;
DO $$ BEGIN ASSERT NOT EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=(SELECT id FROM second_campaign) AND status='ready'),'Cancelled queue retained ready recipients'; END $$;
-- Only synthetic rows; reach the daily/hourly cap without sending anything.
INSERT INTO public.email_campaign_recipients(campaign_id,email,email_key,needs_claim,reserved_at,status)
 SELECT (SELECT id FROM second_campaign),'limit'||i||'@example.test',md5('limit'||i),false,now(),'failed' FROM generate_series(1,90) i;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.reserve_email_campaign_batch((SELECT id FROM all_campaign),'00000000-0000-4000-8000-000000000001','pilot'); RAISE EXCEPTION 'Throttle bypass allowed'; EXCEPTION WHEN invalid_parameter_value THEN ASSERT SQLERRM LIKE 'Sending limit%','Unexpected failure instead of throttle'; END;
END $$;
RESET ROLE;
