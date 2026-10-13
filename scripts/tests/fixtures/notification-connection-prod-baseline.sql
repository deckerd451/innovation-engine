-- DISPOSABLE LOCAL DATABASE ONLY. Never run this against a Supabase project.
--
-- Reproduces the production authorization surface for notifications and
-- connections as read from the production catalog on 2026-10-13 (read-only
-- queries; see docs/SECURITY_NOTIFICATION_CONNECTION_AUTHZ.md). Policies,
-- table grants, function bodies, function ACLs and triggers are copied from
-- production. Columns not involved in authorization are omitted, and
-- triggers that only maintain counters (connection_count, XP, conversation
-- previews, endorsement id mirroring, member de-duplication) are left out.
--
-- This is the state the migration
-- supabase/sql/migrations/20261013_notification_connection_authz.sql is
-- written against; scripts/tests/notification-connection-authz-db.sql must
-- FAIL on this baseline and PASS once the migration is applied.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supabase auth helpers, driven by request.jwt.claim.* settings.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.email', true), '') $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- Tables (authorization-relevant columns and constraints as in production)
CREATE TABLE public.community (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  email text,
  connection_count integer DEFAULT 0
);
CREATE POLICY "community readable" ON public.community FOR SELECT USING (true);
ALTER TABLE public.community ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  to_user_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT timezone('utc', now()),
  status text DEFAULT 'pending',
  type text DEFAULT 'generic',
  context_type text,
  context_reason text,
  context_prompt text,
  context_outcome text,
  context_status text,
  context_schedule text,
  context_completed_at timestamptz,
  context_completed_by uuid REFERENCES public.community(id) ON DELETE SET NULL,
  CONSTRAINT connections_context_status_check CHECK (context_status IS NULL OR context_status = ANY (ARRAY['pending', 'accepted', 'declined', 'completed'])),
  CONSTRAINT connections_context_type_check CHECK (context_type IS NULL OR context_type = 'collaboration_concierge'),
  CONSTRAINT connections_different_users CHECK (from_user_id <> to_user_id),
  CONSTRAINT connections_from_to_valid CHECK (from_user_id IS NOT NULL AND to_user_id IS NOT NULL AND from_user_id <> to_user_id),
  CONSTRAINT connections_status_check CHECK (status = ANY (ARRAY['pending', 'accepted', 'rejected', 'canceled'])),
  CONSTRAINT connections_type_check CHECK (type = ANY (ARRAY['generic', 'friend', 'mentor', 'collaborator', 'follower', 'ble_proximity'])),
  CONSTRAINT unique_connection_from_to UNIQUE (from_user_id, to_user_id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  type text,
  title text,
  message text,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  title text,
  status text DEFAULT 'open'
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects readable" ON public.projects FOR SELECT USING (true);

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'member',
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE public.project_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  status text DEFAULT 'active',
  created_by uuid REFERENCES public.community(id)
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING (status = 'active');

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  status text DEFAULT 'active',
  UNIQUE (organization_id, community_id)
);

CREATE TABLE public.endorsements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id uuid NOT NULL,
  endorser_community_id uuid,
  endorsed_id uuid NOT NULL,
  endorsed_community_id uuid,
  skill text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id uuid NOT NULL,
  participant_2_id uuid NOT NULL
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.interaction_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid,
  to_user_id uuid,
  status text,
  updated_at timestamptz DEFAULT now()
);

-- Production table grants: anon and authenticated hold every privilege;
-- row-level security is the only barrier.
GRANT ALL ON public.community, public.connections, public.notifications, public.projects,
  public.project_members, public.project_requests, public.organizations, public.organization_members,
  public.endorsements, public.conversations, public.messages, public.interaction_edges
  TO anon, authenticated, service_role;

-- Identity helper (production definition)
CREATE OR REPLACE FUNCTION public.get_community_id_from_auth()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT id
  FROM community
  WHERE email = auth.email()
  LIMIT 1;
$function$;

-- Notification writer (production definition and ACL)
CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text DEFAULT NULL::text, p_link text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- Trigger functions that write notifications (production definitions)
CREATE OR REPLACE FUNCTION public.notify_connection_request()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_connection_accepted()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_endorsement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  endorser_name TEXT;
  skill_name    TEXT;
