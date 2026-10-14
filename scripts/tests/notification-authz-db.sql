-- Notification authorization against PostgreSQL (disposable local database).
-- Run by scripts/tests/run-authz-db.sh after:
--   scripts/tests/fixtures/notification-connection-prod-baseline.sql
--   scripts/tests/fixtures/authz-test-helpers.sql
--   supabase/sql/migrations/20261013_notification_connection_authz.sql
--   supabase/sql/migrations/20261013b_membership_and_proximity_authz.sql
-- Must FAIL without the migration (negative control). All rows roll back.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
BEGIN;

INSERT INTO public.community (id, user_id, name, email) VALUES
  ('10000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'Alice', 'alice@example.test'),
  ('10000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000b', 'Bob', 'bob@example.test'),
  ('10000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000c', 'Carol', 'carol@example.test'),
  ('10000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d', 'Dana', 'dana@example.test'),
  ('10000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-00000000000e', 'Eli', 'eli@example.test');
INSERT INTO public.projects (id, creator_id, title) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', 'Harborhack 2026 prep'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a', 'Quiet side project');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Harbor Builders', '10000000-0000-4000-8000-00000000000d');
INSERT INTO public.conversations (id, participant_1_id, participant_2_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b');
INSERT INTO public.notifications (id, user_id, type, title) VALUES
  ('50000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'endorsement', 'For Alice'),
  ('50000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', 'endorsement', 'For Bob');

-- ---------------------------------------------------------------------------
-- Catalog: create_notification is server-only with a pinned search_path
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_fn regprocedure := 'public.create_notification(uuid, text, text, text, text, jsonb)';
BEGIN
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FAILED: anon can execute create_notification'; END IF;
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FAILED: authenticated can execute create_notification'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = v_fn AND a.grantee = 0) THEN
    RAISE EXCEPTION 'FAILED: PUBLIC can execute create_notification';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FAILED: service_role lost create_notification'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn AND 'search_path=public, pg_temp' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'FAILED: create_notification search_path is not pinned';
  END IF;
  IF pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = v_fn)) IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'FAILED: create_notification has an untrusted owner';
  END IF;
  -- Every permissive policy counts: no INSERT policy may remain for members.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd IN ('INSERT', 'ALL')) THEN
    RAISE EXCEPTION 'FAILED: an INSERT policy still exists on notifications';
  END IF;
  IF has_table_privilege('authenticated', 'public.notifications', 'INSERT') OR has_table_privilege('anon', 'public.notifications', 'INSERT') THEN
    RAISE EXCEPTION 'FAILED: members hold INSERT on notifications';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Authenticated member: cannot create or forge notifications
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.denied($$INSERT INTO public.notifications (user_id, type, title, link) VALUES ('10000000-0000-4000-8000-00000000000b', 'connection_accepted', 'Bob accepted your request', 'https://evil.example')$$, 'member inserts a notification for another member');
SELECT t.denied($$INSERT INTO public.notifications (user_id, type, title) VALUES ('10000000-0000-4000-8000-00000000000a', 'test', 'self')$$, 'member inserts a notification for themself');
SELECT t.denied($$SELECT public.create_notification('10000000-0000-4000-8000-00000000000b', 'project_invite', 'Spoofed', 'x', 'https://evil.example', NULL)$$, 'member executes create_notification');
SELECT t.allowed($$UPDATE public.notifications SET read = true WHERE id = '50000000-0000-4000-8000-00000000000a'$$, 'member marks own notification read');
SELECT t.denied($$UPDATE public.notifications SET title = 'Rewritten', link = 'https://evil.example' WHERE id = '50000000-0000-4000-8000-00000000000a'$$, 'member rewrites own notification text');
SELECT t.denied($$UPDATE public.notifications SET user_id = '10000000-0000-4000-8000-00000000000b' WHERE id = '50000000-0000-4000-8000-00000000000a'$$, 'member re-addresses own notification to another member');
SELECT t.eq(t.rows($$UPDATE public.notifications SET read = true WHERE id = '50000000-0000-4000-8000-00000000000b'$$), 0, 'member updates another member''s notification');
SELECT t.eq((SELECT count(*) FROM public.notifications WHERE user_id = '10000000-0000-4000-8000-00000000000b'), 0, 'member reads another member''s notifications');
SELECT t.denied($$DELETE FROM public.notifications WHERE id = '50000000-0000-4000-8000-00000000000a'$$, 'member deletes a notification');
RESET ROLE;

