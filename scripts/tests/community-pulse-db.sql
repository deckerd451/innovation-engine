-- Rare skills and hidden-profile skill groups must never become public summaries.
UPDATE public.community SET skills=skills||', Rare private skill' WHERE user_id='00000000-0000-4000-8000-000000000002';
INSERT INTO public.community(id,name,user_role,is_hidden,skills) SELECT ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Hidden participant '||i,'Member',true,'Hidden skill' FROM generate_series(1,5) i;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $$ DECLARE p jsonb; BEGIN
 p:=public.get_community_pulse();
 ASSERT (p->>'active_projects')::int=1,'Private projects exposed';
 ASSERT (p->>'open_opportunities')::int=1,'Private or expired opportunities counted';
 ASSERT (p->>'member_band')::int%5=0,'Exact profile count exposed';
 ASSERT jsonb_array_length(p->'monthly')=6,'Monthly aggregate missing';
 ASSERT p->>'email' IS NULL AND p->>'recent' IS NULL AND p->>'claimed' IS NULL,'Sensitive metrics exposed';
 ASSERT jsonb_array_length(p->'popular_skills')=2,'Common skills unavailable or private skills exposed';
 ASSERT p::text NOT LIKE '%Hidden skill%' AND p::text NOT LIKE '%rare private%','Rare/hidden skill group exposed';
END $$;
RESET ROLE;
UPDATE public.community SET is_hidden=true WHERE id='30000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN ASSERT (public.get_community_pulse()->'connection_band')='null'::jsonb,'Hidden endpoint connections exposed'; END $$;
RESET ROLE;
UPDATE public.community SET is_disabled=true WHERE user_id='00000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.get_community_pulse(); RAISE EXCEPTION 'Disabled member pulse allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
