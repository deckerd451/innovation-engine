-- DISPOSABLE LOCAL DATABASE ONLY. Never run this against a Supabase project.
--
-- Second half of the production baseline (loaded after
-- notification-connection-prod-baseline.sql): the membership and Nearify
-- functions and triggers, copied verbatim from the production catalog on
-- 2026-10-13 (read-only). Used by run-authz-db.sh.

CREATE OR REPLACE FUNCTION public.ingest_nearify_interaction(p_event_id uuid, p_from_auth_user_id uuid DEFAULT NULL::uuid, p_to_auth_user_id uuid DEFAULT NULL::uuid, p_from_community_id uuid DEFAULT NULL::uuid, p_to_community_id uuid DEFAULT NULL::uuid, p_signal_type text DEFAULT 'proximity'::text, p_confidence numeric DEFAULT 50, p_occurred_at timestamp with time zone DEFAULT now(), p_meta jsonb DEFAULT '{}'::jsonb, p_from_nearify_id text DEFAULT NULL::text, p_to_nearify_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.add_creator_as_member()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'creator');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_auto_add_creator_member()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.creator_id, 'creator')
  on conflict (project_id, user_id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.project_members_dedupe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_set_org_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_create_org_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- Production ACLs: no PUBLIC entry, explicit anon/authenticated/service_role.
REVOKE ALL ON FUNCTION public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.promote_edge_to_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_edge_to_connection(uuid) TO anon, authenticated, service_role;

-- projects INSERT policy (production; the creator must be the caller)
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT TO public
  WITH CHECK (creator_id = get_community_id_from_auth());

CREATE TRIGGER auto_add_creator_as_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION add_creator_as_member();
CREATE TRIGGER trg_project_auto_add_creator_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION project_auto_add_creator_member();
CREATE TRIGGER trg_project_members_dedupe BEFORE INSERT ON public.project_members FOR EACH ROW EXECUTE FUNCTION project_members_dedupe();
CREATE TRIGGER trg_set_org_created_by BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION fn_set_org_created_by();
CREATE TRIGGER trg_auto_create_org_owner AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION fn_auto_create_org_owner();
