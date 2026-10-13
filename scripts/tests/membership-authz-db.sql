-- Membership and proximity-connection authorization against PostgreSQL
-- (disposable local database). Run by scripts/tests/run-authz-db.sh after
-- both baseline fixtures, the helpers and both 20261013 migrations.
-- Must FAIL on the production baseline. All rows roll back.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
BEGIN;

INSERT INTO public.community (id, user_id, name, email) VALUES
  ('10000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'Alice', 'alice@example.test'),
  ('10000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000b', 'Bob', 'bob@example.test'),
  ('10000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000c', 'Carol', 'carol@example.test'),
  ('10000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d', 'Dana', 'dana@example.test'),
  ('10000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-00000000000e', 'Eli', 'eli@example.test'),
  ('10000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-00000000000f', 'Fay', 'fay@example.test');

-- ===========================================================================
-- Organizations
-- ===========================================================================
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.organizations (id, name, status) VALUES ('30000000-0000-4000-8000-000000000001', 'Harbor Builders', 'active')$$, 'Dana creates an organization');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d' AND role = 'owner' AND status = 'active'), 1, 'creator becomes the owner automatically');
SELECT t.eq((SELECT count(*) FROM public.organizations WHERE id = '30000000-0000-4000-8000-000000000001' AND created_by = '10000000-0000-4000-8000-00000000000d'), 1, 'created_by is the creator');

SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.denied($$INSERT INTO public.organizations (id, name, status, created_by) VALUES ('30000000-0000-4000-8000-000000000002', 'Bob''s org?', 'active', '10000000-0000-4000-8000-00000000000b')$$, 'member creates an organization in someone else''s name');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'owner', 'active')$$, 'member makes themself owner of an organization');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'admin', 'active')$$, 'member makes themself admin');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'member', 'active')$$, 'member grants themself active membership');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status, can_post_opportunities) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'member', 'pending', true)$$, 'join request carrying posting permission');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', 'member', 'pending')$$, 'member files a join request as someone else');
SELECT t.allowed($$INSERT INTO public.organization_members (id, organization_id, community_id, role, status) VALUES ('31000000-0000-4000-8000-00000000000c', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'member', 'pending')$$, 'member asks to join');
SELECT t.blocked($$UPDATE public.organization_members SET status = 'active' WHERE id = '31000000-0000-4000-8000-00000000000c'$$, 'requester approves their own request');
SELECT t.blocked($$UPDATE public.organization_members SET role = 'member' WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'non-admin demotes the owner');
SELECT t.blocked($$DELETE FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'non-admin removes the owner');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000d', 'org_join_request'), 1, 'owner notified of the genuine request only');
SELECT t.eq((SELECT count(*) FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND status = 'active'), 1, 'still only the owner is active');

