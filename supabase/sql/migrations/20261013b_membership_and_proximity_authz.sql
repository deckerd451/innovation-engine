-- Membership and proximity-connection authorization boundary.
--
-- Applies after 20261013_notification_connection_authz.sql. Fixes four paths
-- found by a read-only production audit on 2026-10-13
-- (docs/SECURITY_MEMBERSHIP_PROXIMITY_AUTHZ.md):
--
--   1. ingest_nearify_interaction: SECURITY DEFINER, executable by anon and
--      authenticated, creates or promotes an ACCEPTED connection between any
--      two community ids the caller names. (Its body currently fails in
--      production because interaction_edges has no updated_at column; the
--      grant is the vulnerability, and it would become exploitable as soon as
--      the schema is "repaired".) No current caller can reach it from this
--      project, so execution is limited to service_role.
--   2. promote_edge_to_connection: SECURITY DEFINER, executable by anon, never
--      checks that the caller is on the edge, and turns it straight into an
--      ACCEPTED connection with no consent from the other member. Replaced
--      with a consent flow: the caller must be on the edge; it sends a
--      pending request, or accepts one the other member already sent.
--   3. organization_members: allow_insert / allow_update / allow_delete are
--      USING/WITH CHECK (true) for public, so anyone could add, edit (including
--      role = 'owner') or delete any membership.
--   4. project_members: "System can add project members" WITH CHECK (true) let
--      anyone add anyone to any project (a non-pending row grants project task
--      access), and "Users can update their own membership" let a pending
--      requester promote themself.
--
-- Rules are enforced by BEFORE triggers that apply to every write from the
-- anon/authenticated roles regardless of which permissive policies match;
-- trusted server code (SECURITY DEFINER functions running as their owner,
-- service_role) is not restricted. Permissive policies that granted
-- everything are replaced by ones that state the intent.
--
-- Rollback: supabase/sql/rollback/20261013b_membership_and_proximity_authz_rollback.sql
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared helper: the signed-in member's community id (NULL when none).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authz_current_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id FROM community c WHERE c.user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.authz_current_member_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authz_current_member_id() TO authenticated, service_role;

-- The signed-in member's active role in an organization ('owner', 'admin',
-- 'member', ... or NULL). SECURITY DEFINER so organization_members policies
-- can use it without querying organization_members from inside its own
-- policy -- production's policies do that today, and PostgreSQL rejects every
-- member UPDATE and DELETE on the table with "infinite recursion detected in
-- policy".
CREATE OR REPLACE FUNCTION public.authz_org_role(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.role FROM organization_members m
  WHERE m.organization_id = p_organization_id
    AND m.community_id = public.authz_current_member_id()
    AND m.status = 'active'
  ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.authz_org_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authz_org_role(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. ingest_nearify_interaction: trusted server-to-server use only
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. promote_edge_to_connection: consent, not promotion
-- ---------------------------------------------------------------------------
-- Same signature and JSON shape the three web callers read (success, error,
-- connection_id, connection_created, already_promoted), plus `status`:
--   'pending'  -- a request was sent (or had already been sent) to the other member
--   'accepted' -- both members have now asked; the existing request was accepted
-- A declined or cancelled request is never revived from a proximity edge.
CREATE OR REPLACE FUNCTION public.promote_edge_to_connection(p_edge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
REVOKE ALL ON FUNCTION public.promote_edge_to_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_edge_to_connection(uuid) TO authenticated, service_role;

-- Edges are written only by SECURITY DEFINER functions; nothing in the app
-- inserts or deletes them directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.interaction_edges FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.interaction_edges FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. organizations and organization_members
-- ---------------------------------------------------------------------------
-- An organization's creator is the member creating it; created_by drives the
-- automatic owner row (fn_auto_create_org_owner) and join-request recipients,
-- so it can never name somebody else.
CREATE OR REPLACE FUNCTION public.enforce_organization_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
REVOKE ALL ON FUNCTION public.enforce_organization_creator() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_organization_creator ON public.organizations;
-- Sorts before trg_set_org_created_by / trg_auto_create_org_owner.
CREATE TRIGGER enforce_organization_creator
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_creator();

CREATE OR REPLACE FUNCTION public.enforce_organization_member_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
REVOKE ALL ON FUNCTION public.enforce_organization_member_authorization() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_organization_member_authorization ON public.organization_members;
CREATE TRIGGER enforce_organization_member_authorization
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_member_authorization();

-- Replace the allow-everything policies with ones that state the intent.
DROP POLICY IF EXISTS allow_insert ON public.organization_members;
DROP POLICY IF EXISTS allow_update ON public.organization_members;
DROP POLICY IF EXISTS allow_delete ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can add members" ON public.organization_members;
CREATE POLICY "Org admins can add members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (public.authz_org_role(organization_id) IN ('owner', 'admin'));
DROP POLICY IF EXISTS "Org admins can update members" ON public.organization_members;
CREATE POLICY "Org admins can update members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.authz_org_role(organization_id) IN ('owner', 'admin'))
  WITH CHECK (public.authz_org_role(organization_id) IN ('owner', 'admin'));
DROP POLICY IF EXISTS "Org admins can remove members" ON public.organization_members;
CREATE POLICY "Org admins can remove members"
  ON public.organization_members FOR DELETE TO authenticated
  USING (community_id = public.authz_current_member_id()
    OR public.authz_org_role(organization_id) IN ('owner', 'admin'));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organization_members FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.organization_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organizations FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.organizations FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. project_members
-- ---------------------------------------------------------------------------
-- A non-pending row is team membership: it grants access to the project's
-- tasks (project_tasks policies). Only the project creator grants it. A
-- member may ask to join (role 'pending') and may leave; creation adds the
-- creator's own 'creator' row.
CREATE OR REPLACE FUNCTION public.enforce_project_member_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
REVOKE ALL ON FUNCTION public.enforce_project_member_authorization() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_project_member_authorization ON public.project_members;
-- Sorts before trg_project_members_dedupe.
CREATE TRIGGER enforce_project_member_authorization
  BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_member_authorization();

DROP POLICY IF EXISTS "System can add project members" ON public.project_members;
DROP POLICY IF EXISTS "Creators can add project members" ON public.project_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON public.project_members;
DROP POLICY IF EXISTS "Members can request to join and creators can add members" ON public.project_members;
CREATE POLICY "Members can request to join and creators can add members"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.authz_current_member_id()
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.creator_id = public.authz_current_member_id()));
DROP POLICY IF EXISTS "Project creators can manage members" ON public.project_members;
CREATE POLICY "Project creators can manage members"
  ON public.project_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.creator_id = public.authz_current_member_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.creator_id = public.authz_current_member_id()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.project_members FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.project_members FROM authenticated;

COMMIT;
