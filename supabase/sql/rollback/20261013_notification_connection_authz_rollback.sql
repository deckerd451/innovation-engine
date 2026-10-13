-- EMERGENCY ROLLBACK for supabase/sql/migrations/20261013_notification_connection_authz.sql
--
-- Restores the exact pre-migration production state captured read-only on
-- 2026-10-13. This RE-OPENS both authorization problems the migration fixes
-- (arbitrary notifications; self-accepted or re-pointed connections). Use it
-- only if the migration breaks a legitimate journey that cannot be fixed
-- forward, and follow docs/SECURITY_NOTIFICATION_CONNECTION_AUTHZ.md
-- ("Rollback") for browser ordering. Idempotent.

BEGIN;

-- 4. connections
DROP TRIGGER IF EXISTS enforce_connection_authorization ON public.connections;
DROP FUNCTION IF EXISTS public.enforce_connection_authorization();
GRANT ALL ON public.connections TO anon, authenticated;

-- 3. request notifications and the original project invite trigger body
DROP TRIGGER IF EXISTS notify_project_request ON public.project_requests;
DROP TRIGGER IF EXISTS notify_organization_join_request ON public.organization_members;
DROP FUNCTION IF EXISTS public.notify_project_request();
DROP FUNCTION IF EXISTS public.notify_organization_join_request();

CREATE OR REPLACE FUNCTION public.notify_project_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  project_name TEXT;
  inviter_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
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
$function$;

-- 2. notifications table
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid()));
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
REVOKE UPDATE (read) ON public.notifications FROM authenticated;
GRANT ALL ON public.notifications TO anon, authenticated;

-- 1. functions
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['notify_connection_request()', 'notify_connection_accepted()', 'notify_endorsement()', 'notify_new_message()', 'notify_project_invite()'] LOOP
    IF to_regprocedure('public.' || v_fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%s RESET search_path', v_fn);
    END IF;
  END LOOP;
END $$;
ALTER FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) RESET search_path;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) TO PUBLIC, anon, authenticated, service_role;

COMMIT;
