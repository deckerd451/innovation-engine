-- Admin-reviewed, bounded email campaigns. Apply manually; no email is sent by SQL.
BEGIN;
CREATE TABLE IF NOT EXISTS public.email_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL,
 audience text NOT NULL CHECK(audience IN ('all','unclaimed','inactive','active')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 160),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 5000),
 destination text NOT NULL CHECK(destination IN ('home','projects','opportunities')),
 created_at timestamptz NOT NULL DEFAULT now(), cancelled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.email_campaigns ON DELETE CASCADE,
 person_id uuid REFERENCES public.community(id) ON DELETE SET NULL,
 email text NOT NULL, email_key text NOT NULL, name text NOT NULL DEFAULT '', needs_claim boolean NOT NULL,
 is_test boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','sending','accepted','delivered','failed','unknown','skipped','bounced','complained')),
 code text, reserved_at timestamptz, provider_id text UNIQUE,
 unsubscribe_token text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 UNIQUE(campaign_id,email_key,is_test)
);
CREATE TABLE IF NOT EXISTS public.email_campaign_suppressions (email_key text PRIMARY KEY, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.email_campaign_events (id text PRIMARY KEY, provider_id text NOT NULL, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS campaign_recipient_queue ON public.email_campaign_recipients(campaign_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipient_unsubscribe ON public.email_campaign_recipients(unsubscribe_token);
CREATE INDEX IF NOT EXISTS campaign_recipient_recent ON public.email_campaign_recipients(email_key,reserved_at);
CREATE INDEX IF NOT EXISTS campaign_events_provider ON public.email_campaign_events(provider_id);
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaigns,public.email_campaign_recipients,public.email_campaign_suppressions,public.email_campaign_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.campaign_actor_allowed(p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p_actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.community WHERE user_id=p_actor AND user_role='Admin' AND is_disabled IS NOT TRUE);
$$;
REVOKE ALL ON FUNCTION public.campaign_actor_allowed(uuid) FROM PUBLIC,anon,authenticated;

-- Only the owner of the definer functions can call the audience helper.
CREATE OR REPLACE FUNCTION public.campaign_audience(p_audience text)
RETURNS TABLE(person_id uuid,name text,email text,needs_claim boolean,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH ranked AS (
  SELECT c.*,lower(btrim(c.email)) AS address,
   row_number() OVER(PARTITION BY lower(btrim(c.email)) ORDER BY (c.user_id IS NOT NULL) DESC,c.id) AS rank,
   count(*) OVER(PARTITION BY lower(btrim(c.email))) AS same_email
  FROM public.community c
 )
 SELECT c.id,left(coalesce(c.name,''),200),c.address,c.user_id IS NULL,
  CASE WHEN c.address IS NULL OR length(c.address)>320 OR c.address!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 'invalid_email'
   WHEN c.is_disabled IS TRUE THEN 'disabled'
   WHEN c.user_role='Admin' THEN 'admin'
   WHEN coalesce(c.name,'') ~* '(^|[^a-z])(test|tester|fixture)([^a-z]|$)' OR c.address ~* '\+(claimtest|test|fixture)' THEN 'test_profile'
   WHEN EXISTS(SELECT 1 FROM public.email_campaign_suppressions s WHERE s.email_key=md5(c.address)) THEN 'suppressed'
   WHEN c.user_id IS NULL AND c.same_email>1 THEN 'ambiguous_claim'
   WHEN c.rank>1 THEN 'duplicate_address'
   ELSE 'eligible' END
 FROM ranked c WHERE p_audience='all' OR (p_audience='unclaimed' AND c.user_id IS NULL)
  OR (p_audience='active' AND c.user_id IS NOT NULL AND c.last_seen_at>=now()-interval '30 days')
  OR (p_audience='inactive' AND c.user_id IS NOT NULL AND (c.last_seen_at IS NULL OR c.last_seen_at<now()-interval '30 days'));
$$;
REVOKE ALL ON FUNCTION public.campaign_audience(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_email_campaign(p_action text,p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); result jsonb; audience text:=p_payload->>'audience'; cid uuid; skip_ids uuid[]; off integer:=coalesce((p_payload->>'offset')::integer,0);
BEGIN
 IF NOT public.campaign_actor_allowed(actor) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF off<0 OR off>100000 OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 IF p_action IN ('preview','create') THEN
  IF audience IS NULL OR audience NOT IN ('all','unclaimed','inactive','active') THEN RAISE EXCEPTION 'Invalid audience' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO skip_ids FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_ids','[]'::jsonb));
  IF cardinality(skip_ids)>1000 THEN RAISE EXCEPTION 'Too many exclusions' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_action='preview' THEN
  WITH candidates AS (SELECT a.*,CASE WHEN a.person_id=ANY(skip_ids) THEN 'manually_excluded' ELSE a.reason END AS final_reason FROM public.campaign_audience(audience) a)
  SELECT jsonb_build_object('eligible',(SELECT count(*) FROM candidates WHERE final_reason='eligible'),
   'excluded',(SELECT coalesce(jsonb_object_agg(final_reason,n),'{}'::jsonb) FROM (SELECT final_reason,count(*) n FROM candidates WHERE final_reason<>'eligible' GROUP BY final_reason) x),
   'total',(SELECT count(*) FROM candidates),'offset',off,
   'recipients',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT person_id,name,email,needs_claim,final_reason AS reason FROM candidates ORDER BY person_id OFFSET off LIMIT 50) x),'[]'::jsonb)) INTO result;
 ELSIF p_action='create' THEN
  IF coalesce(p_payload->>'subject','') ~ '[[:cntrl:]]' OR length(btrim(coalesce(p_payload->>'subject',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'message',''))) NOT BETWEEN 1 AND 5000 OR coalesce(p_payload->>'destination','') NOT IN ('home','projects','opportunities') THEN RAISE EXCEPTION 'Subject, message and app destination required' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.campaign_audience(audience) WHERE reason='eligible' AND NOT person_id=ANY(skip_ids)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Choose 1 to 5000 eligible recipients' USING ERRCODE='22023'; END IF;
  INSERT INTO public.email_campaigns(created_by,audience,subject,message,destination) VALUES(actor,audience,btrim(p_payload->>'subject'),btrim(p_payload->>'message'),p_payload->>'destination') RETURNING id INTO cid;
  INSERT INTO public.email_campaign_recipients(campaign_id,person_id,email,email_key,name,needs_claim)
   SELECT cid,person_id,email,md5(email),name,needs_claim FROM public.campaign_audience(audience) WHERE reason='eligible' AND NOT person_id=ANY(skip_ids);
  result:=jsonb_build_object('id',cid);
 ELSIF p_action='list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT id,audience,subject,created_at,cancelled FROM public.email_campaigns ORDER BY created_at DESC LIMIT 50) x;
 ELSIF p_action IN ('report','cancel') THEN
  IF NOT EXISTS(SELECT 1 FROM public.email_campaigns WHERE id=p_id) THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE='22023'; END IF;
  IF p_action='cancel' THEN
   UPDATE public.email_campaigns SET cancelled=true WHERE id=p_id AND created_by=actor;
   IF NOT FOUND THEN RAISE EXCEPTION 'Only the creator can cancel' USING ERRCODE='42501'; END IF;
   UPDATE public.email_campaign_recipients SET status='skipped',code='cancelled' WHERE campaign_id=p_id AND status='ready';
  END IF;
  -- A lost response is never silently retried. Provider may already have accepted.
  UPDATE public.email_campaign_recipients SET status='unknown',code='interrupted' WHERE campaign_id=p_id AND status='sending' AND reserved_at<now()-interval '10 minutes';
  SELECT jsonb_build_object('campaign',to_jsonb(c),'can_send',c.created_by=actor AND NOT c.cancelled,'test_attempted',EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND is_test),'report_total',(SELECT count(*) FROM public.email_campaign_recipients WHERE campaign_id=p_id),'counts',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.email_campaign_recipients WHERE campaign_id=p_id AND NOT is_test GROUP BY status) x),'{}'::jsonb),
   'test_accepted',EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND is_test AND status IN ('accepted','delivered')),
   'pilot_started',EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND NOT is_test AND reserved_at IS NOT NULL),
   'total',(SELECT count(*) FROM public.email_campaign_recipients WHERE campaign_id=p_id AND NOT is_test),
   'recipients',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT person_id,name,email,status,code,is_test FROM public.email_campaign_recipients WHERE campaign_id=p_id ORDER BY is_test DESC,id OFFSET off LIMIT 50) x),'[]'::jsonb)) INTO result FROM public.email_campaigns c WHERE c.id=p_id;
 ELSE RAISE EXCEPTION 'Unknown campaign action' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_email_campaign(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_email_campaign(text,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_email_campaign_batch(p_id uuid,p_actor uuid,p_mode text,p_reviewed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE campaign public.email_campaigns; r record; output jsonb:='[]'::jsonb; address text; used integer; daily_used integer; test_id uuid; current_reason text; current_claim boolean;
BEGIN
 IF NOT public.campaign_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 SELECT * INTO campaign FROM public.email_campaigns WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR campaign.created_by<>p_actor OR campaign.cancelled THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 IF p_mode NOT IN ('test','pilot','batch') OR p_mode IS NULL THEN RAISE EXCEPTION 'Invalid send mode' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email-campaign-sending',0));
 SELECT count(*) INTO used FROM public.email_campaign_recipients WHERE reserved_at>now()-interval '1 hour';
 SELECT count(*) INTO daily_used FROM public.email_campaign_recipients WHERE reserved_at>now()-interval '24 hours';
 IF used>=50 OR daily_used>=90 THEN RAISE EXCEPTION 'Sending limit reached (50/hour, 90/day); try later' USING ERRCODE='22023'; END IF;
 IF p_mode='test' THEN
  IF EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND is_test) THEN RAISE EXCEPTION 'Test already attempted; inspect the report or create a new draft' USING ERRCODE='22023'; END IF;
  SELECT lower(btrim(email)) INTO address FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
  IF address IS NULL THEN RAISE EXCEPTION 'A verified admin email is required for a test' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.email_campaign_suppressions WHERE email_key=md5(address)) THEN RAISE EXCEPTION 'Test recipient is suppressed' USING ERRCODE='22023'; END IF;
  INSERT INTO public.email_campaign_recipients(campaign_id,email,email_key,name,needs_claim,is_test) VALUES(p_id,address,md5(address),'Admin preview',false,true) RETURNING id INTO test_id;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND is_test AND status IN ('accepted','delivered')) THEN RAISE EXCEPTION 'Send a successful test first' USING ERRCODE='22023'; END IF;
  IF p_mode='pilot' AND EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND NOT is_test AND reserved_at IS NOT NULL) THEN RAISE EXCEPTION 'Pilot already attempted; review the report' USING ERRCODE='22023'; END IF;
  IF p_mode='batch' AND (p_reviewed IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND NOT is_test AND status IN ('accepted','delivered'))) THEN RAISE EXCEPTION 'Review the pilot before sending remaining recipients' USING ERRCODE='22023'; END IF;
 END IF;
 FOR r IN SELECT * FROM public.email_campaign_recipients WHERE campaign_id=p_id AND status='ready' AND is_test=(p_mode='test') ORDER BY id LIMIT least(5,50-used,90-daily_used) FOR UPDATE LOOP
  IF EXISTS(SELECT 1 FROM public.email_campaign_suppressions WHERE email_key=r.email_key) THEN
   UPDATE public.email_campaign_recipients SET status='skipped',code='suppressed' WHERE id=r.id; CONTINUE;
  END IF;
  current_claim:=r.needs_claim;
  IF NOT r.is_test THEN
   SELECT reason,needs_claim INTO current_reason,current_claim FROM public.campaign_audience(campaign.audience) WHERE person_id=r.person_id AND email=r.email;
   IF current_reason IS DISTINCT FROM 'eligible' THEN UPDATE public.email_campaign_recipients SET status='skipped',code='eligibility_changed' WHERE id=r.id; CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE id<>r.id AND email_key=r.email_key AND reserved_at>now()-interval '7 days' AND NOT is_test) THEN UPDATE public.email_campaign_recipients SET status='skipped',code='weekly_frequency_limit' WHERE id=r.id; CONTINUE; END IF;
  END IF;
  UPDATE public.email_campaign_recipients SET status='sending',reserved_at=now(),code=NULL,needs_claim=current_claim WHERE id=r.id;
  output:=output||jsonb_build_array(jsonb_build_object('id',r.id,'email',r.email,'name',r.name,'needs_claim',current_claim,'is_test',r.is_test,'unsubscribe_token',r.unsubscribe_token,'subject',campaign.subject,'message',campaign.message,'destination',campaign.destination));
 END LOOP;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.reserve_email_campaign_batch(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_email_campaign_batch(uuid,uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_email_campaign_recipient(p_id uuid,p_status text,p_provider_id text DEFAULT NULL,p_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE recipient public.email_campaign_recipients; event text;
BEGIN
 IF p_status NOT IN ('accepted','failed','unknown') THEN RAISE EXCEPTION 'Invalid result' USING ERRCODE='22023'; END IF;
 IF p_provider_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('campaign-provider:'||p_provider_id,0)); END IF;
 SELECT * INTO recipient FROM public.email_campaign_recipients WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR recipient.status NOT IN ('sending','unknown') THEN RETURN; END IF;
 SELECT event_type INTO event FROM public.email_campaign_events WHERE provider_id=p_provider_id ORDER BY CASE event_type WHEN 'email.complained' THEN 3 WHEN 'email.bounced' THEN 2 ELSE 1 END DESC LIMIT 1;
 UPDATE public.email_campaign_recipients SET provider_id=p_provider_id,code=left(coalesce(event,p_code),80),status=CASE event WHEN 'email.complained' THEN 'complained' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.delivered' THEN 'delivered' ELSE p_status END WHERE id=p_id;
 IF event IN ('email.complained','email.bounced') THEN INSERT INTO public.email_campaign_suppressions(email_key,reason) VALUES(recipient.email_key,event) ON CONFLICT DO NOTHING; END IF;
END $$;
REVOKE ALL ON FUNCTION public.finish_email_campaign_recipient(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_email_campaign_recipient(uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_campaign_event(p_id text,p_provider_id text,p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE recipient public.email_campaign_recipients;
BEGIN
 IF p_type NOT IN ('email.delivered','email.bounced','email.complained') OR length(p_id)>200 OR length(p_provider_id)>200 THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('campaign-provider:'||p_provider_id,0));
 INSERT INTO public.email_campaign_events(id,provider_id,event_type) VALUES(p_id,p_provider_id,p_type) ON CONFLICT DO NOTHING;
 SELECT * INTO recipient FROM public.email_campaign_recipients WHERE provider_id=p_provider_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.email_campaign_recipients SET code=CASE WHEN p_type='email.complained' THEN p_type WHEN p_type='email.bounced' AND status<>'complained' THEN p_type WHEN p_type='email.delivered' AND status NOT IN ('bounced','complained') THEN p_type ELSE code END,status=CASE WHEN p_type='email.complained' THEN 'complained' WHEN p_type='email.bounced' AND status<>'complained' THEN 'bounced' WHEN p_type='email.delivered' AND status NOT IN ('bounced','complained') THEN 'delivered' ELSE status END WHERE id=recipient.id;
 IF p_type IN ('email.bounced','email.complained') THEN INSERT INTO public.email_campaign_suppressions(email_key,reason) VALUES(recipient.email_key,p_type) ON CONFLICT DO NOTHING; END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_email_campaign_event(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_campaign_event(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.unsubscribe_campaign_email(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_token IS NULL OR p_token!~'^[0-9a-f]{64}$' THEN RETURN; END IF;
 INSERT INTO public.email_campaign_suppressions(email_key,reason) SELECT email_key,'unsubscribed' FROM public.email_campaign_recipients WHERE unsubscribe_token=p_token ON CONFLICT DO NOTHING;
 UPDATE public.email_campaign_recipients SET status='skipped',code='unsubscribed' WHERE status='ready' AND email_key IN (SELECT email_key FROM public.email_campaign_recipients WHERE unsubscribe_token=p_token);
END $$;
REVOKE ALL ON FUNCTION public.unsubscribe_campaign_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_campaign_email(text) TO anon,authenticated,service_role;
COMMIT;