BEGIN
  IF NEW.endorsed_community_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT name INTO endorser_name
  FROM public.community
  WHERE id = NEW.endorser_community_id;
  skill_name := NEW.skill;
  PERFORM create_notification(
    NEW.endorsed_community_id,
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  sender_name TEXT;
  sender_community_id UUID;
  recipient_id UUID;
BEGIN
  SELECT c.id, c.name INTO sender_community_id, sender_name
  FROM community c
  WHERE c.user_id = NEW.sender_id;
  SELECT CASE
    WHEN participant_1_id = sender_community_id THEN participant_2_id
    ELSE participant_1_id
  END INTO recipient_id
  FROM conversations
  WHERE id = NEW.conversation_id;
  IF recipient_id IS NOT NULL AND sender_community_id IS NOT NULL THEN
    PERFORM create_notification(
      recipient_id,
      'message',
      'New message from ' || COALESCE(sender_name, 'someone'),
      LEFT(NEW.content, 100),
      '/dashboard.html',
      jsonb_build_object('message_id', NEW.id, 'conversation_id', NEW.conversation_id, 'sender_id', sender_community_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_project_invite()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
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

-- BLE / Nearify promotion path (production definition; trusted server-side
-- writer of accepted connections that must keep working).
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

CREATE TRIGGER trigger_notify_connection_accepted AFTER UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION notify_connection_accepted();
CREATE TRIGGER trigger_notify_connection_request AFTER INSERT OR UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION notify_connection_request();
CREATE TRIGGER trigger_notify_endorsement AFTER INSERT ON public.endorsements FOR EACH ROW EXECUTE FUNCTION notify_endorsement();
CREATE TRIGGER trigger_notify_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION notify_new_message();
CREATE TRIGGER trigger_notify_project_invite AFTER INSERT ON public.project_members FOR EACH ROW EXECUTE FUNCTION notify_project_invite();

-- Row-level security and policies (verbatim from production)
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Connections: receiver can update" ON public.connections FOR UPDATE TO authenticated
  USING (to_user_id = get_community_id_from_auth()) WITH CHECK (to_user_id = get_community_id_from_auth());
CREATE POLICY "Connections: sender can cancel pending" ON public.connections FOR UPDATE TO authenticated
  USING (from_user_id = get_community_id_from_auth()) WITH CHECK (from_user_id = get_community_id_from_auth());
CREATE POLICY "Users can cancel sent connection requests" ON public.connections FOR UPDATE TO public
  USING ((from_user_id = get_community_id_from_auth()) AND (status = 'pending'))
  WITH CHECK ((from_user_id = get_community_id_from_auth()) AND (status = ANY (ARRAY['pending', 'canceled'])));
CREATE POLICY "Users can cancel sent requests" ON public.connections FOR UPDATE TO public
  USING ((from_user_id = get_community_id_from_auth()) AND (status = 'pending'))
  WITH CHECK ((from_user_id = get_community_id_from_auth()) AND (status = 'canceled'));
CREATE POLICY "Users can create connection requests" ON public.connections FOR INSERT TO public
  WITH CHECK (from_user_id = get_community_id_from_auth());
CREATE POLICY "Users can create connections" ON public.connections FOR INSERT TO authenticated
  WITH CHECK (from_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid()));
CREATE POLICY "Users can delete their connections" ON public.connections FOR DELETE TO authenticated
  USING ((from_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid()))
      OR (to_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid())));
CREATE POLICY "Users can update their connections" ON public.connections FOR UPDATE TO authenticated
  USING ((from_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid()))
      OR (to_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid())));
CREATE POLICY "Users can view their connections" ON public.connections FOR SELECT TO authenticated
  USING ((from_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid()))
      OR (to_user_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid())));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid()));
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid()));

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view project members" ON public.project_members FOR SELECT USING (true);
CREATE POLICY "Creators can add project members" ON public.project_members FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.creator_id = auth.uid()));
CREATE POLICY "System can add project members" ON public.project_members FOR INSERT TO public WITH CHECK (true);

ALTER TABLE public.project_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project creators can view requests for their projects" ON public.project_requests FOR SELECT TO authenticated
  USING (project_id IN (SELECT projects.id FROM projects WHERE projects.creator_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid())));
CREATE POLICY "Users can create project requests" ON public.project_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid()));
CREATE POLICY "Users can view their own project requests" ON public.project_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid()));

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can join organizations" ON public.organization_members FOR INSERT TO public
  WITH CHECK (community_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid()));
CREATE POLICY allow_insert ON public.organization_members FOR INSERT TO public WITH CHECK (true);
CREATE POLICY allow_select ON public.organization_members FOR SELECT TO public USING (true);

ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view endorsements" ON public.endorsements FOR SELECT USING (true);
CREATE POLICY "Users can endorse others" ON public.endorsements FOR INSERT TO authenticated
  WITH CHECK ((endorser_community_id IN (SELECT c.id FROM community c WHERE c.user_id = auth.uid()))
    AND (endorsed_community_id IS NOT NULL) AND (endorser_community_id <> endorsed_community_id));

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conv_select ON public.conversations FOR SELECT TO public
  USING ((participant_1_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid()))
      OR (participant_2_id IN (SELECT community.id FROM community WHERE community.user_id = auth.uid())));
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_send_messages ON public.messages FOR INSERT TO public
  WITH CHECK ((sender_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid() LIMIT 1))
    AND (conversation_id IN (SELECT conversations.id FROM conversations
      WHERE conversations.participant_1_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid() LIMIT 1)
         OR conversations.participant_2_id = (SELECT community.id FROM community WHERE community.user_id = auth.uid() LIMIT 1))));

ALTER TABLE public.interaction_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY edges_readable ON public.interaction_edges FOR SELECT USING (true);
