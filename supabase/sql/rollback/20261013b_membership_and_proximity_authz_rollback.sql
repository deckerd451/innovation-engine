-- EMERGENCY ROLLBACK for supabase/sql/migrations/20261013b_membership_and_proximity_authz.sql
--
-- Restores the exact pre-migration production state captured read-only on
-- 2026-10-13 (function bodies, ACLs, policies and grants). This RE-OPENS the
-- membership and proximity-connection problems the migration fixes. Use only
-- if a legitimate journey breaks and cannot be fixed forward; see
-- docs/SECURITY_MEMBERSHIP_PROXIMITY_AUTHZ.md ("Rollback"). Idempotent.
-- Does not touch 20261013_notification_connection_authz.sql.

BEGIN;

-- 4. project_members
DROP TRIGGER IF EXISTS enforce_project_member_authorization ON public.project_members;
DROP FUNCTION IF EXISTS public.enforce_project_member_authorization();
DROP POLICY IF EXISTS "Members can request to join and creators can add members" ON public.project_members;
DROP POLICY IF EXISTS "System can add project members" ON public.project_members;
CREATE POLICY "System can add project members" ON public.project_members FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Creators can add project members" ON public.project_members;
CREATE POLICY "Creators can add project members" ON public.project_members FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE ((projects.id = project_members.project_id) AND (projects.creator_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can update their own membership" ON public.project_members;
CREATE POLICY "Users can update their own membership" ON public.project_members FOR UPDATE TO public
  USING (user_id = get_community_id_from_auth());
DROP POLICY IF EXISTS "Project creators can manage members" ON public.project_members;
CREATE POLICY "Project creators can manage members" ON public.project_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM (projects p JOIN community c ON ((c.id = p.creator_id))) WHERE ((p.id = project_members.project_id) AND (c.user_id = auth.uid()))));
GRANT ALL ON public.project_members TO anon, authenticated;

-- 3. organizations and organization_members
DROP TRIGGER IF EXISTS enforce_organization_member_authorization ON public.organization_members;
DROP FUNCTION IF EXISTS public.enforce_organization_member_authorization();
DROP TRIGGER IF EXISTS enforce_organization_creator ON public.organizations;
DROP FUNCTION IF EXISTS public.enforce_organization_creator();
DROP POLICY IF EXISTS "Org admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can update members" ON public.organization_members;
CREATE POLICY "Org admins can update members" ON public.organization_members FOR UPDATE TO public
  USING (organization_id IN (SELECT om.organization_id FROM (organization_members om JOIN community c ON ((c.id = om.community_id)))
    WHERE ((c.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (om.status = 'active'::text))));
DROP POLICY IF EXISTS "Org admins can remove members" ON public.organization_members;
CREATE POLICY "Org admins can remove members" ON public.organization_members FOR DELETE TO public
  USING ((community_id IN (SELECT community.id FROM community WHERE (community.user_id = auth.uid())))
      OR (organization_id IN (SELECT om.organization_id FROM (organization_members om JOIN community c ON ((c.id = om.community_id)))
        WHERE ((c.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (om.status = 'active'::text)))));
DROP POLICY IF EXISTS allow_insert ON public.organization_members;
CREATE POLICY allow_insert ON public.organization_members FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS allow_update ON public.organization_members;
CREATE POLICY allow_update ON public.organization_members FOR UPDATE TO public USING (true);
DROP POLICY IF EXISTS allow_delete ON public.organization_members;
CREATE POLICY allow_delete ON public.organization_members FOR DELETE TO public USING (true);
GRANT ALL ON public.organization_members, public.organizations TO anon, authenticated;

-- 2. promote_edge_to_connection (production body) and interaction_edges grants
CREATE OR REPLACE FUNCTION public.promote_edge_to_connection(p_edge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_edge RECORD;
  v_conn_id UUID;
  v_created BOOLEAN := false;
BEGIN
  SELECT * INTO v_edge
  FROM interaction_edges
  WHERE id = p_edge_id;

  IF v_edge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Edge not found');
  END IF;

  IF v_edge.status = 'promoted' THEN
    RETURN jsonb_build_object('success', true, 'already_promoted', true);
  END IF;

  SELECT id INTO v_conn_id
  FROM connections
  WHERE (from_user_id = v_edge.from_user_id AND to_user_id = v_edge.to_user_id)
     OR (from_user_id = v_edge.to_user_id AND to_user_id = v_edge.from_user_id)
  LIMIT 1;

  IF v_conn_id IS NULL THEN
    INSERT INTO connections (from_user_id, to_user_id, status, type, created_at)
    VALUES (v_edge.from_user_id, v_edge.to_user_id, 'accepted', 'generic', now())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conn_id;
    v_created := (v_conn_id IS NOT NULL);
  ELSE
    UPDATE connections SET status = 'accepted'
    WHERE id = v_conn_id AND status != 'accepted';
  END IF;

  UPDATE interaction_edges
  SET status = 'promoted', updated_at = now()
  WHERE id = p_edge_id;

  RETURN jsonb_build_object(
    'success', true,
    'connection_id', v_conn_id,
    'connection_created', v_created
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.promote_edge_to_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_edge_to_connection(uuid) TO anon, authenticated, service_role;
GRANT ALL ON public.interaction_edges TO anon, authenticated;

-- 1. ingest_nearify_interaction
DO $$
BEGIN
  IF to_regprocedure('public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text) TO anon, authenticated, service_role;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.authz_org_role(uuid);
DROP FUNCTION IF EXISTS public.authz_current_member_id();

COMMIT;
