-- Durable throttling/audit for admin-requested Auth claim emails.
BEGIN;
CREATE TABLE public.admin_claim_email_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 person_id uuid REFERENCES public.community(id) ON DELETE SET NULL,
 requested_by uuid NOT NULL,
 email_key text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','failed')),
 result_code text
);
CREATE INDEX admin_claim_email_recipient_recent ON public.admin_claim_email_requests(email_key,requested_at);
CREATE INDEX admin_claim_email_actor_recent ON public.admin_claim_email_requests(requested_by,requested_at);
CREATE INDEX admin_claim_email_cleanup ON public.admin_claim_email_requests(requested_at);
ALTER TABLE public.admin_claim_email_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_claim_email_requests FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.reserve_admin_claim_emails(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); person record; recipient_email text; key text; request_id uuid; used integer; output jsonb:='[]'::jsonb; pid uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.community WHERE user_id=actor AND user_role='Admin') THEN
  RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';
 END IF;
 IF p_ids IS NULL OR cardinality(p_ids)<1 OR cardinality(p_ids)>20 OR array_position(p_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Choose 1 to 20 people' USING ERRCODE='22023';
 END IF;
 DELETE FROM public.admin_claim_email_requests WHERE requested_at<now()-interval '30 days';
 PERFORM pg_advisory_xact_lock(hashtextextended('claim-admin:'||actor::text,0));
 SELECT count(*) INTO used FROM public.admin_claim_email_requests WHERE requested_by=actor AND requested_at>now()-interval '1 hour';
 FOR pid IN SELECT DISTINCT unnest(p_ids) ORDER BY 1 LOOP
  SELECT id,name,c.email,user_id,is_disabled INTO person FROM public.community c WHERE id=pid;
  IF NOT FOUND THEN output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','not_found')); CONTINUE; END IF;
  IF person.user_id IS NOT NULL THEN output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','already_claimed')); CONTINUE; END IF;
  IF coalesce(person.is_disabled,false) THEN output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','disabled')); CONTINUE; END IF;
  recipient_email:=lower(btrim(person.email));
  IF recipient_email IS NULL OR recipient_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','missing_email')); CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.community c WHERE c.id<>pid AND lower(btrim(c.email))=recipient_email AND c.user_id IS NOT NULL) THEN
   output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','already_claimed')); CONTINUE;
  END IF;
  IF (SELECT count(*) FROM public.community c WHERE lower(btrim(c.email))=recipient_email AND c.user_id IS NULL)>1 THEN
   output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','ambiguous_email')); CONTINUE;
  END IF;
  key:=md5(recipient_email);
  IF NOT pg_try_advisory_xact_lock(hashtextextended('claim-recipient:'||key,0)) THEN
   output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','rate_limited')); CONTINUE;
  END IF;
  IF used>=50 OR EXISTS(SELECT 1 FROM public.admin_claim_email_requests WHERE email_key=key AND requested_at>now()-interval '5 minutes')
   OR (SELECT count(*) FROM public.admin_claim_email_requests WHERE email_key=key AND requested_at>now()-interval '24 hours')>=5 THEN
    output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'status','rate_limited')); CONTINUE;
  END IF;
  INSERT INTO public.admin_claim_email_requests(person_id,requested_by,email_key) VALUES(pid,actor,key) RETURNING id INTO request_id;
  used:=used+1;
  output:=output||jsonb_build_array(jsonb_build_object('person_id',pid,'request_id',request_id,'email',recipient_email,'status','reserved'));
 END LOOP;
 RETURN output;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_admin_claim_emails(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_admin_claim_emails(uuid[]) TO authenticated;
CREATE FUNCTION public.finish_admin_claim_email(p_request_id uuid,p_accepted boolean,p_code text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.admin_claim_email_requests SET status=CASE WHEN p_accepted THEN 'accepted' ELSE 'failed' END,
 result_code=left(p_code,80) WHERE id=p_request_id AND status='pending';
$$;
REVOKE ALL ON FUNCTION public.finish_admin_claim_email(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_admin_claim_email(uuid,boolean,text) TO service_role;
COMMIT;
