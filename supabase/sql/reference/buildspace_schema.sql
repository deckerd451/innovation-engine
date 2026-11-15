--
-- PostgreSQL database dump
--

\restrict OyLuDn8IdztqONFHxPt5LOtYXcUtwfciMYgiWiXKyLpgIPfTcO3b0kz2vCh7hvG

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.7 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: auto-generate UUID; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."auto-generate UUID" AS ENUM (
    'uuid_generate_v4()'
);


--
-- Name: TYPE "auto-generate UUID"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public."auto-generate UUID" IS 'Let Supabase auto-generate UUIDs';


--
-- Name: availability_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.availability_status AS ENUM (
    'available',
    'busy',
    'away',
    'offline'
);


--
-- Name: _my_active_nearify_event_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._my_active_nearify_event_ids() RETURNS TABLE(nearify_event_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT nep.nearify_event_id
  FROM public.nearify_event_presence nep
  JOIN public.community c ON c.id = nep.community_id
  WHERE c.user_id = auth.uid() AND nep.status = 'joined' AND nep.is_live = true;
$$;


--
-- Name: add_creator_as_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_creator_as_member() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'creator');
  RETURN NEW;
END;
$$;


--
-- Name: admin_email_campaign(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_email_campaign(p_action text, p_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: admin_find_members_by_email(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_find_members_by_email(p_query text, p_exact boolean DEFAULT false) RETURNS TABLE(id uuid, name text, email text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_query text := lower(trim(coalesce(p_query, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community a
                 WHERE a.user_id = auth.uid() AND a.user_role = 'Admin' AND a.is_disabled IS NOT TRUE) THEN
    RAISE EXCEPTION 'not_authorized: admin required' USING ERRCODE = '42501';
  END IF;
  IF v_query = '' THEN
    RETURN;
  END IF;
  IF p_exact THEN
    RETURN QUERY
      SELECT c.id, c.name, c.email FROM community c
      WHERE lower(trim(c.email)) = v_query
      ORDER BY c.created_at
      LIMIT 200;
  ELSE
    -- "%" and "_" in the search match only themselves.
    RETURN QUERY
      SELECT c.id, c.name, c.email FROM community c
      WHERE c.email ILIKE '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      ORDER BY c.name
      LIMIT 200;
  END IF;
END;
$$;


--
-- Name: admin_member_emails(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_member_emails(p_ids uuid[]) RETURNS TABLE(id uuid, email text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community a
                 WHERE a.user_id = auth.uid() AND a.user_role = 'Admin' AND a.is_disabled IS NOT TRUE) THEN
    RAISE EXCEPTION 'not_authorized: admin required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_ids), 0) > 1000 THEN
    RAISE EXCEPTION 'at most 1000 profiles at a time' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT c.id, c.email FROM community c WHERE c.id = ANY (p_ids);
END;
$$;


--
-- Name: admin_search_people(text, text, boolean, boolean, boolean, text, boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_search_people(p_search text DEFAULT ''::text, p_role text DEFAULT NULL::text, p_hidden boolean DEFAULT NULL::boolean, p_disabled boolean DEFAULT NULL::boolean, p_claimed boolean DEFAULT NULL::boolean, p_sort text DEFAULT 'created_at'::text, p_ascending boolean DEFAULT false, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_query text := lower(trim(coalesce(p_search, '')));
  v_pattern text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community a
                 WHERE a.user_id = auth.uid() AND a.user_role = 'Admin' AND a.is_disabled IS NOT TRUE) THEN
    RAISE EXCEPTION 'not_authorized: admin required' USING ERRCODE = '42501';
  END IF;
  IF p_sort NOT IN ('name', 'email', 'user_role', 'created_at', 'updated_at', 'last_login') THEN
    RAISE EXCEPTION 'unsupported sort %', p_sort USING ERRCODE = '22023';
  END IF;
  -- "%" and "_" in the search match only themselves.
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
    WITH matches AS (
      SELECT c.id, c.name, c.email, c.user_role, c.created_at, c.updated_at, c.last_login
      FROM community c
      WHERE (v_query = '' OR c.name ILIKE v_pattern OR c.email ILIKE v_pattern)
        AND (p_role IS NULL OR c.user_role = p_role)
        AND (p_hidden IS NULL OR c.is_hidden = p_hidden)
        AND (p_disabled IS NULL OR c.is_disabled = p_disabled)
        AND (p_claimed IS NULL OR (c.user_id IS NOT NULL) = p_claimed)
    )
    SELECT m.id, count(*) OVER () AS total_count
    FROM matches m
    ORDER BY
      CASE WHEN p_ascending THEN CASE p_sort WHEN 'name' THEN m.name WHEN 'email' THEN m.email WHEN 'user_role' THEN m.user_role END END ASC,
      CASE WHEN NOT p_ascending THEN CASE p_sort WHEN 'name' THEN m.name WHEN 'email' THEN m.email WHEN 'user_role' THEN m.user_role END END DESC,
      CASE WHEN p_ascending THEN CASE p_sort WHEN 'created_at' THEN m.created_at WHEN 'updated_at' THEN m.updated_at WHEN 'last_login' THEN m.last_login END END ASC,
      CASE WHEN NOT p_ascending THEN CASE p_sort WHEN 'created_at' THEN m.created_at WHEN 'updated_at' THEN m.updated_at WHEN 'last_login' THEN m.last_login END END DESC,
      m.id
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$$;


--
-- Name: authz_current_member_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authz_current_member_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT c.id FROM community c WHERE c.user_id = auth.uid() LIMIT 1
$$;


--
-- Name: authz_org_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authz_org_role(p_organization_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT m.role FROM organization_members m
  WHERE m.organization_id = p_organization_id
    AND m.community_id = public.authz_current_member_id()
    AND m.status = 'active'
  ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC
  LIMIT 1
$$;


--
-- Name: auto_assign_general_theme(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_assign_general_theme() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  general_theme_id UUID;
BEGIN
  -- Only assign if theme_id is NULL
  IF NEW.theme_id IS NULL THEN
    -- Get the General theme ID
    SELECT id INTO general_theme_id
    FROM theme_circles
    WHERE title = 'General Projects'
    LIMIT 1;
    
    -- Assign it
    IF general_theme_id IS NOT NULL THEN
      NEW.theme_id := general_theme_id;
      RAISE NOTICE '🎯 Auto-assigned project "%" to General theme', NEW.title;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: award_xp(integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_xp(amount integer, action_type text, details jsonb DEFAULT NULL::jsonb) RETURNS TABLE(new_xp integer, new_level integer, did_level_up boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_xp INTEGER;
  current_level INTEGER;
  new_xp_value INTEGER;
  new_level_value INTEGER;
  community_id_val UUID;
  did_level_up_val BOOLEAN := FALSE;
BEGIN
  SELECT id, xp, level INTO community_id_val, current_xp, current_level
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF community_id_val IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  new_xp_value := current_xp + amount;

  CASE
    WHEN new_xp_value >= 50000 THEN new_level_value := 10;
    WHEN new_xp_value >= 25000 THEN new_level_value := 9;
    WHEN new_xp_value >= 10000 THEN new_level_value := 8;
    WHEN new_xp_value >= 5000 THEN new_level_value := 7;
    WHEN new_xp_value >= 2000 THEN new_level_value := 6;
    WHEN new_xp_value >= 1000 THEN new_level_value := 5;
    WHEN new_xp_value >= 500 THEN new_level_value := 4;
    WHEN new_xp_value >= 250 THEN new_level_value := 3;
    WHEN new_xp_value >= 100 THEN new_level_value := 2;
    ELSE new_level_value := 1;
  END CASE;

  IF new_level_value > current_level THEN
    did_level_up_val := TRUE;
  END IF;

  UPDATE public.community
  SET xp = new_xp_value, level = new_level_value, updated_at = NOW()
  WHERE id = community_id_val;

  INSERT INTO public.activity_log (auth_user_id, community_user_id, action_type, details)
  VALUES (auth.uid(), community_id_val, action_type, details);

  RETURN QUERY SELECT new_xp_value, new_level_value, did_level_up_val;
END;
$$;


--
-- Name: award_xp_for_endorsement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_xp_for_endorsement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.community
  SET xp = xp + 5, endorsements_given = endorsements_given + 1
  WHERE id = NEW.endorser_community_id;

  UPDATE public.community
  SET xp = xp + 10, endorsements_received = endorsements_received + 1
  WHERE id = NEW.endorsed_community_id;

  RETURN NEW;
END;
$$;


--
-- Name: begin_community_intent(uuid, text, text, text, text, text, uuid, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_community_intent(p_client_operation_id uuid, p_intent_type text, p_subject_key text, p_subject_label text, p_statement text, p_subject_type text DEFAULT 'community_profile'::text, p_subject_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_visibility text DEFAULT 'public'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_author UUID;
  v_subject UUID;
  v_existing UUID;
  v_episode UUID;
  v_intent UUID;
  v_previous community_intent_statements%ROWTYPE;
  v_key TEXT := lower(trim(p_subject_key));
BEGIN
  SELECT id INTO v_author FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_author IS NULL THEN RAISE EXCEPTION 'No linked community profile'; END IF;
  IF p_intent_type NOT IN ('seeking', 'offering') THEN RAISE EXCEPTION 'Invalid intent type'; END IF;
  IF p_subject_type NOT IN ('community_profile', 'project', 'organization', 'opportunity', 'theme') THEN RAISE EXCEPTION 'Invalid subject type'; END IF;
  v_subject := COALESCE(p_subject_id, CASE WHEN p_subject_type = 'community_profile' THEN v_author ELSE NULL END);
  IF v_subject IS NULL THEN RAISE EXCEPTION 'Subject ID is required'; END IF;
  IF p_subject_type = 'community_profile' AND v_subject <> v_author THEN RAISE EXCEPTION 'Profile intent must belong to its author'; END IF;
  IF p_subject_type = 'project' AND NOT EXISTS (SELECT 1 FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id WHERE p.id = v_subject AND (p.creator_id = v_author OR pm.user_id = v_author)) THEN RAISE EXCEPTION 'Author is not involved with project subject'; END IF;
  IF p_subject_type = 'organization' AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = v_subject AND om.community_id = v_author AND om.status = 'active') THEN RAISE EXCEPTION 'Author is not involved with organization subject'; END IF;
  IF p_subject_type = 'opportunity' AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.id = v_subject AND o.posted_by = v_author) THEN RAISE EXCEPTION 'Author does not own opportunity subject'; END IF;
  IF p_subject_type = 'theme' AND NOT EXISTS (SELECT 1 FROM theme_participants tp WHERE tp.theme_id = v_subject AND tp.community_id = v_author) THEN RAISE EXCEPTION 'Author is not involved with theme subject'; END IF;

  SELECT id INTO v_existing FROM community_intent_statements
  WHERE author_community_id = v_author AND client_operation_id = p_client_operation_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_previous FROM community_intent_statements
  WHERE author_community_id = v_author AND subject_type = p_subject_type AND subject_id = v_subject
    AND intent_type = p_intent_type AND active = true
  FOR UPDATE;
  IF FOUND AND v_previous.subject_key <> v_key THEN
    UPDATE community_intent_statements
    SET active = false, ended_at = now(), updated_at = now()
    WHERE id = v_previous.id;
    INSERT INTO community_intelligence_events (
      author_community_id, subject_type, subject_id, episode_id,
      object_type, object_id, event_type, occurred_at, visibility, provenance, source
    ) VALUES (
      v_author, v_previous.subject_type, v_previous.subject_id, v_previous.episode_id,
      'intent', v_previous.episode_id,
      CASE WHEN v_previous.intent_type = 'seeking' THEN 'seeking_ended' ELSE 'offering_ended' END,
      now(), v_previous.visibility, 'authored', 'community_intent'
    );
  END IF;

  SELECT id INTO v_existing FROM community_intent_statements
  WHERE author_community_id = v_author AND subject_type = p_subject_type AND subject_id = v_subject
    AND intent_type = p_intent_type AND subject_key = v_key AND active = true;
  IF v_existing IS NOT NULL THEN
    -- Same semantic episode: wording correction/reconfirmation, not a new start.
    UPDATE community_intent_statements
    SET subject_label = p_subject_label, statement = p_statement,
        last_confirmed_at = now(), updated_at = now(), expires_at = p_expires_at,
        visibility = p_visibility
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  v_episode := gen_random_uuid();
  INSERT INTO community_intent_statements (
    author_community_id, subject_type, subject_id, episode_id, client_operation_id,
    intent_type, subject_key, subject_label, statement, starts_at, expires_at,
    active, visibility, provenance, source
  ) VALUES (
    v_author, p_subject_type, v_subject, v_episode, p_client_operation_id,
    p_intent_type, v_key, p_subject_label, p_statement, now(),
    p_expires_at, true, p_visibility, 'authored', 'community_intent'
  ) RETURNING id, episode_id INTO v_intent, v_episode;

  INSERT INTO community_intelligence_events (
    author_community_id, subject_type, subject_id, episode_id, client_operation_id,
    object_type, object_id, event_type, occurred_at, visibility, provenance, source
  ) VALUES (
    v_author, p_subject_type, v_subject, v_episode, p_client_operation_id,
    'intent', v_episode, CASE WHEN p_intent_type = 'seeking' THEN 'seeking_started' ELSE 'offering_started' END,
    now(), p_visibility, 'authored', 'community_intent'
  );
  RETURN v_intent;
END;
$$;


--
-- Name: bump_conversation_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_conversation_last_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update public.conversations
  set
    last_message_at = now(),
    last_message_preview = left(new.content, 120),
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;


--
-- Name: calculate_level(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_level(xp integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- Level formula: Level = floor(sqrt(XP / 100)) + 1
  -- Level 1: 0-99 XP
  -- Level 2: 100-399 XP
  -- Level 3: 400-899 XP
  -- Level 4: 900-1599 XP
  -- Level 5: 1600-2499 XP
  -- Level 6: 2500+ XP
  RETURN FLOOR(SQRT(xp / 100.0)) + 1;
END;
$$;


--
-- Name: calculate_streak(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_streak(user_id_param uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  streak_count INTEGER := 0;
  last_date DATE;
  check_date DATE;
BEGIN
  -- Get the most recent activity date
  SELECT last_activity_date INTO last_date
  FROM community
  WHERE id = user_id_param;

  IF last_date IS NULL THEN
    RETURN 0;
  END IF;

  -- If last activity was today or yesterday, start counting
  IF last_date >= CURRENT_DATE - INTERVAL '1 day' THEN
    check_date := last_date;
    
    -- Count consecutive days backwards
    LOOP
      -- Check if there's activity on check_date
      -- This is a simplified version - you may want to check actual activity logs
      IF check_date < last_date - INTERVAL '365 days' THEN
        EXIT;
      END IF;
      
      streak_count := streak_count + 1;
      check_date := check_date - INTERVAL '1 day';
      
      -- For now, we'll just use the current_streak value from the table
      -- In a full implementation, you'd check an activity log table
      EXIT;
    END LOOP;
    
    -- Return the stored streak value
    SELECT current_streak INTO streak_count
    FROM community
    WHERE id = user_id_param;
    
    RETURN COALESCE(streak_count, 0);
  ELSE
    -- Streak is broken
    RETURN 0;
  END IF;
END;
$$;


--
-- Name: campaign_actor_allowed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_actor_allowed(p_actor uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT p_actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.community WHERE user_id=p_actor AND user_role='Admin' AND is_disabled IS NOT TRUE);
$$;


--
-- Name: campaign_audience(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_audience(p_audience text) RETURNS TABLE(person_id uuid, name text, email text, needs_claim boolean, reason text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
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
$_$;


--
-- Name: check_profile_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_profile_completion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Profile is complete if has name, email, and at least one skill
  IF NEW.name IS NOT NULL AND 
     NEW.name != '' AND
     NEW.email IS NOT NULL THEN
    
    -- Check skills based on data type
    IF NEW.skills IS NOT NULL THEN
      -- Try as JSONB
      BEGIN
        IF jsonb_array_length(NEW.skills::jsonb) > 0 THEN
          NEW.profile_completed = true;
          RETURN NEW;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Not JSONB, try as text array
        BEGIN
          IF array_length(NEW.skills::text[], 1) > 0 THEN
            NEW.profile_completed = true;
            RETURN NEW;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Try as plain text
          IF length(trim(NEW.skills::text)) > 0 AND NEW.skills::text != '{}' AND NEW.skills::text != '[]' THEN
            NEW.profile_completed = true;
            RETURN NEW;
          END IF;
        END;
      END;
    END IF;
  END IF;
  
  NEW.profile_completed = false;
  RETURN NEW;
END;
$$;


--
-- Name: claim_community_profile_by_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_community_profile_by_email() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Already linked: that's the member's profile.
  SELECT id INTO v_id FROM community WHERE user_id = v_uid ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  -- Pick one unclaimed profile with this email and link it in the same
  -- statement; others with the same email are left exactly as they are.
  -- A profile locked by another statement is waited for, not skipped; one
  -- linked in the meantime no longer matches user_id IS NULL. Only a profile
  -- now linked to this account is returned.
  FOR attempt IN 1..3 LOOP
    v_id := NULL;
    UPDATE community c
    SET user_id = v_uid, updated_at = now()
    WHERE c.id = (
        SELECT u.id FROM community u
        WHERE u.user_id IS NULL AND lower(trim(u.email)) = v_email
        ORDER BY coalesce(u.profile_completed, false) DESC,
                 coalesce(u.onboarding_completed, false) DESC,
                 u.created_at ASC NULLS LAST
        LIMIT 1
        FOR UPDATE
      )
      AND c.user_id IS NULL
    RETURNING c.id, c.user_id INTO v_id, v_owner;
    IF v_id IS NOT NULL AND v_owner = v_uid THEN
      RETURN v_id;
    END IF;

    -- Another sign-in of this same account may have linked one meanwhile.
    SELECT id INTO v_id FROM community WHERE user_id = v_uid ORDER BY created_at LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    -- Nothing left to claim (another account linked the last one).
    IF NOT EXISTS (SELECT 1 FROM community WHERE user_id IS NULL AND lower(trim(email)) = v_email) THEN
      RETURN NULL;
    END IF;
  END LOOP;

  -- Unclaimed profiles with this email remain but couldn't be linked just
  -- now: fail (sign-in retries) rather than report that there are none,
  -- which would create a new, empty profile.
  RAISE EXCEPTION 'Profile claim busy; try again' USING ERRCODE = '55P03';
END;
$$;


--
-- Name: clean_old_daily_suggestions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_old_daily_suggestions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM daily_suggestions
  WHERE date < CURRENT_DATE - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_expired_presence_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_presence_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM presence_sessions
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_dismissals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_dismissals() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete dismissals older than 30 days
  DELETE FROM discovery_dismissals
  WHERE dismissed_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_suggestions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_suggestions() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM daily_suggestions
  WHERE date < CURRENT_DATE - INTERVAL '30 days';
END;
$$;


--
-- Name: complete_onboarding(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_onboarding(auth_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_caller uuid := auth.uid();
  user_community_id uuid;
begin
  if v_caller is null then
    return json_build_object('error', 'Not signed in', 'success', false);
  end if;
  if auth_user_id is not null and auth_user_id <> v_caller then
    return json_build_object('error', 'Not allowed', 'success', false);
  end if;

  select id into user_community_id
  from public.community
  where user_id = v_caller
  limit 1;

  if user_community_id is null then
    return json_build_object('error', 'Profile not found', 'success', false);
  end if;

  update public.community
  set onboarding_completed = true,
      onboarding_completed_at = now(),
      onboarding_step = 100
  where id = user_community_id;

  return json_build_object('success', true, 'message', 'Onboarding completed');
end;
$$;


--
-- Name: confirm_community_intent(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_community_intent(p_intent_id uuid, p_confirmation_operation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_author UUID; v_updated INTEGER;
BEGIN
  SELECT id INTO v_author FROM community WHERE user_id = auth.uid() LIMIT 1;
  UPDATE community_intent_statements
  SET last_confirmed_at = now(), updated_at = now()
  WHERE id = p_intent_id AND author_community_id = v_author AND active = true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;


--
-- Name: confirm_theme_participation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_theme_participation(p_theme_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_status TEXT;
  v_theme_expires_at TIMESTAMPTZ;
  v_confirmed_at TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT status, expires_at
    INTO v_status, v_theme_expires_at
  FROM theme_circles
  WHERE id = p_theme_id;

  IF v_status IS DISTINCT FROM 'active'
     OR (v_theme_expires_at IS NOT NULL AND v_theme_expires_at <= v_confirmed_at) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Theme is no longer current');
  END IF;

  v_expires_at := v_confirmed_at + interval '30 days';
  IF v_theme_expires_at IS NOT NULL AND v_theme_expires_at < v_expires_at THEN
    v_expires_at := v_theme_expires_at;
  END IF;

  INSERT INTO theme_participants (
    theme_id,
    community_id,
    engagement_level,
    participation_confirmed_at,
    participation_expires_at
  )
  VALUES (
    p_theme_id,
    v_community_id,
    'participating',
    v_confirmed_at,
    v_expires_at
  )
  ON CONFLICT (theme_id, community_id)
  DO UPDATE SET
    engagement_level = 'participating',
    participation_confirmed_at = EXCLUDED.participation_confirmed_at,
    participation_expires_at = EXCLUDED.participation_expires_at;

  RETURN jsonb_build_object(
    'success', true,
    'engagement_level', 'participating',
    'participation_confirmed_at', v_confirmed_at,
    'participation_expires_at', v_expires_at
  );
END;
$$;


--
-- Name: correct_community_intelligence_event(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_community_intelligence_event(p_event_id uuid, p_client_operation_id uuid, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_author UUID; v_event community_intelligence_events%ROWTYPE; v_correction UUID;
BEGIN
  SELECT id INTO v_author FROM community WHERE user_id = auth.uid() LIMIT 1;
  SELECT * INTO v_event FROM community_intelligence_events
  WHERE id = p_event_id AND author_community_id = v_author;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO community_intelligence_events (
    author_community_id, subject_type, subject_id, episode_id, client_operation_id,
    object_type, object_id, event_type, occurred_at, visibility, provenance, source,
    metadata, correction_of_event_id
  ) VALUES (
    v_author, v_event.subject_type, v_event.subject_id, v_event.episode_id, p_client_operation_id,
    v_event.object_type, v_event.object_id, 'event_corrected', now(), v_event.visibility, 'authored', 'community_correction',
    jsonb_build_object('reason', p_reason), p_event_id
  ) ON CONFLICT (author_community_id, client_operation_id) DO NOTHING
  RETURNING id INTO v_correction;
  IF v_correction IS NOT NULL AND v_event.object_type = 'intent'
     AND v_event.event_type IN ('seeking_started', 'offering_started') THEN
    UPDATE community_intent_statements
    SET active = false, ended_at = COALESCE(ended_at, now()),
        voided_at = now(), voided_by_event_id = v_correction, updated_at = now()
    WHERE episode_id = v_event.episode_id AND active = true;
  END IF;
  RETURN true;
END;
$$;


--
-- Name: create_notification(uuid, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text DEFAULT NULL::text, p_link text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;


--
-- Name: create_project_channel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_channel() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO bbs_channels (name, type, project_id, description)
  VALUES (
    'project-' || NEW.id::text,
    'project',
    NEW.id,
    'Discussion channel for ' || NEW.title
  );
  RETURN NEW;
END;
$$;


--
-- Name: current_community_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_community_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select c.id
  from public.community c
  where c.user_id = auth.uid()
  limit 1
$$;


--
-- Name: deactivate_organization(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deactivate_organization(org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND community_id    = v_community_id
      AND role            = 'owner'
      AND status          = 'active'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only the owner can remove this organization';
  END IF;

  UPDATE organizations
  SET status = 'inactive', updated_at = NOW()
  WHERE id = org_id;
END;
$$;


--
-- Name: decay_theme_circles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decay_theme_circles() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Mark expired themes as dissipated (if no significant activity)
  UPDATE theme_circles
  SET status = 'dissipated'
  WHERE status = 'active'
    AND expires_at < NOW()
    AND activity_score < 10;

  -- Archive expired themes with some activity
  UPDATE theme_circles
  SET status = 'archived'
  WHERE status = 'active'
    AND expires_at < NOW()
    AND activity_score >= 10;
END;
$$;


--
-- Name: decrement_upvotes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_upvotes(idea_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE ideas SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = idea_uuid;
END;
$$;


--
-- Name: dismiss_discovery_node(uuid, uuid, text, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_discovery_node(p_user_id uuid, p_node_id uuid, p_node_type text, p_relevance_score numeric DEFAULT NULL::numeric, p_presence_energy numeric DEFAULT NULL::numeric, p_dismissal_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  dismissal_id UUID;
  cooldown_hours INTEGER := 24;
BEGIN
  -- Insert or update dismissal
  INSERT INTO discovery_dismissals (
    user_id,
    node_id,
    node_type,
    dismissed_at,
    reintroduce_after,
    dismissal_reason,
    relevance_score_at_dismissal,
    presence_energy_at_dismissal
  ) VALUES (
    p_user_id,
    p_node_id,
    p_node_type,
    NOW(),
    NOW() + (cooldown_hours || ' hours')::INTERVAL,
    p_dismissal_reason,
    p_relevance_score,
    p_presence_energy
  )
  ON CONFLICT (user_id, node_id) 
  DO UPDATE SET
    dismissed_at = NOW(),
    reintroduce_after = NOW() + (cooldown_hours || ' hours')::INTERVAL,
    dismissal_reason = p_dismissal_reason,
    relevance_score_at_dismissal = p_relevance_score,
    presence_energy_at_dismissal = p_presence_energy
  RETURNING id INTO dismissal_id;
  
  RETURN dismissal_id;
END;
$$;


--
-- Name: end_community_intent(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_community_intent(p_intent_id uuid, p_client_operation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_author UUID;
  v_intent community_intent_statements%ROWTYPE;
BEGIN
  SELECT id INTO v_author FROM community WHERE user_id = auth.uid() LIMIT 1;
  SELECT * INTO v_intent FROM community_intent_statements
  WHERE id = p_intent_id AND author_community_id = v_author FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT v_intent.active THEN RETURN true; END IF;

  UPDATE community_intent_statements
  SET active = false, ended_at = now(), updated_at = now()
  WHERE id = p_intent_id;
  INSERT INTO community_intelligence_events (
    author_community_id, subject_type, subject_id, episode_id, client_operation_id,
    object_type, object_id, event_type, occurred_at, visibility, provenance, source
  ) VALUES (
    v_author, v_intent.subject_type, v_intent.subject_id, v_intent.episode_id, p_client_operation_id,
    'intent', v_intent.episode_id, CASE WHEN v_intent.intent_type = 'seeking' THEN 'seeking_ended' ELSE 'offering_ended' END,
    now(), v_intent.visibility, 'authored', 'community_intent'
  ) ON CONFLICT (author_community_id, client_operation_id) DO NOTHING;
  RETURN true;
END;
$$;


--
-- Name: endorsements_mirror_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.endorsements_mirror_ids() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_endorser_user_id uuid;
  v_endorser_community_id uuid;
  v_endorsed_user_id uuid;
  v_endorsed_community_id uuid;
begin
  -- Normalize skill
  if new.skill is not null then
    new.skill := btrim(new.skill);
  end if;

  -- Resolve endorser pair
  if new.endorser_community_id is not null then
    select c.user_id
    into v_endorser_user_id
    from public.community c
    where c.id = new.endorser_community_id
    limit 1;

    if v_endorser_user_id is not null then
      new.endorser_id := v_endorser_user_id;
    end if;
  elsif new.endorser_id is not null then
    select c.id
    into v_endorser_community_id
    from public.community c
    where c.user_id = new.endorser_id
    limit 1;

    new.endorser_community_id := v_endorser_community_id;
  end if;

  -- Resolve endorsed pair
  if new.endorsed_community_id is not null then
    select c.user_id
    into v_endorsed_user_id
    from public.community c
    where c.id = new.endorsed_community_id
    limit 1;

    if v_endorsed_user_id is not null then
      new.endorsed_id := v_endorsed_user_id;
    end if;
  elsif new.endorsed_id is not null then
    select c.id
    into v_endorsed_community_id
    from public.community c
    where c.user_id = new.endorsed_id
    limit 1;

    new.endorsed_community_id := v_endorsed_community_id;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_capability_evidence_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_capability_evidence_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE completed_count INTEGER;
DECLARE verified_success_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO completed_count
  FROM public.capability_attempts
  WHERE capability_id = NEW.id AND outcome_status IN ('succeeded', 'not_succeeded');
  SELECT COUNT(*) INTO verified_success_count
  FROM public.capability_attempts
  WHERE capability_id = NEW.id AND outcome_status = 'succeeded' AND verification_status = 'verified';
  NEW.evidence_status = CASE WHEN verified_success_count >= 2 THEN 'proven' WHEN completed_count >= 1 THEN 'tested' ELSE 'untested' END;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_connection_authorization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_connection_authorization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_is_from boolean;
  v_is_to boolean;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM community c WHERE c.id = NEW.from_user_id AND c.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Connection requests can only be sent as yourself' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'New connection requests must be pending' USING ERRCODE = '42501';
    END IF;
    IF NEW.context_status IS NOT NULL AND NEW.context_status <> 'pending' THEN
      RAISE EXCEPTION 'New collaboration invitations must be pending' USING ERRCODE = '42501';
    END IF;
    IF NEW.context_completed_at IS NOT NULL OR NEW.context_completed_by IS NOT NULL THEN
      RAISE EXCEPTION 'New collaboration invitations cannot be completed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_is_from := EXISTS (SELECT 1 FROM community c WHERE c.id = OLD.from_user_id AND c.user_id = auth.uid());
  v_is_to := EXISTS (SELECT 1 FROM community c WHERE c.id = OLD.to_user_id AND c.user_id = auth.uid());
  IF NOT (v_is_from OR v_is_to) THEN
    RAISE EXCEPTION 'Only the two members on a connection can change it' USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
    OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.context_type IS DISTINCT FROM OLD.context_type
    OR NEW.context_reason IS DISTINCT FROM OLD.context_reason
    OR NEW.context_prompt IS DISTINCT FROM OLD.context_prompt THEN
    RAISE EXCEPTION 'Connection identity and invitation text cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected') AND v_is_to)
      OR (OLD.status = 'pending' AND NEW.status = 'canceled' AND v_is_from)
    ) THEN
      RAISE EXCEPTION 'Connection status cannot change from % to % for this member', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Collaboration Concierge context
  IF NEW.context_status IS DISTINCT FROM OLD.context_status THEN
    IF NOT (
      OLD.context_type IS NOT NULL AND (
        (OLD.context_status = 'pending' AND NEW.context_status = 'accepted' AND v_is_to AND NEW.status = 'accepted')
        OR (OLD.context_status = 'pending' AND NEW.context_status = 'declined' AND v_is_to)
        OR (OLD.context_status = 'accepted' AND NEW.context_status = 'completed' AND NEW.status = 'accepted')
      )
    ) THEN
      RAISE EXCEPTION 'Collaboration status cannot change from % to % for this member', OLD.context_status, NEW.context_status USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.context_completed_at IS DISTINCT FROM OLD.context_completed_at
    OR NEW.context_completed_by IS DISTINCT FROM OLD.context_completed_by THEN
    IF NOT (
      OLD.context_status = 'accepted' AND NEW.context_status = 'completed'
      AND EXISTS (SELECT 1 FROM community c WHERE c.id = NEW.context_completed_by AND c.user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Collaboration completion can only be recorded by the member completing it' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.context_schedule IS DISTINCT FROM OLD.context_schedule AND OLD.context_type IS NULL THEN
    RAISE EXCEPTION 'Only collaboration invitations have a schedule' USING ERRCODE = '42501';
  END IF;

  IF NEW.context_outcome IS DISTINCT FROM OLD.context_outcome
    AND (OLD.context_type IS NULL OR NEW.context_status IS DISTINCT FROM 'completed') THEN
    RAISE EXCEPTION 'A collaboration outcome can only be recorded once it is complete' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_organization_creator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_organization_creator() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'An organization''s creator cannot be changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  v_me := public.authz_current_member_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in with a profile to create an organization' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := v_me;
  ELSIF NEW.created_by <> v_me THEN
    RAISE EXCEPTION 'Organizations can only be created as yourself' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_organization_member_authorization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_organization_member_authorization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid;
  v_row organization_members%ROWTYPE;
  v_is_admin boolean;
  v_is_owner boolean;
  v_other_owners integer;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_me := public.authz_current_member_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in with a profile to change organization membership' USING ERRCODE = '42501';
  END IF;
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  -- A BEFORE trigger sees the table as it was, so this is the caller's
  -- standing before the change, never the standing they are trying to grant.
  v_is_owner := COALESCE(public.authz_org_role(v_row.organization_id) = 'owner', false);
  v_is_admin := COALESCE(public.authz_org_role(v_row.organization_id) IN ('owner', 'admin'), false);

  IF TG_OP = 'INSERT' THEN
    IF NEW.community_id = v_me AND NOT v_is_admin THEN
      -- A member may ask to join: a plain, pending, permissionless request.
      IF NEW.role = 'member' AND NEW.status = 'pending'
        AND NOT COALESCE(NEW.can_post_opportunities, false)
        AND NOT COALESCE(NEW.can_manage_members, false)
        AND NOT COALESCE(NEW.can_edit_profile, false) THEN
        RETURN NEW;
      END IF;
      -- The creator of an organization that has no owner yet may become its
      -- owner (the creation flow; normally done by fn_auto_create_org_owner).
      IF NEW.role = 'owner' AND NEW.status = 'active'
        AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.organization_id AND o.created_by = v_me)
        AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.role = 'owner' AND m.status = 'active') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'You can ask to join an organization, but not add yourself as an active member, admin or owner' USING ERRCODE = '42501';
    END IF;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Only organization owners and admins can add members' USING ERRCODE = '42501';
    END IF;
    IF NEW.role = 'owner' AND NOT v_is_owner THEN
      RAISE EXCEPTION 'Only an owner can add another owner' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.community_id IS DISTINCT FROM OLD.community_id THEN
      RAISE EXCEPTION 'A membership cannot be moved to another organization or member' USING ERRCODE = '42501';
    END IF;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Only organization owners and admins can change memberships' USING ERRCODE = '42501';
    END IF;
    IF (OLD.role = 'owner' OR NEW.role = 'owner') AND NOT v_is_owner THEN
      RAISE EXCEPTION 'Only an owner can grant, change or remove ownership' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.community_id <> v_me THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Only organization owners and admins can remove other members' USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'owner' AND NOT v_is_owner THEN
      RAISE EXCEPTION 'Only an owner can remove an owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Never leave an organization without an active owner.
  IF OLD.role = 'owner' AND OLD.status = 'active'
    AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    SELECT count(*) INTO v_other_owners FROM organization_members m
    WHERE m.organization_id = OLD.organization_id AND m.role = 'owner' AND m.status = 'active' AND m.id <> OLD.id;
    IF v_other_owners = 0 THEN
      RAISE EXCEPTION 'An organization must keep at least one active owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: enforce_photo_consent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_photo_consent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New profiles always start private. Opt-in is a separate owner action.
    NEW.photo_visible := false;
    NEW.photo_consent_at := NULL;
  ELSE
    IF auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid()
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Only the profile owner may change photo consent'
        USING ERRCODE = '42501';
    END IF;
    NEW.photo_consent_at := CASE WHEN NEW.photo_visible THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_project_member_authorization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_project_member_authorization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid;
  v_is_creator boolean;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  v_me := public.authz_current_member_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in with a profile to change project membership' USING ERRCODE = '42501';
  END IF;
  v_is_creator := EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.creator_id = v_me);

  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'A membership cannot be moved to another project or member' USING ERRCODE = '42501';
  END IF;

  IF NEW.role = 'creator' AND NOT (v_is_creator AND NEW.user_id = v_me) THEN
    RAISE EXCEPTION 'Only the project creator holds the creator role' USING ERRCODE = '42501';
  END IF;

  IF v_is_creator THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.user_id = v_me AND NEW.role = 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'You can ask to join a project; the project creator decides who joins the team' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Only the project creator can change team membership' USING ERRCODE = '42501';
END;
$$;


--
-- Name: finish_admin_claim_email(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_admin_claim_email(p_request_id uuid, p_accepted boolean, p_code text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  UPDATE public.admin_claim_email_requests
  SET status = CASE
        WHEN p_accepted THEN 'accepted'
        ELSE 'failed'
      END,
      result_code = left(p_code, 80)
  WHERE id = p_request_id
    AND status = 'pending';
$$;


--
-- Name: finish_email_campaign_recipient(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_email_campaign_recipient(p_id uuid, p_status text, p_provider_id text DEFAULT NULL::text, p_code text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: fn_auto_create_org_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auto_create_org_owner() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Resolve the community profile for the inserting user
  IF NEW.created_by IS NOT NULL THEN
    v_community_id := NEW.created_by;
  ELSE
    SELECT id INTO v_community_id
    FROM community
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_community_id IS NULL THEN
    -- Running as service_role or seeder — skip auto-member creation
    RETURN NEW;
  END IF;

  -- Insert the owner record (ignore if it somehow already exists)
  INSERT INTO organization_members (
    organization_id,
    community_id,
    role,
    can_post_opportunities,
    can_manage_members,
    can_edit_profile,
    status
  )
  VALUES (
    NEW.id,
    v_community_id,
    'owner',
    TRUE,
    TRUE,
    TRUE,
    'active'
  )
  ON CONFLICT (organization_id, community_id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: fn_set_org_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_org_created_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Only act when created_by was not supplied by the caller
  IF NEW.created_by IS NULL THEN
    SELECT id INTO v_community_id
    FROM community
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_community_id IS NOT NULL THEN
      NEW.created_by := v_community_id;
    END IF;
    -- If still null (e.g. seeder running as service_role), leave as null.
    -- The trigger does not block the insert.
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: get_active_presence_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_presence_sessions() RETURNS TABLE(id uuid, user_id uuid, context_type text, context_id uuid, energy numeric, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.id,
    ps.user_id,
    ps.context_type,
    ps.context_id,
    ps.energy,
    ps.expires_at,
    ps.created_at,
    ps.updated_at
  FROM presence_sessions ps
  WHERE ps.expires_at > NOW()
  ORDER BY ps.energy DESC, ps.expires_at ASC;
END;
$$;


--
-- Name: FUNCTION get_active_presence_sessions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_active_presence_sessions() IS 'Returns all active (non-expired) presence sessions';


--
-- Name: get_admin_network_analytics(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_network_analytics(p_active_window_days integer DEFAULT 30) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
  v_window integer;
  v_result json;
BEGIN
  -- Fail closed: only a caller whose own community row is user_role='Admin'
  -- may proceed. No aggregate is computed or returned otherwise.
  SELECT (user_role = 'Admin') INTO v_is_admin
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized: admin role required'
      USING ERRCODE = '42501';
  END IF;

  v_window := p_active_window_days;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 30;
  END IF;

  WITH canon AS (
    -- Canonical identity per real person. Rows sharing the same non-null
    -- user_id are duplicate/legacy rows for one human; rows with no
    -- user_id are each their own identity (two different unclaimed rows
    -- are two different people, never merged).
    SELECT
      id,
      coalesce(user_id::text, id::text) AS canonical_id,
      name,
      skills,
      last_seen_at,
      created_at,
      row_number() OVER (
        PARTITION BY coalesce(user_id::text, id::text)
        ORDER BY (user_id IS NULL) ASC, created_at ASC
      ) AS rn
    FROM public.community
  ),
  members AS (
    -- One row per canonical identity, preferring the claimed row
    -- (user_id IS NOT NULL) as the representative for display fields.
    SELECT * FROM canon WHERE rn = 1
  ),
  pairs AS (
    -- Every accepted relationship, mapped to canonical identities and
    -- collapsed to one row per unordered pair -- this is what removes
    -- both reciprocal duplicate connection rows AND duplicate-community-
    -- row pairs. Self-pairs (two rows of the same person connected to
    -- each other) are excluded.
    SELECT
      least(ca.canonical_id, cb.canonical_id) AS peer_a,
      greatest(ca.canonical_id, cb.canonical_id) AS peer_b,
      min(c.created_at) AS formed_at
    FROM public.connections c
    JOIN canon ca ON ca.id = c.from_user_id
    JOIN canon cb ON cb.id = c.to_user_id
    WHERE c.status = 'accepted'
      AND ca.canonical_id <> cb.canonical_id
    GROUP BY least(ca.canonical_id, cb.canonical_id), greatest(ca.canonical_id, cb.canonical_id)
  ),
  degree AS (
    -- True per-person degree from the deduped pair list -- NOT from
    -- community.connection_count, which inherits the reciprocal-row bug.
    SELECT canonical_id, count(*) AS n
    FROM (
      SELECT peer_a AS canonical_id FROM pairs
      UNION ALL
      SELECT peer_b AS canonical_id FROM pairs
    ) x
    GROUP BY canonical_id
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM members) AS total_members,
      (SELECT count(*) FROM members
        WHERE last_seen_at IS NOT NULL
          AND last_seen_at >= now() - (v_window || ' days')::interval) AS active_members,
      (SELECT count(*) FROM pairs) AS total_connections,
      (SELECT count(*) FROM members WHERE created_at >= now() - interval '30 days') AS new_members_30d,
      (SELECT count(*) FROM pairs WHERE formed_at >= now() - interval '30 days') AS new_connections_30d,
      (SELECT count(*) FROM public.projects) AS total_projects,
      (SELECT count(*) FROM public.projects WHERE status = 'active') AS active_projects,
      (SELECT count(*) FROM public.opportunities WHERE status = 'open') AS open_opportunities,
      (SELECT count(*) FROM public.opportunities
        WHERE status = 'open' AND coalesce(application_count, 0) = 0) AS open_opportunities_no_apps,
      (SELECT count(*) FROM members m LEFT JOIN degree d ON d.canonical_id = m.canonical_id
        WHERE coalesce(d.n, 0) = 0) AS isolated_count
  ),
  isolated_sample AS (
    SELECT json_agg(row_to_json(t)) AS j FROM (
      SELECT m.id, m.name, m.skills
      FROM members m LEFT JOIN degree d ON d.canonical_id = m.canonical_id
      WHERE coalesce(d.n, 0) = 0
      ORDER BY m.created_at DESC NULLS LAST
      LIMIT 10
    ) t
  ),
  key_connectors AS (
    SELECT json_agg(row_to_json(t)) AS j FROM (
      SELECT m.id, m.name, d.n AS connection_count
      FROM members m JOIN degree d ON d.canonical_id = m.canonical_id
      WHERE d.n > 0
      ORDER BY d.n DESC
      LIMIT GREATEST(5, floor((SELECT total_members FROM totals) * 0.1)::int)
    ) t
  ),
  top_skills AS (
    SELECT json_agg(row_to_json(t)) AS j FROM (
      SELECT trim(skill) AS skill, count(*) AS members
      FROM members m, unnest(string_to_array(m.skills, ',')) AS skill
      WHERE m.skills IS NOT NULL AND trim(skill) <> ''
      GROUP BY trim(skill)
      ORDER BY count(*) DESC
      LIMIT 10
    ) t
  )
  SELECT json_build_object(
    'generated_at', now(),
    'active_window_days', v_window,
    'total_members', totals.total_members,
    'active_members', totals.active_members,
    'total_connections', totals.total_connections,
    'new_members_30d', totals.new_members_30d,
    'new_connections_30d', totals.new_connections_30d,
    'total_projects', totals.total_projects,
    'active_projects', totals.active_projects,
    'open_opportunities', totals.open_opportunities,
    'open_opportunities_no_applications', totals.open_opportunities_no_apps,
    'network_density_pct', CASE
      WHEN totals.total_members > 1
        THEN round((totals.total_connections / ((totals.total_members * (totals.total_members - 1)) / 2.0) * 100)::numeric, 2)
      ELSE 0
    END,
    'isolated_members_count', totals.isolated_count,
    'isolated_members_sample', coalesce(isolated_sample.j, '[]'::json),
    'key_connectors', coalesce(key_connectors.j, '[]'::json),
    'top_skills', coalesce(top_skills.j, '[]'::json)
  ) INTO v_result
  FROM totals, isolated_sample, key_connectors, top_skills;

  RETURN v_result;
END;
$$;


--
-- Name: get_admin_retention_analytics(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_retention_analytics(p_min_cohort integer DEFAULT 5) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
  v_result json;
BEGIN
  SELECT (user_role = 'Admin') INTO v_is_admin
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_min_cohort IS NULL OR p_min_cohort < 1 THEN
    p_min_cohort := 5;
  END IF;

  WITH first_session AS (
    SELECT user_id, min(started_at) AS first_started_at
    FROM public.product_sessions
    GROUP BY user_id
  ),
  session_counts AS (
    SELECT user_id, count(*) AS n
    FROM public.product_sessions
    GROUP BY user_id
  ),
  d1_cohort AS (
    SELECT fs.user_id, fs.first_started_at
    FROM first_session fs
    WHERE fs.first_started_at::date <= (current_date - 2)
  ),
  d1_retained AS (
    SELECT c.user_id
    FROM d1_cohort c
    WHERE EXISTS (
      SELECT 1 FROM public.product_sessions s
      WHERE s.user_id = c.user_id
        AND s.started_at::date = (c.first_started_at::date + 1)
    )
  ),
  d7_cohort AS (
    SELECT fs.user_id, fs.first_started_at
    FROM first_session fs
    WHERE fs.first_started_at <= now() - interval '8 days'
  ),
  d7_retained AS (
    SELECT c.user_id
    FROM d7_cohort c
    WHERE EXISTS (
      SELECT 1 FROM public.product_sessions s
      WHERE s.user_id = c.user_id
        AND s.started_at > c.first_started_at
        AND s.started_at <= c.first_started_at + interval '7 days'
    )
  ),
  d30_cohort AS (
    SELECT fs.user_id, fs.first_started_at
    FROM first_session fs
    WHERE fs.first_started_at <= now() - interval '31 days'
  ),
  d30_retained AS (
    SELECT c.user_id
    FROM d30_cohort c
    WHERE EXISTS (
      SELECT 1 FROM public.product_sessions s
      WHERE s.user_id = c.user_id
        AND s.started_at > c.first_started_at
        AND s.started_at <= c.first_started_at + interval '30 days'
    )
  ),
  activation_events AS (
    SELECT DISTINCT user_id
    FROM public.product_events
    WHERE event_type IN ('connection_requested', 'connection_accepted', 'message_sent')
  ),
  sessioned_users AS (
    SELECT DISTINCT user_id FROM public.product_sessions
  ),
  -- Behavior -> return association. Restricted to the same D7-eligible
  -- cohort as d7_retention above, so the comparison is apples-to-apples
  -- with the headline D7 number.
  action_cohorts AS (
    SELECT
      'connection_requested'::text AS action,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')) AS did_n,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')
          AND c.user_id IN (SELECT user_id FROM d7_retained)) AS did_retained_n,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')) AS not_n,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')
          AND c.user_id IN (SELECT user_id FROM d7_retained)) AS not_retained_n
    UNION ALL
    SELECT
      'message_sent'::text,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')),
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')
          AND c.user_id IN (SELECT user_id FROM d7_retained)),
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')),
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')
          AND c.user_id IN (SELECT user_id FROM d7_retained))
  ),
  action_signals AS (
    SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) AS j
    FROM (
      SELECT
        action,
        did_n,
        did_retained_n,
        not_n,
        not_retained_n,
        round((did_retained_n::numeric / did_n) * 100, 1) AS did_return_pct,
        round((not_retained_n::numeric / not_n) * 100, 1) AS not_return_pct
      FROM action_cohorts
      WHERE did_n >= p_min_cohort AND not_n >= p_min_cohort
    ) t
  ),
  totals AS (
    SELECT
      (SELECT min(started_at) FROM public.product_sessions) AS instrumentation_since,
      (SELECT count(*) FROM public.product_sessions WHERE started_at >= now() - interval '7 days') AS sessions_7d,
      (SELECT count(*) FROM public.product_sessions WHERE started_at >= now() - interval '30 days') AS sessions_30d,
      (SELECT count(DISTINCT user_id) FROM public.product_sessions WHERE started_at >= now() - interval '7 days') AS active_users_7d,
      (SELECT count(DISTINCT user_id) FROM public.product_sessions WHERE started_at >= now() - interval '30 days') AS active_users_30d,
      (SELECT count(*) FROM session_counts WHERE n >= 2) AS returning_users,
      (SELECT count(*) FROM sessioned_users) AS total_sessioned_users,
      (SELECT count(*) FROM sessioned_users su WHERE su.user_id IN (SELECT user_id FROM activation_events)) AS activated_users,
      (SELECT count(*) FROM d1_cohort) AS d1_cohort_n,
      (SELECT count(*) FROM d1_retained) AS d1_retained_n,
      (SELECT count(*) FROM d7_cohort) AS d7_cohort_n,
      (SELECT count(*) FROM d7_retained) AS d7_retained_n,
      (SELECT count(*) FROM d30_cohort) AS d30_cohort_n,
      (SELECT count(*) FROM d30_retained) AS d30_retained_n
  )
  SELECT json_build_object(
    'instrumentation_since', totals.instrumentation_since,
    'min_cohort_size', p_min_cohort,
    'sessions_7d', totals.sessions_7d,
    'sessions_30d', totals.sessions_30d,
    'active_users_7d', totals.active_users_7d,
    'active_users_30d', totals.active_users_30d,
    'returning_users', totals.returning_users,
    'activation', json_build_object(
      'activated_users', totals.activated_users,
      'eligible_users', totals.total_sessioned_users,
      'rate_pct', CASE WHEN totals.total_sessioned_users > 0
        THEN round((totals.activated_users::numeric / totals.total_sessioned_users) * 100, 1)
        ELSE NULL END
    ),
    'd1_retention', json_build_object(
      'cohort_n', totals.d1_cohort_n,
      'retained_n', totals.d1_retained_n,
      'rate_pct', CASE WHEN totals.d1_cohort_n > 0
        THEN round((totals.d1_retained_n::numeric / totals.d1_cohort_n) * 100, 1)
        ELSE NULL END,
      'definition', 'returned on the calendar day after their first session'
    ),
    'd7_retention', json_build_object(
      'cohort_n', totals.d7_cohort_n,
      'retained_n', totals.d7_retained_n,
      'rate_pct', CASE WHEN totals.d7_cohort_n > 0
        THEN round((totals.d7_retained_n::numeric / totals.d7_cohort_n) * 100, 1)
        ELSE NULL END,
      'definition', 'returned at least once within 7 days of first session'
    ),
    'd30_retention', json_build_object(
      'cohort_n', totals.d30_cohort_n,
      'retained_n', totals.d30_retained_n,
      'rate_pct', CASE WHEN totals.d30_cohort_n > 0
        THEN round((totals.d30_retained_n::numeric / totals.d30_cohort_n) * 100, 1)
        ELSE NULL END,
      'definition', 'returned at least once within 30 days of first session'
    ),
    'return_signals', action_signals.j
  ) INTO v_result
  FROM totals, action_signals;

  RETURN v_result;
END;
$$;


--
-- Name: get_admin_site_visit_report(integer, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_site_visit_report(p_days integer DEFAULT 30, p_view text DEFAULT 'community'::text, p_excluded_browser_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community WHERE user_id = auth.uid() AND user_role = 'Admin'
  ) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days < 0 OR p_days > 90 THEN
    RAISE EXCEPTION 'Period must be 0 (last hour) or 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_view IS NULL OR p_view NOT IN ('community', 'internal', 'all') THEN
    RAISE EXCEPTION 'Unknown visitor view' USING ERRCODE = '22023';
  END IF;
  WITH admin_accounts AS (
    SELECT DISTINCT user_id FROM public.community
    WHERE user_role = 'Admin' AND user_id IS NOT NULL
  ), internal_browsers AS (
    -- Use all retained history, even when the admin login is outside this period.
    SELECT DISTINCT browser_id FROM public.site_visit_sessions
    WHERE auth_user_id IN (SELECT user_id FROM admin_accounts)
    UNION SELECT p_excluded_browser_id WHERE p_excluded_browser_id IS NOT NULL
  ), classified AS (
    SELECT v.*, (v.auth_user_id IN (SELECT user_id FROM admin_accounts)
      OR v.browser_id IN (SELECT browser_id FROM internal_browsers)) AS internal
    FROM public.site_visit_sessions v
    WHERE last_seen_at >= now() - CASE WHEN p_days = 0 THEN interval '1 hour' ELSE make_interval(days => p_days) END
  ), filtered AS (
    SELECT * FROM classified
    WHERE p_view = 'all' OR (p_view = 'internal' AND COALESCE(internal, false))
      OR (p_view = 'community' AND NOT COALESCE(internal, false))
  )
  SELECT jsonb_build_object(
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'visits', visits) ORDER BY day)
      FROM (
        SELECT days.day, count(v.session_id) AS visits
        FROM generate_series(
          date_trunc('day', (now() - CASE WHEN p_days = 0 THEN interval '1 hour' ELSE make_interval(days => p_days) END) AT TIME ZONE 'UTC'),
          date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day'
        ) AS days(day)
        LEFT JOIN filtered v ON v.last_seen_at AT TIME ZONE 'UTC' >= days.day
          AND v.last_seen_at AT TIME ZONE 'UTC' < days.day + interval '1 day'
        GROUP BY days.day
      ) buckets),
    'separation_version', 2,
    'internal_visits', (SELECT count(*) FROM classified WHERE internal),
    'community_visits', (SELECT count(*) FROM classified WHERE NOT COALESCE(internal, false)),
    'visits', count(*), 'browsers', count(DISTINCT browser_id),
    'guests', count(*) FILTER (WHERE auth_user_id IS NULL),
    'members', count(*) FILTER (WHERE auth_user_id IS NOT NULL),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.last_seen_at DESC) FROM (
      SELECT last_seen_at, auth_user_id IS NOT NULL AS signed_in, COALESCE(internal, false) AS internal
      FROM filtered ORDER BY last_seen_at DESC LIMIT 20
    ) r), '[]'::jsonb)
  ) INTO result FROM filtered;
  RETURN result;
END $$;


--
-- Name: get_admin_site_visits(integer, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_site_visits(p_days integer DEFAULT 30, p_exclude_self boolean DEFAULT true, p_excluded_browser_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community WHERE user_id = auth.uid() AND user_role = 'Admin'
  ) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days < 0 OR p_days > 90 THEN
    RAISE EXCEPTION 'Period must be 0 (last hour) or 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  WITH admin_accounts AS (
    SELECT DISTINCT user_id FROM public.community
    WHERE user_role = 'Admin' AND user_id IS NOT NULL
  ), internal_browsers AS (
    -- Use all retained history, even when the admin login is outside this period.
    SELECT DISTINCT browser_id FROM public.site_visit_sessions
    WHERE auth_user_id IN (SELECT user_id FROM admin_accounts)
    UNION SELECT p_excluded_browser_id WHERE p_excluded_browser_id IS NOT NULL
  ), classified AS (
    SELECT v.*, (v.auth_user_id IN (SELECT user_id FROM admin_accounts)
      OR v.browser_id IN (SELECT browser_id FROM internal_browsers)) AS internal
    FROM public.site_visit_sessions v
    WHERE last_seen_at >= now() - CASE WHEN p_days = 0 THEN interval '1 hour' ELSE make_interval(days => p_days) END
  ), filtered AS (
    SELECT * FROM classified
    WHERE NOT COALESCE(p_exclude_self, true) OR NOT COALESCE(internal, false)
  )
  SELECT jsonb_build_object(
    'separation_version', 2,
    'internal_visits', (SELECT count(*) FROM classified WHERE internal),
    'community_visits', (SELECT count(*) FROM classified WHERE NOT COALESCE(internal, false)),
    'visits', count(*), 'browsers', count(DISTINCT browser_id),
    'guests', count(*) FILTER (WHERE auth_user_id IS NULL),
    'members', count(*) FILTER (WHERE auth_user_id IS NOT NULL),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.last_seen_at DESC) FROM (
      SELECT last_seen_at, auth_user_id IS NOT NULL AS signed_in, COALESCE(internal, false) AS internal
      FROM filtered ORDER BY last_seen_at DESC LIMIT 20
    ) r), '[]'::jsonb)
  ) INTO result FROM filtered;
  RETURN result;
END $$;


--
-- Name: get_admin_unconnected_members(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_unconnected_members(p_offset integer DEFAULT 0, p_limit integer DEFAULT 25) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.community
    WHERE user_id = auth.uid()
      AND user_role = 'Admin'
  ) THEN
    RAISE EXCEPTION 'not_authorized: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_offset IS NULL OR p_offset < 0
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Invalid page'
      USING ERRCODE = '22023';
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT id, name, skills, created_at
    FROM public.community
    WHERE coalesce(connection_count, 0) = 0
  ),
  page AS (
    SELECT id, name, skills, created_at
    FROM eligible
    ORDER BY created_at DESC NULLS LAST, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM eligible),
    'members', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'name', name,
            'skills', skills
          )
          ORDER BY created_at DESC NULLS LAST, id
        )
        FROM page
      ),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_capability_attempt_stats(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_capability_attempt_stats(capability_ids uuid[]) RETURNS TABLE(capability_id uuid, completed_attempts bigint, successful_attempts bigint, verified_successes bigint, hours_saved_values numeric[], cost_saved_values numeric[])
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    a.capability_id,
    COUNT(*) FILTER (WHERE a.outcome_status IN ('succeeded', 'not_succeeded'))::BIGINT,
    COUNT(*) FILTER (WHERE a.outcome_status = 'succeeded')::BIGINT,
    COUNT(*) FILTER (WHERE a.outcome_status = 'succeeded' AND a.verification_status = 'verified')::BIGINT,
    ARRAY_AGG(a.baseline_hours - a.actual_hours ORDER BY a.created_at)
      FILTER (WHERE a.outcome_status IN ('succeeded', 'not_succeeded') AND a.baseline_hours IS NOT NULL AND a.actual_hours IS NOT NULL),
    ARRAY_AGG(a.baseline_cost - a.actual_cost ORDER BY a.created_at)
      FILTER (WHERE a.outcome_status IN ('succeeded', 'not_succeeded') AND a.baseline_cost IS NOT NULL AND a.actual_cost IS NOT NULL)
  FROM public.capability_attempts a
  JOIN public.capability_packages p ON p.id = a.capability_id
  WHERE a.capability_id = ANY(capability_ids)
    AND ((p.permission_mode = 'community' AND EXISTS (SELECT 1 FROM public.community WHERE user_id = auth.uid())) OR p.creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()))
  GROUP BY a.capability_id;
$$;


--
-- Name: get_community_id_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_id_from_auth() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT id 
  FROM community 
  WHERE email = auth.email()
  LIMIT 1;
$$;


--
-- Name: get_community_pulse(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_pulse() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.community WHERE user_id=auth.uid() AND is_disabled IS NOT TRUE) THEN RAISE EXCEPTION 'Enabled community membership required' USING ERRCODE='42501'; END IF;
 WITH visible AS (
  SELECT * FROM public.community WHERE is_hidden IS NOT TRUE AND is_disabled IS NOT TRUE AND user_role IS DISTINCT FROM 'Admin' AND coalesce(name,'')!~*'(^|[^a-z])(test|tester|fixture)([^a-z]|$)'
 ), edges AS (
  SELECT c.* FROM public.connections c JOIN visible a ON a.id=c.from_user_id JOIN visible b ON b.id=c.to_user_id WHERE c.status='accepted'
 ), skills AS (
  SELECT lower(btrim(s.skill)) AS skill,count(DISTINCT v.id) AS n
  FROM visible v CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(v)->'skills')='array' THEN to_jsonb(v)->'skills' ELSE to_jsonb(string_to_array(coalesce(to_jsonb(v)->>'skills',''),',')) END) s(skill)
  WHERE length(btrim(s.skill)) BETWEEN 1 AND 80 GROUP BY lower(btrim(s.skill)) HAVING count(DISTINCT v.id)>=5
 )
 SELECT jsonb_build_object('generated_at',now(),'privacy_threshold',5,
  'member_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM visible),
  'connection_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM edges),
  'active_projects',(SELECT count(*) FROM public.projects p WHERE p.status='active' AND coalesce((to_jsonb(p)->>'is_hidden')::boolean,false)=false AND (NOT (to_jsonb(p)?'is_public') OR to_jsonb(p)->>'is_public'='true')),
  'open_opportunities',(SELECT count(*) FROM public.opportunities o WHERE o.status='open' AND o.is_public IS TRUE AND (o.application_deadline IS NULL OR o.application_deadline>now())),
  'new_profiles_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM visible WHERE created_at>=now()-interval '30 days'),
  'new_connections_band',(SELECT CASE WHEN count(*)>=5 THEN (count(*)/5)*5 END FROM edges WHERE created_at>=now()-interval '30 days'),
  'popular_skills',coalesce((SELECT jsonb_agg(jsonb_build_object('skill',skill,'members_band',(n/5)*5)) FROM (SELECT * FROM skills ORDER BY n DESC,skill LIMIT 8) s),'[]'::jsonb),
  'monthly', (SELECT jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),'profiles_band',CASE WHEN n>=5 THEN (n/5)*5 END) ORDER BY month) FROM (
   SELECT m.month,count(v.id) n FROM generate_series(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '5 months',date_trunc('month',now() AT TIME ZONE 'UTC'),interval '1 month') m(month)
   LEFT JOIN visible v ON v.created_at AT TIME ZONE 'UTC'>=m.month AND v.created_at AT TIME ZONE 'UTC'<m.month+interval '1 month' GROUP BY m.month
  ) months)
 ) INTO result;
 RETURN result;
END $_$;


--
-- Name: get_endorsement_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_endorsement_count(user_uuid uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT COUNT(DISTINCT endorser_id)::INTEGER
    FROM endorsements
    WHERE endorsed_id = user_uuid
  );
END;
$$;


--
-- Name: get_level_title(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_level_title(level integer) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN CASE
    WHEN level >= 10 THEN 'Legend'
    WHEN level >= 8 THEN 'Master'
    WHEN level >= 6 THEN 'Leader'
    WHEN level >= 4 THEN 'Expert'
    WHEN level >= 2 THEN 'Explorer'
    ELSE 'Newcomer'
  END;
END;
$$;


--
-- Name: get_my_community_intents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_community_intents() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_author UUID;
BEGIN
  SELECT id INTO v_author
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'intents', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'intents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'intent_type', i.intent_type,
        'subject_key', i.subject_key,
        'subject_label', i.subject_label,
        'statement', i.statement,
        'visibility', i.visibility,
        'starts_at', i.starts_at,
        'last_confirmed_at', i.last_confirmed_at,
        'expires_at', i.expires_at,
        'active', i.active
      ) ORDER BY i.intent_type, i.starts_at DESC)
      FROM public.community_intent_statements i
      WHERE i.author_community_id = v_author
        AND i.active = true
        AND i.voided_at IS NULL
        AND i.starts_at <= now()
        AND (i.expires_at IS NULL OR i.expires_at > now())
        AND i.visibility IN ('public', 'nearify', 'private')
    ), '[]'::jsonb)
  );
END;
$$;


--
-- Name: get_nearify_authorization_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_authorization_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_status       TEXT;
BEGIN
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT status INTO v_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify'
  LIMIT 1;

  RETURN jsonb_build_object('status', COALESCE(v_status, 'none'));
END;
$$;


--
-- Name: get_nearify_between_intelligence(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_between_intelligence(p_nearify_user_ids text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_caller_status TEXT;
  v_ids TEXT[];
  v_empty JSONB := jsonb_build_object(
    'success', true,
    'projects', '[]'::jsonb,
    'themes', '[]'::jsonb,
    'organizations', '[]'::jsonb,
    'opportunities', '[]'::jsonb,
    'seeking', '[]'::jsonb,
    'offering', '[]'::jsonb,
    'participation', '[]'::jsonb,
    'object_updates', '[]'::jsonb,
    'seeking_offering_overlaps', '[]'::jsonb
  );
  v_projects JSONB;
  v_themes JSONB;
  v_orgs JSONB;
  v_opportunities JSONB;
  v_seeking JSONB;
  v_offering JSONB;
  v_participation JSONB;
  v_updates JSONB;
  v_overlaps JSONB;
BEGIN
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user'); END IF;

  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status <> 'authorized' THEN RETURN v_empty; END IF;
  IF p_nearify_user_ids IS NULL OR array_length(p_nearify_user_ids, 1) IS NULL THEN RETURN v_empty; END IF;

  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(p_nearify_user_ids) AS x WHERE trim(x) <> '';
  IF v_ids IS NULL THEN RETURN v_empty; END IF;
  IF array_length(v_ids, 1) > 25 THEN v_ids := v_ids[1:25]; END IF;

  WITH candidates AS (
    SELECT DISTINCT nim.nearify_user_id, nim.community_id
    FROM nearify_identity_map nim
    JOIN community c ON c.id = nim.community_id
    JOIN community_experience_authorizations cea
      ON cea.community_id = nim.community_id
     AND cea.experience = 'nearify'
     AND cea.status = 'authorized'
    WHERE nim.nearify_user_id = ANY(v_ids)
      AND nim.community_id <> v_community_id
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'title', p.title, 'status', p.status, 'created_at', p.created_at,
      'updated_at', p.updated_at, 'grounded_count', x.grounded_count,
      'grounded_nearify_user_ids', x.ids,
      'participation', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'nearify_user_id', c2.nearify_user_id, 'started_at', pm.joined_at,
        'state', 'current', 'source', 'project_members') ORDER BY c2.nearify_user_id)
        FROM project_members pm JOIN candidates c2 ON c2.community_id = pm.user_id
        WHERE pm.project_id = p.id), '[]'::jsonb)
    ) ORDER BY x.grounded_count DESC, p.title), '[]'::jsonb)
           FROM (SELECT p2.id, count(DISTINCT c.nearify_user_id) grounded_count,
                  jsonb_agg(DISTINCT c.nearify_user_id ORDER BY c.nearify_user_id) ids
           FROM projects p2 JOIN project_members pm2 ON pm2.project_id = p2.id
           JOIN candidates c ON c.community_id = pm2.user_id
           WHERE p2.status IN ('open', 'active', 'completed') AND pm2.left_at IS NULL
           GROUP BY p2.id) x JOIN projects p ON p.id = x.id),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'title', tc.title, 'status', tc.status,
      'expires_at', tc.expires_at, 'created_at', tc.created_at,
      'grounded_count', x.grounded_count, 'grounded_nearify_user_ids', x.ids,
      'participating_count', x.participating_count,
      'participating_nearify_user_ids', x.participating_ids,
      'participation', x.participation
    ) ORDER BY x.grounded_count DESC, tc.title), '[]'::jsonb)
     FROM (SELECT tc2.id, count(DISTINCT c.nearify_user_id) grounded_count,
                  jsonb_agg(DISTINCT c.nearify_user_id ORDER BY c.nearify_user_id) ids,
                  count(DISTINCT c.nearify_user_id) FILTER (WHERE tp.engagement_level = 'participating' AND (tp.participation_expires_at IS NULL OR tp.participation_expires_at > now())) participating_count,
                  COALESCE(jsonb_agg(DISTINCT c.nearify_user_id ORDER BY c.nearify_user_id) FILTER (WHERE tp.engagement_level = 'participating' AND (tp.participation_expires_at IS NULL OR tp.participation_expires_at > now())), '[]'::jsonb) participating_ids,
                  COALESCE(jsonb_agg(jsonb_build_object('nearify_user_id', c.nearify_user_id, 'state', CASE WHEN tp.engagement_level = 'participating' AND (tp.participation_expires_at IS NULL OR tp.participation_expires_at > now()) THEN 'current' ELSE 'historical_or_exploring' END, 'started_at', COALESCE(tp.participation_confirmed_at, tp.joined_at), 'expires_at', tp.participation_expires_at) ORDER BY c.nearify_user_id), '[]'::jsonb) participation
           FROM theme_circles tc2 JOIN theme_participants tp ON tp.theme_id = tc2.id
           JOIN candidates c ON c.community_id = tp.community_id
           WHERE tc2.status = 'active' AND (tc2.expires_at IS NULL OR tc2.expires_at > now())
           GROUP BY tc2.id) x JOIN theme_circles tc ON tc.id = x.id),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', o.name, 'slug', o.slug, 'status', o.status, 'created_at', o.created_at,
      'updated_at', o.updated_at, 'grounded_count', x.grounded_count,
      'grounded_nearify_user_ids', x.ids,
      'participation', COALESCE((SELECT jsonb_agg(jsonb_build_object('nearify_user_id', c2.nearify_user_id, 'state', 'current', 'started_at', om.joined_at, 'updated_at', om.updated_at) ORDER BY c2.nearify_user_id)
        FROM organization_members om JOIN candidates c2 ON c2.community_id = om.community_id
        WHERE om.organization_id = o.id AND om.status = 'active'), '[]'::jsonb)
    ) ORDER BY x.grounded_count DESC, o.name), '[]'::jsonb)
     FROM (SELECT o2.id, count(DISTINCT c.nearify_user_id) grounded_count,
                  jsonb_agg(DISTINCT c.nearify_user_id ORDER BY c.nearify_user_id) ids
           FROM organizations o2 JOIN organization_members om2 ON om2.organization_id = o2.id
           JOIN candidates c ON c.community_id = om2.community_id
           WHERE o2.status = 'active' AND om2.status = 'active'
           GROUP BY o2.id) x JOIN organizations o ON o.id = x.id),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', opp.id, 'title', opp.title, 'status', opp.status,
      'organization_name', org.name, 'posted_by_nearify_user_id', c.nearify_user_id,
      'created_at', opp.created_at, 'updated_at', opp.updated_at,
      'visibility', CASE WHEN opp.is_public IS NULL OR opp.is_public THEN 'public' ELSE 'private' END
    ) ORDER BY opp.created_at DESC NULLS LAST, opp.title), '[]'::jsonb)
     FROM opportunities opp JOIN candidates c ON c.community_id = opp.posted_by
     LEFT JOIN organizations org ON org.id = opp.organization_id
     WHERE opp.status = 'open' AND (opp.application_deadline IS NULL OR opp.application_deadline > now()) AND (opp.is_public IS NULL OR opp.is_public = true)),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id, 'episode_id', i.episode_id, 'author_nearify_user_id', c.nearify_user_id,
      'subject_type', i.subject_type,
      'subject_id', CASE WHEN i.subject_type = 'community_profile' THEN NULL ELSE i.subject_id END,
      'subject_nearify_user_id', CASE WHEN i.subject_type = 'community_profile' THEN c.nearify_user_id ELSE NULL END,
      'nearify_user_id', c.nearify_user_id, 'intent_type', i.intent_type,
      'subject_key', i.subject_key, 'subject_label', i.subject_label, 'statement', i.statement,
      'starts_at', i.starts_at, 'expires_at', i.expires_at, 'created_at', i.created_at,
      'updated_at', i.updated_at, 'last_confirmed_at', i.last_confirmed_at,
      'ended_at', i.ended_at, 'active', i.active, 'visibility', i.visibility, 'provenance', i.provenance, 'source', i.source
    ) ORDER BY i.updated_at DESC, i.id), '[]'::jsonb)
     FROM community_intent_statements i JOIN candidates c ON c.community_id = i.author_community_id
     WHERE i.active AND i.voided_at IS NULL AND i.intent_type = 'seeking' AND i.starts_at <= now() AND (i.expires_at IS NULL OR i.expires_at > now()) AND i.visibility IN ('public', 'nearify') LIMIT 100),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id, 'episode_id', i.episode_id, 'author_nearify_user_id', c.nearify_user_id,
      'subject_type', i.subject_type,
      'subject_id', CASE WHEN i.subject_type = 'community_profile' THEN NULL ELSE i.subject_id END,
      'subject_nearify_user_id', CASE WHEN i.subject_type = 'community_profile' THEN c.nearify_user_id ELSE NULL END,
      'nearify_user_id', c.nearify_user_id, 'intent_type', i.intent_type,
      'subject_key', i.subject_key, 'subject_label', i.subject_label, 'statement', i.statement,
      'starts_at', i.starts_at, 'expires_at', i.expires_at, 'created_at', i.created_at,
      'updated_at', i.updated_at, 'last_confirmed_at', i.last_confirmed_at,
      'ended_at', i.ended_at, 'active', i.active, 'visibility', i.visibility, 'provenance', i.provenance, 'source', i.source
    ) ORDER BY i.updated_at DESC, i.id), '[]'::jsonb)
     FROM community_intent_statements i JOIN candidates c ON c.community_id = i.author_community_id
     WHERE i.active AND i.voided_at IS NULL AND i.intent_type = 'offering' AND i.starts_at <= now() AND (i.expires_at IS NULL OR i.expires_at > now()) AND i.visibility IN ('public', 'nearify') LIMIT 100),
    (SELECT COALESCE(jsonb_agg(p ORDER BY p.started_at DESC NULLS LAST), '[]'::jsonb)
     FROM (
       SELECT 'theme'::text AS object_type, tp.theme_id AS object_id, c.nearify_user_id,
              CASE WHEN tp.engagement_level = 'participating' AND (tp.participation_expires_at IS NULL OR tp.participation_expires_at > now()) THEN 'current' ELSE 'historical_or_exploring' END AS state,
              COALESCE(tp.participation_confirmed_at, tp.joined_at) AS started_at,
              tp.participation_expires_at AS expires_at
       FROM theme_participants tp JOIN candidates c ON c.community_id = tp.community_id
       UNION ALL
       SELECT 'project'::text, pm.project_id, c.nearify_user_id, 'current'::text, pm.joined_at, NULL::timestamptz
       FROM project_members pm JOIN candidates c ON c.community_id = pm.user_id
       JOIN projects p2 ON p2.id = pm.project_id
       WHERE p2.status IN ('open', 'active') AND pm.left_at IS NULL
       UNION ALL
       SELECT 'organization'::text, om.organization_id, c.nearify_user_id, 'current'::text, om.joined_at, NULL::timestamptz
       FROM organization_members om JOIN candidates c ON c.community_id = om.community_id
       JOIN organizations o2 ON o2.id = om.organization_id
       WHERE o2.status = 'active' AND om.status = 'active'
     ) p),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'object_type', e.object_type, 'object_id', e.object_id, 'author_nearify_user_id', c.nearify_user_id,
      'subject_type', e.subject_type, 'subject_id', CASE WHEN e.subject_type = 'community_profile' THEN NULL ELSE e.subject_id END,
      'subject_nearify_user_id', CASE WHEN e.subject_type = 'community_profile' THEN c.nearify_user_id ELSE NULL END,
      'nearify_user_id', c.nearify_user_id, 'state', e.event_type, 'occurred_at', e.occurred_at, 'visibility', e.visibility,
      'provenance', e.provenance, 'source', e.source, 'metadata', e.metadata
    ) ORDER BY occurred_at DESC), '[]'::jsonb)
     FROM community_intelligence_events e JOIN candidates c ON c.community_id = e.author_community_id
     WHERE e.visibility IN ('public', 'nearify')
       AND NOT EXISTS (SELECT 1 FROM community_intelligence_events correction WHERE correction.correction_of_event_id = e.id)
     LIMIT 100),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'subject_key', s.subject_key, 'subject_label', s.subject_label,
      'seeking', jsonb_build_object('id', s.id, 'episode_id', s.episode_id, 'nearify_user_id', sc.nearify_user_id, 'statement', s.statement, 'updated_at', s.updated_at),
      'offering', jsonb_build_object('id', o.id, 'episode_id', o.episode_id, 'nearify_user_id', oc.nearify_user_id, 'statement', o.statement, 'updated_at', o.updated_at)
    ) ORDER BY s.subject_key), '[]'::jsonb)
     FROM community_intent_statements s JOIN candidates sc ON sc.community_id = s.author_community_id
     JOIN community_intent_statements o ON o.subject_key = s.subject_key AND o.intent_type = 'offering'
     JOIN candidates oc ON oc.community_id = o.author_community_id
     WHERE s.intent_type = 'seeking' AND s.subject_type = 'community_profile' AND o.subject_type = 'community_profile' AND s.active AND o.active AND s.voided_at IS NULL AND o.voided_at IS NULL AND s.author_community_id <> o.author_community_id
       AND s.starts_at <= now() AND o.starts_at <= now()
       AND (s.expires_at IS NULL OR s.expires_at > now()) AND (o.expires_at IS NULL OR o.expires_at > now())
       AND s.visibility IN ('public', 'nearify') AND o.visibility IN ('public', 'nearify') LIMIT 50)
  INTO v_projects, v_themes, v_orgs, v_opportunities, v_seeking, v_offering, v_participation, v_updates, v_overlaps;

  RETURN jsonb_build_object(
    'success', true,
    'projects', v_projects,
    'themes', v_themes,
    'organizations', v_orgs,
    'opportunities', v_opportunities,
    'seeking', v_seeking,
    'offering', v_offering,
    'participation', v_participation,
    'object_updates', v_updates,
    'seeking_offering_overlaps', v_overlaps
  );
END;
$$;


--
-- Name: get_nearify_event_peers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_event_peers() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_result       JSONB;
BEGIN
  -- Resolve current user's community ID
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found');
  END IF;

  -- Build event → peers structure
  WITH my_edges AS (
    SELECT
      ie.id          AS edge_id,
      CASE
        WHEN ie.from_user_id = v_community_id THEN ie.to_user_id
        ELSE ie.from_user_id
      END            AS peer_id,
      ie.status,
      ie.confidence,
      ie.created_at  AS interacted_at,
      ie.meta->>'event_id'    AS event_id,
      ie.meta->>'event_name'  AS event_name,
      ie.meta->>'signal_type' AS signal_type,
      (ie.meta->>'occurred_at') AS occurred_at
    FROM interaction_edges ie
    WHERE (ie.from_user_id = v_community_id OR ie.to_user_id = v_community_id)
      AND ie.status NOT IN ('ignored', 'blocked')
  ),
  -- A member hidden from discovery appears only to their accepted
  -- connections: nobody else gets their name, bio, photo, profile id, edge
  -- id or the events they were at. The encounters themselves are kept.
  visible_edges AS (
    SELECT e.*
    FROM my_edges e
    WHERE NOT EXISTS (
            SELECT 1 FROM community h
            WHERE h.id = e.peer_id AND h.is_hidden IS TRUE)
       OR EXISTS (
            SELECT 1 FROM connections k
            WHERE k.status = 'accepted'
              AND ((k.from_user_id = v_community_id AND k.to_user_id = e.peer_id)
                OR (k.to_user_id = v_community_id AND k.from_user_id = e.peer_id)))
  ),
  -- One row per (event_group, peer) — keep best edge (QR > BLE, then highest confidence)
  best_edges AS (
    SELECT DISTINCT ON (COALESCE(event_id, 'unknown'), peer_id)
      edge_id, peer_id, status, confidence, interacted_at,
      event_id, event_name, signal_type, occurred_at
    FROM visible_edges
    ORDER BY
      COALESCE(event_id, 'unknown'),
      peer_id,
      CASE WHEN signal_type = 'qr_confirmed' THEN 0 ELSE 1 END,
      confidence DESC NULLS LAST
  ),
  peer_profiles AS (
    SELECT
      e.edge_id,
      e.peer_id,
      e.status,
      e.confidence,
      e.interacted_at,
      e.event_id,
      COALESCE(e.event_name, 'Nearify Event') AS event_name,
      COALESCE(e.signal_type, 'proximity')    AS signal_type,
      COALESCE(e.occurred_at::text, e.interacted_at::text) AS occurred_at,
      c.name        AS peer_name,
      c.image_url   AS peer_avatar,
      c.bio         AS peer_headline
    FROM best_edges e
    LEFT JOIN community c ON c.id = e.peer_id
  ),
  grouped AS (
    SELECT
      COALESCE(event_id, 'unknown') AS ev_id,
      event_name,
      MIN(occurred_at) AS earliest_interaction,
      jsonb_agg(
        jsonb_build_object(
          'edge_id',      edge_id,
          'community_id', peer_id,
          'name',         COALESCE(peer_name, 'Unknown'),
          'avatar_url',   peer_avatar,
          'headline',     peer_headline,
          'signal_type',  signal_type,
          'status',       status,
          'confidence',   confidence,
          'occurred_at',  occurred_at
        )
        ORDER BY occurred_at DESC
      ) AS peers
    FROM peer_profiles
    GROUP BY ev_id, event_name
  )
  SELECT jsonb_build_object(
    'success', true,
    'community_id', v_community_id,
    'events', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'event_id',   ev_id,
          'event_name', event_name,
          'occurred_at', earliest_interaction,
          'peers',      peers
        )
        ORDER BY earliest_interaction DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM grouped;

  RETURN COALESCE(v_result, jsonb_build_object('success', true, 'events', '[]'::jsonb));
END;
$$;


--
-- Name: get_nearify_event_recommendations(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_event_recommendations(p_nearify_event_id text, p_limit integer DEFAULT 3) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id  UUID;
  v_caller_status TEXT;
  v_limit INT;
  v_result JSONB;
BEGIN
  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  -- Identity resolved server-side from the caller's own authenticated
  -- session only — see header comment.
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM nearify_event_presence
    WHERE community_id = v_community_id
      AND nearify_event_id = trim(p_nearify_event_id)
      AND status = 'joined'
      AND is_live = true
  ) THEN
    RETURN jsonb_build_object('success', true, 'nearify_event_id', p_nearify_event_id, 'recommendations', '[]'::jsonb);
  END IF;

  -- Caller-side authorization gate — same semantics as
  -- get_nearify_live_attendee_signals: 'authorized' and
  -- 'needs_reconfirmation' both continue serving personalization FOR
  -- the caller (the latter exists to preserve what was already
  -- disclosed to existing links during the migration window);
  -- 'revoked' or no row ('none') yields no recommendations, returned
  -- as the same empty shape the client already treats as a normal
  -- cold-start/no-candidates outcome — never a distinct error.
  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'nearify_event_id', p_nearify_event_id, 'recommendations', '[]'::jsonb);
  END IF;

  -- Hard server-side cap regardless of what the caller requests — this
  -- answers "who should I meet," not an attendee directory.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 3), 1), 5);

  WITH me AS (
    SELECT id, skills FROM community WHERE id = v_community_id
  ),
  my_skills AS (
    SELECT DISTINCT trim(lower(s)) AS skill
    FROM me, unnest(string_to_array(coalesce(me.skills, ''), ',')) AS s
    WHERE trim(s) <> ''
  ),
  my_projects AS (
    SELECT DISTINCT project_id FROM project_members WHERE user_id = v_community_id
  ),
  my_orgs AS (
    SELECT DISTINCT organization_id FROM organization_members WHERE community_id = v_community_id
  ),
  my_partners AS (
    SELECT DISTINCT CASE WHEN from_user_id = v_community_id THEN to_user_id ELSE from_user_id END AS partner
    FROM connections
    WHERE status = 'accepted' AND (from_user_id = v_community_id OR to_user_id = v_community_id)
  ),
  -- Candidate generation: other linked users currently joined to the
  -- same event. RLS on nearify_event_presence already scopes what a
  -- normal client query could see, but this RPC is SECURITY DEFINER
  -- and explicitly excludes self here regardless.
  co_attendees AS (
    SELECT DISTINCT community_id
    FROM nearify_event_presence
    WHERE nearify_event_id = p_nearify_event_id
      AND status = 'joined'
      AND is_live = true
      AND community_id <> v_community_id
  ),
  -- Exclude anyone already meaningfully connected, and require the
  -- candidate to be 'authorized' for the nearify experience — a
  -- candidate merely 'needs_reconfirmation' or 'revoked' (or with no
  -- authorization row at all) must never be recommended to, or
  -- explained via, another Nearify participant. This narrows
  -- candidate generation; it never broadens it beyond the existing
  -- co-attendee-and-not-already-connected set.
  eligible AS (
    SELECT ca.community_id
    FROM co_attendees ca
    JOIN community_experience_authorizations cea
      ON cea.community_id = ca.community_id
     AND cea.experience   = 'nearify'
     AND cea.status       = 'authorized'
    WHERE NOT EXISTS (
      SELECT 1 FROM connections c
      WHERE c.status = 'accepted'
        AND ((c.from_user_id = v_community_id AND c.to_user_id = ca.community_id)
          OR (c.from_user_id = ca.community_id AND c.to_user_id = v_community_id))
    )
  ),
  candidate_profiles AS (
    SELECT c.id, c.name, c.image_url, c.skills, c.role, c.bio
    FROM community c
    WHERE c.id IN (SELECT community_id FROM eligible)
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  ),
  scored AS (
    SELECT
      cp.name, cp.image_url, cp.skills, cp.role, cp.bio,
      (
        SELECT count(*) FROM unnest(string_to_array(coalesce(cp.skills, ''), ',')) s
        WHERE trim(lower(s)) IN (SELECT skill FROM my_skills) AND trim(s) <> ''
      ) AS shared_skill_count,
      (
        SELECT count(*) FROM project_members pm
        WHERE pm.user_id = cp.id AND pm.project_id IN (SELECT project_id FROM my_projects)
      ) AS shared_project_count,
      (
        SELECT count(*) FROM organization_members om
        WHERE om.community_id = cp.id AND om.organization_id IN (SELECT organization_id FROM my_orgs)
      ) AS shared_org_count,
      (
        SELECT count(*) FROM (
          SELECT DISTINCT CASE WHEN from_user_id = cp.id THEN to_user_id ELSE from_user_id END AS partner
          FROM connections
          WHERE status = 'accepted' AND (from_user_id = cp.id OR to_user_id = cp.id)
        ) their_partners
        WHERE their_partners.partner IN (SELECT partner FROM my_partners)
      ) AS mutual_connection_count
    FROM candidate_profiles cp
  ),
  ranked AS (
    SELECT *,
      -- shared_nearify_event is a guaranteed baseline (true for every
      -- row by construction — this candidate is, definitionally, at
      -- the same event) plus additive weight per additional signal
      -- present, mirroring _buildPeopleWorthKnowing's weight table
      -- (shared_project:5, mutual_connections:4, shared_organization:4,
      -- shared_skill:2 per matching skill, capped).
      6
      + public.nearify_professional_context_score(
          shared_project_count, mutual_connection_count, shared_org_count, shared_skill_count
        )
      AS score
    FROM scored
  ),
  top_n AS (
    SELECT * FROM ranked ORDER BY score DESC, name ASC LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'success', true,
    'nearify_event_id', p_nearify_event_id,
    'recommendations', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', name,
          'avatar_url', image_url,
          'role', role,
          'headline', NULLIF(trim(coalesce(skills, '')), ''),
          'bio', bio,
          'score', score,
          'reasons', (
            SELECT jsonb_agg(reason) FROM (
              SELECT jsonb_build_object('type', 'shared_event') AS reason
              UNION ALL
              SELECT jsonb_build_object('type', 'shared_skill', 'count', shared_skill_count)
              WHERE shared_skill_count > 0
              UNION ALL
              SELECT jsonb_build_object('type', 'shared_project', 'count', shared_project_count)
              WHERE shared_project_count > 0
              UNION ALL
              SELECT jsonb_build_object('type', 'shared_organization', 'count', shared_org_count)
              WHERE shared_org_count > 0
              UNION ALL
              SELECT jsonb_build_object('type', 'mutual_connections', 'count', mutual_connection_count)
              WHERE mutual_connection_count > 0
            ) reasons
          )
        )
        ORDER BY score DESC, name ASC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM top_n;

  RETURN v_result;
END;
$$;


--
-- Name: get_nearify_link_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_link_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id  UUID;
  v_nearify_id    TEXT;
  v_linked_at     TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  SELECT nearify_user_id, linked_at
  INTO v_nearify_id, v_linked_at
  FROM nearify_identity_map
  WHERE community_id = v_community_id
  LIMIT 1;

  IF v_nearify_id IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  RETURN jsonb_build_object(
    'linked',           true,
    'nearify_user_id',  v_nearify_id,
    'linked_at',        v_linked_at
  );
END;
$$;


--
-- Name: get_nearify_live_attendee_signals(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_live_attendee_signals(p_nearify_user_ids text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id  UUID;
  v_caller_status TEXT;
  v_ids           TEXT[];
  v_result        JSONB;
BEGIN
  -- Identity resolved EXCLUSIVELY from auth.uid(), same as
  -- get_nearify_event_recommendations — this RPC only ever answers "how
  -- relevant are these candidates to the CALLING user."
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  -- Caller-side authorization gate. 'authorized' and
  -- 'needs_reconfirmation' are both allowed here: needs_reconfirmation
  -- exists specifically to preserve previously-disclosed
  -- personalization-FOR the caller during the migration window — see
  -- community_experience_authorizations.sql. 'revoked' or no row at
  -- all ('none') yields no enrichment, returned as a normal empty
  -- success rather than an error — identical, non-blocking shape to
  -- every other "nothing to enrich" outcome this RPC already produces.
  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'signals', '{}'::jsonb);
  END IF;

  IF p_nearify_user_ids IS NULL OR array_length(p_nearify_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'signals', '{}'::jsonb);
  END IF;

  -- Bound and sanitize the input: dedupe, drop blanks, hard-cap batch size.
  -- A live attendee roster is small by construction; this cap exists only
  -- to prevent an abusive arbitrarily-large request, not because a
  -- realistic roster would approach it.
  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(p_nearify_user_ids) AS x
  WHERE trim(x) <> '';

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'signals', '{}'::jsonb);
  END IF;

  IF array_length(v_ids, 1) > 50 THEN
    v_ids := v_ids[1:50];
  END IF;

  WITH me AS (
    SELECT id, skills FROM community WHERE id = v_community_id
  ),
  my_skills AS (
    SELECT DISTINCT trim(lower(s)) AS skill
    FROM me, unnest(string_to_array(coalesce(me.skills, ''), ',')) AS s
    WHERE trim(s) <> ''
  ),
  my_projects AS (
    SELECT DISTINCT project_id FROM project_members WHERE user_id = v_community_id
  ),
  my_orgs AS (
    SELECT DISTINCT organization_id FROM organization_members WHERE community_id = v_community_id
  ),
  my_partners AS (
    SELECT DISTINCT CASE WHEN from_user_id = v_community_id THEN to_user_id ELSE from_user_id END AS partner
    FROM connections
    WHERE status = 'accepted' AND (from_user_id = v_community_id OR to_user_id = v_community_id)
  ),
  -- Resolve each candidate Nearify ID to a Buildspace identity, server-side.
  -- Silently excluded (no key emitted for that ID at all): no
  -- identity_map entry, a hidden profile, or a candidate that resolves
  -- back to the caller.
  candidates AS (
    SELECT DISTINCT nim.nearify_user_id, nim.community_id
    FROM nearify_identity_map nim
    JOIN community c ON c.id = nim.community_id
    -- Candidate-side authorization gate: ONLY an 'authorized' candidate
    -- may be enriched/explained to another Nearify participant.
    -- needs_reconfirmation, revoked, and no-row all behave identically
    -- to "no usable enrichment for this candidate" — no different than
    -- an unresolved identity, silently excluded (no key emitted) rather
    -- than surfaced with a distinguishing flag.
    JOIN community_experience_authorizations cea
      ON cea.community_id = nim.community_id
     AND cea.experience   = 'nearify'
     AND cea.status       = 'authorized'
    WHERE nim.nearify_user_id = ANY(v_ids)
      AND nim.community_id <> v_community_id
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  ),
  scored AS (
    SELECT
      cand.nearify_user_id,
      (
        SELECT count(*) FROM unnest(string_to_array(coalesce(c.skills, ''), ',')) s
        WHERE trim(lower(s)) IN (SELECT skill FROM my_skills) AND trim(s) <> ''
      ) AS shared_skill_count,
      (
        SELECT count(*) FROM project_members pm
        WHERE pm.user_id = cand.community_id AND pm.project_id IN (SELECT project_id FROM my_projects)
      ) AS shared_project_count,
      (
        SELECT count(*) FROM organization_members om
        WHERE om.community_id = cand.community_id AND om.organization_id IN (SELECT organization_id FROM my_orgs)
      ) AS shared_org_count,
      (
        SELECT count(*) FROM (
          SELECT DISTINCT CASE WHEN from_user_id = cand.community_id THEN to_user_id ELSE from_user_id END AS partner
          FROM connections
          WHERE status = 'accepted' AND (from_user_id = cand.community_id OR to_user_id = cand.community_id)
        ) their_partners
        WHERE their_partners.partner IN (SELECT partner FROM my_partners)
      ) AS mutual_connection_count
    FROM candidates cand
    JOIN community c ON c.id = cand.community_id
  ),
  ranked AS (
    SELECT
      nearify_user_id,
      shared_skill_count, shared_project_count, shared_org_count, mutual_connection_count,
      -- Same weighting as get_nearify_event_recommendations, minus its
      -- +6 shared_event baseline (no equivalent concept here).
      public.nearify_professional_context_score(
          shared_project_count, mutual_connection_count, shared_org_count, shared_skill_count
        )
      AS score
    FROM scored
  )
  SELECT jsonb_object_agg(
    nearify_user_id,
    jsonb_build_object(
      'score', score,
      'reasons', (
        SELECT COALESCE(jsonb_agg(reason), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('type', 'shared_skill', 'count', shared_skill_count) AS reason
          WHERE shared_skill_count > 0
          UNION ALL
          SELECT jsonb_build_object('type', 'shared_project', 'count', shared_project_count)
          WHERE shared_project_count > 0
          UNION ALL
          SELECT jsonb_build_object('type', 'shared_organization', 'count', shared_org_count)
          WHERE shared_org_count > 0
          UNION ALL
          SELECT jsonb_build_object('type', 'mutual_connections', 'count', mutual_connection_count)
          WHERE mutual_connection_count > 0
        ) reasons
      )
    )
  )
  INTO v_result
  FROM ranked;

  RETURN jsonb_build_object(
    'success', true,
    'signals', COALESCE(v_result, '{}'::jsonb)
  );
END;
$$;


--
-- Name: get_nearify_relationship_enrichment(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearify_relationship_enrichment(p_nearify_user_ids text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id  UUID;
  v_caller_status TEXT;
  v_ids           TEXT[];
  v_result        JSONB;
BEGIN
  -- Identity resolved EXCLUSIVELY from auth.uid() — this RPC only ever
  -- answers "what may I show about these candidates to the CALLING user."
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found for current user');
  END IF;

  -- Caller-side authorization gate — identical semantics to the
  -- existing live-signals RPC.
  SELECT status INTO v_caller_status
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify';
  IF v_caller_status IS NULL OR v_caller_status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'enrichment', '{}'::jsonb);
  END IF;

  IF p_nearify_user_ids IS NULL OR array_length(p_nearify_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'enrichment', '{}'::jsonb);
  END IF;

  -- Bound and sanitize input. A between-events caller supplies exactly
  -- one already-selected Continue With person in practice; this cap
  -- exists only to prevent an abusive arbitrarily-large request.
  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(p_nearify_user_ids) AS x
  WHERE trim(x) <> '';

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'enrichment', '{}'::jsonb);
  END IF;

  IF array_length(v_ids, 1) > 10 THEN
    v_ids := v_ids[1:10];
  END IF;

  WITH me AS (
    SELECT id, skills FROM community WHERE id = v_community_id
  ),
  my_skills AS (
    SELECT DISTINCT trim(lower(s)) AS skill
    FROM me, unnest(string_to_array(coalesce(me.skills, ''), ',')) AS s
    WHERE trim(s) <> ''
  ),
  my_projects AS (
    SELECT DISTINCT project_id FROM project_members WHERE user_id = v_community_id
  ),
  my_orgs AS (
    SELECT DISTINCT organization_id FROM organization_members WHERE community_id = v_community_id
  ),
  my_partners AS (
    SELECT DISTINCT CASE WHEN from_user_id = v_community_id THEN to_user_id ELSE from_user_id END AS partner
    FROM connections
    WHERE status = 'accepted' AND (from_user_id = v_community_id OR to_user_id = v_community_id)
  ),
  -- Resolve each candidate Nearify ID to a Buildspace identity,
  -- server-side, exactly as get_nearify_live_attendee_signals.
  candidates AS (
    SELECT DISTINCT nim.nearify_user_id, nim.community_id
    FROM nearify_identity_map nim
    JOIN community c ON c.id = nim.community_id
    JOIN community_experience_authorizations cea
      ON cea.community_id = nim.community_id
     AND cea.experience   = 'nearify'
     AND cea.status       = 'authorized'
    WHERE nim.nearify_user_id = ANY(v_ids)
      AND nim.community_id <> v_community_id
      AND (c.is_hidden IS NULL OR c.is_hidden = false)
  )
  SELECT jsonb_object_agg(
    cand.nearify_user_id,
    jsonb_build_object(
      -- ---- Tier A: shared/mutual ----
      'shared_skills', (
        SELECT COALESCE(jsonb_agg(DISTINCT s), '[]'::jsonb)
        FROM unnest(string_to_array(coalesce(c.skills, ''), ',')) s
        WHERE trim(lower(s)) IN (SELECT skill FROM my_skills) AND trim(s) <> ''
      ),
      'shared_projects', (
        SELECT COALESCE(jsonb_agg(DISTINCT p.title), '[]'::jsonb)
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = cand.community_id
          AND pm.project_id IN (SELECT project_id FROM my_projects)
          AND p.status IN ('open', 'active', 'completed')
      ),
      'shared_organizations', (
        SELECT COALESCE(jsonb_agg(DISTINCT o.name), '[]'::jsonb)
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.community_id = cand.community_id
          AND om.organization_id IN (SELECT organization_id FROM my_orgs)
          AND o.status = 'active'
      ),
      'mutual_connection_count', (
        SELECT count(*) FROM (
          SELECT DISTINCT CASE WHEN from_user_id = cand.community_id THEN to_user_id ELSE from_user_id END AS partner
          FROM connections
          WHERE status = 'accepted' AND (from_user_id = cand.community_id OR to_user_id = cand.community_id)
        ) their_partners
        WHERE their_partners.partner IN (SELECT partner FROM my_partners)
      ),
      -- ---- Tier B: true about them, publicly visible under existing policy ----
      'their_projects', (
        SELECT COALESCE(jsonb_agg(DISTINCT p.title), '[]'::jsonb)
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = cand.community_id AND p.status IN ('open', 'active', 'completed')
      ),
      'their_organizations', (
        SELECT COALESCE(jsonb_agg(DISTINCT o.name), '[]'::jsonb)
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.community_id = cand.community_id AND om.status = 'active' AND o.status = 'active'
      ),
      'their_themes', (
        SELECT COALESCE(jsonb_agg(DISTINCT tc.title), '[]'::jsonb)
        FROM theme_participants tp
        JOIN theme_circles tc ON tc.id = tp.theme_id
        WHERE tp.community_id = cand.community_id
          AND tc.status = 'active'
          AND (tc.expires_at IS NULL OR tc.expires_at > now())
      ),
      -- Only the 'posted' relationship is schema-supportable — see
      -- header comment. No project_team_member type: opportunities has
      -- no project_id column at all.
      'related_active_opportunities', (
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
          'title', opp.title,
          'organization_name', org.name,
          'relationship', 'posted'
        )), '[]'::jsonb)
        FROM opportunities opp
        LEFT JOIN organizations org ON org.id = opp.organization_id
        WHERE opp.posted_by = cand.community_id
          AND opp.status = 'open'
          AND (opp.application_deadline IS NULL OR opp.application_deadline > now())
          AND (opp.is_public IS NULL OR opp.is_public = true)
      )
    )
  )
  INTO v_result
  FROM candidates cand
  JOIN community c ON c.id = cand.community_id;

  RETURN jsonb_build_object(
    'success', true,
    'enrichment', COALESCE(v_result, '{}'::jsonb)
  );
END;
$$;


--
-- Name: get_or_create_conversation(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_conversation(other_user_id uuid, ctx_type text DEFAULT NULL::text, ctx_id uuid DEFAULT NULL::uuid, ctx_title text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_user_community_id UUID;
  other_user_community_id UUID;
  conversation_id UUID;
  p1_id UUID;
  p2_id UUID;
BEGIN
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO other_user_community_id
  FROM public.community
  WHERE user_id = other_user_id
  LIMIT 1;

  IF current_user_community_id IS NULL THEN
    RAISE EXCEPTION 'Current user not found in community table';
  END IF;

  IF other_user_community_id IS NULL THEN
    RAISE EXCEPTION 'Other user not found in community table';
  END IF;

  IF current_user_community_id < other_user_community_id THEN
    p1_id := current_user_community_id;
    p2_id := other_user_community_id;
  ELSE
    p1_id := other_user_community_id;
    p2_id := current_user_community_id;
  END IF;

  SELECT id INTO conversation_id
  FROM public.conversations
  WHERE (participant_1_id = p1_id AND participant_2_id = p2_id)
     OR (participant_1_id = p2_id AND participant_2_id = p1_id)
  LIMIT 1;

  IF conversation_id IS NOT NULL THEN
    RETURN conversation_id;
  END IF;

  INSERT INTO public.conversations (
    participant_1_id, participant_2_id, context_type, context_id,
    context_title, created_at, updated_at
  ) VALUES (
    p1_id, p2_id, ctx_type, ctx_id, ctx_title, NOW(), NOW()
  )
  RETURNING id INTO conversation_id;

  RETURN conversation_id;
END;
$$;


--
-- Name: get_project_interest_requests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_project_interest_requests(p_project_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_title TEXT;
  v_requests JSONB;
BEGIN
  SELECT p.title INTO v_title
  FROM public.projects p
  JOIN public.community owner ON owner.id = p.creator_id
  WHERE p.id = p_project_id
    AND owner.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authorized: project owner required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pm.id,
      'user', jsonb_build_object(
        'id', requester.id,
        'name', requester.name,
        'email', NULL::text,
        'image_url', requester.image_url,
        'bio', requester.bio,
        'skills', requester.skills
      ),
      'followups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', f.id,
          'channel', f.channel,
          'initiated_at', f.initiated_at
        ) ORDER BY f.initiated_at DESC)
        FROM public.project_interest_followups f
        WHERE f.project_member_id = pm.id
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb) INTO v_requests
  FROM public.project_members pm
  JOIN public.community requester ON requester.id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND pm.role = 'pending';

  RETURN jsonb_build_object('project_title', v_title, 'requests', v_requests);
END;
$$;


--
-- Name: get_pulse_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pulse_metrics() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT json_build_object(
    'members',         (SELECT count(*)::int FROM community
                        WHERE is_hidden IS NULL OR is_hidden = false),
    'connections',     (SELECT count(*)::int FROM connections),
    'active_projects', (SELECT count(*)::int FROM projects
                        WHERE status = 'active')
  );
$$;


--
-- Name: get_recent_interactions(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_recent_interactions(p_user_id uuid, p_days integer DEFAULT 7) RETURNS TABLE(node_id uuid, node_type text, interaction_type text, interaction_count bigint, last_interaction timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ni.node_id,
    ni.node_type,
    ni.interaction_type,
    COUNT(*) as interaction_count,
    MAX(ni.created_at) as last_interaction
  FROM node_interactions ni
  WHERE ni.user_id = p_user_id
    AND ni.created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY ni.node_id, ni.node_type, ni.interaction_type
  ORDER BY last_interaction DESC;
END;
$$;


--
-- Name: get_skill_endorsements(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_skill_endorsements(user_uuid uuid, skill_name text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM endorsements
    WHERE endorsed_id = user_uuid AND skill = skill_name
  );
END;
$$;


--
-- Name: get_start_sequence_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_start_sequence_data(auth_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result JSON;
  user_community_id UUID;
  -- community.skills is a TEXT[] column in some environments and a
  -- comma-separated TEXT string in others. Reading it straight into
  -- `skill = ANY(c.skills)` fails wherever it is the string form with
  -- "op ANY/ALL (array) requires array on right side", which aborts the whole
  -- RPC and takes the entire Network Reflection payload down. Read it as text
  -- and normalise it to a real array once, up front, so every downstream use
  -- is array-typed regardless of how the column is stored.
  user_skills TEXT[];
  skills_raw TEXT;
BEGIN
  SELECT id, skills::text
  INTO user_community_id, skills_raw
  FROM community
  WHERE user_id = auth_user_id
  LIMIT 1;

  IF skills_raw IS NULL OR btrim(skills_raw) = '' THEN
    user_skills := ARRAY[]::TEXT[];
  ELSIF skills_raw LIKE '{%}' THEN
    -- Already stored in Postgres array literal form.
    user_skills := skills_raw::TEXT[];
  ELSE
    -- Comma-separated string -- split and trim into a real array.
    user_skills := ARRAY(
      SELECT btrim(part)
      FROM unnest(string_to_array(skills_raw, ',')) AS part
      WHERE btrim(part) <> ''
    );
  END IF;

  IF user_community_id IS NULL THEN
    RETURN json_build_object(
      'error', 'No community profile found',
      'has_profile', false
    );
  END IF;

  SELECT json_build_object(
    'profile', json_build_object(
      'id', c.id,
      'name', c.name,
      'email', NULL::text,
      'image_url', c.image_url,
      'bio', c.bio,
      'skills', user_skills,
      'interests', c.interests,
      'user_role', c.user_role,
      'profile_completed', c.profile_completed
    ),

    'progress', json_build_object(
      'xp', COALESCE(c.xp, 0),
      'level', COALESCE(c.level, 1),
      'login_streak', COALESCE(c.login_streak, 0),
      'last_login', c.last_login,
      'connection_count', COALESCE(c.connection_count, 0),
      'projects_created', COALESCE(c.projects_created, 0),
      'projects_joined', COALESCE(c.projects_joined, 0),
      'endorsements_given', COALESCE(c.endorsements_given, 0),
      'endorsements_received', COALESCE(c.endorsements_received, 0)
    ),

    'immediate_actions', json_build_object(
      'pending_requests', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM connections
          WHERE to_user_id = user_community_id
          AND status = 'pending'
        ),
        'items', '[]'::json
      ),

      'unread_messages', json_build_object(
        'count', (
          SELECT COUNT(DISTINCT conversation_id)::int
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          WHERE (conv.participant_1_id = user_community_id OR conv.participant_2_id = user_community_id)
          AND m.sender_id != user_community_id
          AND m.read = false
        ),
        'conversations', '[]'::json
      ),

      -- Threads where the reader sent the most recent message and is now
      -- waiting to hear back -- the mirror image of unread_messages.  The
      -- Reflection surfaces this separately so "waiting on your reply" and
      -- "you're waiting to hear back" are not conflated.
      'messages_awaiting_reply', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM conversations conv
          WHERE (conv.participant_1_id = user_community_id OR conv.participant_2_id = user_community_id)
          AND (
            SELECT m.sender_id
            FROM messages m
            WHERE m.conversation_id = conv.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) = user_community_id
        ),
        'conversations', '[]'::json
      ),

      'pending_bids', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM project_bids
          WHERE user_id = auth_user_id
          AND status = 'pending'
        ),
        'items', '[]'::json
      ),

      'bids_to_review', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM project_bids pb
          JOIN projects p ON p.id = pb.project_id
          WHERE p.creator_id = auth_user_id
          AND pb.status = 'pending'
        ),
        'items', '[]'::json
      )
    ),

    'opportunities', json_build_object(
      'skill_matched_projects', json_build_object(
        'count', CASE
          WHEN array_length(user_skills, 1) > 0 THEN (
            SELECT COUNT(*)::int
            FROM projects p
            WHERE p.status = 'open'
            AND p.creator_id != auth_user_id
            AND p.required_skills IS NOT NULL
            AND array_length(p.required_skills, 1) > 0
            AND EXISTS (
              SELECT 1 FROM unnest(p.required_skills) skill
              WHERE skill = ANY(user_skills)
            )
          )
          ELSE 0
        END,
        'items', '[]'::json
      ),

      'active_themes', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM theme_circles
          WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        ),
        'items', '[]'::json
      ),

      'open_opportunities', json_build_object(
        -- The production opportunities table has no expires_at column, so an
        -- `expires_at IS NULL OR expires_at > NOW()` predicate raised
        -- "column \"expires_at\" does not exist" and aborted the whole RPC,
        -- taking the entire Network Reflection payload down with it. Count open
        -- opportunities the way the rest of the app does -- status = 'open'
        -- alone (see _loadReflectionOpportunityCount in start-daily-digest.js).
        'count', (
          SELECT COUNT(*)::int
          FROM opportunities
          WHERE status = 'open'
        ),
        'items', '[]'::json
      ),

      'complementary_connections', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM community other
          WHERE other.id != user_community_id
          AND other.skills IS NOT NULL
          -- text-safe "has any skills" check: works whether other.skills is a
          -- TEXT[] ('{a,b}') or a comma-separated TEXT string ('a,b').
          AND btrim(other.skills::text, '{} ') <> ''
          AND NOT EXISTS (
            SELECT 1 FROM connections conn
            WHERE ((conn.from_user_id = user_community_id AND conn.to_user_id = other.id)
               OR (conn.from_user_id = other.id AND conn.to_user_id = user_community_id))
            AND conn.status = 'accepted'
          )
        ),
        'items', '[]'::json
      )
    ),

    'momentum', json_build_object(
      'weekly_activity', (
        SELECT COUNT(*)::int
        FROM activity_log
        WHERE community_user_id = user_community_id
        AND created_at > NOW() - INTERVAL '7 days'
      ),

      'streak', json_build_object(
        'current', COALESCE(c.login_streak, 0),
        'last_login', c.last_login,
        'is_at_risk', (c.last_login < NOW() - INTERVAL '20 hours')
      ),

      'xp_progress', json_build_object(
        'current_xp', COALESCE(c.xp, 0),
        'current_level', COALESCE(c.level, 1),
        'next_level_xp', (COALESCE(c.level, 1) + 1) * 1000,
        'xp_to_next_level', ((COALESCE(c.level, 1) + 1) * 1000) - COALESCE(c.xp, 0),
        'progress_percentage', ROUND((COALESCE(c.xp, 0)::numeric / ((COALESCE(c.level, 1) + 1) * 1000)) * 100, 1)
      ),

      'recent_achievements', '[]'::json
    ),

    'network_insights', json_build_object(
      'connections', json_build_object(
        'total', COALESCE(c.connection_count, 0)
      ),

      'active_projects', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = auth_user_id
          AND pm.left_at IS NULL
          AND p.status IN ('open', 'in_progress')
        ),
        'items', '[]'::json
      ),

      'participating_themes', json_build_object(
        'count', (
          SELECT COUNT(*)::int
          FROM theme_participants tp
          JOIN theme_circles tc ON tc.id = tp.theme_id
          WHERE tp.community_id = user_community_id
          AND tc.status = 'active'
        ),
        'items', '[]'::json
      ),

      'growth', json_build_object(
        'new_connections', (
          SELECT COUNT(*)::int FROM connections
          WHERE (from_user_id = user_community_id OR to_user_id = user_community_id)
          AND status = 'accepted'
          AND created_at > NOW() - INTERVAL '30 days'
        ),
        'new_projects', (
          SELECT COUNT(*)::int FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = auth_user_id
          AND pm.joined_at > NOW() - INTERVAL '30 days'
        ),
        'new_themes', (
          SELECT COUNT(*)::int FROM theme_participants
          WHERE community_id = user_community_id
          AND joined_at > NOW() - INTERVAL '30 days'
        )
      )
    ),

    'recommendations', json_build_object(
      'priority_actions', '[]'::json
    ),

    'generated_at', NOW(),
    'has_profile', true

  ) INTO result
  FROM community c
  WHERE c.id = user_community_id;

  RETURN result;
END;
$$;


--
-- Name: get_unread_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_count() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_user_community_id UUID;
  unread_count INTEGER;
BEGIN
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF current_user_community_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.messages m
  WHERE m.read = FALSE
    AND m.sender_id != auth.uid()
    AND m.conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = current_user_community_id
         OR participant_2_id = current_user_community_id
    );

  RETURN COALESCE(unread_count, 0);
END;
$$;


--
-- Name: get_unread_notification_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_notification_count(user_id_param uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO count
  FROM notifications
  WHERE user_id = user_id_param AND read = false;
  
  RETURN COALESCE(count, 0);
END;
$$;


--
-- Name: guard_capability_verification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_capability_verification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE package_creator UUID;
BEGIN
  IF NEW.verification_status <> 'self_reported' THEN
    SELECT creator_id INTO package_creator
    FROM public.capability_packages
    WHERE id = NEW.capability_id;
    IF package_creator IS NULL
      OR package_creator = NEW.member_id
      OR NOT EXISTS (SELECT 1 FROM public.community WHERE id = package_creator AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Only a different package creator can verify an attempt';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_bid_acceptance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_bid_acceptance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    -- Add to project members
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (NEW.project_id, NEW.user_id, NEW.proposed_role)
    ON CONFLICT (project_id, user_id) DO NOTHING;
    
    -- Increment bid count in community
    UPDATE community 
    SET bids_accepted = COALESCE(bids_accepted, 0) + 1
    WHERE user_id = NEW.user_id;
    
    -- Auto-accept connection if not already connected
    INSERT INTO connections (from_user_id, to_user_id, status, type)
    SELECT 
      p.creator_id, 
      NEW.user_id, 
      'accepted', 
      'project'
    FROM projects p
    WHERE p.id = NEW.project_id
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: has_endorsed(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_endorsed(endorser_uuid uuid, endorsed_uuid uuid, skill_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM endorsements
    WHERE endorser_id = endorser_uuid 
      AND endorsed_id = endorsed_uuid 
      AND skill = skill_name
  );
END;
$$;


--
-- Name: increment_upvotes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_upvotes(idea_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE ideas SET upvotes = upvotes + 1 WHERE id = idea_uuid;
END;
$$;


--
-- Name: infer_ble_edges(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.infer_ble_edges(p_group_id uuid DEFAULT NULL::uuid, p_min_overlap_seconds integer DEFAULT 120, p_lookback_minutes integer DEFAULT 240) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  inserted_count int := 0;
  v_member uuid := public.authz_current_member_id();
  v_lookback int := least(greatest(coalesce(p_lookback_minutes, 240), 1), 1440);
  v_min_overlap int := greatest(coalesce(p_min_overlap_seconds, 120), 30);
begin
  if v_member is null then
    raise exception 'Sign in as a community member to generate suggestions'
      using errcode = '42501';
  end if;

  with recent as (
    select
      ps.user_id,
      ps.context_id as beacon_id,
      min(ps.created_at) as start_ts,
      max(coalesce(ps.last_seen, ps.updated_at, ps.created_at)) as end_ts,
      avg(coalesce(ps.energy, 0)) as avg_energy
    from public.presence_sessions ps
    join public.beacons b on b.id = ps.context_id
    where ps.context_type = 'beacon'
      and ps.created_at >= now() - make_interval(mins => v_lookback)
      and (p_group_id is null or b.group_id = p_group_id)
    group by ps.user_id, ps.context_id
  ),
  pairs as (
    select
      r1.beacon_id,
      least(r1.user_id, r2.user_id) as from_user_id,
      greatest(r1.user_id, r2.user_id) as to_user_id,
      greatest(r1.start_ts, r2.start_ts) as overlap_start,
      least(r1.end_ts, r2.end_ts) as overlap_end,
      greatest(
        0,
        extract(epoch from (least(r1.end_ts, r2.end_ts) - greatest(r1.start_ts, r2.start_ts)))
      )::int as overlap_seconds,
      ((r1.avg_energy + r2.avg_energy) / 2.0) as avg_energy
    from recent r1
    join recent r2
      on r1.beacon_id = r2.beacon_id
     and r1.user_id < r2.user_id
    where v_member in (r1.user_id, r2.user_id)
  ),
  candidates as (
    select * from pairs where overlap_seconds >= v_min_overlap
  ),
  ins as (
    insert into public.interaction_edges (
      from_user_id, to_user_id, status, type,
      beacon_id, overlap_seconds, confidence, meta
    )
    select
      c.from_user_id, c.to_user_id, 'suggested', 'ble_proximity',
      c.beacon_id, c.overlap_seconds,
      least(1.0, 0.45 + (c.overlap_seconds / 900.0) + (c.avg_energy / 10.0))::numeric,
      jsonb_build_object(
        'overlap_start', c.overlap_start,
        'overlap_end', c.overlap_end,
        'avg_energy', c.avg_energy
      )
    from candidates c
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from ins;

  return inserted_count;
end $$;


--
-- Name: ingest_nearify_event_presence(text, text, timestamp with time zone, text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_nearify_event_presence(p_nearify_event_id text, p_event_name text DEFAULT NULL::text, p_event_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT 'joined'::text, p_from_community_id uuid DEFAULT NULL::uuid, p_from_auth_user_id uuid DEFAULT NULL::uuid, p_from_nearify_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_community_id UUID;
  v_row_id       UUID;
  v_created      BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to update event participation' USING ERRCODE = '42501';
  END IF;

  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('joined', 'left') THEN
    RETURN jsonb_build_object('success', false, 'error', 'status must be joined or left');
  END IF;

  -- Identity parameters remain for native-client compatibility, but are
  -- assertions only. Resolve the actor exclusively from the signed-in session.
  SELECT id INTO v_community_id
  FROM public.community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  IF (p_from_community_id IS NOT NULL AND p_from_community_id <> v_community_id)
     OR (p_from_auth_user_id IS NOT NULL AND p_from_auth_user_id <> auth.uid())
     OR (p_from_nearify_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.nearify_identity_map nim
       WHERE nim.community_id = v_community_id
         AND lower(nim.nearify_user_id) = lower(trim(p_from_nearify_id))
     )) THEN
    RAISE EXCEPTION 'Identity does not match signed-in member' USING ERRCODE = '42501';
  END IF;

  INSERT INTO nearify_event_presence (
    community_id, nearify_event_id, event_name, event_starts_at, status, last_seen_at, updated_at
  ) VALUES (
    v_community_id, trim(p_nearify_event_id), p_event_name, p_event_starts_at, p_status, now(), now()
  )
  ON CONFLICT (community_id, nearify_event_id) DO UPDATE
    SET status          = EXCLUDED.status,
        event_name      = COALESCE(EXCLUDED.event_name, nearify_event_presence.event_name),
        event_starts_at = COALESCE(EXCLUDED.event_starts_at, nearify_event_presence.event_starts_at),
        last_seen_at    = now(),
        updated_at      = now()
  RETURNING id, (xmax = 0)
  INTO v_row_id, v_created;

  RETURN jsonb_build_object(
    'success',      true,
    'community_id', v_community_id,
    'presence_id',  v_row_id,
    'status',       p_status,
    'created',      v_created
  );
END;
$$;


--
-- Name: ingest_nearify_evidence_v2(uuid, text, text, text, numeric, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_nearify_evidence_v2(p_event_id uuid, p_from_nearify_id text, p_to_nearify_id text, p_signal_type text DEFAULT 'qr_confirmed'::text, p_confidence numeric DEFAULT 100, p_occurred_at timestamp with time zone DEFAULT now(), p_event_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_from UUID;
  v_to UUID;
  v_edge UUID;
  v_created BOOLEAN := false;
BEGIN
  IF p_event_id IS NULL OR p_occurred_at IS NULL
     OR p_from_nearify_id IS NULL OR trim(p_from_nearify_id) = ''
     OR p_to_nearify_id IS NULL OR trim(p_to_nearify_id) = ''
     OR p_signal_type IS NULL OR p_signal_type NOT IN ('qr_confirmed', 'proximity', 'ble_proximity')
     OR p_confidence IS NULL OR NOT (p_confidence BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'Invalid encounter evidence' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.interaction_edges'::regclass
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Review interaction_edges triggers before evidence ingestion' USING ERRCODE = '55000';
  END IF;

  -- Only explicitly linked, authorized identities can contribute context.
  -- Resolve each input independently; never accept a caller-supplied graph ID.
  SELECT nim.community_id INTO v_from
  FROM public.nearify_identity_map nim
  JOIN public.community_experience_authorizations a USING (community_id)
  WHERE nim.nearify_user_id = trim(p_from_nearify_id)
    AND a.experience = 'nearify' AND a.status = 'authorized';
  SELECT nim.community_id INTO v_to
  FROM public.nearify_identity_map nim
  JOIN public.community_experience_authorizations a USING (community_id)
  WHERE nim.nearify_user_id = trim(p_to_nearify_id)
    AND a.experience = 'nearify' AND a.status = 'authorized';
  IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN
    RAISE EXCEPTION 'Evidence requires two distinct authorized linked members' USING ERRCODE = '22023';
  END IF;

  -- Use the v2-only pair/event/signal index. Never refresh old evidence,
  -- change its lifecycle, or revive ignored/blocked rows on a retry.
  -- created_at is supported by the live table; updated_at is not assumed.
  INSERT INTO public.interaction_edges (
    from_user_id, to_user_id, type, status, confidence, overlap_seconds, meta, created_at
  ) VALUES (
    LEAST(v_from, v_to), GREATEST(v_from, v_to), p_signal_type,
    'suggested', p_confidence, 0,
    jsonb_build_object(
      'event_id', p_event_id::text, 'event_name', p_event_name,
      'signal_type', p_signal_type, 'occurred_at', p_occurred_at,
      'ingested_at', now(), 'source', 'nearify-evidence-v2',
      'evidence_version', 2
    ), p_occurred_at
  )
  ON CONFLICT (
    LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id),
    COALESCE((meta->>'event_id')::text, ''),
    COALESCE((meta->>'signal_type')::text, '')
  ) WHERE meta->>'source' = 'nearify-evidence-v2' AND meta->>'evidence_version' = '2'
  DO NOTHING
  RETURNING id INTO v_edge;

  v_created := FOUND;
  IF NOT v_created THEN
    SELECT id INTO v_edge FROM public.interaction_edges
    WHERE meta->>'source' = 'nearify-evidence-v2' AND meta->>'evidence_version' = '2'
      AND LEAST(from_user_id, to_user_id) = LEAST(v_from, v_to)
      AND GREATEST(from_user_id, to_user_id) = GREATEST(v_from, v_to)
      AND COALESCE(meta->>'event_id', '') = p_event_id::text
      AND COALESCE(meta->>'signal_type', '') = p_signal_type;
    IF v_edge IS NULL THEN
      -- A concurrent deletion/isolation snapshot must never look successful.
      RAISE EXCEPTION 'Retry encounter evidence ingestion' USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'evidence_version', 2, 'edge_id', v_edge,
    'edge_created', v_created, 'connection_created', false,
    'connection_promoted', false
  );
END;
$$;


--
-- Name: ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_nearify_interaction(p_event_id uuid, p_from_auth_user_id uuid DEFAULT NULL::uuid, p_to_auth_user_id uuid DEFAULT NULL::uuid, p_from_community_id uuid DEFAULT NULL::uuid, p_to_community_id uuid DEFAULT NULL::uuid, p_signal_type text DEFAULT 'proximity'::text, p_confidence numeric DEFAULT 50, p_occurred_at timestamp with time zone DEFAULT now(), p_meta jsonb DEFAULT '{}'::jsonb, p_from_nearify_id text DEFAULT NULL::text, p_to_nearify_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_from_cid  UUID;
  v_to_cid    UUID;
  v_edge_id   UUID;
  v_edge_status TEXT;
  v_conn_id   UUID;
  v_edge_created  BOOLEAN := false;
  v_edge_updated  BOOLEAN := false;
  v_conn_promoted BOOLEAN := false;
  v_conn_created  BOOLEAN := false;
  v_merged_meta JSONB;
  v_norm_from UUID;
  v_norm_to   UUID;
BEGIN
  -- ============================================================
  -- STEP 1: Resolve community IDs (community_id → auth_uid → nearify_id)
  -- ============================================================

  v_from_cid := p_from_community_id;
  IF v_from_cid IS NULL AND p_from_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_from_cid FROM community WHERE user_id = p_from_auth_user_id LIMIT 1;
  END IF;
  IF v_from_cid IS NULL AND p_from_nearify_id IS NOT NULL THEN
    SELECT community_id INTO v_from_cid FROM nearify_identity_map WHERE nearify_user_id = p_from_nearify_id LIMIT 1;
  END IF;

  v_to_cid := p_to_community_id;
  IF v_to_cid IS NULL AND p_to_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_to_cid FROM community WHERE user_id = p_to_auth_user_id LIMIT 1;
  END IF;
  IF v_to_cid IS NULL AND p_to_nearify_id IS NOT NULL THEN
    SELECT community_id INTO v_to_cid FROM nearify_identity_map WHERE nearify_user_id = p_to_nearify_id LIMIT 1;
  END IF;

  IF v_from_cid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not resolve from_user community ID');
  END IF;
  IF v_to_cid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not resolve to_user community ID');
  END IF;
  IF v_from_cid = v_to_cid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Self-edges are not allowed');
  END IF;

  -- ============================================================
  -- STEP 2: Build merged meta
  -- ============================================================
  v_merged_meta := COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object(
    'event_id',    p_event_id,
    'signal_type', p_signal_type,
    'confidence',  p_confidence,
    'occurred_at', p_occurred_at,
    'ingested_at', now()
  );

  IF p_signal_type = 'qr_confirmed' THEN
    v_edge_status := 'confirmed';
  ELSE
    v_edge_status := 'suggested';
  END IF;

  -- ============================================================
  -- STEP 3: Upsert interaction_edge
  -- ============================================================
  v_norm_from := LEAST(v_from_cid, v_to_cid);
  v_norm_to   := GREATEST(v_from_cid, v_to_cid);

  INSERT INTO interaction_edges (
    from_user_id, to_user_id, type, status, confidence, meta, created_at, updated_at
  ) VALUES (
    v_norm_from, v_norm_to,
    COALESCE(p_signal_type, 'proximity'),
    v_edge_status,
    COALESCE(p_confidence, 50),
    v_merged_meta,
    COALESCE(p_occurred_at, now()),
    now()
  )
  ON CONFLICT (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id),
    COALESCE((meta->>'event_id')::text, ''),
    COALESCE((meta->>'signal_type')::text, '')
  )
  DO UPDATE SET
    status     = CASE
                   WHEN EXCLUDED.status = 'confirmed' THEN 'confirmed'
                   ELSE interaction_edges.status
                 END,
    confidence = GREATEST(interaction_edges.confidence, EXCLUDED.confidence),
    meta       = interaction_edges.meta || EXCLUDED.meta,
    updated_at = now()
  RETURNING id, (xmax = 0) AS was_inserted
  INTO v_edge_id, v_edge_created;

  v_edge_updated := NOT v_edge_created;

  -- ============================================================
  -- STEP 4: Promote to connection if QR-confirmed
  -- ============================================================
  IF p_signal_type = 'qr_confirmed' THEN
    SELECT id INTO v_conn_id FROM connections
    WHERE (from_user_id = v_norm_from AND to_user_id = v_norm_to)
       OR (from_user_id = v_norm_to   AND to_user_id = v_norm_from)
    LIMIT 1;

    IF v_conn_id IS NULL THEN
      INSERT INTO connections (from_user_id, to_user_id, status, type, created_at, updated_at)
      VALUES (v_from_cid, v_to_cid, 'accepted', 'generic', now(), now())
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_conn_id;
      IF v_conn_id IS NOT NULL THEN
        v_conn_created  := true;
        v_conn_promoted := true;
      END IF;
    ELSE
      UPDATE connections SET status = 'accepted', updated_at = now()
      WHERE id = v_conn_id AND status != 'accepted';
      v_conn_promoted := true;
    END IF;

    IF v_conn_promoted THEN
      UPDATE interaction_edges SET status = 'promoted', updated_at = now() WHERE id = v_edge_id;
    END IF;
  END IF;

  -- ============================================================
  -- STEP 5: Return result
  -- ============================================================
  RETURN jsonb_build_object(
    'success',            true,
    'from_community_id',  v_from_cid,
    'to_community_id',    v_to_cid,
    'edge_id',            v_edge_id,
    'edge_created',       v_edge_created,
    'edge_updated',       v_edge_updated,
    'connection_promoted', COALESCE(v_conn_promoted, false),
    'connection_created',  COALESCE(v_conn_created,  false),
    'connection_id',       v_conn_id
  );
END;
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.community c
    where c.user_id = uid
      and c.user_role = 'Admin'
      and coalesce(c.is_disabled,false) = false
  );
$$;


--
-- Name: is_node_dismissed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_node_dismissed(p_user_id uuid, p_node_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  dismissal_record RECORD;
BEGIN
  SELECT * INTO dismissal_record
  FROM discovery_dismissals
  WHERE user_id = p_user_id
    AND node_id = p_node_id
    AND reintroduce_after > NOW();
  
  RETURN FOUND;
END;
$$;


--
-- Name: link_nearify_account(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_nearify_account(p_nearify_user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_existing_id  TEXT;
BEGIN
  IF p_nearify_user_id IS NULL OR trim(p_nearify_user_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_user_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT nearify_user_id INTO v_existing_id
  FROM nearify_identity_map
  WHERE community_id = v_community_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_id <> trim(p_nearify_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_linked_to_different_identity');
  END IF;

  INSERT INTO nearify_identity_map (community_id, nearify_user_id, linked_at, updated_at)
  VALUES (v_community_id, trim(p_nearify_user_id), now(), now())
  ON CONFLICT (community_id) DO UPDATE
    SET nearify_user_id = trim(p_nearify_user_id),
        updated_at      = now();

  INSERT INTO community_experience_authorizations (community_id, experience, status, authorized_at, updated_at)
  VALUES (v_community_id, 'nearify', 'authorized', now(), now())
  ON CONFLICT (community_id, experience) DO UPDATE
    SET status        = 'authorized',
        authorized_at = now(),
        revoked_at    = NULL,
        updated_at    = now();

  RETURN jsonb_build_object(
    'success',          true,
    'community_id',     v_community_id,
    'nearify_user_id',  trim(p_nearify_user_id)
  );
END;
$$;


--
-- Name: nearify_professional_context_score(bigint, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nearify_professional_context_score(p_shared_projects bigint, p_mutual_connections bigint, p_shared_organizations bigint, p_shared_skills bigint) RETURNS bigint
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT (p_shared_projects > 0)::int * 5
       + (p_mutual_connections > 0)::int * 4
       + (p_shared_organizations > 0)::int * 4
       + LEAST(p_shared_skills, 3) * 2;
$$;


--
-- Name: normalize_skills_text(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_skills_text() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Remove braces and quotes if accidentally submitted
  NEW.skills := regexp_replace(NEW.skills, '[\{\}\"]', '', 'g');
  -- Normalize spacing and commas
  NEW.skills := regexp_replace(NEW.skills, '\s*,\s*', ', ', 'g');
  RETURN NEW;
END;
$$;


--
-- Name: notify_connection_accepted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_connection_accepted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  accepter_name TEXT;
BEGIN
  IF NEW.status = 'accepted' AND (OLD IS NULL OR OLD.status != 'accepted') THEN
    SELECT name INTO accepter_name
    FROM community
    WHERE id = NEW.to_user_id;

    PERFORM create_notification(
      NEW.from_user_id,
      'connection_accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your connection request',
      'You are now connected!',
      '/index.html?user=' || NEW.to_user_id::text,
      jsonb_build_object('connection_id', NEW.id, 'user_id', NEW.to_user_id)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_connection_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_connection_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  sender_name TEXT;
BEGIN
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status != 'pending') THEN
    SELECT name INTO sender_name
    FROM community
    WHERE id = NEW.from_user_id;

    PERFORM create_notification(
      NEW.to_user_id,
      'connection_request',
      COALESCE(sender_name, 'Someone') || ' sent you a connection request',
      'Review and respond to this connection request',
      '/index.html?user=' || NEW.from_user_id::text,
      jsonb_build_object('connection_id', NEW.id, 'sender_id', NEW.from_user_id)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_endorsement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_endorsement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  endorser_name TEXT;
  skill_name    TEXT;
BEGIN
  -- notifications.user_id references community.id, not auth.users.
  -- Skip if there is no community row to notify (should not happen, but guard anyway).
  IF NEW.endorsed_community_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get endorser name via community_id
  SELECT name INTO endorser_name
  FROM public.community
  WHERE id = NEW.endorser_community_id;

  skill_name := NEW.skill;

  PERFORM create_notification(
    NEW.endorsed_community_id,   -- community.id (matches notifications_user_id_fkey)
    'endorsement',
    COALESCE(endorser_name, 'Someone') || ' endorsed you for ' || skill_name,
    'Your skills are being recognized!',
    '/dashboard.html',
    jsonb_build_object(
      'endorsement_id', NEW.id,
      'endorser_id',    NEW.endorser_id,
      'skill',          skill_name
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  sender_name TEXT;
  sender_community_id UUID;
  recipient_id UUID;
BEGIN
  -- Get sender's community ID and name
  SELECT c.id, c.name INTO sender_community_id, sender_name
  FROM community c
  WHERE c.user_id = NEW.sender_id;
  
  -- Determine recipient (the other participant in the conversation)
  SELECT CASE
    WHEN participant_1_id = sender_community_id THEN participant_2_id
    ELSE participant_1_id
  END INTO recipient_id
  FROM conversations
  WHERE id = NEW.conversation_id;
  
  -- Create notification for recipient (only if we found both sender and recipient)
  IF recipient_id IS NOT NULL AND sender_community_id IS NOT NULL THEN
    PERFORM create_notification(
      recipient_id,
      'message',
      'New message from ' || COALESCE(sender_name, 'someone'),
      LEFT(NEW.content, 100), -- First 100 chars of message
      '/dashboard.html',
      jsonb_build_object('message_id', NEW.id, 'conversation_id', NEW.conversation_id, 'sender_id', sender_community_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: notify_opportunity_interest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_opportunity_interest() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_poster_id UUID;
  v_opportunity_title TEXT;
  v_interested_name TEXT;
BEGIN
  SELECT o.posted_by, o.title
    INTO v_poster_id, v_opportunity_title
  FROM public.opportunities o
  WHERE o.id = NEW.opportunity_id;

  IF v_poster_id IS NULL OR v_poster_id = NEW.community_id THEN
    RETURN NEW;
  END IF;

  SELECT c.name
    INTO v_interested_name
  FROM public.community c
  WHERE c.id = NEW.community_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, link, metadata)
  VALUES (
    v_poster_id,
    'opportunity_interest',
    COALESCE(NULLIF(v_interested_name, ''), 'A community member')
      || ' is interested in your opportunity',
    'Review their interest and contact them through Innovation Engine messaging.',
    'opportunity.html?id=' || NEW.opportunity_id::TEXT,
    jsonb_build_object(
      'opportunity_id', NEW.opportunity_id,
      'interested_community_id', NEW.community_id,
      'opportunity_title', v_opportunity_title
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_organization_join_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_organization_join_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_org RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM community c WHERE c.id = NEW.community_id AND c.user_id = auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT o.id, o.name, o.created_by INTO v_org FROM organizations o WHERE o.id = NEW.organization_id;
  IF v_org.created_by IS NULL OR v_org.created_by = NEW.community_id THEN RETURN NEW; END IF;
  PERFORM create_notification(
    v_org.created_by,
    'org_join_request',
    'New Organization Join Request',
    'Someone wants to join ' || COALESCE(v_org.name, 'your organization'),
    '?org=' || v_org.id::text,
    jsonb_build_object('organization_id', v_org.id, 'membership_id', NEW.id)
  );
  RETURN NEW;
END;
$$;


--
-- Name: notify_project_invite(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_project_invite() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  project_name TEXT;
  inviter_name TEXT;
  v_project RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') AND EXISTS (
      SELECT 1 FROM community me WHERE me.user_id = auth.uid() AND me.id = NEW.user_id
    ) THEN
      IF NEW.role = 'pending' THEN
        SELECT p.id, p.title, p.creator_id INTO v_project FROM projects p WHERE p.id = NEW.project_id;
        IF v_project.creator_id IS NOT NULL AND v_project.creator_id <> NEW.user_id THEN
          PERFORM create_notification(
            v_project.creator_id,
            'project_request',
            'New Project Request',
            'Someone wants to join your project: ' || COALESCE(v_project.title, 'your project'),
            '?project=' || v_project.id::text,
            jsonb_build_object('project_id', v_project.id, 'member_id', NEW.id)
          );
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') AND NOT EXISTS (
      SELECT 1 FROM community me
      WHERE me.user_id = auth.uid()
        AND (
          EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.creator_id = me.id)
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = NEW.project_id AND pm.user_id = me.id AND pm.id <> NEW.id)
        )
    ) THEN
      RETURN NEW;
    END IF;

    SELECT title INTO project_name
    FROM projects
    WHERE id = NEW.project_id;
    SELECT c.name INTO inviter_name
    FROM projects p
    JOIN community c ON c.user_id = p.creator_id
    WHERE p.id = NEW.project_id;
    PERFORM create_notification(
      NEW.user_id,
      'project_invite',
      'Invited to join "' || COALESCE(project_name, 'a project') || '"',
      COALESCE(inviter_name, 'Someone') || ' invited you to collaborate on this project',
      '/dashboard.html',
      jsonb_build_object('project_id', NEW.project_id, 'member_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_project_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_project_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_project RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM community c WHERE c.id = NEW.user_id AND c.user_id = auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT p.id, p.title, p.creator_id INTO v_project FROM projects p WHERE p.id = NEW.project_id;
  IF v_project.creator_id IS NULL OR v_project.creator_id = NEW.user_id THEN RETURN NEW; END IF;
  PERFORM create_notification(
    v_project.creator_id,
    'project_request',
    'New Project Request',
    'Someone wants to join your project: ' || COALESCE(v_project.title, 'your project'),
    '?project=' || v_project.id::text,
    jsonb_build_object('project_id', v_project.id, 'request_id', NEW.id)
  );
  RETURN NEW;
END;
$$;


--
-- Name: prevent_opportunity_poster_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_opportunity_poster_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.posted_by IS DISTINCT FROM OLD.posted_by THEN
    RAISE EXCEPTION 'opportunity posted_by cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: project_auto_add_creator_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_auto_add_creator_member() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.creator_id, 'creator')
  on conflict (project_id, user_id) do nothing;

  return new;
end;
$$;


--
-- Name: project_members_dedupe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_members_dedupe() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if exists (
    select 1
    from public.project_members pm
    where pm.project_id = new.project_id
      and pm.user_id = new.user_id
  ) then
    return null; -- skip insert
  end if;

  return new;
end;
$$;


--
-- Name: projects_sync_name_title(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_sync_name_title() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.title is null then
    new.title := nullif(btrim(coalesce(new.name,'')), '');
  end if;

  new.name := coalesce(new.title, '');

  return new;
end;
$$;


--
-- Name: projects_sync_skills(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_sync_skills() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- if JS sends skills_needed (string), convert to required_skills[]
  if new.skills_needed is not null and btrim(new.skills_needed) <> '' then
    new.required_skills := regexp_split_to_array(new.skills_needed, '\s*,\s*');
  elsif new.required_skills is not null then
    new.skills_needed := array_to_string(new.required_skills, ', ');
  end if;

  return new;
end;
$$;


--
-- Name: promote_edge_to_connection(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_edge_to_connection(p_edge_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := public.authz_current_member_id();
  v_edge interaction_edges%ROWTYPE;
  v_other uuid;
  v_conn connections%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in to connect' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_edge FROM interaction_edges WHERE id = p_edge_id;
  IF NOT FOUND OR v_me NOT IN (v_edge.from_user_id, v_edge.to_user_id) THEN
    -- Same answer for "no such edge" and "not your edge": edge ids are not
    -- authorization and must not be probeable.
    RETURN jsonb_build_object('success', false, 'error', 'Edge not found');
  END IF;
  IF v_edge.status IN ('ignored', 'blocked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This suggestion was dismissed');
  END IF;
  v_other := CASE WHEN v_edge.from_user_id = v_me THEN v_edge.to_user_id ELSE v_edge.from_user_id END;

  -- Serialize both members' taps on this pair (either edge direction) until
  -- commit. Without it, simultaneous taps each find no connection and send
  -- reciprocal requests, and neither tap reaches the acceptance below. The
  -- next statement takes a fresh snapshot, so the second tap sees the first.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'connection-pair:' || LEAST(v_me, v_other)::text || ':' || GREATEST(v_me, v_other)::text, 0));

  SELECT * INTO v_conn FROM connections
  WHERE (from_user_id = v_me AND to_user_id = v_other) OR (from_user_id = v_other AND to_user_id = v_me)
  ORDER BY (status = 'accepted') DESC, (status = 'pending') DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO connections (from_user_id, to_user_id, status, type)
    VALUES (v_me, v_other, 'pending', 'generic')
    RETURNING * INTO v_conn;
    RETURN jsonb_build_object('success', true, 'status', 'pending', 'connection_id', v_conn.id, 'connection_created', true);
  END IF;

  IF v_conn.status = 'accepted' THEN
    UPDATE interaction_edges SET status = 'accepted' WHERE id = p_edge_id AND status <> 'accepted';
    RETURN jsonb_build_object('success', true, 'status', 'accepted', 'already_promoted', true, 'connection_id', v_conn.id, 'connection_created', false);
  END IF;

  IF v_conn.status = 'pending' AND v_conn.to_user_id = v_me THEN
    -- The other member already asked; this member is the recipient agreeing.
    UPDATE connections SET status = 'accepted' WHERE id = v_conn.id AND status = 'pending';
    UPDATE interaction_edges SET status = 'accepted' WHERE id = p_edge_id AND status <> 'accepted';
    RETURN jsonb_build_object('success', true, 'status', 'accepted', 'connection_id', v_conn.id, 'connection_created', false);
  END IF;

  IF v_conn.status = 'pending' THEN
    RETURN jsonb_build_object('success', true, 'status', 'pending', 'connection_id', v_conn.id, 'connection_created', false);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'This connection request was already closed');
END;
$$;


--
-- Name: reconfirm_nearify_authorization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconfirm_nearify_authorization() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_current      TEXT;
BEGIN
  SELECT id INTO v_community_id FROM community WHERE user_id = auth.uid() LIMIT 1;
  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT status INTO v_current
  FROM community_experience_authorizations
  WHERE community_id = v_community_id AND experience = 'nearify'
  LIMIT 1;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No Nearify authorization found for current user');
  ELSIF v_current = 'authorized' THEN
    -- Idempotent: a repeated/racing tap of Continue is a no-op success,
    -- not an error.
    RETURN jsonb_build_object('success', true, 'status', 'authorized');
  ELSIF v_current = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nearify authorization was revoked; reconnect from the Nearify app to re-authorize');
  END IF;

  -- v_current = 'needs_reconfirmation'
  UPDATE community_experience_authorizations
  SET status = 'authorized',
      authorized_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id AND experience = 'nearify';

  RETURN jsonb_build_object('success', true, 'status', 'authorized');
END;
$$;


--
-- Name: record_email_campaign_event(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_email_campaign_event(p_id text, p_provider_id text, p_type text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: record_opportunity_interest_followup(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_opportunity_interest_followup(p_opportunity_id uuid, p_interested_community_id uuid, p_channel text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_interest_id UUID;
  v_followup_id UUID;
BEGIN
  IF p_channel NOT IN ('message', 'email') THEN
    RAISE EXCEPTION 'invalid follow-up channel' USING ERRCODE = '22023';
  END IF;

  SELECT oi.id INTO v_interest_id
  FROM public.opportunity_interests oi
  WHERE oi.opportunity_id = p_opportunity_id
    AND oi.community_id = p_interested_community_id;

  IF v_interest_id IS NULL THEN
    RAISE EXCEPTION 'opportunity interest not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.opportunity_interest_followups (
    opportunity_interest_id,
    channel
  ) VALUES (
    v_interest_id,
    p_channel
  )
  RETURNING id INTO v_followup_id;

  RETURN v_followup_id;
END;
$$;


--
-- Name: record_project_interest_followup(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_project_interest_followup(p_project_member_id uuid, p_channel text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_followup_id UUID;
BEGIN
  IF p_channel NOT IN ('message', 'email') THEN
    RAISE EXCEPTION 'invalid follow-up channel' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_interest_followups (project_member_id, channel)
  VALUES (p_project_member_id, p_channel)
  RETURNING id INTO v_followup_id;

  RETURN v_followup_id;
END;
$$;


--
-- Name: record_site_visit(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_site_visit(p_session_id uuid, p_browser_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF p_session_id IS NULL OR p_browser_id IS NULL THEN
    RAISE EXCEPTION 'Missing visit identity' USING ERRCODE = '22023';
  END IF;
  -- Bounded housekeeping: remove at most 100 expired visits per recording call.
  DELETE FROM public.site_visit_sessions WHERE session_id IN (
    SELECT session_id FROM public.site_visit_sessions
    WHERE last_seen_at < now() - interval '90 days'
    ORDER BY last_seen_at LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  INSERT INTO public.site_visit_sessions AS visit(session_id, browser_id, auth_user_id)
    VALUES(p_session_id, p_browser_id, auth.uid())
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen_at = now(), auth_user_id = COALESCE(visit.auth_user_id, auth.uid())
    WHERE visit.browser_id = p_browser_id
      AND (visit.auth_user_id IS NULL OR visit.auth_user_id = auth.uid());
END $$;


--
-- Name: refresh_capability_evidence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_capability_evidence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE successful_count INTEGER;
DECLARE verified_success_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO successful_count
  FROM public.capability_attempts
  WHERE capability_id = NEW.capability_id
    AND outcome_status IN ('succeeded', 'not_succeeded');
  SELECT COUNT(*) INTO verified_success_count
  FROM public.capability_attempts
  WHERE capability_id = NEW.capability_id
    AND outcome_status = 'succeeded'
    AND verification_status = 'verified';
  UPDATE public.capability_packages
  SET evidence_status = CASE WHEN verified_success_count >= 2 THEN 'proven' WHEN successful_count >= 1 THEN 'tested' ELSE 'untested' END,
      updated_at = now()
  WHERE id = NEW.capability_id;
  RETURN NEW;
END;
$$;


--
-- Name: reject_community_intelligence_event_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_community_intelligence_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'community_intelligence_events is append-only';
END;
$$;


--
-- Name: reserve_admin_claim_emails(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_admin_claim_emails(p_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  actor uuid := auth.uid();
  person record;
  recipient_email text;
  key text;
  request_id uuid;
  used integer;
  output jsonb := '[]'::jsonb;
  pid uuid;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.community
    WHERE user_id = actor AND user_role = 'Admin'
  ) THEN
    RAISE EXCEPTION 'Admin required'
      USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL
     OR cardinality(p_ids) < 1
     OR cardinality(p_ids) > 20
     OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Choose 1 to 20 people'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.admin_claim_email_requests
  WHERE requested_at < now() - interval '30 days';

  PERFORM pg_advisory_xact_lock(
    hashtextextended('claim-admin:' || actor::text, 0)
  );

  SELECT count(*) INTO used
  FROM public.admin_claim_email_requests
  WHERE requested_by = actor
    AND requested_at > now() - interval '1 hour';

  FOR pid IN
    SELECT DISTINCT unnest(p_ids) ORDER BY 1
  LOOP
    SELECT id, name, c.email, user_id, is_disabled
    INTO person
    FROM public.community c
    WHERE id = pid;

    IF NOT FOUND THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'not_found'
        )
      );
      CONTINUE;
    END IF;

    IF person.user_id IS NOT NULL THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'already_claimed'
        )
      );
      CONTINUE;
    END IF;

    IF coalesce(person.is_disabled, false) THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'disabled'
        )
      );
      CONTINUE;
    END IF;

    recipient_email := lower(btrim(person.email));

    IF recipient_email IS NULL
       OR recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'missing_email'
        )
      );
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.community c
      WHERE c.id <> pid
        AND lower(btrim(c.email)) = recipient_email
        AND c.user_id IS NOT NULL
    ) THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'already_claimed'
        )
      );
      CONTINUE;
    END IF;

    IF (
      SELECT count(*)
      FROM public.community c
      WHERE lower(btrim(c.email)) = recipient_email
        AND c.user_id IS NULL
    ) > 1 THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'ambiguous_email'
        )
      );
      CONTINUE;
    END IF;

    key := md5(recipient_email);

    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('claim-recipient:' || key, 0)
    ) THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'rate_limited'
        )
      );
      CONTINUE;
    END IF;

    IF used >= 50
       OR EXISTS (
         SELECT 1
         FROM public.admin_claim_email_requests
         WHERE email_key = key
           AND requested_at > now() - interval '5 minutes'
       )
       OR (
         SELECT count(*)
         FROM public.admin_claim_email_requests
         WHERE email_key = key
           AND requested_at > now() - interval '24 hours'
       ) >= 5 THEN
      output := output || jsonb_build_array(
        jsonb_build_object(
          'person_id', pid,
          'status', 'rate_limited'
        )
      );
      CONTINUE;
    END IF;

    INSERT INTO public.admin_claim_email_requests(
      person_id, requested_by, email_key
    )
    VALUES (pid, actor, key)
    RETURNING id INTO request_id;

    used := used + 1;

    output := output || jsonb_build_array(
      jsonb_build_object(
        'person_id', pid,
        'request_id', request_id,
        'email', recipient_email,
        'status', 'reserved'
      )
    );
  END LOOP;

  RETURN output;
END;
$_$;


--
-- Name: reserve_email_campaign_batch(uuid, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_email_campaign_batch(p_id uuid, p_actor uuid, p_mode text, p_reviewed boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: set_capability_memory_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_capability_memory_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_my_photo_visibility(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_my_photo_visibility(p_visible boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_consent_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_visible IS NULL THEN
    RAISE EXCEPTION 'Authentication and a visibility choice are required'
      USING ERRCODE = '42501';
  END IF;
  -- Update all rows owned by this auth identity, including legacy duplicates.
  UPDATE public.community SET photo_visible = p_visible
  WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT photo_consent_at INTO v_consent_at FROM public.community
  WHERE user_id = auth.uid() LIMIT 1;
  RETURN jsonb_build_object('photo_visible', p_visible, 'photo_consent_at', v_consent_at);
END;
$$;


--
-- Name: set_nearify_event_live_presence(text, text, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_nearify_event_live_presence(p_nearify_event_id text, p_event_name text DEFAULT NULL::text, p_event_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_live boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_row_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF p_nearify_event_id IS NULL OR trim(p_nearify_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'nearify_event_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked community profile found');
  END IF;

  SELECT status INTO v_status
  FROM public.nearify_event_presence
  WHERE community_id = v_community_id
    AND nearify_event_id = trim(p_nearify_event_id)
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event commitment not found');
  END IF;
  IF p_is_live AND v_status <> 'joined' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A left event cannot become live without rejoining');
  END IF;

  UPDATE public.nearify_event_presence
  SET is_live = COALESCE(p_is_live, false),
      event_name = COALESCE(p_event_name, event_name),
      event_starts_at = COALESCE(p_event_starts_at, event_starts_at),
      last_seen_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id
    AND nearify_event_id = trim(p_nearify_event_id)
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'success', true,
    'community_id', v_community_id,
    'presence_id', v_row_id,
    'is_live', COALESCE(p_is_live, false),
    'status', v_status
  );
END;
$$;


--
-- Name: set_project_task_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_project_task_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = NOW();
  END IF;

  IF NEW.status = 'done' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at = NOW();
    END IF;
  ELSE
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: stop_theme_participation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stop_theme_participation(p_theme_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  UPDATE theme_participants
  SET engagement_level = 'interested',
      participation_confirmed_at = NULL,
      participation_expires_at = NULL
  WHERE theme_id = p_theme_id
    AND community_id = v_community_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_updated > 0, 'engagement_level', 'interested');
END;
$$;


--
-- Name: unified_network_maintenance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unified_network_maintenance() RETURNS TABLE(expired_presence_cleaned integer, old_dismissals_cleaned integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  presence_count INTEGER;
  dismissal_count INTEGER;
BEGIN
  -- Clean up expired presence sessions
  presence_count := cleanup_expired_presence_sessions();
  
  -- Clean up old dismissals
  dismissal_count := cleanup_old_dismissals();
  
  RETURN QUERY SELECT presence_count, dismissal_count;
END;
$$;


--
-- Name: FUNCTION unified_network_maintenance(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.unified_network_maintenance() IS 'Maintenance function to clean up expired data. Should be run periodically (e.g., hourly)';


--
-- Name: unlink_nearify_account(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlink_nearify_account(p_expected_nearify_user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_community_id UUID;
  v_current_id   TEXT;
  v_deleted      INT := 0;
BEGIN
  IF p_expected_nearify_user_id IS NULL OR trim(p_expected_nearify_user_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_expected_nearify_user_id is required');
  END IF;

  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found');
  END IF;

  SELECT nearify_user_id INTO v_current_id
  FROM nearify_identity_map
  WHERE community_id = v_community_id
  LIMIT 1;

  IF v_current_id IS NULL THEN
    -- Nothing to unlink — idempotent no-op, matching the previous
    -- contract's ('unlinked': false) case, not an error.
    RETURN jsonb_build_object('success', true, 'unlinked', false);
  END IF;

  IF v_current_id <> trim(p_expected_nearify_user_id) THEN
    -- The caller's belief about who is linked doesn't match reality —
    -- refuse outright. No delete, no revoke, no partial effect.
    RETURN jsonb_build_object('success', false, 'error', 'expected_mismatch');
  END IF;

  DELETE FROM nearify_identity_map WHERE community_id = v_community_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE community_experience_authorizations
  SET status     = 'revoked',
      revoked_at = now(),
      updated_at = now()
  WHERE community_id = v_community_id
    AND experience   = 'nearify'
    AND status      != 'revoked';

  RETURN jsonb_build_object('success', true, 'unlinked', v_deleted > 0);
END;
$$;


--
-- Name: unsubscribe_campaign_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsubscribe_campaign_email(p_token text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 IF p_token IS NULL OR p_token!~'^[0-9a-f]{64}$' THEN RETURN; END IF;
 INSERT INTO public.email_campaign_suppressions(email_key,reason) SELECT email_key,'unsubscribed' FROM public.email_campaign_recipients WHERE unsubscribe_token=p_token ON CONFLICT DO NOTHING;
 UPDATE public.email_campaign_recipients SET status='skipped',code='unsubscribed' WHERE status='ready' AND email_key IN (SELECT email_key FROM public.email_campaign_recipients WHERE unsubscribe_token=p_token);
END $_$;


--
-- Name: update_connection_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_connection_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  user1_id UUID;
  user2_id UUID;
BEGIN
  user1_id := COALESCE(NEW.from_user_id, OLD.from_user_id);
  user2_id := COALESCE(NEW.to_user_id, OLD.to_user_id);

  IF user1_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT count(DISTINCT peer) FROM (
        SELECT CASE WHEN conn.from_user_id = user1_id THEN conn.to_user_id ELSE conn.from_user_id END AS peer
        FROM public.connections conn
        WHERE (conn.from_user_id = user1_id OR conn.to_user_id = user1_id)
          AND conn.status = 'accepted'
      ) p
    )
    WHERE id = user1_id;
  END IF;

  IF user2_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT count(DISTINCT peer) FROM (
        SELECT CASE WHEN conn.from_user_id = user2_id THEN conn.to_user_id ELSE conn.from_user_id END AS peer
        FROM public.connections conn
        WHERE (conn.from_user_id = user2_id OR conn.to_user_id = user2_id)
          AND conn.status = 'accepted'
      ) p
    )
    WHERE id = user2_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_conversation_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_last_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_conversation_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_on_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE conversations 
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_cynq_cards_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_cynq_cards_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_endorsement_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_endorsement_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE community
  SET endorsements = (
    SELECT COUNT(*) FROM endorsements WHERE target_id = NEW.target_id
  )
  WHERE id = NEW.target_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_login_timestamp(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_login_timestamp(auth_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if auth_user_id is not null and auth_user_id <> v_caller then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.community
  set previous_login_at = last_login,
      last_login = now()
  where user_id = v_caller;
end;
$$;


--
-- Name: update_onboarding_step(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_onboarding_step(auth_user_id uuid, step_number integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_caller uuid := auth.uid();
  user_community_id uuid;
begin
  if v_caller is null then
    return json_build_object('error', 'Not signed in', 'success', false);
  end if;
  if auth_user_id is not null and auth_user_id <> v_caller then
    return json_build_object('error', 'Not allowed', 'success', false);
  end if;

  select id into user_community_id
  from public.community
  where user_id = v_caller
  limit 1;

  if user_community_id is null then
    return json_build_object('error', 'Profile not found', 'success', false);
  end if;

  update public.community
  set onboarding_step = step_number,
      onboarding_started_at = coalesce(onboarding_started_at, now())
  where id = user_community_id;

  return json_build_object('success', true, 'step', step_number);
end;
$$;


--
-- Name: update_organization_follower_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organization_follower_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations
    SET follower_count = follower_count + 1
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations
    SET follower_count = GREATEST(follower_count - 1, 0)
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_organization_opportunity_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organization_opportunity_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    UPDATE organizations
    SET opportunity_count = opportunity_count + 1
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'open' AND NEW.status != 'open' THEN
      UPDATE organizations
      SET opportunity_count = GREATEST(opportunity_count - 1, 0)
      WHERE id = NEW.organization_id;
    ELSIF OLD.status != 'open' AND NEW.status = 'open' THEN
      UPDATE organizations
      SET opportunity_count = opportunity_count + 1
      WHERE id = NEW.organization_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'open' THEN
    UPDATE organizations
    SET opportunity_count = GREATEST(opportunity_count - 1, 0)
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_presence_sessions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_presence_sessions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_project_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'project_bids' THEN
      UPDATE projects SET bid_count = bid_count + 1 WHERE id = NEW.project_id;
    ELSIF TG_TABLE_NAME = 'project_upvotes' THEN
      UPDATE projects SET upvote_count = upvote_count + 1 WHERE id = NEW.project_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'project_upvotes' THEN
      UPDATE projects SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.project_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_streak_on_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_streak_on_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If last activity was yesterday, increment streak
  IF NEW.last_activity_date = CURRENT_DATE - INTERVAL '1 day' THEN
    NEW.current_streak := COALESCE(NEW.current_streak, 0) + 1;
  -- If last activity was today, keep streak
  ELSIF NEW.last_activity_date = CURRENT_DATE THEN
    -- No change
    NULL;
  -- Otherwise, reset streak
  ELSE
    NEW.current_streak := 1;
  END IF;
  
  NEW.last_activity_date := CURRENT_DATE;
  RETURN NEW;
END;
$$;


--
-- Name: update_team_size(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_team_size() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE ideas 
    SET current_team_size = current_team_size + 1 
    WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'active' AND NEW.status = 'active' THEN
    UPDATE ideas 
    SET current_team_size = current_team_size + 1 
    WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status != 'active' THEN
    UPDATE ideas 
    SET current_team_size = GREATEST(current_team_size - 1, 0) 
    WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE ideas 
    SET current_team_size = GREATEST(current_team_size - 1, 0) 
    WHERE id = OLD.idea_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_theme_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_theme_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE theme_circles
  SET
    activity_score = activity_score + 1,
    last_activity_at = NOW()
  WHERE id = NEW.theme_id;

  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_user_level(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_level() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.level := calculate_level(NEW.total_xp);
  RETURN NEW;
END;
$$;


--
-- Name: upsert_presence_ping(text, uuid, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_presence_ping(p_context_type text, p_context_id uuid, p_energy numeric, p_ttl_seconds integer DEFAULT 25) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
declare
  v_auth_id uuid;
  v_email text;
  v_comm_id uuid;
  has_auth_user_id boolean;
  has_email boolean;
begin
  v_auth_id := auth.uid();
  if v_auth_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Pull email from JWT claims if present
  v_email := (current_setting('request.jwt.claims', true)::jsonb ->> 'email');

  -- Detect whether community has these columns (avoid guessing)
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='community' and column_name='auth_user_id'
  ) into has_auth_user_id;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='community' and column_name='email'
  ) into has_email;

  -- 1) Try to find community row by auth_user_id
  if has_auth_user_id then
    execute 'select id from public.community where auth_user_id = $1 limit 1'
      into v_comm_id
      using v_auth_id;
  end if;

  -- 2) Fallback: try by email
  if v_comm_id is null and has_email and v_email is not null then
    execute 'select id from public.community where email = $1 limit 1'
      into v_comm_id
      using v_email;
  end if;

  -- 3) If still missing, create a minimal community row (best-effort)
  if v_comm_id is null then
    begin
      if has_auth_user_id and has_email and v_email is not null then
        execute 'insert into public.community (auth_user_id, email) values ($1, $2) returning id'
          into v_comm_id
          using v_auth_id, v_email;
      elsif has_auth_user_id then
        execute 'insert into public.community (auth_user_id) values ($1) returning id'
          into v_comm_id
          using v_auth_id;
      elsif has_email and v_email is not null then
        execute 'insert into public.community (email) values ($1) returning id'
          into v_comm_id
          using v_email;
      else
        raise exception 'Cannot create community user: no auth_user_id/email columns available';
      end if;
    exception when others then
      -- If your community table has required NOT NULL columns, this may fail.
      -- In that case, create the community profile via your existing frontend onboarding/ensureCommunityUser logic.
      raise exception 'No community profile for this user, and auto-create failed: %', sqlerrm;
    end;
  end if;

  -- 4) Insert presence ping using community.id (FK-safe)
  insert into public.presence_sessions (
    id, user_id, context_type, context_id,
    energy, expires_at,
    created_at, updated_at,
    is_active, last_seen
  )
  values (
    gen_random_uuid(),
    v_comm_id,
    p_context_type,
    p_context_id,
    p_energy,
    now() + make_interval(secs => p_ttl_seconds),
    now(),
    now(),
    true,
    now()
  );
end $_$;


--
-- Name: xp_for_next_level(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.xp_for_next_level(current_level integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- XP needed for next level = (level^2) * 100
  RETURN (current_level * current_level) * 100;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    category text,
    requirement_type text,
    requirement_value integer,
    xp_reward integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: active_organizations_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_organizations_summary AS
SELECT
    NULL::uuid AS id,
    NULL::text AS name,
    NULL::text AS slug,
    NULL::text AS description,
    NULL::text AS logo_url,
    NULL::text[] AS industry,
    NULL::text AS size,
    NULL::text AS location,
    NULL::integer AS follower_count,
    NULL::integer AS opportunity_count,
    NULL::boolean AS verified,
    NULL::bigint AS member_count,
    NULL::bigint AS open_opportunities,
    NULL::text[] AS sponsored_themes;


--
-- Name: presence_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presence_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    context_type text DEFAULT 'general'::text,
    context_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    energy numeric(3,2) DEFAULT 1.0,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    last_seen timestamp with time zone DEFAULT now(),
    CONSTRAINT presence_sessions_context_type_check CHECK (((context_type IS NULL) OR (context_type = ANY (ARRAY['theme'::text, 'project'::text, 'profile'::text, 'general'::text, 'beacon'::text])))),
    CONSTRAINT presence_sessions_energy_check CHECK (((energy >= (0)::numeric) AND (energy <= (1)::numeric)))
);


--
-- Name: TABLE presence_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.presence_sessions IS 'Tracks ephemeral real-time presence energy for nodes with TTL-based expiration';


--
-- Name: COLUMN presence_sessions.context_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.presence_sessions.context_type IS 'Type of context: theme, project, profile, or general';


--
-- Name: COLUMN presence_sessions.context_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.presence_sessions.context_id IS 'ID of the context (theme_id, project_id, user_id, etc.)';


--
-- Name: COLUMN presence_sessions.energy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.presence_sessions.energy IS 'Presence energy value [0, 1]';


--
-- Name: COLUMN presence_sessions.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.presence_sessions.expires_at IS 'TTL expiration timestamp';


--
-- Name: COLUMN presence_sessions.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.presence_sessions.is_active IS 'Whether the user session is currently active (tab visible and heartbeat running)';


--
-- Name: COLUMN presence_sessions.last_seen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.presence_sessions.last_seen IS 'Timestamp of last heartbeat/activity from this session';


--
-- Name: active_presence_sessions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_presence_sessions WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    context_type,
    context_id,
    energy,
    expires_at,
    created_at,
    updated_at,
    EXTRACT(epoch FROM (expires_at - now())) AS seconds_until_expiry
   FROM public.presence_sessions ps
  WHERE (expires_at > now())
  ORDER BY energy DESC, expires_at;


--
-- Name: active_themes_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_themes_summary AS
SELECT
    NULL::uuid AS id,
    NULL::text AS title,
    NULL::text AS description,
    NULL::text[] AS tags,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS expires_at,
    NULL::integer AS activity_score,
    NULL::text AS origin_type,
    NULL::bigint AS participant_count,
    NULL::bigint AS active_count;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    community_user_id uuid,
    idea_id uuid,
    action_type text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    project_id uuid GENERATED ALWAYS AS (((details ->> 'project_id'::text))::uuid) STORED
);


--
-- Name: admin_claim_email_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_claim_email_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid,
    requested_by uuid NOT NULL,
    email_key text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result_code text,
    CONSTRAINT admin_claim_email_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'failed'::text])))
);


--
-- Name: community; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community (
    name text NOT NULL,
    skills text,
    interests text[],
    x integer,
    y integer,
    created_at timestamp with time zone DEFAULT now(),
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text,
    image_url text,
    endorsements jsonb,
    availability text,
    user_id uuid,
    bio text,
    newsletter_opt_in boolean DEFAULT false,
    newsletter_opt_in_at timestamp with time zone,
    connection_count integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    profile_completed boolean DEFAULT false,
    user_role text DEFAULT 'Member'::text,
    image_path text,
    projects_created integer DEFAULT 0,
    projects_joined integer DEFAULT 0,
    bids_submitted integer DEFAULT 0,
    bids_accepted integer DEFAULT 0,
    role text,
    xp integer DEFAULT 0,
    level integer DEFAULT 1,
    login_streak integer DEFAULT 0,
    last_login timestamp with time zone,
    daily_quests_completed jsonb DEFAULT '[]'::jsonb,
    endorsements_given integer DEFAULT 0,
    endorsements_received integer DEFAULT 0,
    onboarding_completed boolean DEFAULT false,
    onboarding_step integer DEFAULT 0,
    onboarding_started_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    previous_login_at timestamp with time zone,
    last_start_view_at timestamp with time zone,
    start_view_count integer DEFAULT 0,
    is_hidden boolean DEFAULT false,
    avatar_storage_path text,
    total_xp integer DEFAULT 0,
    current_streak integer DEFAULT 0,
    last_activity_date date,
    is_disabled boolean DEFAULT false NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now(),
    photo_visible boolean DEFAULT false NOT NULL,
    photo_consent_at timestamp with time zone
);


--
-- Name: TABLE community; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.community IS 'neural network';


--
-- Name: COLUMN community.last_seen_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.last_seen_at IS 'Low-frequency presence persistence. Updated on page hide/unload and every 30-60 minutes (NOT on every heartbeat).';


--
-- Name: COLUMN community.photo_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.photo_visible IS 'Whether this member''s profile photo is shown to OTHER members across Synapse (graph, Explore -> People, Search, People Worth Knowing). Independent of is_hidden (listed/searchable/discoverable). Members always see their own photo regardless of this value.';


--
-- Name: COLUMN community.photo_consent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.photo_consent_at IS 'Server-recorded member opt-in. Legacy photo_visible=true alone is not consent.';


--
-- Name: ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    skills text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by_auth_id uuid,
    created_by_community_id uuid,
    upvotes integer DEFAULT 0,
    max_team_size integer,
    current_team_size integer DEFAULT 0,
    CONSTRAINT ideas_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idea_id uuid,
    auth_user_id uuid,
    community_user_id uuid,
    role text DEFAULT 'contributor'::text,
    status text DEFAULT 'pending'::text,
    skills_offered text[] DEFAULT '{}'::text[],
    message text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT team_members_role_check CHECK ((role = ANY (ARRAY['creator'::text, 'contributor'::text, 'interested'::text]))),
    CONSTRAINT team_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'active'::text, 'left'::text])))
);


--
-- Name: admin_ideas_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_ideas_overview WITH (security_invoker='true') AS
 SELECT i.id,
    i.title,
    i.status,
    i.created_at,
    i.upvotes,
    i.current_team_size,
    i.max_team_size,
    c.name AS creator_name,
    NULL::text AS creator_email,
    ( SELECT json_agg(json_build_object('user_id', tm.auth_user_id, 'name', tc.name, 'email', NULL::text, 'role', tm.role, 'status', tm.status, 'skills_offered', tm.skills_offered, 'joined_at', tm.joined_at)) AS json_agg
           FROM (public.team_members tm
             JOIN public.community tc ON ((tm.community_user_id = tc.id)))
          WHERE ((tm.idea_id = i.id) AND (tm.status = ANY (ARRAY['approved'::text, 'active'::text])))) AS team_members
   FROM (public.ideas i
     LEFT JOIN public.community c ON ((i.created_by_community_id = c.id)));


--
-- Name: bbs_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bbs_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'public'::text,
    project_id uuid,
    user1_id uuid,
    user2_id uuid,
    description text,
    is_archived boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bbs_channels_check CHECK (((type <> 'dm'::text) OR ((user1_id IS NOT NULL) AND (user2_id IS NOT NULL)))),
    CONSTRAINT bbs_channels_type_check CHECK ((type = ANY (ARRAY['public'::text, 'project'::text, 'dm'::text])))
);


--
-- Name: bbs_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bbs_messages (
    id bigint NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    username text DEFAULT 'Guest'::text,
    channel_id uuid,
    user_id uuid,
    reply_to_id bigint
);


--
-- Name: bbs_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bbs_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.bbs_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bbs_online; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bbs_online (
    username text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    zork_mode boolean DEFAULT false
);


--
-- Name: bbs_online_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bbs_online_active WITH (security_invoker='true') AS
 SELECT username,
    last_seen,
    zork_mode
   FROM public.bbs_online
  WHERE (last_seen > (now() - '00:00:25'::interval))
  ORDER BY last_seen DESC;


--
-- Name: bbs_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bbs_presence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: beacons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beacons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beacon_key text NOT NULL,
    label text NOT NULL,
    kind text NOT NULL,
    group_id uuid,
    is_active boolean DEFAULT true,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: capability_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capability_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capability_id uuid NOT NULL,
    member_id uuid NOT NULL,
    project_id uuid,
    goal text,
    task_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    baseline_hours numeric(10,2),
    actual_hours numeric(10,2),
    baseline_cost numeric(12,2),
    actual_cost numeric(12,2),
    outcome_status text DEFAULT 'planned'::text NOT NULL,
    verification_status text DEFAULT 'self_reported'::text NOT NULL,
    quality_note text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capability_attempts_actual_cost_check CHECK (((actual_cost IS NULL) OR (actual_cost >= (0)::numeric))),
    CONSTRAINT capability_attempts_actual_hours_check CHECK (((actual_hours IS NULL) OR (actual_hours >= (0)::numeric))),
    CONSTRAINT capability_attempts_baseline_cost_check CHECK (((baseline_cost IS NULL) OR (baseline_cost >= (0)::numeric))),
    CONSTRAINT capability_attempts_baseline_hours_check CHECK (((baseline_hours IS NULL) OR (baseline_hours >= (0)::numeric))),
    CONSTRAINT capability_attempts_outcome_status_check CHECK ((outcome_status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'succeeded'::text, 'not_succeeded'::text]))),
    CONSTRAINT capability_attempts_verification_status_check CHECK ((verification_status = ANY (ARRAY['self_reported'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: capability_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capability_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    goal text NOT NULL,
    summary text,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraints jsonb DEFAULT '{}'::jsonb NOT NULL,
    failure_notes text,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    permission_mode text DEFAULT 'private'::text NOT NULL,
    evidence_status text DEFAULT 'untested'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capability_packages_evidence_status_check CHECK ((evidence_status = ANY (ARRAY['untested'::text, 'tested'::text, 'proven'::text]))),
    CONSTRAINT capability_packages_goal_check CHECK ((btrim(goal) <> ''::text)),
    CONSTRAINT capability_packages_permission_mode_check CHECK ((permission_mode = ANY (ARRAY['private'::text, 'community'::text]))),
    CONSTRAINT capability_packages_title_check CHECK ((btrim(title) <> ''::text)),
    CONSTRAINT capability_packages_version_check CHECK ((version > 0))
);


--
-- Name: client_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_errors (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    message text,
    stack text,
    url text,
    "timestamp" timestamp with time zone DEFAULT now(),
    level text,
    category text,
    environment text,
    user_agent text
);


--
-- Name: community_backup_pre_oauth_migration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_backup_pre_oauth_migration (
    name text,
    skills text,
    interests text[],
    x integer,
    y integer,
    created_at timestamp with time zone,
    id uuid,
    email text,
    image_url text,
    endorsements jsonb,
    availability text,
    user_id uuid,
    bio text,
    newsletter_opt_in boolean,
    newsletter_opt_in_at timestamp with time zone,
    connection_count integer,
    updated_at timestamp with time zone,
    profile_completed boolean,
    user_role text,
    image_path text,
    projects_created integer,
    projects_joined integer,
    bids_submitted integer,
    bids_accepted integer,
    role text,
    xp integer,
    level integer,
    login_streak integer,
    last_login timestamp with time zone,
    daily_quests_completed jsonb,
    endorsements_given integer,
    endorsements_received integer,
    onboarding_completed boolean,
    onboarding_step integer,
    onboarding_started_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    previous_login_at timestamp with time zone,
    last_start_view_at timestamp with time zone,
    start_view_count integer,
    is_hidden boolean,
    avatar_storage_path text,
    total_xp integer,
    current_streak integer,
    last_activity_date date,
    is_disabled boolean
);


--
-- Name: community_experience_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_experience_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    community_id uuid NOT NULL,
    experience text NOT NULL,
    status text DEFAULT 'authorized'::text NOT NULL,
    authorized_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT community_experience_authorizations_status_check CHECK ((status = ANY (ARRAY['authorized'::text, 'needs_reconfirmation'::text, 'revoked'::text])))
);


--
-- Name: community_intelligence_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_intelligence_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_community_id uuid NOT NULL,
    subject_type text DEFAULT 'community_profile'::text NOT NULL,
    subject_id uuid NOT NULL,
    episode_id uuid,
    client_operation_id uuid,
    object_type text NOT NULL,
    object_id uuid NOT NULL,
    event_type text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    provenance text DEFAULT 'authored'::text NOT NULL,
    source text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    correction_of_event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_intelligence_events_event_type_check CHECK ((event_type = ANY (ARRAY['seeking_started'::text, 'seeking_ended'::text, 'offering_started'::text, 'offering_ended'::text, 'participation_started'::text, 'participation_ended'::text, 'project_status_changed'::text, 'opportunity_opened'::text, 'opportunity_closed'::text, 'meaningful_update'::text, 'event_corrected'::text]))),
    CONSTRAINT community_intelligence_events_object_type_check CHECK ((object_type = ANY (ARRAY['project'::text, 'theme'::text, 'organization'::text, 'opportunity'::text, 'intent'::text]))),
    CONSTRAINT community_intelligence_events_provenance_check CHECK ((provenance = ANY (ARRAY['authored'::text, 'system'::text]))),
    CONSTRAINT community_intelligence_events_subject_type_check CHECK ((subject_type = ANY (ARRAY['community_profile'::text, 'project'::text, 'organization'::text, 'opportunity'::text, 'theme'::text, 'intent'::text]))),
    CONSTRAINT community_intelligence_events_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'nearify'::text, 'private'::text])))
);


--
-- Name: community_intent_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_intent_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_community_id uuid NOT NULL,
    subject_type text DEFAULT 'community_profile'::text NOT NULL,
    subject_id uuid NOT NULL,
    episode_id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_operation_id uuid NOT NULL,
    intent_type text NOT NULL,
    subject_key text NOT NULL,
    subject_label text NOT NULL,
    statement text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    last_confirmed_at timestamp with time zone,
    ended_at timestamp with time zone,
    voided_at timestamp with time zone,
    voided_by_event_id uuid,
    visibility text DEFAULT 'public'::text NOT NULL,
    provenance text DEFAULT 'authored'::text NOT NULL,
    source text DEFAULT 'community_intent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_intent_statements_check CHECK (((expires_at IS NULL) OR (expires_at > starts_at))),
    CONSTRAINT community_intent_statements_check1 CHECK ((((active = true) AND (ended_at IS NULL)) OR ((active = false) AND (ended_at IS NOT NULL)))),
    CONSTRAINT community_intent_statements_intent_type_check CHECK ((intent_type = ANY (ARRAY['seeking'::text, 'offering'::text]))),
    CONSTRAINT community_intent_statements_provenance_check CHECK ((provenance = ANY (ARRAY['authored'::text, 'imported'::text]))),
    CONSTRAINT community_intent_statements_statement_check CHECK ((length(TRIM(BOTH FROM statement)) > 0)),
    CONSTRAINT community_intent_statements_subject_key_check CHECK ((length(TRIM(BOTH FROM subject_key)) > 0)),
    CONSTRAINT community_intent_statements_subject_label_check CHECK ((length(TRIM(BOTH FROM subject_label)) > 0)),
    CONSTRAINT community_intent_statements_subject_type_check CHECK ((subject_type = ANY (ARRAY['community_profile'::text, 'project'::text, 'organization'::text, 'opportunity'::text, 'theme'::text]))),
    CONSTRAINT community_intent_statements_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'nearify'::text, 'private'::text])))
);


--
-- Name: community_with_last_seen; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.community_with_last_seen WITH (security_invoker='true') AS
 SELECT c.name,
    c.skills,
    c.interests,
    c.x,
    c.y,
    c.created_at,
    c.id,
    NULL::text AS email,
    c.image_url,
    c.endorsements,
    c.availability,
    c.user_id,
    c.bio,
    c.newsletter_opt_in,
    c.newsletter_opt_in_at,
    c.connection_count,
    c.updated_at,
    c.profile_completed,
    c.user_role,
    c.image_path,
    c.projects_created,
    c.projects_joined,
    c.bids_submitted,
    c.bids_accepted,
    c.role,
    c.xp,
    c.level,
    c.login_streak,
    c.last_login,
    c.daily_quests_completed,
    c.endorsements_given,
    c.endorsements_received,
    c.onboarding_completed,
    c.onboarding_step,
    c.onboarding_started_at,
    c.onboarding_completed_at,
    c.previous_login_at,
    c.last_start_view_at,
    c.start_view_count,
    c.is_hidden,
    c.avatar_storage_path,
    c.total_xp,
    c.current_streak,
    c.last_activity_date,
    c.is_disabled,
    c.last_seen_at,
    lp.last_seen AS presence_last_seen,
    lp.expires_at AS presence_expires_at,
    lp.is_active AS presence_is_active,
    lp.context_type AS presence_context_type,
    lp.context_id AS presence_context_id
   FROM (public.community c
     LEFT JOIN ( SELECT DISTINCT ON (presence_sessions.user_id) presence_sessions.user_id,
            presence_sessions.last_seen,
            presence_sessions.expires_at,
            presence_sessions.is_active,
            presence_sessions.context_type,
            presence_sessions.context_id
           FROM public.presence_sessions
          ORDER BY presence_sessions.user_id, presence_sessions.last_seen DESC) lp ON ((lp.user_id = c.id)));


--
-- Name: connection_leaderboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.connection_leaderboard WITH (security_invoker='true') AS
 SELECT id,
    name,
    image_url,
    connection_count,
    row_number() OVER (ORDER BY connection_count DESC) AS rank
   FROM public.community c
  WHERE (connection_count > 0)
  ORDER BY connection_count DESC
 LIMIT 100;


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    status text DEFAULT 'pending'::text,
    type text DEFAULT 'generic'::text,
    context_type text,
    context_reason text,
    context_prompt text,
    context_outcome text,
    context_status text,
    context_schedule text,
    context_completed_at timestamp with time zone,
    context_completed_by uuid,
    CONSTRAINT connections_context_status_check CHECK (((context_status IS NULL) OR (context_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'completed'::text])))),
    CONSTRAINT connections_context_type_check CHECK (((context_type IS NULL) OR (context_type = 'collaboration_concierge'::text))),
    CONSTRAINT connections_different_users CHECK ((from_user_id <> to_user_id)),
    CONSTRAINT connections_from_to_valid CHECK (((from_user_id IS NOT NULL) AND (to_user_id IS NOT NULL) AND (from_user_id <> to_user_id))),
    CONSTRAINT connections_no_self_connection CHECK ((from_user_id <> to_user_id)),
    CONSTRAINT connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'canceled'::text]))),
    CONSTRAINT connections_type_check CHECK ((type = ANY (ARRAY['generic'::text, 'friend'::text, 'mentor'::text, 'collaborator'::text, 'follower'::text, 'ble_proximity'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_1_id uuid NOT NULL,
    participant_2_id uuid NOT NULL,
    last_message_at timestamp with time zone DEFAULT now(),
    last_message_preview text,
    created_at timestamp with time zone DEFAULT now(),
    context_type text,
    context_id uuid,
    context_title text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT different_participants CHECK ((participant_1_id <> participant_2_id))
);


--
-- Name: cynq_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cynq_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    stage text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    team_id uuid,
    project_id uuid,
    assigned_to uuid[] DEFAULT '{}'::uuid[],
    CONSTRAINT cynq_cards_stage_check CHECK ((stage = ANY (ARRAY['empathize'::text, 'define'::text, 'ideate'::text, 'prototype'::text, 'test'::text])))
);


--
-- Name: cynq_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cynq_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cynq_team_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: cynq_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cynq_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: daily_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    suggestion_type text NOT NULL,
    target_id uuid NOT NULL,
    score numeric DEFAULT 0 NOT NULL,
    why jsonb DEFAULT '[]'::jsonb NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'heuristic'::text NOT NULL,
    CONSTRAINT daily_suggestions_suggestion_type_check CHECK ((suggestion_type = ANY (ARRAY['person'::text, 'project'::text, 'theme'::text, 'org'::text])))
);


--
-- Name: TABLE daily_suggestions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_suggestions IS 'V2: Stores daily personalized suggestions with explicit reasoning and coordination detection';


--
-- Name: COLUMN daily_suggestions.suggestion_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_suggestions.suggestion_type IS 'Type: person, project_join, project_recruit, theme, org, coordination';


--
-- Name: COLUMN daily_suggestions.why; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_suggestions.why IS 'Array of 1-3 concrete reasons explaining the suggestion';


--
-- Name: COLUMN daily_suggestions.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_suggestions.data IS 'Additional data for UI rendering (title, description, action, etc.)';


--
-- Name: COLUMN daily_suggestions.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_suggestions.source IS 'Source: coordination (intelligence layer), heuristic (scoring), fallback (minimum guarantee)';


--
-- Name: discovery_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_dismissals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    node_id uuid NOT NULL,
    node_type text NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now(),
    reintroduce_after timestamp with time zone NOT NULL,
    dismissal_reason text,
    relevance_score_at_dismissal numeric(3,2),
    presence_energy_at_dismissal numeric(3,2),
    CONSTRAINT discovery_dismissals_node_type_check CHECK ((node_type = ANY (ARRAY['person'::text, 'project'::text, 'theme'::text, 'organization'::text])))
);


--
-- Name: TABLE discovery_dismissals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.discovery_dismissals IS 'Tracks dismissed discovery nodes with 24-hour cooldown period';


--
-- Name: COLUMN discovery_dismissals.reintroduce_after; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discovery_dismissals.reintroduce_after IS 'Timestamp after which node can be reintroduced (dismissed_at + 24 hours)';


--
-- Name: COLUMN discovery_dismissals.relevance_score_at_dismissal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discovery_dismissals.relevance_score_at_dismissal IS 'Relevance score at time of dismissal for comparison';


--
-- Name: COLUMN discovery_dismissals.presence_energy_at_dismissal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discovery_dismissals.presence_energy_at_dismissal IS 'Presence energy at time of dismissal for comparison';


--
-- Name: email_campaign_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_events (
    id text NOT NULL,
    provider_id text NOT NULL,
    event_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    person_id uuid,
    email text NOT NULL,
    email_key text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    needs_claim boolean NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    code text,
    reserved_at timestamp with time zone,
    provider_id text,
    unsubscribe_token text DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    CONSTRAINT email_campaign_recipients_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'sending'::text, 'accepted'::text, 'delivered'::text, 'failed'::text, 'unknown'::text, 'skipped'::text, 'bounced'::text, 'complained'::text])))
);


--
-- Name: email_campaign_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_suppressions (
    email_key text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    audience text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    destination text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled boolean DEFAULT false NOT NULL,
    CONSTRAINT email_campaigns_audience_check CHECK ((audience = ANY (ARRAY['all'::text, 'unclaimed'::text, 'inactive'::text, 'active'::text]))),
    CONSTRAINT email_campaigns_destination_check CHECK ((destination = ANY (ARRAY['home'::text, 'projects'::text, 'opportunities'::text]))),
    CONSTRAINT email_campaigns_message_check CHECK (((length(message) >= 1) AND (length(message) <= 5000))),
    CONSTRAINT email_campaigns_subject_check CHECK (((length(subject) >= 1) AND (length(subject) <= 160)))
);


--
-- Name: endorsements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.endorsements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endorser_id uuid NOT NULL,
    endorser_community_id uuid,
    endorsed_id uuid NOT NULL,
    endorsed_community_id uuid,
    skill text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    signal_id uuid NOT NULL,
    from_neuron_id uuid NOT NULL,
    to_neuron_id uuid NOT NULL,
    endorsement boolean NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: idea_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idea_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idea_id uuid,
    auth_user_id uuid,
    community_user_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: idea_upvotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idea_upvotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idea_id uuid,
    auth_user_id uuid,
    community_user_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: interaction_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interaction_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'suggested'::text NOT NULL,
    type text DEFAULT 'ble_proximity'::text NOT NULL,
    beacon_id uuid,
    overlap_seconds integer DEFAULT 0 NOT NULL,
    confidence numeric DEFAULT 0.5 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT interaction_edges_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'accepted'::text, 'ignored'::text, 'blocked'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages_backup (
    id uuid,
    conversation_id uuid,
    sender_id uuid,
    content text,
    read boolean,
    created_at timestamp with time zone
);


--
-- Name: nearify_event_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nearify_event_presence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    community_id uuid NOT NULL,
    nearify_event_id text NOT NULL,
    event_name text,
    event_starts_at timestamp with time zone,
    status text DEFAULT 'joined'::text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_live boolean DEFAULT false NOT NULL,
    CONSTRAINT nearify_event_presence_status_check CHECK ((status = ANY (ARRAY['joined'::text, 'left'::text])))
);


--
-- Name: nearify_identity_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nearify_identity_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    community_id uuid NOT NULL,
    nearify_user_id text NOT NULL,
    linked_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: node_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_interactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    node_id uuid NOT NULL,
    node_type text NOT NULL,
    interaction_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT node_interactions_interaction_type_check CHECK ((interaction_type = ANY (ARRAY['view'::text, 'tap'::text, 'connect'::text, 'dismiss'::text, 'focus'::text, 'explore'::text]))),
    CONSTRAINT node_interactions_node_type_check CHECK ((node_type = ANY (ARRAY['person'::text, 'project'::text, 'theme'::text, 'organization'::text])))
);


--
-- Name: TABLE node_interactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.node_interactions IS 'Tracks user interactions with nodes for relevance scoring and history';


--
-- Name: COLUMN node_interactions.node_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.node_interactions.node_type IS 'Type of node: person, project, theme, or organization';


--
-- Name: COLUMN node_interactions.interaction_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.node_interactions.interaction_type IS 'Type of interaction: view, tap, connect, dismiss, focus, or explore';


--
-- Name: COLUMN node_interactions.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.node_interactions.metadata IS 'Additional metadata about the interaction (JSON)';


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    user_id uuid NOT NULL,
    node_id text NOT NULL,
    note text
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    link text,
    read boolean DEFAULT false,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    opportunity_type text NOT NULL,
    summary text,
    description text,
    organization_id uuid,
    posted_by uuid,
    location text,
    location_type text,
    status text DEFAULT 'open'::text NOT NULL,
    url text,
    contact_email text,
    compensation_type text,
    compensation_min numeric,
    compensation_max numeric,
    skills jsonb DEFAULT '[]'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    application_deadline timestamp with time zone,
    is_featured boolean DEFAULT false,
    is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    commitment text,
    view_count integer DEFAULT 0 NOT NULL,
    application_count integer DEFAULT 0 NOT NULL,
    theme_id uuid
);


--
-- Name: opportunity_engagement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_engagement (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id text NOT NULL,
    action text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT opportunity_engagement_action_check CHECK ((action = ANY (ARRAY['join'::text, 'bookmark'::text, 'click'::text])))
);


--
-- Name: TABLE opportunity_engagement; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.opportunity_engagement IS 'Tracks user engagement with opportunities (join, bookmark, click actions)';


--
-- Name: opportunity_engagement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opportunity_engagement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opportunity_engagement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opportunity_engagement_id_seq OWNED BY public.opportunity_engagement.id;


--
-- Name: opportunity_interest_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_interest_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_interest_id uuid NOT NULL,
    channel text NOT NULL,
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT opportunity_interest_followups_channel_check CHECK ((channel = ANY (ARRAY['message'::text, 'email'::text])))
);


--
-- Name: TABLE opportunity_interest_followups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.opportunity_interest_followups IS 'Append-only poster-private history that message or email follow-up was initiated for an opportunity interest; it does not represent delivery.';


--
-- Name: opportunity_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    community_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE opportunity_interests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.opportunity_interests IS 'Private expressions of interest, visible only to the interested member and opportunity poster.';


--
-- Name: organization_followers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_followers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    community_id uuid,
    followed_at timestamp with time zone DEFAULT now()
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    community_id uuid,
    role text DEFAULT 'member'::text,
    title text,
    bio text,
    can_post_opportunities boolean DEFAULT false,
    can_manage_members boolean DEFAULT false,
    can_edit_profile boolean DEFAULT false,
    status text DEFAULT 'active'::text,
    joined_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: organization_theme_sponsorships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_theme_sponsorships (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    theme_id uuid,
    sponsorship_type text,
    description text,
    amount numeric(10,2),
    status text DEFAULT 'active'::text,
    started_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    website text,
    logo_url text,
    banner_url text,
    industry text[],
    size text,
    location text,
    founded_year integer,
    linkedin_url text,
    twitter_url text,
    github_url text,
    follower_count integer DEFAULT 0,
    opportunity_count integer DEFAULT 0,
    verified boolean DEFAULT false,
    status text DEFAULT 'active'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    community_id uuid,
    session_id uuid,
    event_type text NOT NULL,
    entity_type text,
    entity_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_events_event_type_check CHECK ((event_type = ANY (ARRAY['session_started'::text, 'person_viewed'::text, 'connection_requested'::text, 'connection_accepted'::text, 'opportunity_viewed'::text, 'message_sent'::text, 'reflection_viewed'::text])))
);


--
-- Name: TABLE product_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_events IS 'Fixed, small taxonomy of meaningful product actions (see the CHECK constraint). No content/text/URLs/device data -- entity_id is a bare pointer only. opportunity_applied and project_joined were evaluated and left out: no single canonical, reliably-wired production action exists for either (see the migration''s companion report).';


--
-- Name: product_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    community_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE product_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_sessions IS 'One row per qualifying authenticated visit. A visit resumes the same row (last_activity_at extended, throttled) if activity continues within 30 minutes; otherwise a new row is created. Never written for anonymous/pre-auth visits.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    name text,
    bio text,
    skills text[],
    image_url text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles_with_last_seen; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profiles_with_last_seen WITH (security_invoker='true') AS
 SELECT p.id,
    p.email,
    p.name,
    p.bio,
    p.skills,
    p.image_url,
    p.updated_at,
    lp.last_seen AS presence_last_seen,
    lp.expires_at AS presence_expires_at,
    lp.is_active AS presence_is_active,
    lp.context_type AS presence_context_type,
    lp.context_id AS presence_context_id
   FROM (public.profiles p
     LEFT JOIN ( SELECT DISTINCT ON (presence_sessions.user_id) presence_sessions.user_id,
            presence_sessions.last_seen,
            presence_sessions.expires_at,
            presence_sessions.is_active,
            presence_sessions.context_type,
            presence_sessions.context_id
           FROM public.presence_sessions
          ORDER BY presence_sessions.user_id, presence_sessions.last_seen DESC) lp ON ((lp.user_id = p.id)));


--
-- Name: project_bids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_bids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pitch_message text NOT NULL,
    proposed_role text,
    portfolio_links text[] DEFAULT '{}'::text[],
    availability text,
    status text DEFAULT 'pending'::text,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT project_bids_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: project_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_identifier text NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    project_id uuid
);


--
-- Name: project_interest_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_interest_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_member_id uuid NOT NULL,
    channel text NOT NULL,
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_interest_followups_channel_check CHECK ((channel = ANY (ARRAY['message'::text, 'email'::text])))
);


--
-- Name: TABLE project_interest_followups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_interest_followups IS 'Append-only project-owner-private history of Message or native Email follow-up initiated for a pending join request; never delivery status.';


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    contribution_notes text,
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone
);


--
-- Name: project_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    user_id uuid,
    status text DEFAULT 'pending'::text,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    owner_id uuid,
    related_url text,
    due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    completion_note text,
    CONSTRAINT project_tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT project_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text]))),
    CONSTRAINT project_tasks_title_not_blank CHECK ((btrim(title) <> ''::text))
);


--
-- Name: COLUMN project_tasks.completion_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_tasks.completion_note IS 'Brief member-written summary of what was accomplished when this task was completed.';


--
-- Name: project_upvotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_upvotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_identifier text NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    required_skills text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'open'::text,
    timeline text,
    budget text,
    use_cynq_workflow boolean DEFAULT true,
    view_count integer DEFAULT 0,
    bid_count integer DEFAULT 0,
    upvote_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    name text DEFAULT ''::text NOT NULL,
    skills_needed text DEFAULT ''::text NOT NULL,
    theme_id uuid,
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['open'::text, 'active'::text, 'completed'::text, 'cancelled'::text, 'archived'::text])))
);


--
-- Name: recent_interactions_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.recent_interactions_summary WITH (security_invoker='true') AS
 SELECT user_id,
    node_id,
    node_type,
    count(*) AS total_interactions,
    max(created_at) AS last_interaction,
    array_agg(DISTINCT interaction_type) AS interaction_types
   FROM public.node_interactions
  WHERE (created_at > (now() - '7 days'::interval))
  GROUP BY user_id, node_id, node_type;


--
-- Name: signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    type text NOT NULL,
    payload jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_visit_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visit_sessions (
    session_id uuid NOT NULL,
    browser_id uuid NOT NULL,
    auth_user_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skill_colors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_colors (
    skill text NOT NULL,
    color text NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id bigint NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'General'::text,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: skills_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skills_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skills_id_seq OWNED BY public.skills.id;


--
-- Name: streak_leaderboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.streak_leaderboard WITH (security_invoker='true') AS
 SELECT id,
    name,
    image_url,
    login_streak,
    row_number() OVER (ORDER BY login_streak DESC) AS rank
   FROM public.community c
  WHERE (login_streak > 0)
  ORDER BY login_streak DESC
 LIMIT 100;


--
-- Name: swag_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swag_votes (
    id bigint NOT NULL,
    swag text NOT NULL,
    votes integer DEFAULT 0
);


--
-- Name: swag_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.swag_votes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.swag_votes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: theme_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_id uuid NOT NULL,
    created_by uuid NOT NULL,
    action_type text NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    CONSTRAINT theme_actions_action_type_check CHECK ((action_type = ANY (ARRAY['propose_project'::text, 'schedule_session'::text, 'draft_outline'::text, 'signal_availability'::text])))
);


--
-- Name: theme_circles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_circles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text,
    created_by uuid,
    origin_type text NOT NULL,
    activity_score integer DEFAULT 0,
    last_activity_at timestamp with time zone DEFAULT now(),
    x real,
    y real,
    cta_text text,
    cta_link text,
    CONSTRAINT theme_circles_origin_type_check CHECK ((origin_type = ANY (ARRAY['admin'::text, 'search'::text, 'behavior'::text, 'event'::text]))),
    CONSTRAINT theme_circles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'archived'::text, 'dissipated'::text])))
);


--
-- Name: theme_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_id uuid NOT NULL,
    community_id uuid NOT NULL,
    engagement_level text DEFAULT 'interested'::text NOT NULL,
    signals text[] DEFAULT '{}'::text[],
    joined_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    participation_confirmed_at timestamp with time zone,
    participation_expires_at timestamp with time zone,
    CONSTRAINT theme_participants_engagement_level_check CHECK ((engagement_level = ANY (ARRAY['hover'::text, 'exploring'::text, 'interested'::text, 'active'::text, 'leading'::text, 'proposing'::text, 'participating'::text]))),
    CONSTRAINT theme_participants_participation_state_check CHECK ((((engagement_level = 'participating'::text) AND (participation_confirmed_at IS NOT NULL) AND (participation_expires_at IS NOT NULL) AND (participation_expires_at > participation_confirmed_at)) OR ((engagement_level <> 'participating'::text) AND (participation_confirmed_at IS NULL) AND (participation_expires_at IS NULL))))
);


--
-- Name: theme_projects_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.theme_projects_view WITH (security_invoker='true') AS
 SELECT tc.id AS theme_id,
    tc.title AS theme_title,
    tc.tags AS theme_tags,
    tc.status AS theme_status,
    tc.expires_at,
    p.id AS project_id,
    p.title AS project_title,
    p.description AS project_description,
    p.status AS project_status,
    p.creator_id,
    p.tags AS project_tags,
    p.created_at AS project_created_at,
        CASE
            WHEN (p.theme_id = tc.id) THEN 'explicit'::text
            ELSE 'tag_match'::text
        END AS relationship_type
   FROM (public.theme_circles tc
     LEFT JOIN public.projects p ON (((p.theme_id = tc.id) OR ((p.theme_id IS NULL) AND (p.tags && tc.tags)))))
  WHERE ((tc.status = 'active'::text) AND ((p.status = ANY (ARRAY['active'::text, 'in-progress'::text, 'open'::text])) OR (p.id IS NULL)))
  ORDER BY tc.title,
        CASE
            WHEN (p.theme_id = tc.id) THEN 'explicit'::text
            ELSE 'tag_match'::text
        END, p.created_at DESC;


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    community_id uuid,
    achievement_id uuid,
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: watchlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlists (
    user_id uuid NOT NULL,
    node_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL
);


--
-- Name: xp_leaderboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.xp_leaderboard WITH (security_invoker='true') AS
 SELECT id,
    name,
    image_url,
    xp,
    level,
    row_number() OVER (ORDER BY xp DESC) AS rank
   FROM public.community c
  WHERE (xp > 0)
  ORDER BY xp DESC
 LIMIT 100;


--
-- Name: zork_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zork_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text,
    action text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: zork_saves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zork_saves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    save_data text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: opportunity_engagement id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_engagement ALTER COLUMN id SET DEFAULT nextval('public.opportunity_engagement_id_seq'::regclass);


--
-- Name: skills id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills ALTER COLUMN id SET DEFAULT nextval('public.skills_id_seq'::regclass);


--
-- Name: achievements achievements_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_code_key UNIQUE (code);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: admin_claim_email_requests admin_claim_email_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_claim_email_requests
    ADD CONSTRAINT admin_claim_email_requests_pkey PRIMARY KEY (id);


--
-- Name: bbs_channels bbs_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_channels
    ADD CONSTRAINT bbs_channels_pkey PRIMARY KEY (id);


--
-- Name: bbs_messages bbs_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_messages
    ADD CONSTRAINT bbs_messages_pkey PRIMARY KEY (id);


--
-- Name: bbs_online bbs_online_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_online
    ADD CONSTRAINT bbs_online_pkey PRIMARY KEY (username);


--
-- Name: bbs_presence bbs_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_presence
    ADD CONSTRAINT bbs_presence_pkey PRIMARY KEY (id);


--
-- Name: beacons beacons_beacon_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beacons
    ADD CONSTRAINT beacons_beacon_key_key UNIQUE (beacon_key);


--
-- Name: beacons beacons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beacons
    ADD CONSTRAINT beacons_pkey PRIMARY KEY (id);


--
-- Name: capability_attempts capability_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_attempts
    ADD CONSTRAINT capability_attempts_pkey PRIMARY KEY (id);


--
-- Name: capability_packages capability_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_packages
    ADD CONSTRAINT capability_packages_pkey PRIMARY KEY (id);


--
-- Name: community_experience_authorizations cea_community_experience_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_experience_authorizations
    ADD CONSTRAINT cea_community_experience_unique UNIQUE (community_id, experience);


--
-- Name: client_errors client_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_errors
    ADD CONSTRAINT client_errors_pkey PRIMARY KEY (id);


--
-- Name: community_experience_authorizations community_experience_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_experience_authorizations
    ADD CONSTRAINT community_experience_authorizations_pkey PRIMARY KEY (id);


--
-- Name: community_intelligence_events community_intelligence_events_author_community_id_client_op_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_intelligence_events
    ADD CONSTRAINT community_intelligence_events_author_community_id_client_op_key UNIQUE (author_community_id, client_operation_id);


--
-- Name: community_intelligence_events community_intelligence_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_intelligence_events
    ADD CONSTRAINT community_intelligence_events_pkey PRIMARY KEY (id);


--
-- Name: community_intent_statements community_intent_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_intent_statements
    ADD CONSTRAINT community_intent_statements_pkey PRIMARY KEY (id);


--
-- Name: community community_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community
    ADD CONSTRAINT community_pkey PRIMARY KEY (id);


--
-- Name: community community_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community
    ADD CONSTRAINT community_user_id_key UNIQUE (user_id);


--
-- Name: community community_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community
    ADD CONSTRAINT community_user_id_unique UNIQUE (user_id);


--
-- Name: community community_user_neuron_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community
    ADD CONSTRAINT community_user_neuron_unique UNIQUE (user_id, id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: cynq_cards cynq_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_cards
    ADD CONSTRAINT cynq_cards_pkey PRIMARY KEY (id);


--
-- Name: cynq_team_members cynq_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_team_members
    ADD CONSTRAINT cynq_team_members_pkey PRIMARY KEY (id);


--
-- Name: cynq_team_members cynq_team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_team_members
    ADD CONSTRAINT cynq_team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: cynq_teams cynq_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_teams
    ADD CONSTRAINT cynq_teams_pkey PRIMARY KEY (id);


--
-- Name: daily_suggestions daily_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_suggestions
    ADD CONSTRAINT daily_suggestions_pkey PRIMARY KEY (id);


--
-- Name: daily_suggestions daily_suggestions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_suggestions
    ADD CONSTRAINT daily_suggestions_unique UNIQUE (user_id, date, suggestion_type, target_id);


--
-- Name: discovery_dismissals discovery_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_dismissals
    ADD CONSTRAINT discovery_dismissals_pkey PRIMARY KEY (id);


--
-- Name: discovery_dismissals discovery_dismissals_user_id_node_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_dismissals
    ADD CONSTRAINT discovery_dismissals_user_id_node_id_key UNIQUE (user_id, node_id);


--
-- Name: email_campaign_events email_campaign_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_events
    ADD CONSTRAINT email_campaign_events_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_recipients email_campaign_recipients_campaign_id_email_key_is_test_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_campaign_id_email_key_is_test_key UNIQUE (campaign_id, email_key, is_test);


--
-- Name: email_campaign_recipients email_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_recipients email_campaign_recipients_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_provider_id_key UNIQUE (provider_id);


--
-- Name: email_campaign_suppressions email_campaign_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_suppressions
    ADD CONSTRAINT email_campaign_suppressions_pkey PRIMARY KEY (email_key);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: endorsements endorsements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT endorsements_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: idea_comments idea_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_comments
    ADD CONSTRAINT idea_comments_pkey PRIMARY KEY (id);


--
-- Name: idea_upvotes idea_upvotes_idea_id_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_upvotes
    ADD CONSTRAINT idea_upvotes_idea_id_auth_user_id_key UNIQUE (idea_id, auth_user_id);


--
-- Name: idea_upvotes idea_upvotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_upvotes
    ADD CONSTRAINT idea_upvotes_pkey PRIMARY KEY (id);


--
-- Name: ideas ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT ideas_pkey PRIMARY KEY (id);


--
-- Name: interaction_edges interaction_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_edges
    ADD CONSTRAINT interaction_edges_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: nearify_event_presence nearify_event_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_event_presence
    ADD CONSTRAINT nearify_event_presence_pkey PRIMARY KEY (id);


--
-- Name: nearify_identity_map nearify_identity_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_identity_map
    ADD CONSTRAINT nearify_identity_map_pkey PRIMARY KEY (id);


--
-- Name: nearify_event_presence nep_community_event_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_event_presence
    ADD CONSTRAINT nep_community_event_unique UNIQUE (community_id, nearify_event_id);


--
-- Name: nearify_identity_map nim_community_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_identity_map
    ADD CONSTRAINT nim_community_unique UNIQUE (community_id);


--
-- Name: nearify_identity_map nim_nearify_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_identity_map
    ADD CONSTRAINT nim_nearify_id_unique UNIQUE (nearify_user_id);


--
-- Name: node_interactions node_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_interactions
    ADD CONSTRAINT node_interactions_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (user_id, node_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);


--
-- Name: opportunity_engagement opportunity_engagement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_engagement
    ADD CONSTRAINT opportunity_engagement_pkey PRIMARY KEY (id);


--
-- Name: opportunity_interest_followups opportunity_interest_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_interest_followups
    ADD CONSTRAINT opportunity_interest_followups_pkey PRIMARY KEY (id);


--
-- Name: opportunity_interests opportunity_interests_opportunity_id_community_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_interests
    ADD CONSTRAINT opportunity_interests_opportunity_id_community_id_key UNIQUE (opportunity_id, community_id);


--
-- Name: opportunity_interests opportunity_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_interests
    ADD CONSTRAINT opportunity_interests_pkey PRIMARY KEY (id);


--
-- Name: organization_followers organization_followers_organization_id_community_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_followers
    ADD CONSTRAINT organization_followers_organization_id_community_id_key UNIQUE (organization_id, community_id);


--
-- Name: organization_followers organization_followers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_followers
    ADD CONSTRAINT organization_followers_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_organization_id_community_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_community_id_key UNIQUE (organization_id, community_id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organization_theme_sponsorships organization_theme_sponsorships_organization_id_theme_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_theme_sponsorships
    ADD CONSTRAINT organization_theme_sponsorships_organization_id_theme_id_key UNIQUE (organization_id, theme_id);


--
-- Name: organization_theme_sponsorships organization_theme_sponsorships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_theme_sponsorships
    ADD CONSTRAINT organization_theme_sponsorships_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: presence_sessions presence_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presence_sessions
    ADD CONSTRAINT presence_sessions_pkey PRIMARY KEY (id);


--
-- Name: product_events product_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_pkey PRIMARY KEY (id);


--
-- Name: product_sessions product_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sessions
    ADD CONSTRAINT product_sessions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_bids project_bids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bids
    ADD CONSTRAINT project_bids_pkey PRIMARY KEY (id);


--
-- Name: project_bids project_bids_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bids
    ADD CONSTRAINT project_bids_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_comments project_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_pkey PRIMARY KEY (id);


--
-- Name: project_interest_followups project_interest_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_interest_followups
    ADD CONSTRAINT project_interest_followups_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_members project_members_project_user_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_user_uniq UNIQUE (project_id, user_id);


--
-- Name: project_requests project_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_requests
    ADD CONSTRAINT project_requests_pkey PRIMARY KEY (id);


--
-- Name: project_requests project_requests_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_requests
    ADD CONSTRAINT project_requests_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_tasks project_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_pkey PRIMARY KEY (id);


--
-- Name: project_upvotes project_upvotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_upvotes
    ADD CONSTRAINT project_upvotes_pkey PRIMARY KEY (id);


--
-- Name: project_upvotes project_upvotes_user_id_project_identifier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_upvotes
    ADD CONSTRAINT project_upvotes_user_id_project_identifier_key UNIQUE (user_id, project_identifier);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);


--
-- Name: site_visit_sessions site_visit_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_sessions
    ADD CONSTRAINT site_visit_sessions_pkey PRIMARY KEY (session_id);


--
-- Name: skill_colors skill_colors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_colors
    ADD CONSTRAINT skill_colors_pkey PRIMARY KEY (skill);


--
-- Name: skills skills_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_name_key UNIQUE (name);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: swag_votes swag_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swag_votes
    ADD CONSTRAINT swag_votes_pkey PRIMARY KEY (id);


--
-- Name: swag_votes swag_votes_swag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swag_votes
    ADD CONSTRAINT swag_votes_swag_key UNIQUE (swag);


--
-- Name: team_members team_members_idea_id_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_idea_id_auth_user_id_key UNIQUE (idea_id, auth_user_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: theme_actions theme_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_actions
    ADD CONSTRAINT theme_actions_pkey PRIMARY KEY (id);


--
-- Name: theme_circles theme_circles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_circles
    ADD CONSTRAINT theme_circles_pkey PRIMARY KEY (id);


--
-- Name: theme_participants theme_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_participants
    ADD CONSTRAINT theme_participants_pkey PRIMARY KEY (id);


--
-- Name: theme_participants theme_participants_theme_id_community_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_participants
    ADD CONSTRAINT theme_participants_theme_id_community_id_key UNIQUE (theme_id, community_id);


--
-- Name: connections unique_connection_from_to; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT unique_connection_from_to UNIQUE (from_user_id, to_user_id);


--
-- Name: endorsements unique_endorsement; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT unique_endorsement UNIQUE (endorser_id, endorsed_id, skill);


--
-- Name: conversations unique_participants; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT unique_participants UNIQUE (participant_1_id, participant_2_id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);


--
-- Name: watchlists watchlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_pkey PRIMARY KEY (user_id, node_id);


--
-- Name: zork_events zork_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zork_events
    ADD CONSTRAINT zork_events_pkey PRIMARY KEY (id);


--
-- Name: zork_saves zork_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zork_saves
    ADD CONSTRAINT zork_saves_pkey PRIMARY KEY (id);


--
-- Name: zork_saves zork_saves_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zork_saves
    ADD CONSTRAINT zork_saves_username_key UNIQUE (username);


--
-- Name: activity_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_created_at_idx ON public.activity_log USING btree (created_at DESC);


--
-- Name: activity_log_idea_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_idea_id_idx ON public.activity_log USING btree (idea_id);


--
-- Name: activity_log_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_project_id_idx ON public.activity_log USING btree (project_id);


--
-- Name: admin_claim_email_actor_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_claim_email_actor_recent ON public.admin_claim_email_requests USING btree (requested_by, requested_at);


--
-- Name: admin_claim_email_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_claim_email_cleanup ON public.admin_claim_email_requests USING btree (requested_at);


--
-- Name: admin_claim_email_recipient_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_claim_email_recipient_recent ON public.admin_claim_email_requests USING btree (email_key, requested_at);


--
-- Name: campaign_events_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_events_provider ON public.email_campaign_events USING btree (provider_id);


--
-- Name: campaign_recipient_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recipient_queue ON public.email_campaign_recipients USING btree (campaign_id, status);


--
-- Name: campaign_recipient_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recipient_recent ON public.email_campaign_recipients USING btree (email_key, reserved_at);


--
-- Name: campaign_recipient_unsubscribe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX campaign_recipient_unsubscribe ON public.email_campaign_recipients USING btree (unsubscribe_token);


--
-- Name: community_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_email_idx ON public.community USING btree (email);


--
-- Name: community_name_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_name_ci ON public.community USING btree (lower(name));


--
-- Name: community_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_name_trgm ON public.community USING gin (name extensions.gin_trgm_ops);


--
-- Name: community_skills_gin_text_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_skills_gin_text_idx ON public.community USING gin (to_tsvector('english'::regconfig, skills));


--
-- Name: community_user_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX community_user_id_unique_idx ON public.community USING btree (user_id);


--
-- Name: connections_unique_active_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX connections_unique_active_pair ON public.connections USING btree (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id)) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text]));


--
-- Name: endorsements_endorsed_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX endorsements_endorsed_id_idx ON public.endorsements USING btree (endorsed_id);


--
-- Name: endorsements_endorser_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX endorsements_endorser_id_idx ON public.endorsements USING btree (endorser_id);


--
-- Name: endorsements_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX endorsements_skill_idx ON public.endorsements USING btree (skill);


--
-- Name: endorsements_unique_pair_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX endorsements_unique_pair_skill ON public.endorsements USING btree (endorser_community_id, endorsed_community_id, skill);


--
-- Name: idea_comments_idea_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idea_comments_idea_id_idx ON public.idea_comments USING btree (idea_id);


--
-- Name: idea_upvotes_auth_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idea_upvotes_auth_user_id_idx ON public.idea_upvotes USING btree (auth_user_id);


--
-- Name: idea_upvotes_idea_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idea_upvotes_idea_id_idx ON public.idea_upvotes USING btree (idea_id);


--
-- Name: ideas_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ideas_created_at_idx ON public.ideas USING btree (created_at DESC);


--
-- Name: ideas_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ideas_creator_idx ON public.ideas USING btree (created_by_auth_id);


--
-- Name: ideas_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ideas_status_idx ON public.ideas USING btree (status);


--
-- Name: idx_activity_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_community ON public.activity_log USING btree (community_user_id, created_at DESC);


--
-- Name: idx_activity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_type ON public.activity_log USING btree (action_type);


--
-- Name: idx_activity_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_user ON public.activity_log USING btree (auth_user_id, created_at DESC);


--
-- Name: idx_bbs_channels_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbs_channels_project_id ON public.bbs_channels USING btree (project_id);


--
-- Name: idx_bbs_channels_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbs_channels_type ON public.bbs_channels USING btree (type);


--
-- Name: idx_bbs_messages_channel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbs_messages_channel_id ON public.bbs_messages USING btree (channel_id);


--
-- Name: idx_bbs_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbs_messages_created_at ON public.bbs_messages USING btree (created_at DESC);


--
-- Name: idx_bbs_messages_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbs_messages_user_id ON public.bbs_messages USING btree (user_id);


--
-- Name: idx_capability_attempts_capability; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capability_attempts_capability ON public.capability_attempts USING btree (capability_id, outcome_status);


--
-- Name: idx_capability_attempts_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capability_attempts_member ON public.capability_attempts USING btree (member_id, created_at DESC);


--
-- Name: idx_capability_attempts_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capability_attempts_project ON public.capability_attempts USING btree (project_id, outcome_status);


--
-- Name: idx_capability_packages_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capability_packages_project ON public.capability_packages USING btree (project_id, updated_at DESC);


--
-- Name: idx_capability_packages_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capability_packages_visibility ON public.capability_packages USING btree (permission_mode, evidence_status);


--
-- Name: idx_cea_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cea_community ON public.community_experience_authorizations USING btree (community_id);


--
-- Name: idx_cea_experience_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cea_experience_status ON public.community_experience_authorizations USING btree (experience, status);


--
-- Name: idx_community_intelligence_events_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_intelligence_events_object ON public.community_intelligence_events USING btree (subject_type, subject_id, occurred_at DESC);


--
-- Name: idx_community_intelligence_events_profile_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_intelligence_events_profile_time ON public.community_intelligence_events USING btree (author_community_id, occurred_at DESC);


--
-- Name: idx_community_intent_active_episode; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_community_intent_active_episode ON public.community_intent_statements USING btree (subject_type, subject_id, intent_type, subject_key) WHERE (active = true);


--
-- Name: idx_community_intent_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_intent_current ON public.community_intent_statements USING btree (author_community_id, intent_type, subject_key, active, expires_at);


--
-- Name: idx_community_intent_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_community_intent_operation ON public.community_intent_statements USING btree (author_community_id, client_operation_id);


--
-- Name: idx_community_is_hidden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_is_hidden ON public.community USING btree (is_hidden);


--
-- Name: idx_community_last_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_last_seen_at ON public.community USING btree (last_seen_at);


--
-- Name: idx_community_last_seen_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_last_seen_at_desc ON public.community USING btree (last_seen_at DESC);


--
-- Name: idx_community_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_level ON public.community USING btree (level DESC);


--
-- Name: idx_community_streak; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_streak ON public.community USING btree (login_streak DESC);


--
-- Name: idx_community_total_xp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_total_xp ON public.community USING btree (total_xp);


--
-- Name: idx_community_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_user_id ON public.community USING btree (user_id);


--
-- Name: idx_community_xp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_xp ON public.community USING btree (xp DESC);


--
-- Name: idx_connections_context_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_context_status ON public.connections USING btree (context_type, context_status) WHERE (context_type IS NOT NULL);


--
-- Name: idx_connections_from_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_from_user ON public.connections USING btree (from_user_id);


--
-- Name: idx_connections_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_status ON public.connections USING btree (status);


--
-- Name: idx_connections_to_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_to_user ON public.connections USING btree (to_user_id);


--
-- Name: idx_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message ON public.conversations USING btree (last_message_at DESC);


--
-- Name: idx_conversations_participant1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_participant1 ON public.conversations USING btree (participant_1_id);


--
-- Name: idx_conversations_participant2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_participant2 ON public.conversations USING btree (participant_2_id);


--
-- Name: idx_conversations_participant_1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_participant_1 ON public.conversations USING btree (participant_1_id);


--
-- Name: idx_conversations_participant_2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_participant_2 ON public.conversations USING btree (participant_2_id);


--
-- Name: idx_cynq_cards_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cynq_cards_created_at ON public.cynq_cards USING btree (created_at DESC);


--
-- Name: idx_cynq_cards_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cynq_cards_project_id ON public.cynq_cards USING btree (project_id);


--
-- Name: idx_cynq_cards_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cynq_cards_stage ON public.cynq_cards USING btree (stage);


--
-- Name: idx_cynq_cards_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cynq_cards_team_id ON public.cynq_cards USING btree (team_id);


--
-- Name: idx_cynq_cards_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cynq_cards_user_id ON public.cynq_cards USING btree (user_id);


--
-- Name: idx_daily_suggestions_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_suggestions_user_created ON public.daily_suggestions USING btree (user_id, created_at DESC);


--
-- Name: idx_daily_suggestions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_suggestions_user_date ON public.daily_suggestions USING btree (user_id, date DESC);


--
-- Name: idx_dismissals_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dismissals_active ON public.discovery_dismissals USING btree (user_id, dismissed_at);


--
-- Name: idx_dismissals_reintroduce; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dismissals_reintroduce ON public.discovery_dismissals USING btree (user_id, reintroduce_after);


--
-- Name: idx_dismissals_user_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dismissals_user_node ON public.discovery_dismissals USING btree (user_id, node_id);


--
-- Name: idx_feedback_from_neuron; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_from_neuron ON public.feedback USING btree (from_neuron_id);


--
-- Name: idx_feedback_signal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_signal ON public.feedback USING btree (signal_id);


--
-- Name: idx_feedback_to_neuron; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_to_neuron ON public.feedback USING btree (to_neuron_id);


--
-- Name: idx_interactions_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_node ON public.node_interactions USING btree (node_id, created_at DESC);


--
-- Name: idx_interactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_type ON public.node_interactions USING btree (interaction_type, created_at DESC);


--
-- Name: idx_interactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_user ON public.node_interactions USING btree (user_id, created_at DESC);


--
-- Name: idx_interactions_user_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_user_node ON public.node_interactions USING btree (user_id, node_id, created_at DESC);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread ON public.messages USING btree (conversation_id, read) WHERE (read = false);


--
-- Name: idx_nearify_evidence_v2_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_nearify_evidence_v2_dedup ON public.interaction_edges USING btree (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id), COALESCE((meta ->> 'event_id'::text), ''::text), COALESCE((meta ->> 'signal_type'::text), ''::text)) WHERE (((meta ->> 'source'::text) = 'nearify-evidence-v2'::text) AND ((meta ->> 'evidence_version'::text) = '2'::text));


--
-- Name: idx_nep_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nep_community ON public.nearify_event_presence USING btree (community_id);


--
-- Name: idx_nep_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nep_event ON public.nearify_event_presence USING btree (nearify_event_id);


--
-- Name: idx_nep_event_joined; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nep_event_joined ON public.nearify_event_presence USING btree (nearify_event_id) WHERE (status = 'joined'::text);


--
-- Name: idx_nep_event_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nep_event_live ON public.nearify_event_presence USING btree (nearify_event_id) WHERE (is_live = true);


--
-- Name: idx_nim_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nim_community ON public.nearify_identity_map USING btree (community_id);


--
-- Name: idx_nim_nearify_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nim_nearify_id ON public.nearify_identity_map USING btree (nearify_user_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (read);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_opp_engagement_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opp_engagement_created ON public.opportunity_engagement USING btree (created_at DESC);


--
-- Name: idx_opp_engagement_opp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opp_engagement_opp ON public.opportunity_engagement USING btree (opportunity_id);


--
-- Name: idx_opp_engagement_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opp_engagement_user ON public.opportunity_engagement USING btree (user_id);


--
-- Name: idx_opportunity_interest_followups_interest_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_interest_followups_interest_time ON public.opportunity_interest_followups USING btree (opportunity_interest_id, initiated_at DESC);


--
-- Name: idx_opportunity_interests_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_interests_community ON public.opportunity_interests USING btree (community_id, created_at DESC);


--
-- Name: idx_opportunity_interests_opportunity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunity_interests_opportunity ON public.opportunity_interests USING btree (opportunity_id, created_at DESC);


--
-- Name: idx_org_followers_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_followers_community ON public.organization_followers USING btree (community_id);


--
-- Name: idx_org_followers_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_followers_org ON public.organization_followers USING btree (organization_id);


--
-- Name: idx_org_members_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_community ON public.organization_members USING btree (community_id);


--
-- Name: idx_org_members_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_org ON public.organization_members USING btree (organization_id);


--
-- Name: idx_org_members_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_role ON public.organization_members USING btree (role);


--
-- Name: idx_org_sponsorships_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sponsorships_org ON public.organization_theme_sponsorships USING btree (organization_id);


--
-- Name: idx_org_sponsorships_theme; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sponsorships_theme ON public.organization_theme_sponsorships USING btree (theme_id);


--
-- Name: idx_organizations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_created_by ON public.organizations USING btree (created_by);


--
-- Name: idx_organizations_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_industry ON public.organizations USING gin (industry);


--
-- Name: idx_organizations_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_slug ON public.organizations USING btree (slug);


--
-- Name: idx_organizations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_status ON public.organizations USING btree (status);


--
-- Name: idx_presence_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_active ON public.presence_sessions USING btree (user_id, expires_at);


--
-- Name: idx_presence_context; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_context ON public.presence_sessions USING btree (context_type, context_id);


--
-- Name: idx_presence_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_expires ON public.presence_sessions USING btree (expires_at);


--
-- Name: idx_presence_sessions_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_sessions_is_active ON public.presence_sessions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_presence_sessions_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_sessions_last_seen ON public.presence_sessions USING btree (last_seen);


--
-- Name: idx_presence_sessions_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_sessions_user_active ON public.presence_sessions USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_presence_sessions_user_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presence_sessions_user_last_seen ON public.presence_sessions USING btree (user_id, last_seen);


--
-- Name: idx_product_events_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_events_type_time ON public.product_events USING btree (event_type, occurred_at);


--
-- Name: idx_product_events_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_events_user_time ON public.product_events USING btree (user_id, occurred_at);


--
-- Name: idx_product_sessions_user_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_sessions_user_started ON public.product_sessions USING btree (user_id, started_at);


--
-- Name: idx_project_bids_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_bids_project_id ON public.project_bids USING btree (project_id);


--
-- Name: idx_project_bids_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_bids_status ON public.project_bids USING btree (status);


--
-- Name: idx_project_bids_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_bids_user_id ON public.project_bids USING btree (user_id);


--
-- Name: idx_project_interest_followups_request_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_interest_followups_request_time ON public.project_interest_followups USING btree (project_member_id, initiated_at DESC);


--
-- Name: idx_project_members_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_members_project_id ON public.project_members USING btree (project_id);


--
-- Name: idx_project_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_members_user_id ON public.project_members USING btree (user_id);


--
-- Name: idx_project_requests_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_requests_project ON public.project_requests USING btree (project_id);


--
-- Name: idx_project_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_requests_status ON public.project_requests USING btree (status);


--
-- Name: idx_project_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_requests_user ON public.project_requests USING btree (user_id);


--
-- Name: idx_project_tasks_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_tasks_owner ON public.project_tasks USING btree (owner_id);


--
-- Name: idx_project_tasks_project_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_tasks_project_completed ON public.project_tasks USING btree (project_id, completed_at DESC);


--
-- Name: idx_project_tasks_project_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_tasks_project_status ON public.project_tasks USING btree (project_id, status);


--
-- Name: idx_project_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_tasks_status ON public.project_tasks USING btree (status);


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at DESC);


--
-- Name: idx_projects_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_creator_id ON public.projects USING btree (creator_id);


--
-- Name: idx_projects_required_skills; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_required_skills ON public.projects USING gin (required_skills);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_projects_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_tags ON public.projects USING gin (tags);


--
-- Name: idx_projects_theme; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_theme ON public.projects USING btree (theme_id) WHERE (theme_id IS NOT NULL);


--
-- Name: idx_signals_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_created_by ON public.signals USING btree (created_by);


--
-- Name: idx_skills_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_category ON public.skills USING btree (category);


--
-- Name: idx_skills_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_name ON public.skills USING btree (name);


--
-- Name: idx_skills_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_usage ON public.skills USING btree (usage_count DESC);


--
-- Name: idx_theme_circles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_circles_active ON public.theme_circles USING btree (status, expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_theme_circles_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_circles_creator ON public.theme_circles USING btree (created_by);


--
-- Name: idx_theme_participants_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_participants_community ON public.theme_participants USING btree (community_id);


--
-- Name: idx_theme_participants_current_participation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_participants_current_participation ON public.theme_participants USING btree (theme_id, engagement_level, participation_expires_at);


--
-- Name: idx_theme_participants_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_participants_engagement ON public.theme_participants USING btree (engagement_level);


--
-- Name: idx_theme_participants_theme; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_participants_theme ON public.theme_participants USING btree (theme_id, engagement_level);


--
-- Name: idx_theme_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_participants_user ON public.theme_participants USING btree (community_id);


--
-- Name: idx_user_achievements_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_achievements_community ON public.user_achievements USING btree (community_id, earned_at DESC);


--
-- Name: idx_user_achievements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_achievements_user ON public.user_achievements USING btree (user_id, earned_at DESC);


--
-- Name: interaction_edges_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interaction_edges_status_idx ON public.interaction_edges USING btree (status, created_at DESC);


--
-- Name: interaction_edges_users_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interaction_edges_users_idx ON public.interaction_edges USING btree (from_user_id, to_user_id, created_at DESC);


--
-- Name: opportunity_engagement_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunity_engagement_opportunity_idx ON public.opportunity_engagement USING btree (opportunity_id);


--
-- Name: opportunity_engagement_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunity_engagement_user_idx ON public.opportunity_engagement USING btree (user_id);


--
-- Name: presence_sessions_context_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX presence_sessions_context_time_idx ON public.presence_sessions USING btree (context_type, context_id, created_at DESC);


--
-- Name: projects_unique_creator_title; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_unique_creator_title ON public.projects USING btree (creator_id, lower(title));


--
-- Name: site_visit_sessions_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_visit_sessions_recent_idx ON public.site_visit_sessions USING btree (last_seen_at);


--
-- Name: team_members_auth_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_auth_user_id_idx ON public.team_members USING btree (auth_user_id);


--
-- Name: team_members_community_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_community_user_id_idx ON public.team_members USING btree (community_user_id);


--
-- Name: team_members_idea_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_idea_id_idx ON public.team_members USING btree (idea_id);


--
-- Name: zork_saves_username_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX zork_saves_username_idx ON public.zork_saves USING btree (username);


--
-- Name: active_organizations_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.active_organizations_summary WITH (security_invoker='true') AS
 SELECT o.id,
    o.name,
    o.slug,
    o.description,
    o.logo_url,
    o.industry,
    o.size,
    o.location,
    o.follower_count,
    o.opportunity_count,
    o.verified,
    count(DISTINCT om.id) AS member_count,
    count(DISTINCT opp.id) AS open_opportunities,
    array_agg(DISTINCT tc.title) FILTER (WHERE (tc.title IS NOT NULL)) AS sponsored_themes
   FROM ((((public.organizations o
     LEFT JOIN public.organization_members om ON (((o.id = om.organization_id) AND (om.status = 'active'::text))))
     LEFT JOIN public.opportunities opp ON (((o.id = opp.organization_id) AND (opp.status = 'open'::text))))
     LEFT JOIN public.organization_theme_sponsorships ots ON (((o.id = ots.organization_id) AND (ots.status = 'active'::text))))
     LEFT JOIN public.theme_circles tc ON ((ots.theme_id = tc.id)))
  WHERE (o.status = 'active'::text)
  GROUP BY o.id;


--
-- Name: active_themes_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.active_themes_summary WITH (security_invoker='true') AS
 SELECT tc.id,
    tc.title,
    tc.description,
    tc.tags,
    tc.created_at,
    tc.expires_at,
    tc.activity_score,
    tc.origin_type,
    count(DISTINCT tp.community_id) AS participant_count,
    count(DISTINCT
        CASE
            WHEN (tp.engagement_level = ANY (ARRAY['active'::text, 'proposing'::text])) THEN tp.community_id
            ELSE NULL::uuid
        END) AS active_count
   FROM (public.theme_circles tc
     LEFT JOIN public.theme_participants tp ON ((tc.id = tp.theme_id)))
  WHERE ((tc.status = 'active'::text) AND (tc.expires_at > now()))
  GROUP BY tc.id;


--
-- Name: projects auto_add_creator_as_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_add_creator_as_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_member();


--
-- Name: projects auto_create_project_channel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_create_project_channel AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.create_project_channel();


--
-- Name: community_intelligence_events community_intelligence_events_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER community_intelligence_events_append_only BEFORE DELETE OR UPDATE ON public.community_intelligence_events FOR EACH ROW EXECUTE FUNCTION public.reject_community_intelligence_event_mutation();


--
-- Name: connections enforce_connection_authorization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_connection_authorization BEFORE INSERT OR UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.enforce_connection_authorization();


--
-- Name: organizations enforce_organization_creator; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_organization_creator BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_creator();


--
-- Name: organization_members enforce_organization_member_authorization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_organization_member_authorization BEFORE INSERT OR DELETE OR UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_member_authorization();


--
-- Name: community enforce_photo_consent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_photo_consent BEFORE INSERT OR UPDATE OF photo_visible, photo_consent_at ON public.community FOR EACH ROW EXECUTE FUNCTION public.enforce_photo_consent();


--
-- Name: project_members enforce_project_member_authorization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_project_member_authorization BEFORE INSERT OR UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.enforce_project_member_authorization();


--
-- Name: ideas ideas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ideas_updated_at BEFORE UPDATE ON public.ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: community normalize_skills_text_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_skills_text_trigger BEFORE INSERT OR UPDATE ON public.community FOR EACH ROW EXECUTE FUNCTION public.normalize_skills_text();


--
-- Name: opportunity_interests notify_opportunity_interest; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_opportunity_interest AFTER INSERT ON public.opportunity_interests FOR EACH ROW EXECUTE FUNCTION public.notify_opportunity_interest();


--
-- Name: organization_members notify_organization_join_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_organization_join_request AFTER INSERT ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.notify_organization_join_request();


--
-- Name: project_requests notify_project_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_project_request AFTER INSERT ON public.project_requests FOR EACH ROW EXECUTE FUNCTION public.notify_project_request();


--
-- Name: project_bids on_bid_acceptance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_bid_acceptance AFTER UPDATE ON public.project_bids FOR EACH ROW WHEN ((new.status = 'accepted'::text)) EXECUTE FUNCTION public.handle_bid_acceptance();


--
-- Name: presence_sessions presence_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER presence_sessions_updated_at BEFORE UPDATE ON public.presence_sessions FOR EACH ROW EXECUTE FUNCTION public.update_presence_sessions_updated_at();


--
-- Name: opportunities prevent_opportunity_poster_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_opportunity_poster_change BEFORE UPDATE OF posted_by ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.prevent_opportunity_poster_change();


--
-- Name: community profile_completion_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profile_completion_trigger BEFORE INSERT OR UPDATE ON public.community FOR EACH ROW EXECUTE FUNCTION public.check_profile_completion();


--
-- Name: community protect_community_privileged_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_community_privileged_fields BEFORE INSERT OR UPDATE OF user_role, is_disabled ON public.community FOR EACH ROW EXECUTE FUNCTION private.protect_community_privileged_fields();


--
-- Name: cynq_cards set_cynq_cards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_cynq_cards_updated_at BEFORE UPDATE ON public.cynq_cards FOR EACH ROW EXECUTE FUNCTION public.update_cynq_cards_updated_at();


--
-- Name: team_members team_size_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER team_size_trigger AFTER INSERT OR DELETE OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_team_size();


--
-- Name: theme_participants theme_participant_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER theme_participant_activity AFTER INSERT OR UPDATE ON public.theme_participants FOR EACH ROW EXECUTE FUNCTION public.update_theme_activity();


--
-- Name: organizations trg_auto_create_org_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_create_org_owner AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_org_owner();


--
-- Name: capability_attempts trg_capability_attempts_timestamps; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_capability_attempts_timestamps BEFORE UPDATE ON public.capability_attempts FOR EACH ROW EXECUTE FUNCTION public.set_capability_memory_timestamps();


--
-- Name: capability_packages trg_capability_packages_timestamps; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_capability_packages_timestamps BEFORE UPDATE ON public.capability_packages FOR EACH ROW EXECUTE FUNCTION public.set_capability_memory_timestamps();


--
-- Name: endorsements trg_endorsements_mirror_ids; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_endorsements_mirror_ids BEFORE INSERT OR UPDATE ON public.endorsements FOR EACH ROW EXECUTE FUNCTION public.endorsements_mirror_ids();


--
-- Name: capability_packages trg_enforce_capability_evidence_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_capability_evidence_status BEFORE INSERT OR UPDATE OF evidence_status ON public.capability_packages FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_evidence_status();


--
-- Name: capability_attempts trg_guard_capability_verification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_capability_verification BEFORE INSERT OR UPDATE OF verification_status ON public.capability_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_capability_verification();


--
-- Name: projects trg_project_auto_add_creator_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_auto_add_creator_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.project_auto_add_creator_member();


--
-- Name: project_members trg_project_members_dedupe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_members_dedupe BEFORE INSERT ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.project_members_dedupe();


--
-- Name: project_tasks trg_project_tasks_timestamps; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_tasks_timestamps BEFORE INSERT OR UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.set_project_task_timestamps();


--
-- Name: projects trg_projects_sync_name_title; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_projects_sync_name_title BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_sync_name_title();


--
-- Name: projects trg_projects_sync_skills; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_projects_sync_skills BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_sync_skills();


--
-- Name: capability_attempts trg_refresh_capability_evidence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_refresh_capability_evidence AFTER INSERT OR UPDATE OF outcome_status, verification_status ON public.capability_attempts FOR EACH ROW EXECUTE FUNCTION public.refresh_capability_evidence();


--
-- Name: organizations trg_set_org_created_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_org_created_by BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.fn_set_org_created_by();


--
-- Name: projects trigger_auto_assign_general_theme; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_assign_general_theme BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.auto_assign_general_theme();


--
-- Name: endorsements trigger_award_xp_endorsement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_award_xp_endorsement AFTER INSERT ON public.endorsements FOR EACH ROW EXECUTE FUNCTION public.award_xp_for_endorsement();


--
-- Name: connections trigger_notify_connection_accepted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_connection_accepted AFTER UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.notify_connection_accepted();


--
-- Name: connections trigger_notify_connection_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_connection_request AFTER INSERT OR UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.notify_connection_request();


--
-- Name: endorsements trigger_notify_endorsement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_endorsement AFTER INSERT ON public.endorsements FOR EACH ROW EXECUTE FUNCTION public.notify_endorsement();


--
-- Name: messages trigger_notify_new_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


--
-- Name: project_members trigger_notify_project_invite; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_project_invite AFTER INSERT ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.notify_project_invite();


--
-- Name: connections trigger_update_connection_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_connection_count AFTER INSERT OR DELETE OR UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.update_connection_count();


--
-- Name: messages trigger_update_conversation_last_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_conversation_last_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();


--
-- Name: community trigger_update_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_level BEFORE UPDATE OF total_xp ON public.community FOR EACH ROW EXECUTE FUNCTION public.update_user_level();


--
-- Name: organization_followers trigger_update_org_follower_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_org_follower_count AFTER INSERT OR DELETE ON public.organization_followers FOR EACH ROW EXECUTE FUNCTION public.update_organization_follower_count();


--
-- Name: bbs_channels update_bbs_channels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bbs_channels_updated_at BEFORE UPDATE ON public.bbs_channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_bids update_project_bid_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_bid_count AFTER INSERT ON public.project_bids FOR EACH ROW EXECUTE FUNCTION public.update_project_stats();


--
-- Name: project_bids update_project_bids_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_bids_updated_at BEFORE UPDATE ON public.project_bids FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_upvotes update_project_upvote_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_upvote_count AFTER INSERT OR DELETE ON public.project_upvotes FOR EACH ROW EXECUTE FUNCTION public.update_project_stats();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_log activity_log_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: activity_log activity_log_community_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_community_user_id_fkey FOREIGN KEY (community_user_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: activity_log activity_log_idea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_idea_id_fkey FOREIGN KEY (idea_id) REFERENCES public.ideas(id) ON DELETE CASCADE;


--
-- Name: admin_claim_email_requests admin_claim_email_requests_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_claim_email_requests
    ADD CONSTRAINT admin_claim_email_requests_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: bbs_channels bbs_channels_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_channels
    ADD CONSTRAINT bbs_channels_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: bbs_channels bbs_channels_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_channels
    ADD CONSTRAINT bbs_channels_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bbs_channels bbs_channels_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_channels
    ADD CONSTRAINT bbs_channels_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bbs_messages bbs_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_messages
    ADD CONSTRAINT bbs_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.bbs_channels(id) ON DELETE CASCADE;


--
-- Name: bbs_messages bbs_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_messages
    ADD CONSTRAINT bbs_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.bbs_messages(id) ON DELETE CASCADE;


--
-- Name: bbs_messages bbs_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbs_messages
    ADD CONSTRAINT bbs_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: capability_attempts capability_attempts_capability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_attempts
    ADD CONSTRAINT capability_attempts_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.capability_packages(id) ON DELETE CASCADE;


--
-- Name: capability_attempts capability_attempts_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_attempts
    ADD CONSTRAINT capability_attempts_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: capability_attempts capability_attempts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_attempts
    ADD CONSTRAINT capability_attempts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: capability_packages capability_packages_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_packages
    ADD CONSTRAINT capability_packages_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: capability_packages capability_packages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_packages
    ADD CONSTRAINT capability_packages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: community_experience_authorizations community_experience_authorizations_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_experience_authorizations
    ADD CONSTRAINT community_experience_authorizations_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: community_intelligence_events community_intelligence_events_author_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_intelligence_events
    ADD CONSTRAINT community_intelligence_events_author_community_id_fkey FOREIGN KEY (author_community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: community_intelligence_events community_intelligence_events_correction_of_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_intelligence_events
    ADD CONSTRAINT community_intelligence_events_correction_of_event_id_fkey FOREIGN KEY (correction_of_event_id) REFERENCES public.community_intelligence_events(id);


--
-- Name: community_intent_statements community_intent_statements_author_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_intent_statements
    ADD CONSTRAINT community_intent_statements_author_community_id_fkey FOREIGN KEY (author_community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: connections connections_context_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_context_completed_by_fkey FOREIGN KEY (context_completed_by) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: connections connections_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: connections connections_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_participant_1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_participant_1_id_fkey FOREIGN KEY (participant_1_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_participant_2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_participant_2_id_fkey FOREIGN KEY (participant_2_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: cynq_cards cynq_cards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_cards
    ADD CONSTRAINT cynq_cards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: cynq_cards cynq_cards_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_cards
    ADD CONSTRAINT cynq_cards_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.cynq_teams(id) ON DELETE SET NULL;


--
-- Name: cynq_cards cynq_cards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_cards
    ADD CONSTRAINT cynq_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cynq_team_members cynq_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_team_members
    ADD CONSTRAINT cynq_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.cynq_teams(id) ON DELETE CASCADE;


--
-- Name: cynq_team_members cynq_team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_team_members
    ADD CONSTRAINT cynq_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cynq_teams cynq_teams_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cynq_teams
    ADD CONSTRAINT cynq_teams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: daily_suggestions daily_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_suggestions
    ADD CONSTRAINT daily_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: discovery_dismissals discovery_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_dismissals
    ADD CONSTRAINT discovery_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: endorsements endorsements_endorsed_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT endorsements_endorsed_community_id_fkey FOREIGN KEY (endorsed_community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: endorsements endorsements_endorser_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT endorsements_endorser_community_id_fkey FOREIGN KEY (endorser_community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_from_neuron_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_from_neuron_id_fkey FOREIGN KEY (from_neuron_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_signal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_to_neuron_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_to_neuron_id_fkey FOREIGN KEY (to_neuron_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: idea_comments idea_comments_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_comments
    ADD CONSTRAINT idea_comments_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: idea_comments idea_comments_community_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_comments
    ADD CONSTRAINT idea_comments_community_user_id_fkey FOREIGN KEY (community_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: idea_comments idea_comments_idea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_comments
    ADD CONSTRAINT idea_comments_idea_id_fkey FOREIGN KEY (idea_id) REFERENCES public.ideas(id) ON DELETE CASCADE;


--
-- Name: idea_upvotes idea_upvotes_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_upvotes
    ADD CONSTRAINT idea_upvotes_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: idea_upvotes idea_upvotes_community_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_upvotes
    ADD CONSTRAINT idea_upvotes_community_user_id_fkey FOREIGN KEY (community_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: idea_upvotes idea_upvotes_idea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_upvotes
    ADD CONSTRAINT idea_upvotes_idea_id_fkey FOREIGN KEY (idea_id) REFERENCES public.ideas(id) ON DELETE CASCADE;


--
-- Name: ideas ideas_created_by_auth_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT ideas_created_by_auth_id_fkey FOREIGN KEY (created_by_auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ideas ideas_created_by_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT ideas_created_by_community_id_fkey FOREIGN KEY (created_by_community_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: interaction_edges interaction_edges_beacon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_edges
    ADD CONSTRAINT interaction_edges_beacon_id_fkey FOREIGN KEY (beacon_id) REFERENCES public.beacons(id) ON DELETE SET NULL;


--
-- Name: interaction_edges interaction_edges_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_edges
    ADD CONSTRAINT interaction_edges_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: interaction_edges interaction_edges_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_edges
    ADD CONSTRAINT interaction_edges_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: nearify_event_presence nearify_event_presence_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_event_presence
    ADD CONSTRAINT nearify_event_presence_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: nearify_identity_map nearify_identity_map_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nearify_identity_map
    ADD CONSTRAINT nearify_identity_map_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: node_interactions node_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_interactions
    ADD CONSTRAINT node_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: opportunity_engagement opportunity_engagement_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_engagement
    ADD CONSTRAINT opportunity_engagement_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: opportunity_interest_followups opportunity_interest_followups_opportunity_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_interest_followups
    ADD CONSTRAINT opportunity_interest_followups_opportunity_interest_id_fkey FOREIGN KEY (opportunity_interest_id) REFERENCES public.opportunity_interests(id) ON DELETE CASCADE;


--
-- Name: opportunity_interests opportunity_interests_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_interests
    ADD CONSTRAINT opportunity_interests_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: opportunity_interests opportunity_interests_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_interests
    ADD CONSTRAINT opportunity_interests_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: organization_followers organization_followers_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_followers
    ADD CONSTRAINT organization_followers_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: organization_followers organization_followers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_followers
    ADD CONSTRAINT organization_followers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_theme_sponsorships organization_theme_sponsorships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_theme_sponsorships
    ADD CONSTRAINT organization_theme_sponsorships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_theme_sponsorships organization_theme_sponsorships_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_theme_sponsorships
    ADD CONSTRAINT organization_theme_sponsorships_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.theme_circles(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.community(id);


--
-- Name: presence_sessions presence_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presence_sessions
    ADD CONSTRAINT presence_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: product_events product_events_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: product_events product_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.product_sessions(id) ON DELETE SET NULL;


--
-- Name: product_events product_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_sessions product_sessions_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sessions
    ADD CONSTRAINT product_sessions_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: product_sessions product_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sessions
    ADD CONSTRAINT product_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_bids project_bids_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bids
    ADD CONSTRAINT project_bids_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_bids project_bids_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bids
    ADD CONSTRAINT project_bids_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_comments project_comments_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_comments project_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_interest_followups project_interest_followups_project_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_interest_followups
    ADD CONSTRAINT project_interest_followups_project_member_id_fkey FOREIGN KEY (project_member_id) REFERENCES public.project_members(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: project_requests project_requests_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_requests
    ADD CONSTRAINT project_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_requests project_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_requests
    ADD CONSTRAINT project_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: project_tasks project_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: project_tasks project_tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: project_tasks project_tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_tasks project_tasks_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: project_upvotes project_upvotes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_upvotes
    ADD CONSTRAINT project_upvotes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_upvotes project_upvotes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_upvotes
    ADD CONSTRAINT project_upvotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: projects projects_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.theme_circles(id) ON DELETE SET NULL;


--
-- Name: signals signals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: site_visit_sessions site_visit_sessions_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_sessions
    ADD CONSTRAINT site_visit_sessions_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_members team_members_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_community_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_community_user_id_fkey FOREIGN KEY (community_user_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_idea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_idea_id_fkey FOREIGN KEY (idea_id) REFERENCES public.ideas(id) ON DELETE CASCADE;


--
-- Name: theme_actions theme_actions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_actions
    ADD CONSTRAINT theme_actions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.community(id);


--
-- Name: theme_actions theme_actions_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_actions
    ADD CONSTRAINT theme_actions_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.theme_circles(id) ON DELETE CASCADE;


--
-- Name: theme_circles theme_circles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_circles
    ADD CONSTRAINT theme_circles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.community(id);


--
-- Name: theme_participants theme_participants_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_participants
    ADD CONSTRAINT theme_participants_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: theme_participants theme_participants_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_participants
    ADD CONSTRAINT theme_participants_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.theme_circles(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activity_log Admins can view activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view activity" ON public.activity_log FOR SELECT USING ((auth.uid() IN ( SELECT community.user_id
   FROM public.community
  WHERE (community.role = 'admin'::text))));


--
-- Name: project_comments Allow all users to view all comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to view all comments" ON public.project_comments FOR SELECT USING (true);


--
-- Name: project_upvotes Allow all users to view all upvotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to view all upvotes" ON public.project_upvotes FOR SELECT USING (true);


--
-- Name: project_comments Allow authenticated users to insert their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to insert their own comments" ON public.project_comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: project_upvotes Allow authenticated users to insert their own upvotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to insert their own upvotes" ON public.project_upvotes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: skills Allow public read access to skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to skills" ON public.skills FOR SELECT USING (true);


--
-- Name: project_comments Allow users to delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to delete their own comments" ON public.project_comments FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: project_upvotes Allow users to delete their own upvotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to delete their own upvotes" ON public.project_upvotes FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: activity_log Anyone can insert activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert activity" ON public.activity_log FOR INSERT WITH CHECK (true);


--
-- Name: client_errors Anyone can insert errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert errors" ON public.client_errors FOR INSERT WITH CHECK (true);


--
-- Name: feedback Anyone can submit feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit feedback" ON public.feedback FOR INSERT WITH CHECK (true);


--
-- Name: idea_comments Anyone can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view comments" ON public.idea_comments FOR SELECT USING (true);


--
-- Name: endorsements Anyone can view endorsements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view endorsements" ON public.endorsements FOR SELECT USING (true);


--
-- Name: ideas Anyone can view ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view ideas" ON public.ideas FOR SELECT USING (true);


--
-- Name: projects Anyone can view open/active projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view open/active projects" ON public.projects FOR SELECT USING ((status = ANY (ARRAY['open'::text, 'active'::text, 'completed'::text])));


--
-- Name: project_members Anyone can view project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view project members" ON public.project_members FOR SELECT USING (true);


--
-- Name: team_members Anyone can view team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view team members" ON public.team_members FOR SELECT USING (true);


--
-- Name: idea_upvotes Anyone can view upvotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view upvotes" ON public.idea_upvotes FOR SELECT USING (true);


--
-- Name: idea_comments Authenticated users can comment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can comment" ON public.idea_comments FOR INSERT WITH CHECK ((auth.uid() = auth_user_id));


--
-- Name: bbs_channels Authenticated users can create bbs channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create bbs channels" ON public.bbs_channels FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: cynq_cards Authenticated users can create cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create cards" ON public.cynq_cards FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: organizations Authenticated users can create organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create organizations" ON public.organizations FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: theme_circles Authenticated users can create themes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create themes" ON public.theme_circles FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: ideas Authenticated users can insert ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert ideas" ON public.ideas FOR INSERT WITH CHECK ((auth.uid() = created_by_auth_id));


--
-- Name: theme_actions Authenticated users can propose actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can propose actions" ON public.theme_actions FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: beacons Authenticated users can read beacons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read beacons" ON public.beacons FOR SELECT TO authenticated USING (true);


--
-- Name: opportunities Authenticated users can read opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read opportunities" ON public.opportunities FOR SELECT TO authenticated USING (true);


--
-- Name: team_members Authenticated users can request to join; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can request to join" ON public.team_members FOR INSERT WITH CHECK ((auth.uid() = auth_user_id));


--
-- Name: idea_upvotes Authenticated users can upvote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can upvote" ON public.idea_upvotes FOR INSERT WITH CHECK ((auth.uid() = auth_user_id));


--
-- Name: community Authenticated users can view profiles and presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view profiles and presence" ON public.community FOR SELECT TO authenticated USING (((is_hidden IS NULL) OR (is_hidden = false) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));


--
-- Name: swag_votes Authenticated users can vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can vote" ON public.swag_votes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: project_bids Bids viewable by creators and bidders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bids viewable by creators and bidders" ON public.project_bids FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_bids.project_id) AND (projects.creator_id = auth.uid()))))));


--
-- Name: capability_packages Community can view shared capability packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Community can view shared capability packages" ON public.capability_packages FOR SELECT TO authenticated USING ((((permission_mode = 'community'::text) AND (EXISTS ( SELECT 1
   FROM public.community
  WHERE (community.user_id = auth.uid())))) OR (creator_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: opportunities Community members can post personal opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Community members can post personal opportunities" ON public.opportunities FOR INSERT WITH CHECK (((posted_by IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) AND (organization_id IS NULL)));


--
-- Name: connections Connections: receiver can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Connections: receiver can update" ON public.connections FOR UPDATE TO authenticated USING ((to_user_id = public.get_community_id_from_auth())) WITH CHECK ((to_user_id = public.get_community_id_from_auth()));


--
-- Name: connections Connections: sender can cancel pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Connections: sender can cancel pending" ON public.connections FOR UPDATE TO authenticated USING ((from_user_id = public.get_community_id_from_auth())) WITH CHECK ((from_user_id = public.get_community_id_from_auth()));


--
-- Name: capability_packages Creators can create capability packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can create capability packages" ON public.capability_packages FOR INSERT TO authenticated WITH CHECK ((creator_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: capability_packages Creators can delete capability packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can delete capability packages" ON public.capability_packages FOR DELETE TO authenticated USING ((creator_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: ideas Creators can delete their ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can delete their ideas" ON public.ideas FOR DELETE USING ((auth.uid() = created_by_auth_id));


--
-- Name: projects Creators can delete their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can delete their projects" ON public.projects FOR DELETE USING ((creator_id = public.get_community_id_from_auth()));


--
-- Name: team_members Creators can manage team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can manage team members" ON public.team_members FOR UPDATE USING ((idea_id IN ( SELECT ideas.id
   FROM public.ideas
  WHERE (ideas.created_by_auth_id = auth.uid()))));


--
-- Name: project_bids Creators can update bid status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update bid status" ON public.project_bids FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_bids.project_id) AND (projects.creator_id = auth.uid())))));


--
-- Name: capability_packages Creators can update capability packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update capability packages" ON public.capability_packages FOR UPDATE TO authenticated USING ((creator_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))) WITH CHECK ((creator_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: ideas Creators can update their ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update their ideas" ON public.ideas FOR UPDATE USING ((auth.uid() = created_by_auth_id));


--
-- Name: projects Creators can update their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update their projects" ON public.projects FOR UPDATE USING ((creator_id = public.get_community_id_from_auth()));


--
-- Name: theme_circles Creators can update their themes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update their themes" ON public.theme_circles FOR UPDATE USING ((created_by IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: bbs_channels DM channels viewable by participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "DM channels viewable by participants" ON public.bbs_channels FOR SELECT USING (((type = 'dm'::text) AND ((auth.uid() = user1_id) OR (auth.uid() = user2_id))));


--
-- Name: opportunity_interests Members and posters can view opportunity interests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and posters can view opportunity interests" ON public.opportunity_interests FOR SELECT TO authenticated USING (((community_id IN ( SELECT c.id
   FROM public.community c
  WHERE (c.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (public.opportunities o
     JOIN public.community poster ON ((poster.id = o.posted_by)))
  WHERE ((o.id = opportunity_interests.opportunity_id) AND (poster.user_id = auth.uid()))))));


--
-- Name: capability_attempts Members can create own capability attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create own capability attempts" ON public.capability_attempts FOR INSERT TO authenticated WITH CHECK (((member_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.capability_packages p
  WHERE ((p.id = capability_attempts.capability_id) AND ((p.permission_mode = 'community'::text) OR (p.creator_id = capability_attempts.member_id)))))));


--
-- Name: opportunity_interests Members can express opportunity interest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can express opportunity interest" ON public.opportunity_interests FOR INSERT TO authenticated WITH CHECK (((community_id IN ( SELECT c.id
   FROM public.community c
  WHERE (c.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.opportunities o
  WHERE ((o.id = opportunity_interests.opportunity_id) AND (o.status = 'open'::text) AND (o.is_public = true) AND ((o.application_deadline IS NULL) OR (o.application_deadline > now())) AND (o.posted_by <> opportunity_interests.community_id))))));


--
-- Name: project_members Members can request to join and creators can add members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can request to join and creators can add members" ON public.project_members FOR INSERT TO authenticated WITH CHECK (((user_id = public.authz_current_member_id()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.creator_id = public.authz_current_member_id()))))));


--
-- Name: capability_attempts Members can update own capability attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update own capability attempts" ON public.capability_attempts FOR UPDATE TO authenticated USING ((member_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))) WITH CHECK (((member_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.capability_packages p
  WHERE ((p.id = capability_attempts.capability_id) AND ((p.permission_mode = 'community'::text) OR (p.creator_id = capability_attempts.member_id)))))));


--
-- Name: capability_attempts Members can view own capability attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view own capability attempts" ON public.capability_attempts FOR SELECT TO authenticated USING (((member_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (public.capability_packages p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = capability_attempts.capability_id) AND (c.user_id = auth.uid()))))));


--
-- Name: opportunity_interests Members can withdraw opportunity interest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can withdraw opportunity interest" ON public.opportunity_interests FOR DELETE TO authenticated USING ((community_id IN ( SELECT c.id
   FROM public.community c
  WHERE (c.user_id = auth.uid()))));


--
-- Name: opportunities Opportunity creators can delete their own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Opportunity creators can delete their own" ON public.opportunities FOR DELETE USING ((posted_by IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: opportunities Opportunity creators can update their own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Opportunity creators can update their own" ON public.opportunities FOR UPDATE USING ((posted_by IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: organization_members Org admins can add members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can add members" ON public.organization_members FOR INSERT TO authenticated WITH CHECK ((public.authz_org_role(organization_id) = ANY (ARRAY['owner'::text, 'admin'::text])));


--
-- Name: organization_members Org admins can remove members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can remove members" ON public.organization_members FOR DELETE TO authenticated USING (((community_id = public.authz_current_member_id()) OR (public.authz_org_role(organization_id) = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: organization_members Org admins can update members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org admins can update members" ON public.organization_members FOR UPDATE TO authenticated USING ((public.authz_org_role(organization_id) = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((public.authz_org_role(organization_id) = ANY (ARRAY['owner'::text, 'admin'::text])));


--
-- Name: organizations Org owners can deactivate organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org owners can deactivate organizations" ON public.organizations FOR DELETE USING ((id IN ( SELECT om.organization_id
   FROM (public.organization_members om
     JOIN public.community c ON ((c.id = om.community_id)))
  WHERE ((c.user_id = auth.uid()) AND (om.role = 'owner'::text) AND (om.status = 'active'::text)))));


--
-- Name: organizations Organization admins can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization admins can update" ON public.organizations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.organization_members om
     JOIN public.community c ON ((c.id = om.community_id)))
  WHERE ((om.organization_id = organizations.id) AND (c.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (om.status = 'active'::text)))));


--
-- Name: organization_members Organization members are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members are viewable by everyone" ON public.organization_members FOR SELECT USING ((status = 'active'::text));


--
-- Name: organizations Organizations are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING ((status = 'active'::text));


--
-- Name: opportunity_interest_followups Posters can create opportunity interest follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Posters can create opportunity interest follow-ups" ON public.opportunity_interest_followups FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.opportunity_interests oi
     JOIN public.opportunities o ON ((o.id = oi.opportunity_id)))
     JOIN public.community poster ON ((poster.id = o.posted_by)))
  WHERE ((oi.id = opportunity_interest_followups.opportunity_interest_id) AND (poster.user_id = auth.uid())))));


--
-- Name: opportunity_interest_followups Posters can view opportunity interest follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Posters can view opportunity interest follow-ups" ON public.opportunity_interest_followups FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.opportunity_interests oi
     JOIN public.opportunities o ON ((o.id = oi.opportunity_id)))
     JOIN public.community poster ON ((poster.id = o.posted_by)))
  WHERE ((oi.id = opportunity_interest_followups.opportunity_interest_id) AND (poster.user_id = auth.uid())))));


--
-- Name: bbs_channels Project channels viewable by project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project channels viewable by project members" ON public.bbs_channels FOR SELECT USING (((type = 'project'::text) AND (EXISTS ( SELECT 1
   FROM public.project_members
  WHERE ((project_members.project_id = bbs_channels.project_id) AND (project_members.user_id = auth.uid()))))));


--
-- Name: project_members Project creators can delete members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project creators can delete members" ON public.project_members FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = project_members.project_id) AND (c.user_id = auth.uid())))) OR (user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: project_tasks Project creators can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project creators can delete tasks" ON public.project_tasks FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = project_tasks.project_id) AND (c.user_id = auth.uid())))));


--
-- Name: project_members Project creators can manage members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project creators can manage members" ON public.project_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.creator_id = public.authz_current_member_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.creator_id = public.authz_current_member_id())))));


--
-- Name: project_requests Project creators can view requests for their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project creators can view requests for their projects" ON public.project_requests FOR SELECT TO authenticated USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.creator_id = ( SELECT community.id
           FROM public.community
          WHERE (community.user_id = auth.uid()))))));


--
-- Name: project_members Project members are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project members are viewable by everyone" ON public.project_members FOR SELECT USING (true);


--
-- Name: project_interest_followups Project owners can create request follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project owners can create request follow-ups" ON public.project_interest_followups FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.project_members pm
     JOIN public.projects p ON ((p.id = pm.project_id)))
     JOIN public.community owner ON ((owner.id = p.creator_id)))
  WHERE ((pm.id = project_interest_followups.project_member_id) AND (pm.role = 'pending'::text) AND (owner.user_id = auth.uid())))));


--
-- Name: project_interest_followups Project owners can view request follow-ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project owners can view request follow-ups" ON public.project_interest_followups FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.project_members pm
     JOIN public.projects p ON ((p.id = pm.project_id)))
     JOIN public.community owner ON ((owner.id = p.creator_id)))
  WHERE ((pm.id = project_interest_followups.project_member_id) AND (owner.user_id = auth.uid())))));


--
-- Name: project_tasks Project team can create tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project team can create tasks" ON public.project_tasks FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = project_tasks.project_id) AND (c.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.project_members pm
     JOIN public.community c ON ((c.id = pm.user_id)))
  WHERE ((pm.project_id = project_tasks.project_id) AND (pm.role IS DISTINCT FROM 'pending'::text) AND (c.user_id = auth.uid()))))));


--
-- Name: project_tasks Project team can update tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project team can update tasks" ON public.project_tasks FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = project_tasks.project_id) AND (c.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.project_members pm
     JOIN public.community c ON ((c.id = pm.user_id)))
  WHERE ((pm.project_id = project_tasks.project_id) AND (pm.role IS DISTINCT FROM 'pending'::text) AND (c.user_id = auth.uid())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = project_tasks.project_id) AND (c.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.project_members pm
     JOIN public.community c ON ((c.id = pm.user_id)))
  WHERE ((pm.project_id = project_tasks.project_id) AND (pm.role IS DISTINCT FROM 'pending'::text) AND (c.user_id = auth.uid()))))));


--
-- Name: project_tasks Project team can view tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project team can view tasks" ON public.project_tasks FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.community c ON ((c.id = p.creator_id)))
  WHERE ((p.id = project_tasks.project_id) AND (c.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.project_members pm
     JOIN public.community c ON ((c.id = pm.user_id)))
  WHERE ((pm.project_id = project_tasks.project_id) AND (pm.role IS DISTINCT FROM 'pending'::text) AND (c.user_id = auth.uid()))))));


--
-- Name: bbs_channels Public channels viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public channels viewable by everyone" ON public.bbs_channels FOR SELECT USING ((type = 'public'::text));


--
-- Name: achievements Public read access to achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to achievements" ON public.achievements FOR SELECT USING (true);


--
-- Name: theme_circles Public read access to active themes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to active themes" ON public.theme_circles FOR SELECT USING (((status = 'active'::text) OR (created_by IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: cynq_cards Public read access to cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to cards" ON public.cynq_cards FOR SELECT USING (true);


--
-- Name: bbs_online Public read access to online users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to online users" ON public.bbs_online FOR SELECT USING (true);


--
-- Name: theme_participants Public read access to participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to participants" ON public.theme_participants FOR SELECT USING (true);


--
-- Name: bbs_presence Public read access to presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to presence" ON public.bbs_presence FOR SELECT USING (true);


--
-- Name: signals Public read access to signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to signals" ON public.signals FOR SELECT USING (true);


--
-- Name: skill_colors Public read access to skill colors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to skill colors" ON public.skill_colors FOR SELECT USING (true);


--
-- Name: swag_votes Public read access to swag votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to swag votes" ON public.swag_votes FOR SELECT USING (true);


--
-- Name: theme_actions Public read access to theme actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to theme actions" ON public.theme_actions FOR SELECT USING (true);


--
-- Name: zork_events Public read access to zork events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access to zork events" ON public.zork_events FOR SELECT USING (true);


--
-- Name: achievements Service role can manage achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage achievements" ON public.achievements TO service_role USING (true) WITH CHECK (true);


--
-- Name: signals Service role can manage signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage signals" ON public.signals TO service_role USING (true) WITH CHECK (true);


--
-- Name: skill_colors Service role can manage skill colors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage skill colors" ON public.skill_colors TO service_role USING (true) WITH CHECK (true);


--
-- Name: swag_votes Service role can manage votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage votes" ON public.swag_votes TO service_role USING (true) WITH CHECK (true);


--
-- Name: zork_events Service role can manage zork events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage zork events" ON public.zork_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: client_errors Service role can read all errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read all errors" ON public.client_errors FOR SELECT TO service_role USING (true);


--
-- Name: feedback Service role can view all feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all feedback" ON public.feedback FOR SELECT TO service_role USING (true);


--
-- Name: community_backup_pre_oauth_migration Service role only access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access" ON public.community_backup_pre_oauth_migration TO service_role USING (true) WITH CHECK (true);


--
-- Name: messages_backup Service role only access to backup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to backup" ON public.messages_backup TO service_role USING (true) WITH CHECK (true);


--
-- Name: organization_theme_sponsorships Sponsorships are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sponsorships are viewable by everyone" ON public.organization_theme_sponsorships FOR SELECT USING ((status = 'active'::text));


--
-- Name: activity_log System can log activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can log activity" ON public.activity_log FOR INSERT WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: connections Users can cancel sent connection requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can cancel sent connection requests" ON public.connections FOR UPDATE USING (((from_user_id = public.get_community_id_from_auth()) AND (status = 'pending'::text))) WITH CHECK (((from_user_id = public.get_community_id_from_auth()) AND (status = ANY (ARRAY['pending'::text, 'canceled'::text]))));


--
-- Name: connections Users can cancel sent requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can cancel sent requests" ON public.connections FOR UPDATE USING (((from_user_id = public.get_community_id_from_auth()) AND (status = 'pending'::text))) WITH CHECK (((from_user_id = public.get_community_id_from_auth()) AND (status = 'canceled'::text)));


--
-- Name: project_bids Users can create bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create bids" ON public.project_bids FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: connections Users can create connection requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create connection requests" ON public.connections FOR INSERT WITH CHECK ((from_user_id = public.get_community_id_from_auth()));


--
-- Name: connections Users can create connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create connections" ON public.connections FOR INSERT TO authenticated WITH CHECK ((from_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: project_requests Users can create project requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create project requests" ON public.project_requests FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: projects Users can create projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK ((creator_id = public.get_community_id_from_auth()));


--
-- Name: cynq_teams Users can create teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create teams" ON public.cynq_teams FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: idea_comments Users can delete their comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their comments" ON public.idea_comments FOR DELETE USING ((auth.uid() = auth_user_id));


--
-- Name: connections Users can delete their connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their connections" ON public.connections FOR DELETE TO authenticated USING (((from_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) OR (to_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: cynq_cards Users can delete their own cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own cards" ON public.cynq_cards FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: discovery_dismissals Users can delete their own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own dismissals" ON public.discovery_dismissals FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: team_members Users can delete their own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own membership" ON public.team_members FOR DELETE USING ((auth.uid() = auth_user_id));


--
-- Name: nearify_identity_map Users can delete their own nearify link; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own nearify link" ON public.nearify_identity_map FOR DELETE TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: presence_sessions Users can delete their own presence sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own presence sessions" ON public.presence_sessions FOR DELETE USING ((user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: user_achievements Users can earn achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can earn achievements" ON public.user_achievements FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: endorsements Users can endorse others; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can endorse others" ON public.endorsements FOR INSERT TO authenticated WITH CHECK (((endorser_community_id IN ( SELECT c.id
   FROM public.community c
  WHERE (c.user_id = auth.uid()))) AND (endorsed_community_id IS NOT NULL) AND (endorser_community_id <> endorsed_community_id)));


--
-- Name: organization_followers Users can follow organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can follow organizations" ON public.organization_followers FOR INSERT WITH CHECK ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: discovery_dismissals Users can insert their own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own dismissals" ON public.discovery_dismissals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: node_interactions Users can insert their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own interactions" ON public.node_interactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: nearify_identity_map Users can insert their own nearify link; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own nearify link" ON public.nearify_identity_map FOR INSERT TO authenticated WITH CHECK ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: presence_sessions Users can insert their own presence sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own presence sessions" ON public.presence_sessions FOR INSERT WITH CHECK ((user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: organization_members Users can join organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can join organizations" ON public.organization_members FOR INSERT WITH CHECK ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: theme_participants Users can join themes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can join themes" ON public.theme_participants FOR INSERT TO authenticated WITH CHECK (((engagement_level <> 'participating'::text) AND (community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: theme_participants Users can leave themes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can leave themes" ON public.theme_participants FOR DELETE TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: bbs_online Users can manage their online status by username; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their online status by username" ON public.bbs_online TO authenticated USING ((username IN ( SELECT bbs_online.username
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((username IN ( SELECT bbs_online.username
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notes Users can manage their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own notes" ON public.notes TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: bbs_presence Users can manage their own presence by username; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own presence by username" ON public.bbs_presence TO authenticated USING ((username IN ( SELECT bbs_presence.username
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((username IN ( SELECT bbs_presence.username
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: daily_suggestions Users can manage their own suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own suggestions" ON public.daily_suggestions USING ((user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))) WITH CHECK ((user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: watchlists Users can manage their watchlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their watchlists" ON public.watchlists TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: zork_events Users can manage their zork events by username; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their zork events by username" ON public.zork_events TO authenticated USING ((username IN ( SELECT zork_events.username
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((username IN ( SELECT zork_events.username
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can read their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: endorsements Users can remove their endorsements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove their endorsements" ON public.endorsements FOR DELETE USING ((auth.uid() = endorser_id));


--
-- Name: idea_upvotes Users can remove their upvotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove their upvotes" ON public.idea_upvotes FOR DELETE USING ((auth.uid() = auth_user_id));


--
-- Name: opportunity_engagement Users can track their own engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can track their own engagements" ON public.opportunity_engagement FOR INSERT TO authenticated WITH CHECK ((auth.uid() = ( SELECT community.user_id
   FROM public.community
  WHERE (community.id = opportunity_engagement.user_id)
 LIMIT 1)));


--
-- Name: organization_followers Users can unfollow organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unfollow organizations" ON public.organization_followers FOR DELETE USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: project_bids Users can update own bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own bids" ON public.project_bids FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: connections Users can update their connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their connections" ON public.connections FOR UPDATE TO authenticated USING (((from_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) OR (to_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: cynq_cards Users can update their own cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own cards" ON public.cynq_cards FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: community Users can update their own community profile image; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own community profile image" ON public.community FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: discovery_dismissals Users can update their own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own dismissals" ON public.discovery_dismissals FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: opportunity_engagement Users can update their own engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own engagements" ON public.opportunity_engagement FOR UPDATE TO authenticated USING ((auth.uid() = ( SELECT community.user_id
   FROM public.community
  WHERE (community.id = opportunity_engagement.user_id)
 LIMIT 1)));


--
-- Name: team_members Users can update their own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own membership" ON public.team_members FOR UPDATE USING ((auth.uid() = auth_user_id));


--
-- Name: nearify_identity_map Users can update their own nearify link; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own nearify link" ON public.nearify_identity_map FOR UPDATE TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id IN ( SELECT c.id
   FROM public.community c
  WHERE (c.user_id = auth.uid())))) WITH CHECK ((user_id IN ( SELECT c.id
   FROM public.community c
  WHERE (c.user_id = auth.uid()))));


--
-- Name: presence_sessions Users can update their own presence sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own presence sessions" ON public.presence_sessions FOR UPDATE USING ((user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))) WITH CHECK ((user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: project_requests Users can update their own project requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own project requests" ON public.project_requests FOR UPDATE TO authenticated USING ((user_id = ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: theme_participants Users can update their participation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their participation" ON public.theme_participants FOR UPDATE TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))) WITH CHECK (((engagement_level <> 'participating'::text) AND (community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: opportunity_engagement Users can view all engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all engagements" ON public.opportunity_engagement FOR SELECT TO authenticated USING (true);


--
-- Name: presence_sessions Users can view all presence sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all presence sessions" ON public.presence_sessions FOR SELECT USING (true);


--
-- Name: theme_participants Users can view all theme participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all theme participants" ON public.theme_participants FOR SELECT TO authenticated USING (true);


--
-- Name: nearify_event_presence Users can view co-attendees at events they're currently at; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view co-attendees at events they're currently at" ON public.nearify_event_presence FOR SELECT TO authenticated USING ((nearify_event_id IN ( SELECT _my_active_nearify_event_ids.nearify_event_id
   FROM public._my_active_nearify_event_ids() _my_active_nearify_event_ids(nearify_event_id))));


--
-- Name: organization_followers Users can view followers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view followers" ON public.organization_followers FOR SELECT USING (true);


--
-- Name: user_achievements Users can view own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own achievements" ON public.user_achievements FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: activity_log Users can view own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own activity" ON public.activity_log FOR SELECT USING ((auth_user_id = auth.uid()));


--
-- Name: cynq_team_members Users can view team members of their teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view team members of their teams" ON public.cynq_team_members FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.cynq_team_members tm
  WHERE ((tm.team_id = cynq_team_members.team_id) AND (tm.user_id = auth.uid())))));


--
-- Name: cynq_teams Users can view teams they're members of; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view teams they're members of" ON public.cynq_teams FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.cynq_team_members
  WHERE ((cynq_team_members.team_id = cynq_teams.id) AND (cynq_team_members.user_id = auth.uid())))));


--
-- Name: connections Users can view their connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their connections" ON public.connections FOR SELECT TO authenticated USING (((from_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))) OR (to_user_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid())))));


--
-- Name: discovery_dismissals Users can view their own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own dismissals" ON public.discovery_dismissals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: nearify_event_presence Users can view their own event presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own event presence" ON public.nearify_event_presence FOR SELECT TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: community_experience_authorizations Users can view their own experience authorizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own experience authorizations" ON public.community_experience_authorizations FOR SELECT TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: node_interactions Users can view their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own interactions" ON public.node_interactions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: nearify_identity_map Users can view their own nearify link; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own nearify link" ON public.nearify_identity_map FOR SELECT TO authenticated USING ((community_id IN ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: project_requests Users can view their own project requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own project requests" ON public.project_requests FOR SELECT TO authenticated USING ((user_id = ( SELECT community.id
   FROM public.community
  WHERE (community.user_id = auth.uid()))));


--
-- Name: zork_saves Users manage their own zork saves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage their own zork saves" ON public.zork_saves USING ((auth.role() = 'anon'::text));


--
-- Name: community_intelligence_events Visible intelligence events are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visible intelligence events are readable" ON public.community_intelligence_events FOR SELECT TO authenticated USING ((visibility = ANY (ARRAY['public'::text, 'nearify'::text])));


--
-- Name: community_intent_statements Visible intent statements are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visible intent statements are readable" ON public.community_intent_statements FOR SELECT TO authenticated USING (((visibility = ANY (ARRAY['public'::text, 'nearify'::text])) AND (active = true)));


--
-- Name: achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_claim_email_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_claim_email_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members allow_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_select ON public.organization_members FOR SELECT USING (true);


--
-- Name: bbs_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bbs_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: bbs_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bbs_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: bbs_messages bbs_messages_active_member_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bbs_messages_active_member_insert ON public.bbs_messages FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (username = ( SELECT private.current_active_community_name() AS current_active_community_name)) AND (( SELECT private.current_active_community_id() AS current_active_community_id) IS NOT NULL) AND ((length(TRIM(BOTH FROM text)) >= 1) AND (length(TRIM(BOTH FROM text)) <= 500))));


--
-- Name: bbs_messages bbs_messages_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bbs_messages_admin_delete ON public.bbs_messages FOR DELETE TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: bbs_messages bbs_messages_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bbs_messages_public_read ON public.bbs_messages FOR SELECT TO authenticated, anon USING (true);


--
-- Name: bbs_online; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bbs_online ENABLE ROW LEVEL SECURITY;

--
-- Name: bbs_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bbs_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: beacons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beacons ENABLE ROW LEVEL SECURITY;

--
-- Name: capability_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capability_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: capability_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capability_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: client_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: community; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community ENABLE ROW LEVEL SECURITY;

--
-- Name: community_backup_pre_oauth_migration; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_backup_pre_oauth_migration ENABLE ROW LEVEL SECURITY;

--
-- Name: community_experience_authorizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_experience_authorizations ENABLE ROW LEVEL SECURITY;

--
-- Name: community community_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_insert_admin ON public.community FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: community community_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_insert_self ON public.community FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: community_intelligence_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_intelligence_events ENABLE ROW LEVEL SECURITY;

--
-- Name: community_intent_statements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_intent_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: community community_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_update_admin ON public.community FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: community community_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_update_self ON public.community FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations conversations_participant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_participant_insert ON public.conversations FOR INSERT TO authenticated WITH CHECK (((( SELECT private.current_active_community_id() AS current_active_community_id) IS NOT NULL) AND ((participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id)))));


--
-- Name: conversations conversations_participant_metadata_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_participant_metadata_update ON public.conversations FOR UPDATE TO authenticated USING (((participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id)))) WITH CHECK (((participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id))));


--
-- Name: conversations conversations_participant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_participant_select ON public.conversations FOR SELECT TO authenticated USING (((( SELECT private.current_active_community_id() AS current_active_community_id) IS NOT NULL) AND ((participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id)))));


--
-- Name: cynq_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cynq_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: cynq_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cynq_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: cynq_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cynq_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discovery_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: endorsements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: idea_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idea_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: idea_upvotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idea_upvotes ENABLE ROW LEVEL SECURITY;

--
-- Name: ideas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

--
-- Name: product_events insert own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own events" ON public.product_events FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: product_sessions insert own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own sessions" ON public.product_sessions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: interaction_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interaction_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: interaction_edges interaction_edges_select_involving_me; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interaction_edges_select_involving_me ON public.interaction_edges FOR SELECT USING (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));


--
-- Name: interaction_edges interaction_edges_update_involving_me; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interaction_edges_update_involving_me ON public.interaction_edges FOR UPDATE USING (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id))) WITH CHECK (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages_backup ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_participant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_participant_insert ON public.messages FOR INSERT TO authenticated WITH CHECK (((sender_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) AND (read = false) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (c.participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id))))))));


--
-- Name: messages messages_participant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_participant_select ON public.messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (c.participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id)))))));


--
-- Name: messages messages_recipient_mark_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_recipient_mark_read ON public.messages FOR UPDATE TO authenticated USING (((read = false) AND (sender_id <> ( SELECT private.current_active_community_id() AS current_active_community_id)) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (c.participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id)))))))) WITH CHECK (((read = true) AND (sender_id <> ( SELECT private.current_active_community_id() AS current_active_community_id)) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_1_id = ( SELECT private.current_active_community_id() AS current_active_community_id)) OR (c.participant_2_id = ( SELECT private.current_active_community_id() AS current_active_community_id))))))));


--
-- Name: nearify_event_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nearify_event_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: nearify_identity_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nearify_identity_map ENABLE ROW LEVEL SECURITY;

--
-- Name: node_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.node_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_engagement oe_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oe_insert_own ON public.opportunity_engagement FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: opportunity_engagement oe_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oe_select_own ON public.opportunity_engagement FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_engagement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_engagement ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_interest_followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_interest_followups ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members org_members_select_safe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_safe ON public.organization_members FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.community c
  WHERE ((c.id = organization_members.community_id) AND (c.user_id = auth.uid())))));


--
-- Name: organization_followers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_followers ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_theme_sponsorships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_theme_sponsorships ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: presence_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presence_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

--
-- Name: product_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_bids; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_bids ENABLE ROW LEVEL SECURITY;

--
-- Name: project_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: project_interest_followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_interest_followups ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: project_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: project_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: project_upvotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_upvotes ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_creator_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_creator_only ON public.projects FOR DELETE TO authenticated USING ((creator_id = public.current_community_id()));


--
-- Name: projects projects_insert_creator_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_creator_only ON public.projects FOR INSERT TO authenticated WITH CHECK ((creator_id = public.current_community_id()));


--
-- Name: projects projects_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_authenticated ON public.projects FOR SELECT TO authenticated USING (true);


--
-- Name: projects projects_update_creator_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_creator_only ON public.projects FOR UPDATE TO authenticated USING ((creator_id = public.current_community_id())) WITH CHECK ((creator_id = public.current_community_id()));


--
-- Name: product_events select own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own events" ON public.product_events FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: product_sessions select own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own sessions" ON public.product_sessions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visit_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visit_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_colors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_colors ENABLE ROW LEVEL SECURITY;

--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: swag_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.swag_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_circles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_circles ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: product_sessions update own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own sessions" ON public.product_sessions FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

--
-- Name: zork_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zork_events ENABLE ROW LEVEL SECURITY;

--
-- Name: zork_saves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zork_saves ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _my_active_nearify_event_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._my_active_nearify_event_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public._my_active_nearify_event_ids() TO authenticated;
GRANT ALL ON FUNCTION public._my_active_nearify_event_ids() TO service_role;


--
-- Name: FUNCTION add_creator_as_member(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_creator_as_member() TO anon;
GRANT ALL ON FUNCTION public.add_creator_as_member() TO authenticated;
GRANT ALL ON FUNCTION public.add_creator_as_member() TO service_role;


--
-- Name: FUNCTION admin_email_campaign(p_action text, p_id uuid, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_email_campaign(p_action text, p_id uuid, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_email_campaign(p_action text, p_id uuid, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_email_campaign(p_action text, p_id uuid, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION admin_find_members_by_email(p_query text, p_exact boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_find_members_by_email(p_query text, p_exact boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_find_members_by_email(p_query text, p_exact boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_find_members_by_email(p_query text, p_exact boolean) TO service_role;


--
-- Name: FUNCTION admin_member_emails(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_member_emails(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_member_emails(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.admin_member_emails(p_ids uuid[]) TO service_role;


--
-- Name: FUNCTION admin_search_people(p_search text, p_role text, p_hidden boolean, p_disabled boolean, p_claimed boolean, p_sort text, p_ascending boolean, p_offset integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_search_people(p_search text, p_role text, p_hidden boolean, p_disabled boolean, p_claimed boolean, p_sort text, p_ascending boolean, p_offset integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_search_people(p_search text, p_role text, p_hidden boolean, p_disabled boolean, p_claimed boolean, p_sort text, p_ascending boolean, p_offset integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_search_people(p_search text, p_role text, p_hidden boolean, p_disabled boolean, p_claimed boolean, p_sort text, p_ascending boolean, p_offset integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION authz_current_member_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.authz_current_member_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.authz_current_member_id() TO authenticated;
GRANT ALL ON FUNCTION public.authz_current_member_id() TO service_role;


--
-- Name: FUNCTION authz_org_role(p_organization_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.authz_org_role(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.authz_org_role(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.authz_org_role(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION auto_assign_general_theme(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_assign_general_theme() TO anon;
GRANT ALL ON FUNCTION public.auto_assign_general_theme() TO authenticated;
GRANT ALL ON FUNCTION public.auto_assign_general_theme() TO service_role;


--
-- Name: FUNCTION award_xp(amount integer, action_type text, details jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_xp(amount integer, action_type text, details jsonb) TO anon;
GRANT ALL ON FUNCTION public.award_xp(amount integer, action_type text, details jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.award_xp(amount integer, action_type text, details jsonb) TO service_role;


--
-- Name: FUNCTION award_xp_for_endorsement(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_xp_for_endorsement() TO anon;
GRANT ALL ON FUNCTION public.award_xp_for_endorsement() TO authenticated;
GRANT ALL ON FUNCTION public.award_xp_for_endorsement() TO service_role;


--
-- Name: FUNCTION begin_community_intent(p_client_operation_id uuid, p_intent_type text, p_subject_key text, p_subject_label text, p_statement text, p_subject_type text, p_subject_id uuid, p_expires_at timestamp with time zone, p_visibility text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.begin_community_intent(p_client_operation_id uuid, p_intent_type text, p_subject_key text, p_subject_label text, p_statement text, p_subject_type text, p_subject_id uuid, p_expires_at timestamp with time zone, p_visibility text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.begin_community_intent(p_client_operation_id uuid, p_intent_type text, p_subject_key text, p_subject_label text, p_statement text, p_subject_type text, p_subject_id uuid, p_expires_at timestamp with time zone, p_visibility text) TO anon;
GRANT ALL ON FUNCTION public.begin_community_intent(p_client_operation_id uuid, p_intent_type text, p_subject_key text, p_subject_label text, p_statement text, p_subject_type text, p_subject_id uuid, p_expires_at timestamp with time zone, p_visibility text) TO authenticated;
GRANT ALL ON FUNCTION public.begin_community_intent(p_client_operation_id uuid, p_intent_type text, p_subject_key text, p_subject_label text, p_statement text, p_subject_type text, p_subject_id uuid, p_expires_at timestamp with time zone, p_visibility text) TO service_role;


--
-- Name: FUNCTION bump_conversation_last_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_conversation_last_message() TO anon;
GRANT ALL ON FUNCTION public.bump_conversation_last_message() TO authenticated;
GRANT ALL ON FUNCTION public.bump_conversation_last_message() TO service_role;


--
-- Name: FUNCTION calculate_level(xp integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_level(xp integer) TO anon;
GRANT ALL ON FUNCTION public.calculate_level(xp integer) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_level(xp integer) TO service_role;


--
-- Name: FUNCTION calculate_streak(user_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_streak(user_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.calculate_streak(user_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_streak(user_id_param uuid) TO service_role;


--
-- Name: FUNCTION campaign_actor_allowed(p_actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campaign_actor_allowed(p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.campaign_actor_allowed(p_actor uuid) TO service_role;


--
-- Name: FUNCTION campaign_audience(p_audience text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campaign_audience(p_audience text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.campaign_audience(p_audience text) TO service_role;


--
-- Name: FUNCTION check_profile_completion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_profile_completion() TO anon;
GRANT ALL ON FUNCTION public.check_profile_completion() TO authenticated;
GRANT ALL ON FUNCTION public.check_profile_completion() TO service_role;


--
-- Name: FUNCTION claim_community_profile_by_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_community_profile_by_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_community_profile_by_email() TO authenticated;
GRANT ALL ON FUNCTION public.claim_community_profile_by_email() TO service_role;


--
-- Name: FUNCTION clean_old_daily_suggestions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clean_old_daily_suggestions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clean_old_daily_suggestions() TO service_role;


--
-- Name: FUNCTION cleanup_expired_presence_sessions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_presence_sessions() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_presence_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_presence_sessions() TO service_role;


--
-- Name: FUNCTION cleanup_old_dismissals(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_old_dismissals() TO anon;
GRANT ALL ON FUNCTION public.cleanup_old_dismissals() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_old_dismissals() TO service_role;


--
-- Name: FUNCTION cleanup_old_suggestions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_old_suggestions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_old_suggestions() TO service_role;


--
-- Name: FUNCTION complete_onboarding(auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_onboarding(auth_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_onboarding(auth_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.complete_onboarding(auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION confirm_community_intent(p_intent_id uuid, p_confirmation_operation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_community_intent(p_intent_id uuid, p_confirmation_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_community_intent(p_intent_id uuid, p_confirmation_operation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.confirm_community_intent(p_intent_id uuid, p_confirmation_operation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_community_intent(p_intent_id uuid, p_confirmation_operation_id uuid) TO service_role;


--
-- Name: FUNCTION confirm_theme_participation(p_theme_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_theme_participation(p_theme_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_theme_participation(p_theme_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_theme_participation(p_theme_id uuid) TO service_role;


--
-- Name: FUNCTION correct_community_intelligence_event(p_event_id uuid, p_client_operation_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.correct_community_intelligence_event(p_event_id uuid, p_client_operation_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.correct_community_intelligence_event(p_event_id uuid, p_client_operation_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.correct_community_intelligence_event(p_event_id uuid, p_client_operation_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.correct_community_intelligence_event(p_event_id uuid, p_client_operation_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_link text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_link text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_link text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION create_project_channel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_project_channel() TO anon;
GRANT ALL ON FUNCTION public.create_project_channel() TO authenticated;
GRANT ALL ON FUNCTION public.create_project_channel() TO service_role;


--
-- Name: FUNCTION current_community_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_community_id() TO anon;
GRANT ALL ON FUNCTION public.current_community_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_community_id() TO service_role;


--
-- Name: FUNCTION deactivate_organization(org_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.deactivate_organization(org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.deactivate_organization(org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.deactivate_organization(org_id uuid) TO service_role;


--
-- Name: FUNCTION decay_theme_circles(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decay_theme_circles() TO anon;
GRANT ALL ON FUNCTION public.decay_theme_circles() TO authenticated;
GRANT ALL ON FUNCTION public.decay_theme_circles() TO service_role;


--
-- Name: FUNCTION decrement_upvotes(idea_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decrement_upvotes(idea_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decrement_upvotes(idea_uuid uuid) TO service_role;


--
-- Name: FUNCTION dismiss_discovery_node(p_user_id uuid, p_node_id uuid, p_node_type text, p_relevance_score numeric, p_presence_energy numeric, p_dismissal_reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dismiss_discovery_node(p_user_id uuid, p_node_id uuid, p_node_type text, p_relevance_score numeric, p_presence_energy numeric, p_dismissal_reason text) TO anon;
GRANT ALL ON FUNCTION public.dismiss_discovery_node(p_user_id uuid, p_node_id uuid, p_node_type text, p_relevance_score numeric, p_presence_energy numeric, p_dismissal_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_discovery_node(p_user_id uuid, p_node_id uuid, p_node_type text, p_relevance_score numeric, p_presence_energy numeric, p_dismissal_reason text) TO service_role;


--
-- Name: FUNCTION end_community_intent(p_intent_id uuid, p_client_operation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.end_community_intent(p_intent_id uuid, p_client_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_community_intent(p_intent_id uuid, p_client_operation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.end_community_intent(p_intent_id uuid, p_client_operation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.end_community_intent(p_intent_id uuid, p_client_operation_id uuid) TO service_role;


--
-- Name: FUNCTION endorsements_mirror_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.endorsements_mirror_ids() TO anon;
GRANT ALL ON FUNCTION public.endorsements_mirror_ids() TO authenticated;
GRANT ALL ON FUNCTION public.endorsements_mirror_ids() TO service_role;


--
-- Name: FUNCTION enforce_capability_evidence_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_capability_evidence_status() TO anon;
GRANT ALL ON FUNCTION public.enforce_capability_evidence_status() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_capability_evidence_status() TO service_role;


--
-- Name: FUNCTION enforce_connection_authorization(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_connection_authorization() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_connection_authorization() TO service_role;


--
-- Name: FUNCTION enforce_organization_creator(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_organization_creator() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_organization_creator() TO service_role;


--
-- Name: FUNCTION enforce_organization_member_authorization(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_organization_member_authorization() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_organization_member_authorization() TO service_role;


--
-- Name: FUNCTION enforce_photo_consent(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_photo_consent() TO anon;
GRANT ALL ON FUNCTION public.enforce_photo_consent() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_photo_consent() TO service_role;


--
-- Name: FUNCTION enforce_project_member_authorization(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_project_member_authorization() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_project_member_authorization() TO service_role;


--
-- Name: FUNCTION finish_admin_claim_email(p_request_id uuid, p_accepted boolean, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_admin_claim_email(p_request_id uuid, p_accepted boolean, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_admin_claim_email(p_request_id uuid, p_accepted boolean, p_code text) TO service_role;


--
-- Name: FUNCTION finish_email_campaign_recipient(p_id uuid, p_status text, p_provider_id text, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_email_campaign_recipient(p_id uuid, p_status text, p_provider_id text, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_email_campaign_recipient(p_id uuid, p_status text, p_provider_id text, p_code text) TO service_role;


--
-- Name: FUNCTION fn_auto_create_org_owner(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_auto_create_org_owner() TO anon;
GRANT ALL ON FUNCTION public.fn_auto_create_org_owner() TO authenticated;
GRANT ALL ON FUNCTION public.fn_auto_create_org_owner() TO service_role;


--
-- Name: FUNCTION fn_set_org_created_by(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_set_org_created_by() TO anon;
GRANT ALL ON FUNCTION public.fn_set_org_created_by() TO authenticated;
GRANT ALL ON FUNCTION public.fn_set_org_created_by() TO service_role;


--
-- Name: FUNCTION get_active_presence_sessions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_presence_sessions() TO anon;
GRANT ALL ON FUNCTION public.get_active_presence_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_presence_sessions() TO service_role;


--
-- Name: FUNCTION get_admin_network_analytics(p_active_window_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_network_analytics(p_active_window_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_network_analytics(p_active_window_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_admin_network_analytics(p_active_window_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_network_analytics(p_active_window_days integer) TO service_role;


--
-- Name: FUNCTION get_admin_retention_analytics(p_min_cohort integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_retention_analytics(p_min_cohort integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_retention_analytics(p_min_cohort integer) TO anon;
GRANT ALL ON FUNCTION public.get_admin_retention_analytics(p_min_cohort integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_retention_analytics(p_min_cohort integer) TO service_role;


--
-- Name: FUNCTION get_admin_site_visit_report(p_days integer, p_view text, p_excluded_browser_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_site_visit_report(p_days integer, p_view text, p_excluded_browser_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_site_visit_report(p_days integer, p_view text, p_excluded_browser_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_site_visit_report(p_days integer, p_view text, p_excluded_browser_id uuid) TO service_role;


--
-- Name: FUNCTION get_admin_site_visits(p_days integer, p_exclude_self boolean, p_excluded_browser_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_site_visits(p_days integer, p_exclude_self boolean, p_excluded_browser_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_site_visits(p_days integer, p_exclude_self boolean, p_excluded_browser_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_site_visits(p_days integer, p_exclude_self boolean, p_excluded_browser_id uuid) TO service_role;


--
-- Name: FUNCTION get_admin_unconnected_members(p_offset integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_unconnected_members(p_offset integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_unconnected_members(p_offset integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_unconnected_members(p_offset integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_capability_attempt_stats(capability_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_capability_attempt_stats(capability_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_capability_attempt_stats(capability_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_capability_attempt_stats(capability_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_capability_attempt_stats(capability_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_community_id_from_auth(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_id_from_auth() TO anon;
GRANT ALL ON FUNCTION public.get_community_id_from_auth() TO authenticated;
GRANT ALL ON FUNCTION public.get_community_id_from_auth() TO service_role;


--
-- Name: FUNCTION get_community_pulse(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_community_pulse() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_community_pulse() TO authenticated;
GRANT ALL ON FUNCTION public.get_community_pulse() TO service_role;


--
-- Name: FUNCTION get_endorsement_count(user_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_endorsement_count(user_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_endorsement_count(user_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_endorsement_count(user_uuid uuid) TO service_role;


--
-- Name: FUNCTION get_level_title(level integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_level_title(level integer) TO anon;
GRANT ALL ON FUNCTION public.get_level_title(level integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_level_title(level integer) TO service_role;


--
-- Name: FUNCTION get_my_community_intents(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_community_intents() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_community_intents() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_community_intents() TO service_role;


--
-- Name: FUNCTION get_nearify_authorization_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_authorization_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_authorization_status() TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_authorization_status() TO service_role;


--
-- Name: FUNCTION get_nearify_between_intelligence(p_nearify_user_ids text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_between_intelligence(p_nearify_user_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_between_intelligence(p_nearify_user_ids text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_between_intelligence(p_nearify_user_ids text[]) TO service_role;


--
-- Name: FUNCTION get_nearify_event_peers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_event_peers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_event_peers() TO anon;
GRANT ALL ON FUNCTION public.get_nearify_event_peers() TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_event_peers() TO service_role;


--
-- Name: FUNCTION get_nearify_event_recommendations(p_nearify_event_id text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_event_recommendations(p_nearify_event_id text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_event_recommendations(p_nearify_event_id text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_nearify_event_recommendations(p_nearify_event_id text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_event_recommendations(p_nearify_event_id text, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_nearify_link_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_link_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_link_status() TO anon;
GRANT ALL ON FUNCTION public.get_nearify_link_status() TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_link_status() TO service_role;


--
-- Name: FUNCTION get_nearify_live_attendee_signals(p_nearify_user_ids text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_live_attendee_signals(p_nearify_user_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_live_attendee_signals(p_nearify_user_ids text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_live_attendee_signals(p_nearify_user_ids text[]) TO service_role;


--
-- Name: FUNCTION get_nearify_relationship_enrichment(p_nearify_user_ids text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_nearify_relationship_enrichment(p_nearify_user_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_nearify_relationship_enrichment(p_nearify_user_ids text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearify_relationship_enrichment(p_nearify_user_ids text[]) TO service_role;


--
-- Name: FUNCTION get_or_create_conversation(other_user_id uuid, ctx_type text, ctx_id uuid, ctx_title text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_or_create_conversation(other_user_id uuid, ctx_type text, ctx_id uuid, ctx_title text) TO anon;
GRANT ALL ON FUNCTION public.get_or_create_conversation(other_user_id uuid, ctx_type text, ctx_id uuid, ctx_title text) TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_conversation(other_user_id uuid, ctx_type text, ctx_id uuid, ctx_title text) TO service_role;


--
-- Name: FUNCTION get_project_interest_requests(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_project_interest_requests(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_project_interest_requests(p_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_project_interest_requests(p_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_project_interest_requests(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION get_pulse_metrics(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_pulse_metrics() TO anon;
GRANT ALL ON FUNCTION public.get_pulse_metrics() TO authenticated;
GRANT ALL ON FUNCTION public.get_pulse_metrics() TO service_role;


--
-- Name: FUNCTION get_recent_interactions(p_user_id uuid, p_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_recent_interactions(p_user_id uuid, p_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_recent_interactions(p_user_id uuid, p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_recent_interactions(p_user_id uuid, p_days integer) TO service_role;


--
-- Name: FUNCTION get_skill_endorsements(user_uuid uuid, skill_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_skill_endorsements(user_uuid uuid, skill_name text) TO anon;
GRANT ALL ON FUNCTION public.get_skill_endorsements(user_uuid uuid, skill_name text) TO authenticated;
GRANT ALL ON FUNCTION public.get_skill_endorsements(user_uuid uuid, skill_name text) TO service_role;


--
-- Name: FUNCTION get_start_sequence_data(auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_start_sequence_data(auth_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_start_sequence_data(auth_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_start_sequence_data(auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_unread_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_unread_count() TO anon;
GRANT ALL ON FUNCTION public.get_unread_count() TO authenticated;
GRANT ALL ON FUNCTION public.get_unread_count() TO service_role;


--
-- Name: FUNCTION get_unread_notification_count(user_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_unread_notification_count(user_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.get_unread_notification_count(user_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_unread_notification_count(user_id_param uuid) TO service_role;


--
-- Name: FUNCTION guard_capability_verification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_capability_verification() TO anon;
GRANT ALL ON FUNCTION public.guard_capability_verification() TO authenticated;
GRANT ALL ON FUNCTION public.guard_capability_verification() TO service_role;


--
-- Name: FUNCTION handle_bid_acceptance(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_bid_acceptance() TO anon;
GRANT ALL ON FUNCTION public.handle_bid_acceptance() TO authenticated;
GRANT ALL ON FUNCTION public.handle_bid_acceptance() TO service_role;


--
-- Name: FUNCTION has_endorsed(endorser_uuid uuid, endorsed_uuid uuid, skill_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_endorsed(endorser_uuid uuid, endorsed_uuid uuid, skill_name text) TO anon;
GRANT ALL ON FUNCTION public.has_endorsed(endorser_uuid uuid, endorsed_uuid uuid, skill_name text) TO authenticated;
GRANT ALL ON FUNCTION public.has_endorsed(endorser_uuid uuid, endorsed_uuid uuid, skill_name text) TO service_role;


--
-- Name: FUNCTION increment_upvotes(idea_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_upvotes(idea_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_upvotes(idea_uuid uuid) TO service_role;


--
-- Name: FUNCTION infer_ble_edges(p_group_id uuid, p_min_overlap_seconds integer, p_lookback_minutes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.infer_ble_edges(p_group_id uuid, p_min_overlap_seconds integer, p_lookback_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.infer_ble_edges(p_group_id uuid, p_min_overlap_seconds integer, p_lookback_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.infer_ble_edges(p_group_id uuid, p_min_overlap_seconds integer, p_lookback_minutes integer) TO service_role;


--
-- Name: FUNCTION ingest_nearify_event_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_status text, p_from_community_id uuid, p_from_auth_user_id uuid, p_from_nearify_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ingest_nearify_event_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_status text, p_from_community_id uuid, p_from_auth_user_id uuid, p_from_nearify_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ingest_nearify_event_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_status text, p_from_community_id uuid, p_from_auth_user_id uuid, p_from_nearify_id text) TO authenticated;
GRANT ALL ON FUNCTION public.ingest_nearify_event_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_status text, p_from_community_id uuid, p_from_auth_user_id uuid, p_from_nearify_id text) TO service_role;


--
-- Name: FUNCTION ingest_nearify_evidence_v2(p_event_id uuid, p_from_nearify_id text, p_to_nearify_id text, p_signal_type text, p_confidence numeric, p_occurred_at timestamp with time zone, p_event_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ingest_nearify_evidence_v2(p_event_id uuid, p_from_nearify_id text, p_to_nearify_id text, p_signal_type text, p_confidence numeric, p_occurred_at timestamp with time zone, p_event_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ingest_nearify_evidence_v2(p_event_id uuid, p_from_nearify_id text, p_to_nearify_id text, p_signal_type text, p_confidence numeric, p_occurred_at timestamp with time zone, p_event_name text) TO service_role;


--
-- Name: FUNCTION ingest_nearify_interaction(p_event_id uuid, p_from_auth_user_id uuid, p_to_auth_user_id uuid, p_from_community_id uuid, p_to_community_id uuid, p_signal_type text, p_confidence numeric, p_occurred_at timestamp with time zone, p_meta jsonb, p_from_nearify_id text, p_to_nearify_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ingest_nearify_interaction(p_event_id uuid, p_from_auth_user_id uuid, p_to_auth_user_id uuid, p_from_community_id uuid, p_to_community_id uuid, p_signal_type text, p_confidence numeric, p_occurred_at timestamp with time zone, p_meta jsonb, p_from_nearify_id text, p_to_nearify_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ingest_nearify_interaction(p_event_id uuid, p_from_auth_user_id uuid, p_to_auth_user_id uuid, p_from_community_id uuid, p_to_community_id uuid, p_signal_type text, p_confidence numeric, p_occurred_at timestamp with time zone, p_meta jsonb, p_from_nearify_id text, p_to_nearify_id text) TO service_role;


--
-- Name: FUNCTION is_admin(uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO service_role;


--
-- Name: FUNCTION is_node_dismissed(p_user_id uuid, p_node_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_node_dismissed(p_user_id uuid, p_node_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_node_dismissed(p_user_id uuid, p_node_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_node_dismissed(p_user_id uuid, p_node_id uuid) TO service_role;


--
-- Name: FUNCTION link_nearify_account(p_nearify_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.link_nearify_account(p_nearify_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_nearify_account(p_nearify_user_id text) TO anon;
GRANT ALL ON FUNCTION public.link_nearify_account(p_nearify_user_id text) TO authenticated;
GRANT ALL ON FUNCTION public.link_nearify_account(p_nearify_user_id text) TO service_role;


--
-- Name: FUNCTION nearify_professional_context_score(p_shared_projects bigint, p_mutual_connections bigint, p_shared_organizations bigint, p_shared_skills bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nearify_professional_context_score(p_shared_projects bigint, p_mutual_connections bigint, p_shared_organizations bigint, p_shared_skills bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nearify_professional_context_score(p_shared_projects bigint, p_mutual_connections bigint, p_shared_organizations bigint, p_shared_skills bigint) TO authenticated;
GRANT ALL ON FUNCTION public.nearify_professional_context_score(p_shared_projects bigint, p_mutual_connections bigint, p_shared_organizations bigint, p_shared_skills bigint) TO service_role;


--
-- Name: FUNCTION normalize_skills_text(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_skills_text() TO anon;
GRANT ALL ON FUNCTION public.normalize_skills_text() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_skills_text() TO service_role;


--
-- Name: FUNCTION notify_connection_accepted(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_connection_accepted() TO anon;
GRANT ALL ON FUNCTION public.notify_connection_accepted() TO authenticated;
GRANT ALL ON FUNCTION public.notify_connection_accepted() TO service_role;


--
-- Name: FUNCTION notify_connection_request(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_connection_request() TO anon;
GRANT ALL ON FUNCTION public.notify_connection_request() TO authenticated;
GRANT ALL ON FUNCTION public.notify_connection_request() TO service_role;


--
-- Name: FUNCTION notify_endorsement(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_endorsement() TO anon;
GRANT ALL ON FUNCTION public.notify_endorsement() TO authenticated;
GRANT ALL ON FUNCTION public.notify_endorsement() TO service_role;


--
-- Name: FUNCTION notify_new_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_message() TO anon;
GRANT ALL ON FUNCTION public.notify_new_message() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_message() TO service_role;


--
-- Name: FUNCTION notify_opportunity_interest(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_opportunity_interest() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_opportunity_interest() TO anon;
GRANT ALL ON FUNCTION public.notify_opportunity_interest() TO authenticated;
GRANT ALL ON FUNCTION public.notify_opportunity_interest() TO service_role;


--
-- Name: FUNCTION notify_organization_join_request(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_organization_join_request() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_organization_join_request() TO service_role;


--
-- Name: FUNCTION notify_project_invite(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_project_invite() TO anon;
GRANT ALL ON FUNCTION public.notify_project_invite() TO authenticated;
GRANT ALL ON FUNCTION public.notify_project_invite() TO service_role;


--
-- Name: FUNCTION notify_project_request(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_project_request() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_project_request() TO service_role;


--
-- Name: FUNCTION prevent_opportunity_poster_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_opportunity_poster_change() TO anon;
GRANT ALL ON FUNCTION public.prevent_opportunity_poster_change() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_opportunity_poster_change() TO service_role;


--
-- Name: FUNCTION project_auto_add_creator_member(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_auto_add_creator_member() TO anon;
GRANT ALL ON FUNCTION public.project_auto_add_creator_member() TO authenticated;
GRANT ALL ON FUNCTION public.project_auto_add_creator_member() TO service_role;


--
-- Name: FUNCTION project_members_dedupe(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_members_dedupe() TO anon;
GRANT ALL ON FUNCTION public.project_members_dedupe() TO authenticated;
GRANT ALL ON FUNCTION public.project_members_dedupe() TO service_role;


--
-- Name: FUNCTION projects_sync_name_title(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_sync_name_title() TO anon;
GRANT ALL ON FUNCTION public.projects_sync_name_title() TO authenticated;
GRANT ALL ON FUNCTION public.projects_sync_name_title() TO service_role;


--
-- Name: FUNCTION projects_sync_skills(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_sync_skills() TO anon;
GRANT ALL ON FUNCTION public.projects_sync_skills() TO authenticated;
GRANT ALL ON FUNCTION public.projects_sync_skills() TO service_role;


--
-- Name: FUNCTION promote_edge_to_connection(p_edge_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.promote_edge_to_connection(p_edge_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.promote_edge_to_connection(p_edge_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.promote_edge_to_connection(p_edge_id uuid) TO service_role;


--
-- Name: FUNCTION reconfirm_nearify_authorization(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reconfirm_nearify_authorization() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconfirm_nearify_authorization() TO authenticated;
GRANT ALL ON FUNCTION public.reconfirm_nearify_authorization() TO service_role;


--
-- Name: FUNCTION record_email_campaign_event(p_id text, p_provider_id text, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_email_campaign_event(p_id text, p_provider_id text, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_email_campaign_event(p_id text, p_provider_id text, p_type text) TO service_role;


--
-- Name: FUNCTION record_opportunity_interest_followup(p_opportunity_id uuid, p_interested_community_id uuid, p_channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_opportunity_interest_followup(p_opportunity_id uuid, p_interested_community_id uuid, p_channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_opportunity_interest_followup(p_opportunity_id uuid, p_interested_community_id uuid, p_channel text) TO anon;
GRANT ALL ON FUNCTION public.record_opportunity_interest_followup(p_opportunity_id uuid, p_interested_community_id uuid, p_channel text) TO authenticated;
GRANT ALL ON FUNCTION public.record_opportunity_interest_followup(p_opportunity_id uuid, p_interested_community_id uuid, p_channel text) TO service_role;


--
-- Name: FUNCTION record_project_interest_followup(p_project_member_id uuid, p_channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_project_interest_followup(p_project_member_id uuid, p_channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_project_interest_followup(p_project_member_id uuid, p_channel text) TO anon;
GRANT ALL ON FUNCTION public.record_project_interest_followup(p_project_member_id uuid, p_channel text) TO authenticated;
GRANT ALL ON FUNCTION public.record_project_interest_followup(p_project_member_id uuid, p_channel text) TO service_role;


--
-- Name: FUNCTION record_site_visit(p_session_id uuid, p_browser_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_site_visit(p_session_id uuid, p_browser_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_site_visit(p_session_id uuid, p_browser_id uuid) TO anon;
GRANT ALL ON FUNCTION public.record_site_visit(p_session_id uuid, p_browser_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_site_visit(p_session_id uuid, p_browser_id uuid) TO service_role;


--
-- Name: FUNCTION refresh_capability_evidence(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_capability_evidence() TO anon;
GRANT ALL ON FUNCTION public.refresh_capability_evidence() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_capability_evidence() TO service_role;


--
-- Name: FUNCTION reject_community_intelligence_event_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reject_community_intelligence_event_mutation() TO anon;
GRANT ALL ON FUNCTION public.reject_community_intelligence_event_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.reject_community_intelligence_event_mutation() TO service_role;


--
-- Name: FUNCTION reserve_admin_claim_emails(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_admin_claim_emails(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_admin_claim_emails(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reserve_admin_claim_emails(p_ids uuid[]) TO service_role;


--
-- Name: FUNCTION reserve_email_campaign_batch(p_id uuid, p_actor uuid, p_mode text, p_reviewed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_email_campaign_batch(p_id uuid, p_actor uuid, p_mode text, p_reviewed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_email_campaign_batch(p_id uuid, p_actor uuid, p_mode text, p_reviewed boolean) TO service_role;


--
-- Name: FUNCTION set_capability_memory_timestamps(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_capability_memory_timestamps() TO anon;
GRANT ALL ON FUNCTION public.set_capability_memory_timestamps() TO authenticated;
GRANT ALL ON FUNCTION public.set_capability_memory_timestamps() TO service_role;


--
-- Name: FUNCTION set_my_photo_visibility(p_visible boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_my_photo_visibility(p_visible boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_photo_visibility(p_visible boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_my_photo_visibility(p_visible boolean) TO service_role;


--
-- Name: FUNCTION set_nearify_event_live_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_is_live boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_nearify_event_live_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_is_live boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_nearify_event_live_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_is_live boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_nearify_event_live_presence(p_nearify_event_id text, p_event_name text, p_event_starts_at timestamp with time zone, p_is_live boolean) TO service_role;


--
-- Name: FUNCTION set_project_task_timestamps(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_project_task_timestamps() TO anon;
GRANT ALL ON FUNCTION public.set_project_task_timestamps() TO authenticated;
GRANT ALL ON FUNCTION public.set_project_task_timestamps() TO service_role;


--
-- Name: FUNCTION stop_theme_participation(p_theme_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stop_theme_participation(p_theme_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stop_theme_participation(p_theme_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.stop_theme_participation(p_theme_id uuid) TO service_role;


--
-- Name: FUNCTION unified_network_maintenance(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unified_network_maintenance() TO anon;
GRANT ALL ON FUNCTION public.unified_network_maintenance() TO authenticated;
GRANT ALL ON FUNCTION public.unified_network_maintenance() TO service_role;


--
-- Name: FUNCTION unlink_nearify_account(p_expected_nearify_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unlink_nearify_account(p_expected_nearify_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_nearify_account(p_expected_nearify_user_id text) TO anon;
GRANT ALL ON FUNCTION public.unlink_nearify_account(p_expected_nearify_user_id text) TO authenticated;
GRANT ALL ON FUNCTION public.unlink_nearify_account(p_expected_nearify_user_id text) TO service_role;


--
-- Name: FUNCTION unsubscribe_campaign_email(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unsubscribe_campaign_email(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unsubscribe_campaign_email(p_token text) TO anon;
GRANT ALL ON FUNCTION public.unsubscribe_campaign_email(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.unsubscribe_campaign_email(p_token text) TO service_role;


--
-- Name: FUNCTION update_connection_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_connection_count() TO anon;
GRANT ALL ON FUNCTION public.update_connection_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_connection_count() TO service_role;


--
-- Name: FUNCTION update_conversation_last_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_conversation_last_message() TO anon;
GRANT ALL ON FUNCTION public.update_conversation_last_message() TO authenticated;
GRANT ALL ON FUNCTION public.update_conversation_last_message() TO service_role;


--
-- Name: FUNCTION update_conversation_on_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_conversation_on_message() TO anon;
GRANT ALL ON FUNCTION public.update_conversation_on_message() TO authenticated;
GRANT ALL ON FUNCTION public.update_conversation_on_message() TO service_role;


--
-- Name: FUNCTION update_cynq_cards_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_cynq_cards_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_cynq_cards_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_cynq_cards_updated_at() TO service_role;


--
-- Name: FUNCTION update_endorsement_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_endorsement_count() TO anon;
GRANT ALL ON FUNCTION public.update_endorsement_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_endorsement_count() TO service_role;


--
-- Name: FUNCTION update_login_timestamp(auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_login_timestamp(auth_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_login_timestamp(auth_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_login_timestamp(auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION update_onboarding_step(auth_user_id uuid, step_number integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_onboarding_step(auth_user_id uuid, step_number integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_onboarding_step(auth_user_id uuid, step_number integer) TO authenticated;
GRANT ALL ON FUNCTION public.update_onboarding_step(auth_user_id uuid, step_number integer) TO service_role;


--
-- Name: FUNCTION update_organization_follower_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_organization_follower_count() TO anon;
GRANT ALL ON FUNCTION public.update_organization_follower_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_organization_follower_count() TO service_role;


--
-- Name: FUNCTION update_organization_opportunity_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_organization_opportunity_count() TO anon;
GRANT ALL ON FUNCTION public.update_organization_opportunity_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_organization_opportunity_count() TO service_role;


--
-- Name: FUNCTION update_presence_sessions_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_presence_sessions_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_presence_sessions_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_presence_sessions_updated_at() TO service_role;


--
-- Name: FUNCTION update_project_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_project_stats() TO anon;
GRANT ALL ON FUNCTION public.update_project_stats() TO authenticated;
GRANT ALL ON FUNCTION public.update_project_stats() TO service_role;


--
-- Name: FUNCTION update_streak_on_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_streak_on_activity() TO anon;
GRANT ALL ON FUNCTION public.update_streak_on_activity() TO authenticated;
GRANT ALL ON FUNCTION public.update_streak_on_activity() TO service_role;


--
-- Name: FUNCTION update_team_size(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_team_size() TO anon;
GRANT ALL ON FUNCTION public.update_team_size() TO authenticated;
GRANT ALL ON FUNCTION public.update_team_size() TO service_role;


--
-- Name: FUNCTION update_theme_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_theme_activity() TO anon;
GRANT ALL ON FUNCTION public.update_theme_activity() TO authenticated;
GRANT ALL ON FUNCTION public.update_theme_activity() TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_user_level(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_user_level() TO anon;
GRANT ALL ON FUNCTION public.update_user_level() TO authenticated;
GRANT ALL ON FUNCTION public.update_user_level() TO service_role;


--
-- Name: FUNCTION upsert_presence_ping(p_context_type text, p_context_id uuid, p_energy numeric, p_ttl_seconds integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upsert_presence_ping(p_context_type text, p_context_id uuid, p_energy numeric, p_ttl_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.upsert_presence_ping(p_context_type text, p_context_id uuid, p_energy numeric, p_ttl_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_presence_ping(p_context_type text, p_context_id uuid, p_energy numeric, p_ttl_seconds integer) TO service_role;


--
-- Name: FUNCTION xp_for_next_level(current_level integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.xp_for_next_level(current_level integer) TO anon;
GRANT ALL ON FUNCTION public.xp_for_next_level(current_level integer) TO authenticated;
GRANT ALL ON FUNCTION public.xp_for_next_level(current_level integer) TO service_role;


--
-- Name: TABLE achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievements TO anon;
GRANT ALL ON TABLE public.achievements TO authenticated;
GRANT ALL ON TABLE public.achievements TO service_role;


--
-- Name: TABLE active_organizations_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.active_organizations_summary TO anon;
GRANT ALL ON TABLE public.active_organizations_summary TO authenticated;
GRANT ALL ON TABLE public.active_organizations_summary TO service_role;


--
-- Name: TABLE presence_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.presence_sessions TO anon;
GRANT ALL ON TABLE public.presence_sessions TO authenticated;
GRANT ALL ON TABLE public.presence_sessions TO service_role;


--
-- Name: TABLE active_presence_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.active_presence_sessions TO anon;
GRANT ALL ON TABLE public.active_presence_sessions TO authenticated;
GRANT ALL ON TABLE public.active_presence_sessions TO service_role;


--
-- Name: TABLE active_themes_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.active_themes_summary TO anon;
GRANT ALL ON TABLE public.active_themes_summary TO authenticated;
GRANT ALL ON TABLE public.active_themes_summary TO service_role;


--
-- Name: TABLE activity_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_log TO anon;
GRANT ALL ON TABLE public.activity_log TO authenticated;
GRANT ALL ON TABLE public.activity_log TO service_role;


--
-- Name: TABLE admin_claim_email_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_claim_email_requests TO service_role;


--
-- Name: TABLE community; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.community TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.community TO authenticated;
GRANT ALL ON TABLE public.community TO service_role;


--
-- Name: COLUMN community.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.community TO anon;
GRANT SELECT(name) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.skills; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(skills) ON TABLE public.community TO anon;
GRANT SELECT(skills) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.interests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(interests) ON TABLE public.community TO anon;
GRANT SELECT(interests) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.x; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(x) ON TABLE public.community TO anon;
GRANT SELECT(x) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.y; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(y) ON TABLE public.community TO anon;
GRANT SELECT(y) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.community TO anon;
GRANT SELECT(created_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.community TO anon;
GRANT SELECT(id) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.image_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(image_url) ON TABLE public.community TO anon;
GRANT SELECT(image_url) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.endorsements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(endorsements) ON TABLE public.community TO anon;
GRANT SELECT(endorsements) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.availability; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(availability) ON TABLE public.community TO anon;
GRANT SELECT(availability) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.community TO anon;
GRANT SELECT(user_id) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.bio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bio) ON TABLE public.community TO anon;
GRANT SELECT(bio) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.newsletter_opt_in; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(newsletter_opt_in) ON TABLE public.community TO anon;
GRANT SELECT(newsletter_opt_in) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.newsletter_opt_in_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(newsletter_opt_in_at) ON TABLE public.community TO anon;
GRANT SELECT(newsletter_opt_in_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.connection_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connection_count) ON TABLE public.community TO anon;
GRANT SELECT(connection_count) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.community TO anon;
GRANT SELECT(updated_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.profile_completed; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(profile_completed) ON TABLE public.community TO anon;
GRANT SELECT(profile_completed) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.user_role; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_role) ON TABLE public.community TO anon;
GRANT SELECT(user_role) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.image_path; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(image_path) ON TABLE public.community TO anon;
GRANT SELECT(image_path) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.projects_created; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(projects_created) ON TABLE public.community TO anon;
GRANT SELECT(projects_created) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.projects_joined; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(projects_joined) ON TABLE public.community TO anon;
GRANT SELECT(projects_joined) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.bids_submitted; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bids_submitted) ON TABLE public.community TO anon;
GRANT SELECT(bids_submitted) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.bids_accepted; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bids_accepted) ON TABLE public.community TO anon;
GRANT SELECT(bids_accepted) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.role; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(role) ON TABLE public.community TO anon;
GRANT SELECT(role) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.xp; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(xp) ON TABLE public.community TO anon;
GRANT SELECT(xp) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.level; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(level) ON TABLE public.community TO anon;
GRANT SELECT(level) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.login_streak; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(login_streak) ON TABLE public.community TO anon;
GRANT SELECT(login_streak) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.last_login; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_login) ON TABLE public.community TO anon;
GRANT SELECT(last_login) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.daily_quests_completed; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(daily_quests_completed) ON TABLE public.community TO anon;
GRANT SELECT(daily_quests_completed) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.endorsements_given; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(endorsements_given) ON TABLE public.community TO anon;
GRANT SELECT(endorsements_given) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.endorsements_received; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(endorsements_received) ON TABLE public.community TO anon;
GRANT SELECT(endorsements_received) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.onboarding_completed; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(onboarding_completed) ON TABLE public.community TO anon;
GRANT SELECT(onboarding_completed) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.onboarding_step; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(onboarding_step) ON TABLE public.community TO anon;
GRANT SELECT(onboarding_step) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.onboarding_started_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(onboarding_started_at) ON TABLE public.community TO anon;
GRANT SELECT(onboarding_started_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.onboarding_completed_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(onboarding_completed_at) ON TABLE public.community TO anon;
GRANT SELECT(onboarding_completed_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.previous_login_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(previous_login_at) ON TABLE public.community TO anon;
GRANT SELECT(previous_login_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.last_start_view_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_start_view_at) ON TABLE public.community TO anon;
GRANT SELECT(last_start_view_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.start_view_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(start_view_count) ON TABLE public.community TO anon;
GRANT SELECT(start_view_count) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.is_hidden; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_hidden) ON TABLE public.community TO anon;
GRANT SELECT(is_hidden) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.avatar_storage_path; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(avatar_storage_path) ON TABLE public.community TO anon;
GRANT SELECT(avatar_storage_path) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.total_xp; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(total_xp) ON TABLE public.community TO anon;
GRANT SELECT(total_xp) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.current_streak; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(current_streak) ON TABLE public.community TO anon;
GRANT SELECT(current_streak) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.last_activity_date; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_activity_date) ON TABLE public.community TO anon;
GRANT SELECT(last_activity_date) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.is_disabled; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_disabled) ON TABLE public.community TO anon;
GRANT SELECT(is_disabled) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.last_seen_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_seen_at) ON TABLE public.community TO anon;
GRANT SELECT(last_seen_at) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.photo_visible; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(photo_visible) ON TABLE public.community TO anon;
GRANT SELECT(photo_visible) ON TABLE public.community TO authenticated;


--
-- Name: COLUMN community.photo_consent_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(photo_consent_at) ON TABLE public.community TO anon;
GRANT SELECT(photo_consent_at) ON TABLE public.community TO authenticated;


--
-- Name: TABLE ideas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ideas TO anon;
GRANT ALL ON TABLE public.ideas TO authenticated;
GRANT ALL ON TABLE public.ideas TO service_role;


--
-- Name: TABLE team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_members TO anon;
GRANT ALL ON TABLE public.team_members TO authenticated;
GRANT ALL ON TABLE public.team_members TO service_role;


--
-- Name: TABLE admin_ideas_overview; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_ideas_overview TO anon;
GRANT ALL ON TABLE public.admin_ideas_overview TO authenticated;
GRANT ALL ON TABLE public.admin_ideas_overview TO service_role;


--
-- Name: TABLE bbs_channels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bbs_channels TO anon;
GRANT ALL ON TABLE public.bbs_channels TO authenticated;
GRANT ALL ON TABLE public.bbs_channels TO service_role;


--
-- Name: TABLE bbs_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bbs_messages TO service_role;
GRANT SELECT ON TABLE public.bbs_messages TO anon;
GRANT SELECT,DELETE ON TABLE public.bbs_messages TO authenticated;


--
-- Name: COLUMN bbs_messages.text; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(text) ON TABLE public.bbs_messages TO authenticated;


--
-- Name: COLUMN bbs_messages.username; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(username) ON TABLE public.bbs_messages TO authenticated;


--
-- Name: COLUMN bbs_messages.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(user_id) ON TABLE public.bbs_messages TO authenticated;


--
-- Name: SEQUENCE bbs_messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.bbs_messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bbs_messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bbs_messages_id_seq TO service_role;


--
-- Name: TABLE bbs_online; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bbs_online TO anon;
GRANT ALL ON TABLE public.bbs_online TO authenticated;
GRANT ALL ON TABLE public.bbs_online TO service_role;


--
-- Name: TABLE bbs_online_active; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bbs_online_active TO anon;
GRANT ALL ON TABLE public.bbs_online_active TO authenticated;
GRANT ALL ON TABLE public.bbs_online_active TO service_role;


--
-- Name: TABLE bbs_presence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bbs_presence TO anon;
GRANT ALL ON TABLE public.bbs_presence TO authenticated;
GRANT ALL ON TABLE public.bbs_presence TO service_role;


--
-- Name: TABLE beacons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.beacons TO anon;
GRANT ALL ON TABLE public.beacons TO authenticated;
GRANT ALL ON TABLE public.beacons TO service_role;


--
-- Name: TABLE capability_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.capability_attempts TO anon;
GRANT ALL ON TABLE public.capability_attempts TO authenticated;
GRANT ALL ON TABLE public.capability_attempts TO service_role;


--
-- Name: TABLE capability_packages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.capability_packages TO anon;
GRANT ALL ON TABLE public.capability_packages TO authenticated;
GRANT ALL ON TABLE public.capability_packages TO service_role;


--
-- Name: TABLE client_errors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_errors TO anon;
GRANT ALL ON TABLE public.client_errors TO authenticated;
GRANT ALL ON TABLE public.client_errors TO service_role;


--
-- Name: TABLE community_backup_pre_oauth_migration; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_backup_pre_oauth_migration TO anon;
GRANT ALL ON TABLE public.community_backup_pre_oauth_migration TO authenticated;
GRANT ALL ON TABLE public.community_backup_pre_oauth_migration TO service_role;


--
-- Name: TABLE community_experience_authorizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_experience_authorizations TO service_role;
GRANT SELECT ON TABLE public.community_experience_authorizations TO authenticated;


--
-- Name: TABLE community_intelligence_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_intelligence_events TO service_role;


--
-- Name: TABLE community_intent_statements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_intent_statements TO service_role;


--
-- Name: TABLE community_with_last_seen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_with_last_seen TO anon;
GRANT ALL ON TABLE public.community_with_last_seen TO authenticated;
GRANT ALL ON TABLE public.community_with_last_seen TO service_role;


--
-- Name: TABLE connection_leaderboard; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.connection_leaderboard TO anon;
GRANT ALL ON TABLE public.connection_leaderboard TO authenticated;
GRANT ALL ON TABLE public.connection_leaderboard TO service_role;


--
-- Name: TABLE connections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.connections TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.connections TO authenticated;
GRANT ALL ON TABLE public.connections TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversations TO service_role;
GRANT SELECT ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.participant_1_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(participant_1_id) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.participant_2_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(participant_2_id) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.last_message_at; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(last_message_at),UPDATE(last_message_at) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.last_message_preview; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(last_message_preview),UPDATE(last_message_preview) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.context_type; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(context_type) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.context_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(context_id) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.context_title; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(context_title) ON TABLE public.conversations TO authenticated;


--
-- Name: COLUMN conversations.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.conversations TO authenticated;


--
-- Name: TABLE cynq_cards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cynq_cards TO anon;
GRANT ALL ON TABLE public.cynq_cards TO authenticated;
GRANT ALL ON TABLE public.cynq_cards TO service_role;


--
-- Name: TABLE cynq_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cynq_team_members TO anon;
GRANT ALL ON TABLE public.cynq_team_members TO authenticated;
GRANT ALL ON TABLE public.cynq_team_members TO service_role;


--
-- Name: TABLE cynq_teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cynq_teams TO anon;
GRANT ALL ON TABLE public.cynq_teams TO authenticated;
GRANT ALL ON TABLE public.cynq_teams TO service_role;


--
-- Name: TABLE daily_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_suggestions TO anon;
GRANT ALL ON TABLE public.daily_suggestions TO authenticated;
GRANT ALL ON TABLE public.daily_suggestions TO service_role;


--
-- Name: TABLE discovery_dismissals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.discovery_dismissals TO anon;
GRANT ALL ON TABLE public.discovery_dismissals TO authenticated;
GRANT ALL ON TABLE public.discovery_dismissals TO service_role;


--
-- Name: TABLE email_campaign_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaign_events TO service_role;


--
-- Name: TABLE email_campaign_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaign_recipients TO service_role;


--
-- Name: TABLE email_campaign_suppressions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaign_suppressions TO service_role;


--
-- Name: TABLE email_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaigns TO service_role;


--
-- Name: TABLE endorsements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.endorsements TO anon;
GRANT ALL ON TABLE public.endorsements TO authenticated;
GRANT ALL ON TABLE public.endorsements TO service_role;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.feedback TO anon;
GRANT ALL ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;


--
-- Name: TABLE idea_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.idea_comments TO anon;
GRANT ALL ON TABLE public.idea_comments TO authenticated;
GRANT ALL ON TABLE public.idea_comments TO service_role;


--
-- Name: TABLE idea_upvotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.idea_upvotes TO anon;
GRANT ALL ON TABLE public.idea_upvotes TO authenticated;
GRANT ALL ON TABLE public.idea_upvotes TO service_role;


--
-- Name: TABLE interaction_edges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.interaction_edges TO anon;
GRANT SELECT,MAINTAIN,UPDATE ON TABLE public.interaction_edges TO authenticated;
GRANT ALL ON TABLE public.interaction_edges TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO service_role;
GRANT SELECT ON TABLE public.messages TO authenticated;


--
-- Name: COLUMN messages.conversation_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(conversation_id) ON TABLE public.messages TO authenticated;


--
-- Name: COLUMN messages.sender_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(sender_id) ON TABLE public.messages TO authenticated;


--
-- Name: COLUMN messages.content; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(content) ON TABLE public.messages TO authenticated;


--
-- Name: COLUMN messages.read; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(read),UPDATE(read) ON TABLE public.messages TO authenticated;


--
-- Name: TABLE messages_backup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages_backup TO anon;
GRANT ALL ON TABLE public.messages_backup TO authenticated;
GRANT ALL ON TABLE public.messages_backup TO service_role;


--
-- Name: TABLE nearify_event_presence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nearify_event_presence TO anon;
GRANT ALL ON TABLE public.nearify_event_presence TO authenticated;
GRANT ALL ON TABLE public.nearify_event_presence TO service_role;


--
-- Name: TABLE nearify_identity_map; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nearify_identity_map TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nearify_identity_map TO authenticated;
GRANT ALL ON TABLE public.nearify_identity_map TO service_role;


--
-- Name: TABLE node_interactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.node_interactions TO anon;
GRANT ALL ON TABLE public.node_interactions TO authenticated;
GRANT ALL ON TABLE public.node_interactions TO service_role;


--
-- Name: TABLE notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notes TO anon;
GRANT ALL ON TABLE public.notes TO authenticated;
GRANT ALL ON TABLE public.notes TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.notifications TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: COLUMN notifications.read; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(read) ON TABLE public.notifications TO authenticated;


--
-- Name: TABLE opportunities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.opportunities TO anon;
GRANT ALL ON TABLE public.opportunities TO authenticated;
GRANT ALL ON TABLE public.opportunities TO service_role;


--
-- Name: TABLE opportunity_engagement; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.opportunity_engagement TO anon;
GRANT ALL ON TABLE public.opportunity_engagement TO authenticated;
GRANT ALL ON TABLE public.opportunity_engagement TO service_role;


--
-- Name: SEQUENCE opportunity_engagement_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.opportunity_engagement_id_seq TO anon;
GRANT ALL ON SEQUENCE public.opportunity_engagement_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.opportunity_engagement_id_seq TO service_role;


--
-- Name: TABLE opportunity_interest_followups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.opportunity_interest_followups TO anon;
GRANT ALL ON TABLE public.opportunity_interest_followups TO authenticated;
GRANT ALL ON TABLE public.opportunity_interest_followups TO service_role;


--
-- Name: TABLE opportunity_interests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.opportunity_interests TO anon;
GRANT ALL ON TABLE public.opportunity_interests TO authenticated;
GRANT ALL ON TABLE public.opportunity_interests TO service_role;


--
-- Name: TABLE organization_followers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_followers TO anon;
GRANT ALL ON TABLE public.organization_followers TO authenticated;
GRANT ALL ON TABLE public.organization_followers TO service_role;


--
-- Name: TABLE organization_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.organization_members TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.organization_members TO authenticated;
GRANT ALL ON TABLE public.organization_members TO service_role;


--
-- Name: TABLE organization_theme_sponsorships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_theme_sponsorships TO anon;
GRANT ALL ON TABLE public.organization_theme_sponsorships TO authenticated;
GRANT ALL ON TABLE public.organization_theme_sponsorships TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.organizations TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE product_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_events TO anon;
GRANT ALL ON TABLE public.product_events TO authenticated;
GRANT ALL ON TABLE public.product_events TO service_role;


--
-- Name: TABLE product_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_sessions TO anon;
GRANT ALL ON TABLE public.product_sessions TO authenticated;
GRANT ALL ON TABLE public.product_sessions TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE profiles_with_last_seen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles_with_last_seen TO anon;
GRANT ALL ON TABLE public.profiles_with_last_seen TO authenticated;
GRANT ALL ON TABLE public.profiles_with_last_seen TO service_role;


--
-- Name: TABLE project_bids; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_bids TO anon;
GRANT ALL ON TABLE public.project_bids TO authenticated;
GRANT ALL ON TABLE public.project_bids TO service_role;


--
-- Name: TABLE project_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_comments TO anon;
GRANT ALL ON TABLE public.project_comments TO authenticated;
GRANT ALL ON TABLE public.project_comments TO service_role;


--
-- Name: TABLE project_interest_followups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_interest_followups TO anon;
GRANT ALL ON TABLE public.project_interest_followups TO authenticated;
GRANT ALL ON TABLE public.project_interest_followups TO service_role;


--
-- Name: TABLE project_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.project_members TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.project_members TO authenticated;
GRANT ALL ON TABLE public.project_members TO service_role;


--
-- Name: TABLE project_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_requests TO anon;
GRANT ALL ON TABLE public.project_requests TO authenticated;
GRANT ALL ON TABLE public.project_requests TO service_role;


--
-- Name: TABLE project_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_tasks TO anon;
GRANT ALL ON TABLE public.project_tasks TO authenticated;
GRANT ALL ON TABLE public.project_tasks TO service_role;


--
-- Name: TABLE project_upvotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_upvotes TO anon;
GRANT ALL ON TABLE public.project_upvotes TO authenticated;
GRANT ALL ON TABLE public.project_upvotes TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE recent_interactions_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recent_interactions_summary TO anon;
GRANT ALL ON TABLE public.recent_interactions_summary TO authenticated;
GRANT ALL ON TABLE public.recent_interactions_summary TO service_role;


--
-- Name: TABLE signals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.signals TO anon;
GRANT ALL ON TABLE public.signals TO authenticated;
GRANT ALL ON TABLE public.signals TO service_role;


--
-- Name: TABLE site_visit_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_visit_sessions TO service_role;


--
-- Name: TABLE skill_colors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_colors TO anon;
GRANT ALL ON TABLE public.skill_colors TO authenticated;
GRANT ALL ON TABLE public.skill_colors TO service_role;


--
-- Name: TABLE skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skills TO anon;
GRANT ALL ON TABLE public.skills TO authenticated;
GRANT ALL ON TABLE public.skills TO service_role;


--
-- Name: SEQUENCE skills_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.skills_id_seq TO anon;
GRANT ALL ON SEQUENCE public.skills_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.skills_id_seq TO service_role;


--
-- Name: TABLE streak_leaderboard; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.streak_leaderboard TO anon;
GRANT ALL ON TABLE public.streak_leaderboard TO authenticated;
GRANT ALL ON TABLE public.streak_leaderboard TO service_role;


--
-- Name: TABLE swag_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.swag_votes TO anon;
GRANT ALL ON TABLE public.swag_votes TO authenticated;
GRANT ALL ON TABLE public.swag_votes TO service_role;


--
-- Name: SEQUENCE swag_votes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.swag_votes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.swag_votes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.swag_votes_id_seq TO service_role;


--
-- Name: TABLE theme_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.theme_actions TO anon;
GRANT ALL ON TABLE public.theme_actions TO authenticated;
GRANT ALL ON TABLE public.theme_actions TO service_role;


--
-- Name: TABLE theme_circles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.theme_circles TO anon;
GRANT ALL ON TABLE public.theme_circles TO authenticated;
GRANT ALL ON TABLE public.theme_circles TO service_role;


--
-- Name: TABLE theme_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.theme_participants TO anon;
GRANT ALL ON TABLE public.theme_participants TO authenticated;
GRANT ALL ON TABLE public.theme_participants TO service_role;


--
-- Name: TABLE theme_projects_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.theme_projects_view TO anon;
GRANT ALL ON TABLE public.theme_projects_view TO authenticated;
GRANT ALL ON TABLE public.theme_projects_view TO service_role;


--
-- Name: TABLE user_achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_achievements TO anon;
GRANT ALL ON TABLE public.user_achievements TO authenticated;
GRANT ALL ON TABLE public.user_achievements TO service_role;


--
-- Name: TABLE watchlists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.watchlists TO anon;
GRANT ALL ON TABLE public.watchlists TO authenticated;
GRANT ALL ON TABLE public.watchlists TO service_role;


--
-- Name: TABLE xp_leaderboard; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.xp_leaderboard TO anon;
GRANT ALL ON TABLE public.xp_leaderboard TO authenticated;
GRANT ALL ON TABLE public.xp_leaderboard TO service_role;


--
-- Name: TABLE zork_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zork_events TO anon;
GRANT ALL ON TABLE public.zork_events TO authenticated;
GRANT ALL ON TABLE public.zork_events TO service_role;


--
-- Name: TABLE zork_saves; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zork_saves TO anon;
GRANT ALL ON TABLE public.zork_saves TO authenticated;
GRANT ALL ON TABLE public.zork_saves TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict OyLuDn8IdztqONFHxPt5LOtYXcUtwfciMYgiWiXKyLpgIPfTcO3b0kz2vCh7hvG

