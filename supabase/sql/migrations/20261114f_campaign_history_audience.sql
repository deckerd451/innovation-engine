-- Fix the PL/pgSQL audience variable/column collision. Preserve drafts and access controls.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_email_campaign(p_action text,p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); result jsonb; v_audience text:=p_payload->>'audience'; cid uuid; skip_ids uuid[]; off integer:=coalesce((p_payload->>'offset')::integer,0);
BEGIN
 IF NOT public.campaign_actor_allowed(actor) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF off<0 OR off>100000 OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 IF p_action IN ('preview','create') THEN
  IF v_audience IS NULL OR v_audience NOT IN ('all','unclaimed','inactive','active') THEN RAISE EXCEPTION 'Invalid audience' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO skip_ids FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_ids','[]'::jsonb));
  IF cardinality(skip_ids)>1000 THEN RAISE EXCEPTION 'Too many exclusions' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_action='preview' THEN
  WITH candidates AS (SELECT a.*,CASE WHEN a.person_id=ANY(skip_ids) THEN 'manually_excluded' ELSE a.reason END AS final_reason FROM public.campaign_audience(v_audience) a)
  SELECT jsonb_build_object('eligible',(SELECT count(*) FROM candidates WHERE final_reason='eligible'),
   'excluded',(SELECT coalesce(jsonb_object_agg(final_reason,n),'{}'::jsonb) FROM (SELECT final_reason,count(*) n FROM candidates WHERE final_reason<>'eligible' GROUP BY final_reason) x),
   'total',(SELECT count(*) FROM candidates),'offset',off,
   'recipients',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT person_id,name,email,needs_claim,final_reason AS reason FROM candidates ORDER BY person_id OFFSET off LIMIT 50) x),'[]'::jsonb)) INTO result;
 ELSIF p_action='create' THEN
  IF coalesce(p_payload->>'subject','') ~ '[[:cntrl:]]' OR length(btrim(coalesce(p_payload->>'subject',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'message',''))) NOT BETWEEN 1 AND 5000 OR coalesce(p_payload->>'destination','') NOT IN ('home','projects','opportunities') THEN RAISE EXCEPTION 'Subject, message and app destination required' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.campaign_audience(v_audience) WHERE reason='eligible' AND NOT person_id=ANY(skip_ids)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Choose 1 to 5000 eligible recipients' USING ERRCODE='22023'; END IF;
  INSERT INTO public.email_campaigns(created_by,audience,subject,message,destination) VALUES(actor,v_audience,btrim(p_payload->>'subject'),btrim(p_payload->>'message'),p_payload->>'destination') RETURNING id INTO cid;
  INSERT INTO public.email_campaign_recipients(campaign_id,person_id,email,email_key,name,needs_claim)
   SELECT cid,person_id,email,md5(email),name,needs_claim FROM public.campaign_audience(v_audience) WHERE reason='eligible' AND NOT person_id=ANY(skip_ids);
  result:=jsonb_build_object('id',cid);
 ELSIF p_action='list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (SELECT c.id,c.audience,c.subject,c.created_at,c.cancelled FROM public.email_campaigns c ORDER BY c.created_at DESC LIMIT 50) x;
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

COMMIT;
