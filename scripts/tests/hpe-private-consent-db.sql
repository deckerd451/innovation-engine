\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.hpe_research_window VALUES (1,now()+interval '24 hours',now()+interval '744 hours',now()+interval '768 hours');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.hpe_participation_consent(consent_version,adult_confirmed,scope) VALUES (1,true,'charleston-sc');
INSERT INTO public.hpe_research_consent(consent_version) VALUES (1);
DO $$ BEGIN
 BEGIN
  INSERT INTO public.hpe_outcome_response(response) VALUES ('yes');
  RAISE EXCEPTION 'early response accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.hpe_participation_consent SET enrolled_at=now()-interval '1 year';
  RAISE EXCEPTION 'timestamp spoof accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.hpe_research_window SET starts_at=now()-interval '721 hours',ends_at=now()-interval '1 hour',response_until=now()+interval '1 day';
UPDATE public.hpe_research_consent SET enrolled_at=now()-interval '722 hours';
SET LOCAL ROLE authenticated;
INSERT INTO public.hpe_outcome_response(response) VALUES ('yes');
UPDATE public.hpe_outcome_response SET response='no';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.hpe_participation_consent) OR EXISTS (SELECT 1 FROM public.hpe_research_consent) OR EXISTS (SELECT 1 FROM public.hpe_outcome_response) THEN RAISE EXCEPTION 'cross-account read'; END IF;
 DELETE FROM public.hpe_participation_consent;
 IF FOUND THEN RAISE EXCEPTION 'cross-account deletion'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM * FROM public.hpe_outcome_response;
  RAISE EXCEPTION 'anonymous read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
DELETE FROM public.hpe_research_consent;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.hpe_outcome_response) OR NOT EXISTS (SELECT 1 FROM public.hpe_participation_consent) THEN RAISE EXCEPTION 'research withdrawal incorrect'; END IF;
END $$;
DELETE FROM public.hpe_participation_consent;
RESET ROLE;
ROLLBACK;