SELECT t.act(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000f', 'owner', 'active')$$, 'anonymous caller adds an owner');
SELECT t.denied($$UPDATE public.organization_members SET role = 'owner' WHERE organization_id = '30000000-0000-4000-8000-000000000001'$$, 'anonymous caller edits memberships');
SELECT t.denied($$DELETE FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001'$$, 'anonymous caller deletes memberships');
SELECT t.denied($$INSERT INTO public.organizations (name, status) VALUES ('anon org', 'active')$$, 'anonymous caller creates an organization');
RESET ROLE;

-- Owner manages members
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.organization_members SET status = 'active' WHERE id = '31000000-0000-4000-8000-00000000000c'$$, 'owner approves a join request');
SELECT t.allowed($$INSERT INTO public.organization_members (organization_id, community_id, role, status, can_manage_members) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000e', 'admin', 'active', true)$$, 'owner adds an admin (addMember)');
SELECT t.denied($$UPDATE public.organization_members SET role = 'member' WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'sole owner demotes themself');
SELECT t.denied($$DELETE FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'sole owner leaves the organization');
SELECT t.denied($$UPDATE public.organizations SET created_by = '10000000-0000-4000-8000-00000000000e' WHERE id = '30000000-0000-4000-8000-000000000001'$$, 'organization creator re-assigned');
RESET ROLE;

-- Admin (Eli): manages members, never ownership
SELECT t.act('a0000000-0000-4000-8000-00000000000e');
SET LOCAL ROLE authenticated;
SELECT t.denied($$UPDATE public.organization_members SET role = 'owner' WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000e'$$, 'admin promotes themself to owner');
SELECT t.denied($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000f', 'owner', 'active')$$, 'admin adds an owner');
SELECT t.denied($$UPDATE public.organization_members SET role = 'member' WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'admin demotes the owner');
SELECT t.denied($$DELETE FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'admin removes the owner');
SELECT t.denied($$UPDATE public.organization_members SET community_id = '10000000-0000-4000-8000-00000000000f' WHERE id = '31000000-0000-4000-8000-00000000000c'$$, 'admin moves a membership to another member');
SELECT t.allowed($$INSERT INTO public.organization_members (organization_id, community_id, role, status) VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000f', 'member', 'active')$$, 'admin adds a member');
SELECT t.allowed($$UPDATE public.organization_members SET can_post_opportunities = true WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000f'$$, 'admin changes a member''s permissions (updateMemberRole)');
SELECT t.allowed($$DELETE FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000f'$$, 'admin removes a member (removeMember)');
RESET ROLE;

-- Ownership hand-over, then leaving
SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.organization_members SET role = 'owner' WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000e'$$, 'owner makes the admin an owner');
SELECT t.allowed($$DELETE FROM public.organization_members WHERE organization_id = '30000000-0000-4000-8000-000000000001' AND community_id = '10000000-0000-4000-8000-00000000000d'$$, 'owner leaves once another owner exists');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$DELETE FROM public.organization_members WHERE id = '31000000-0000-4000-8000-00000000000c'$$, 'member leaves');
RESET ROLE;

-- ===========================================================================
-- Projects
-- ===========================================================================
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$INSERT INTO public.projects (id, creator_id, title) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', 'Harborhack 2026 prep')$$, 'Alice creates a project');
-- enhanced-project-creation.js also inserts the creator row; de-duplicated.
SELECT t.allowed($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', 'creator')$$, 'creator row inserted again by the client', 0);
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.project_members WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000a' AND role = 'creator'), 1, 'creator is on the team');

SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'member')$$, 'member adds themself to another member''s team');
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'creator')$$, 'member claims the creator role');
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', 'member')$$, 'member adds someone else to a team');
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', 'pending')$$, 'member files a join request as someone else');
SELECT t.allowed($$INSERT INTO public.project_members (id, project_id, user_id, role) VALUES ('21000000-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000c', 'pending')$$, 'member asks to join');
SELECT t.blocked($$UPDATE public.project_members SET role = 'member' WHERE id = '21000000-0000-4000-8000-00000000000c'$$, 'requester approves themself');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.project_members WHERE id = '21000000-0000-4000-8000-00000000000c' AND role = 'pending'), 1, 'request still pending');

SELECT t.act(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000f', 'member')$$, 'anonymous caller adds a team member');
SELECT t.denied($$UPDATE public.project_members SET role = 'member' WHERE id = '21000000-0000-4000-8000-00000000000c'$$, 'anonymous caller edits a membership');
SELECT t.denied($$DELETE FROM public.project_members WHERE project_id = '20000000-0000-4000-8000-000000000001'$$, 'anonymous caller removes members');
RESET ROLE;

SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.project_members SET role = 'member' WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000c' AND role = 'pending'$$, 'creator approves the request');
SELECT t.allowed($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000e', 'member')$$, 'creator adds Eli (confirmProjectInvitation)');
SELECT t.denied($$UPDATE public.project_members SET role = 'creator' WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000e'$$, 'creator hands the creator role to a member row');
SELECT t.denied($$UPDATE public.project_members SET user_id = '10000000-0000-4000-8000-00000000000f' WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000e'$$, 'membership moved to another member');
RESET ROLE;
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000e', 'project_invite'), 1, 'invited member is notified');

SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.denied($$INSERT INTO public.project_members (project_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000f', 'member')$$, 'team member adds someone (creator decides)');
SELECT t.blocked($$UPDATE public.project_members SET role = 'creator' WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000c'$$, 'team member edits their own role');
SELECT t.blocked($$DELETE FROM public.project_members WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000e'$$, 'team member removes another member');
SELECT t.allowed($$DELETE FROM public.project_members WHERE project_id = '20000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-00000000000c'$$, 'team member leaves');
RESET ROLE;

-- ===========================================================================
-- Proximity edges -> connections (BLE / Nearify)
-- ===========================================================================
INSERT INTO public.interaction_edges (id, from_user_id, to_user_id, status) VALUES
  ('70000000-0000-4000-8000-0000000000ab', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b', 'suggested'),
  ('70000000-0000-4000-8000-0000000000ac', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000c', 'suggested'),
  ('70000000-0000-4000-8000-0000000000ae', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000e', 'ignored');

-- Who may execute the ingestion function at all (its production body also
-- fails today: interaction_edges has no updated_at column).
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: members can execute ingest_nearify_interaction';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: service_role lost ingest_nearify_interaction';
  END IF;
END $$;

SELECT t.act(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT t.denied($$SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ab')$$, 'anonymous caller promotes an edge');
SELECT t.denied($$SELECT public.ingest_nearify_interaction(gen_random_uuid(), NULL, NULL, '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b', 'qr_confirmed')$$, 'anonymous caller ingests a QR-confirmed connection');
RESET ROLE;

SELECT t.act('a0000000-0000-4000-8000-00000000000d');
SET LOCAL ROLE authenticated;
SELECT t.denied($$SELECT public.ingest_nearify_interaction(gen_random_uuid(), NULL, NULL, '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b', 'qr_confirmed')$$, 'member ingests a QR-confirmed connection between others');
SELECT t.eq((SELECT (public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ab')->>'success')::boolean::int), 0, 'unrelated member promotes someone else''s edge');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.connections), 0, 'no connection from an unrelated member''s promotion');


-- Alice taps Connect: a request, not a connection
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.eq((SELECT CASE WHEN r->>'success' = 'true' AND r->>'status' = 'pending' THEN 1 ELSE 0 END FROM (SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ab') r) x), 1, 'first tap sends a request');
SELECT t.eq((SELECT CASE WHEN r->>'status' = 'pending' AND r->>'connection_created' = 'false' THEN 1 ELSE 0 END FROM (SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ab') r) x), 1, 'second tap does not duplicate');
SELECT t.eq((SELECT CASE WHEN r->>'success' = 'false' THEN 1 ELSE 0 END FROM (SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ae') r) x), 1, 'dismissed suggestion cannot be promoted');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.connections WHERE from_user_id = '10000000-0000-4000-8000-00000000000a' AND to_user_id = '10000000-0000-4000-8000-00000000000b' AND status = 'pending'), 1, 'one pending request to Bob');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000b', 'connection_request'), 1, 'Bob is asked');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000a', 'connection_accepted'), 0, 'Alice is not told Bob accepted');

-- Bob taps Connect on the same edge: both agreed
SELECT t.act('a0000000-0000-4000-8000-00000000000b');
SET LOCAL ROLE authenticated;
SELECT t.eq((SELECT CASE WHEN r->>'status' = 'accepted' THEN 1 ELSE 0 END FROM (SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ab') r) x), 1, 'second member''s tap accepts');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.connections WHERE from_user_id = '10000000-0000-4000-8000-00000000000a' AND to_user_id = '10000000-0000-4000-8000-00000000000b' AND status = 'accepted'), 1, 'connected after both agreed');
SELECT t.eq(t.notes('10000000-0000-4000-8000-00000000000a', 'connection_accepted'), 1, 'Alice told once, truthfully');
SELECT t.eq((SELECT count(*) FROM public.interaction_edges WHERE id = '70000000-0000-4000-8000-0000000000ab' AND status = 'accepted'), 1, 'edge marked accepted');

-- A declined request is not revived from proximity
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ac');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000c');
SET LOCAL ROLE authenticated;
SELECT t.allowed($$UPDATE public.connections SET status = 'rejected' WHERE from_user_id = '10000000-0000-4000-8000-00000000000a' AND to_user_id = '10000000-0000-4000-8000-00000000000c' AND status = 'pending'$$, 'Carol declines');
RESET ROLE;
SELECT t.act('a0000000-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT t.eq((SELECT CASE WHEN r->>'success' = 'false' THEN 1 ELSE 0 END FROM (SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000ac') r) x), 1, 'declined request not revived');
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM public.connections WHERE to_user_id = '10000000-0000-4000-8000-00000000000c' AND status = 'rejected'), 1, 'decline stands');

-- ===========================================================================
-- Catalog: no allow-everything write policy remains on these tables
-- ===========================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('organization_members', 'project_members', 'interaction_edges')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')
  ) THEN
    RAISE EXCEPTION 'FAILED: a write policy that allows everything remains';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.organization_members'::regclass AND tgname = 'enforce_organization_member_authorization')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.project_members'::regclass AND tgname = 'enforce_project_member_authorization')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.organizations'::regclass AND tgname = 'enforce_organization_creator') THEN
    RAISE EXCEPTION 'FAILED: membership triggers missing';
  END IF;
  IF has_function_privilege('anon', 'public.promote_edge_to_connection(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: anon can execute promote_edge_to_connection';
  END IF;
END $$;

ROLLBACK;
\o
\echo 'membership and proximity authorization checks passed'