-- Anonymous caller
SELECT t.act(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT t.denied($$SELECT public.create_notification('10000000-0000-4000-8000-00000000000b', 'project_invite', 'Spoofed', NULL, NULL, NULL)$$, 'anonymous caller executes create_notification');
SELECT t.denied($$INSERT INTO public.notifications (user_id, type, title) VALUES ('10000000-0000-4000-8000-00000000000b', 'x', 'anon')$$, 'anonymous caller inserts a notification');
SELECT t.eq((SELECT count(*) FROM public.notifications), 0, 'anonymous caller reads notifications');
RESET ROLE;

-- Trusted server-side caller
SELECT t.act(NULL, 'service_role');
SET LOCAL ROLE service_role;
SELECT t.allowed($$SELECT public.create_notification('10000000-0000-4000-8000-00000000000b', 'system', 'Server notice', NULL, NULL, NULL)$$, 'service_role creates a notification');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'system'), 1, 'service_role notification delivered');

-- ---------------------------------------------------------------------------
-- Legitimate notifications still arrive
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.connections (id, from_user_id, to_user_id, status, type) VALUES ('60000000-0000-4000-8000-0000000000ab', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b', 'pending', 'generic')$$, 'Alice sends Bob a connection request');
SELECT t.allowed($$INSERT INTO public.endorsements (endorser_id, endorser_community_id, endorsed_id, endorsed_community_id, skill) VALUES ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', 'AI agents')$$, 'Alice endorses Bob');
SELECT t.allowed($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', 'member')$$, 'Alice (creator) adds Bob to her project');
SELECT t.allowed($$INSERT INTO public.messages (conversation_id, sender_id, content) VALUES ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', 'Hello Bob')$$, 'Alice messages Bob');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'connection_request'), 1, 'connection request notification');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'endorsement'), 2, 'endorsement notification (plus the seeded one)');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'project_invite'), 1, 'project invite notification from the creator');
-- Pre-existing production behaviour, unchanged: notify_new_message looks the
-- sender up by auth user id while messages.sender_id holds the community id,
-- so no message notification is produced (0 'message' rows in production).
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'message'), 0, 'message notification behaviour unchanged');

SELECT t.act('a0000000-0000-4000-8000-00000000000b');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ab' AND status = 'pending'$$, 'Bob accepts Alice''s request');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000a', 'connection_accepted'), 1, 'connection accepted notification');

SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.project_requests (project_id, user_id, status, message) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'pending', 'I can help')$$, 'Carol asks to join Alice''s project');
SELECT t.allowed($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'member', 'pending')$$, 'Carol asks to join Dana''s organization');
SELECT t.allowed($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'pending')$$, 'Carol asks to join through project_members');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.notifications WHERE user_id = '10000000-0000-4000-8000-00000000000a' AND type = 'project_request' AND metadata ? 'request_id'), 1, 'project join request reaches the project creator');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000d', 'org_join_request'), 1, 'organization join request reaches the organization owner');
-- Browse Projects asks to join with a pending project_members row: the
-- creator is told, and the requester is not sent a false invitation.
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000c', 'project_invite'), 0, 'requester is not sent an invitation for their own request');
SELECT t.eq((SELECT count(*) FROM public.notifications WHERE user_id = '10000000-0000-4000-8000-00000000000a' AND type = 'project_request' AND metadata->>'project_id' = '20000000-0000-4000-8000-000000000001' AND metadata ? 'member_id'), 1, 'pending project_members request reaches the project creator');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000c', 'project_request'), 0, 'requester is not notified of their own request');

SELECT t.act(NULL, 'service_role');
SET LOCAL ROLE service_role;
SELECT t.allowed($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000d', 'member')$$, 'server adds Dana to a project');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000d', 'project_invite'), 1, 'server-side project invite notification');

-- ---------------------------------------------------------------------------
-- Abuse through notification-producing tables
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
-- The membership migration refuses these rows outright; the invite
-- notification guard remains as a second layer behind it.
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000b', 'member')$$, 'Carol inserts Bob into a project she has no role in');
SELECT t.denied($$INSERT INTO public.project_requests (project_id, user_id, status) VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000b', 'pending')$$, 'Carol files a project request as Bob');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', 'member', 'pending')$$, 'Carol files an organization request as Bob');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'project_invite'), 1, 'third party cannot send Bob a project invite notification');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000d', 'org_join_request'), 1, 'request filed for someone else does not notify the owner');

SELECT t.act(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000e', 'member')$$, 'anonymous caller inserts Eli into a project');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000e', 'project_invite'), 0, 'anonymous caller cannot send a project invite notification');

ROLLBACK;
\echo 'notification authorization checks passed'
