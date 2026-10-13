-- Notification and connection authorization boundary.
--
-- Fixes two production authorization problems found by a read-only audit on
-- 2026-10-13 (docs/SECURITY_NOTIFICATION_CONNECTION_AUTHZ.md):
--
--   1. Any signed-in member could create a notification for any recipient
--      (INSERT policy WITH CHECK (true)), re-address one of their own
--      notifications to someone else (UPDATE policy without WITH CHECK), and
--      anyone -- including signed-out callers -- could execute the
--      SECURITY DEFINER create_notification().
--   2. The permissive connections UPDATE policies let either party change any
--      column, so a sender could accept their own request (which also fired a
--      false "accepted your request" notification), re-point a request at a
--      different member, or rewrite the Collaboration Concierge context.
--      The INSERT policies never constrained status, so a request could also
--      be created already 'accepted'.
--
-- Approach: notifications are written only by server-side code. The member-
-- initiated notifications that the browser used to insert directly
-- (project join requests and organization join requests) are now created by
-- triggers that derive the recipient from the row and confirm the signed-in
-- member is the requester. Connection rules are enforced by a trigger that
-- applies to every write from the anon/authenticated roles regardless of how
-- many permissive policies match; trusted server code (SECURITY DEFINER
-- functions such as promote_edge_to_connection, and service_role) is not
-- restricted by it.
--
-- Deploy only after docs/SECURITY_NOTIFICATION_CONNECTION_AUTHZ.md's
-- checklist. Rollback: supabase/sql/rollback/20261013_notification_connection_authz_rollback.sql
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. create_notification(): trusted server-side use only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_owner
  FROM pg_proc WHERE oid = 'public.create_notification(uuid, text, text, text, text, jsonb)'::regprocedure;
  -- The callers below are SECURITY DEFINER trigger functions that run as
  -- their owner; they rely on create_notification being owned by a trusted
  -- role, never by a role members can act as.
  IF v_owner IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'create_notification is owned by %, expected a trusted owner such as postgres', v_owner;
  END IF;
END $$;

ALTER FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) TO service_role;

-- Pin search_path on the existing SECURITY DEFINER notification triggers.
-- Their bodies are unchanged (except notify_project_invite, below).
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['notify_connection_request()', 'notify_connection_accepted()', 'notify_endorsement()', 'notify_new_message()', 'notify_project_invite()'] LOOP
    IF to_regprocedure('public.' || v_fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public, pg_temp', v_fn);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. notifications table: members read and mark their own; nobody else writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- The browser only ever sets `read`. Column-level UPDATE keeps members from
-- rewriting the title, link, type or recipient of a notification.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id IN (SELECT c.id FROM public.community c WHERE c.user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT c.id FROM public.community c WHERE c.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Server-side notifications for member-initiated requests
-- ---------------------------------------------------------------------------
-- Replaces the direct browser inserts in assets/js/comprehensive-fixes.js.
-- Only the requester themself triggers a notification; the recipient comes
-- from the project/organization row, never from the caller.

CREATE OR REPLACE FUNCTION public.notify_project_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION public.notify_organization_join_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.notify_project_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_organization_join_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_project_request ON public.project_requests;
CREATE TRIGGER notify_project_request
  AFTER INSERT ON public.project_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_project_request();

DROP TRIGGER IF EXISTS notify_organization_join_request ON public.organization_members;
CREATE TRIGGER notify_organization_join_request
  AFTER INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_organization_join_request();

-- project_members accepts inserts from anyone ("System can add project
-- members" WITH CHECK (true)), so the existing invite trigger let any caller
-- send a project_invite notification to any member. Keep legitimate cases --
-- the project creator or an existing team member adding someone, a member
-- joining themself, and trusted server code (no member JWT) -- and stay
-- silent otherwise. The membership policy itself is out of scope here.
CREATE OR REPLACE FUNCTION public.notify_project_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  project_name TEXT;
  inviter_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') AND NOT EXISTS (
      SELECT 1 FROM community me
      WHERE me.user_id = auth.uid()
        AND (
          me.id = NEW.user_id
          OR EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.creator_id = me.id)
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

-- ---------------------------------------------------------------------------
-- 4. connections: identity immutability and valid status transitions
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is the caller's database role.
-- Inside trusted SECURITY DEFINER functions (BLE/Nearify promotion, bid
-- acceptance run by the server) current_user is the function owner, so those
-- paths keep working; service_role is likewise trusted.
CREATE OR REPLACE FUNCTION public.enforce_connection_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.enforce_connection_authorization() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_connection_authorization ON public.connections;
-- Named to sort before the existing AFTER notification triggers; being a
-- BEFORE trigger it runs first regardless, and a rejected write never reaches
-- notify_connection_accepted / notify_connection_request.
CREATE TRIGGER enforce_connection_authorization
  BEFORE INSERT OR UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_connection_authorization();

-- Table privileges RLS cannot govern.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.connections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.connections FROM anon;

COMMIT;
