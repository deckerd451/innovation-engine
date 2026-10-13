-- Connection authorization against PostgreSQL (disposable local database).
-- Run by scripts/tests/run-authz-db.sh after:
--   scripts/tests/fixtures/notification-connection-prod-baseline.sql
--   scripts/tests/fixtures/authz-test-helpers.sql
--   supabase/sql/migrations/20261013_notification_connection_authz.sql
-- Exercises the writes through ALL of production's permissive connection
-- policies at once. Must FAIL without the migration. All rows roll back.
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

-- ---------------------------------------------------------------------------
-- Sender (Alice): cannot manufacture acceptance or change identities
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.denied($$INSERT INTO public.connections (from_user_id, to_user_id, status) VALUES ('10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000c', 'accepted')$$, 'sender creates an already-accepted connection');
SELECT t.denied($$INSERT INTO public.connections (from_user_id, to_user_id, status) VALUES ('10000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000c', 'pending')$$, 'member sends a request as someone else');
SELECT t.denied($$INSERT INTO public.connections (from_user_id, to_user_id, status, type, context_type, context_status) VALUES ('10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000c', 'pending', 'collaborator', 'collaboration_concierge', 'completed')$$, 'sender creates an already-completed collaboration');
SELECT t.allowed($$INSERT INTO public.connections (id, from_user_id, to_user_id, status, type) VALUES ('60000000-0000-4000-8000-0000000000ac', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000c', 'pending', 'generic')$$, 'Alice sends Carol a request');
SELECT t.denied($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender accepts their own request');
SELECT t.denied($$UPDATE public.connections SET status = 'rejected' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender declines on the recipient''s behalf');
SELECT t.denied($$UPDATE public.connections SET to_user_id = '10000000-0000-4000-8000-00000000000d' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender re-points the request at another member');
SELECT t.denied($$UPDATE public.connections SET from_user_id = '10000000-0000-4000-8000-00000000000d' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender changes the sender');
SELECT t.denied($$UPDATE public.connections SET type = 'mentor' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender changes the connection type');
SELECT t.denied($$UPDATE public.connections SET created_at = now() - interval '1 year' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender back-dates the request');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000a', 'connection_accepted'), 0, 'no false acceptance notification');
SELECT t.eq((SELECT count(*) FROM public.connections WHERE id = '60000000-0000-4000-8000-0000000000ac' AND status = 'pending' AND to_user_id = '10000000-0000-4000-8000-00000000000c'), 1, 'request unchanged');

-- ---------------------------------------------------------------------------
-- Unrelated member (Dana) and anonymous caller
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.eq(t.rows($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$), 0, 'unrelated member accepts someone else''s request');
SELECT t.eq(t.rows($$DELETE FROM public.connections WHERE id = '60000000-0000-4000-8000-0000000000ac'$$), 0, 'unrelated member deletes someone else''s request');
SELECT t.eq((SELECT count(*) FROM public.connections WHERE id = '60000000-0000-4000-8000-0000000000ac'), 0, 'unrelated member sees someone else''s request');
RESET ROLE;

SELECT t.act(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT t.denied($$INSERT INTO public.connections (from_user_id, to_user_id, status) VALUES ('10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000c', 'pending')$$, 'anonymous caller creates a connection');
SELECT t.denied($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'anonymous caller updates a connection');
SELECT t.denied($$DELETE FROM public.connections WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'anonymous caller deletes a connection');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Recipient (Carol): may accept or decline, not cancel; no reopening
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.denied($$UPDATE public.connections SET status = 'canceled' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'recipient cancels the sender''s request');
SELECT t.denied($$UPDATE public.connections SET to_user_id = '10000000-0000-4000-8000-00000000000e' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'recipient forwards the request to someone else');
SELECT t.allowed($$UPDATE public.connections SET status = 'rejected' WHERE id = '60000000-0000-4000-8000-0000000000ac' AND status = 'pending'$$, 'recipient declines');
SELECT t.denied($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'recipient accepts after declining');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.denied($$UPDATE public.connections SET status = 'pending' WHERE id = '60000000-0000-4000-8000-0000000000ac'$$, 'sender reopens a declined request');
-- Sender cancels a pending request; it cannot be revived by either side.
SELECT t.allowed($$INSERT INTO public.connections (id, from_user_id, to_user_id, status, type) VALUES ('60000000-0000-4000-8000-0000000000ad', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000d', 'pending', 'generic')$$, 'Alice sends Dana a request');
SELECT t.allowed($$UPDATE public.connections SET status = 'canceled' WHERE id = '60000000-0000-4000-8000-0000000000ad' AND status = 'pending'$$, 'sender cancels');
SELECT t.denied($$UPDATE public.connections SET status = 'pending' WHERE id = '60000000-0000-4000-8000-0000000000ad'$$, 'sender revives a canceled request');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.denied($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ad'$$, 'recipient accepts a canceled request');
SELECT t.allowed($$DELETE FROM public.connections WHERE id = '60000000-0000-4000-8000-0000000000ad'$$, 'either member can still remove a connection row');
RESET ROLE;

-- Normal accept, and accepted connections cannot be rolled back to pending
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.connections (id, from_user_id, to_user_id, status, type) VALUES ('60000000-0000-4000-8000-0000000000ab', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b', 'pending', 'generic')$$, 'Alice sends Bob a request');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000b');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ab' AND status = 'pending'$$, 'recipient accepts');
SELECT t.denied($$UPDATE public.connections SET status = 'pending' WHERE id = '60000000-0000-4000-8000-0000000000ab'$$, 'accepted connection moved back to pending (would re-send a request notification)');
SELECT t.denied($$UPDATE public.connections SET context_schedule = 'today' WHERE id = '60000000-0000-4000-8000-0000000000ab'$$, 'schedule set on a plain connection');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000a', 'connection_accepted'), 1, 'genuine acceptance notifies the sender once');

-- ---------------------------------------------------------------------------
-- Trusted server-side writers keep working (BLE/Nearify promotion, service)
-- ---------------------------------------------------------------------------
INSERT INTO public.interaction_edges (id, from_user_id, to_user_id, status) VALUES
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-00000000000e', 'confirmed');
SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-000000000001')$$, 'member promotes a confirmed BLE edge (SECURITY DEFINER)');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.connections WHERE from_user_id = '10000000-0000-4000-8000-00000000000c' AND to_user_id = '10000000-0000-4000-8000-00000000000e' AND status = 'accepted'), 1, 'BLE promotion still creates the accepted connection');
SELECT t.act(NULL, 'service_role');
SET LOCAL ROLE service_role;
SELECT t.allowed($$INSERT INTO public.connections (from_user_id, to_user_id, status) VALUES ('10000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-00000000000e', 'accepted')$$, 'service_role creates an accepted connection');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Collaboration Concierge journey (assets/js/collaboration-concierge.js)
-- ---------------------------------------------------------------------------
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.connections (id, from_user_id, to_user_id, status, type, context_type, context_reason, context_prompt, context_outcome, context_status) VALUES ('60000000-0000-4000-8000-0000000000ae', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000e', 'pending', 'collaborator', 'collaboration_concierge', 'You both work on agents', 'Compare what you are building and trade one useful resource.', 'Leave with one next step you can each take.', 'pending')$$, 'sendInvite');
SELECT t.denied($$UPDATE public.connections SET context_status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'sender accepts their own collaboration invitation');
SELECT t.denied($$UPDATE public.connections SET context_reason = 'Eli asked for this' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'sender rewrites the invitation reason');
SELECT t.denied($$UPDATE public.connections SET context_outcome = 'next_step' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'outcome recorded before the collaboration happened');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000e');
SET LOCAL ROLE authenticated;
SELECT t.denied($$UPDATE public.connections SET context_status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'collaboration accepted before the connection');
SELECT t.denied($$UPDATE public.connections SET context_prompt = 'changed' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'recipient rewrites the invitation prompt');
SELECT t.allowed($$UPDATE public.connections SET status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ae' AND status = 'pending'$$, 'acceptConnectionRequest');
SELECT t.allowed($$UPDATE public.connections SET context_status = 'accepted', context_schedule = NULL WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'CollaborationConcierge.accept');
SELECT t.allowed($$UPDATE public.connections SET context_schedule = 'today' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'recipient setSchedule');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.connections SET context_schedule = 'this_week' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'sender setSchedule');
SELECT t.denied($$UPDATE public.connections SET context_status = 'completed', context_schedule = NULL, context_completed_at = now(), context_completed_by = '10000000-0000-4000-8000-00000000000e' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'completion attributed to the other member');
SELECT t.allowed($$UPDATE public.connections SET context_status = 'completed', context_schedule = NULL, context_completed_at = now(), context_completed_by = '10000000-0000-4000-8000-00000000000a' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'respond(completed)');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000e');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.connections SET context_outcome = 'next_step' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'recordOutcome');
SELECT t.denied($$UPDATE public.connections SET context_status = 'accepted' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'completed collaboration reopened');
SELECT t.denied($$UPDATE public.connections SET context_completed_by = '10000000-0000-4000-8000-00000000000e' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$, 'completion re-attributed afterwards');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.eq(t.rows($$UPDATE public.connections SET context_outcome = 'not_yet' WHERE id = '60000000-0000-4000-8000-0000000000ae'$$), 0, 'unrelated member records an outcome');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.connections WHERE id = '60000000-0000-4000-8000-0000000000ae' AND context_status = 'completed' AND context_outcome = 'next_step' AND context_completed_by = '10000000-0000-4000-8000-00000000000a'), 1, 'concierge journey recorded');

-- Recipient declines a collaboration invitation together with the request
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.connections (id, from_user_id, to_user_id, status, type, context_type, context_reason, context_status) VALUES ('60000000-0000-4000-8000-0000000000af', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000d', 'pending', 'collaborator', 'collaboration_concierge', 'Shared theme', 'pending')$$, 'sendInvite to Dana');
SELECT t.denied($$UPDATE public.connections SET context_status = 'declined' WHERE id = '60000000-0000-4000-8000-0000000000af'$$, 'sender declines on the recipient''s behalf');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.connections SET status = 'rejected', context_status = 'declined' WHERE id = '60000000-0000-4000-8000-0000000000af'$$, 'recipient declines the collaboration');
RESET ROLE;

-- Catalog: the rule is a trigger, so it holds however many permissive
-- policies match a write.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.connections'::regclass AND tgname = 'enforce_connection_authorization' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'FAILED: enforce_connection_authorization trigger missing or disabled';
  END IF;
  IF has_table_privilege('anon', 'public.connections', 'INSERT') OR has_table_privilege('authenticated', 'public.connections', 'TRUNCATE') THEN
    RAISE EXCEPTION 'FAILED: connection table privileges not narrowed';
  END IF;
END $$;

ROLLBACK;
\echo 'connection authorization checks passed'
