-- Member email privacy (20261029_member_email_privacy_prepare.sql and
-- 20261029b_member_email_privacy_lock.sql) against PostgreSQL: a disposable
-- local database built from fixtures/email-privacy-prod-baseline.sql,
-- synthetic profiles only. Run by scripts/tests/run-email-privacy-db.sh,
-- which also checks this FAILS before the migrations.
--
-- Members and visitors can't get another member's email by any route
-- tried here (the column, select *, filters, sorting, RETURNING, the views,
-- the functions); admins can, only through the admin functions; and sign-in,
-- claiming, profile reads and writes, the hidden-profile rule and the
-- connection helper keep working.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.fails(p_sql text, p_expected text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_expected in SQLERRM) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'FAILED: % (wrong error: %)', p_label, SQLERRM;
  END;
  RAISE EXCEPTION 'NOT DENIED: % (no error)', p_label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.eq(p_actual text, p_expected text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid, p_email text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true),
         set_config('request.jwt.claim.email', COALESCE(p_email, ''), true)
$$;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'admin@example.test'),
  ('a0000000-0000-4000-8000-00000000000d', 'disabled.admin@example.test'),
  ('a0000000-0000-4000-8000-000000000001', 'member@example.test'),
  ('a0000000-0000-4000-8000-000000000002', 'other@example.test'),
  ('a0000000-0000-4000-8000-000000000003', 'hidden@example.test'),
  ('a0000000-0000-4000-8000-000000000004', 'Old@Example.test'),
  ('a0000000-0000-4000-8000-000000000005', 'new@example.test'),
  ('a0000000-0000-4000-8000-000000000006', 'raced@example.test'),
  ('a0000000-0000-4000-8000-000000000007', 'busy@example.test');
INSERT INTO public.community (id, user_id, email, name, user_role, is_hidden, is_disabled, profile_completed, onboarding_completed, created_at, skills) VALUES
  ('10000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'admin@example.test', 'Admin', 'Admin', false, false, true, true, '2026-01-01', 'design'),
  ('10000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d', 'disabled.admin@example.test', 'Former admin', 'Admin', false, true, true, true, '2026-01-01', NULL),
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'member@example.test', 'Member', 'Member', false, false, true, true, '2026-01-01', 'python, sql'),
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'other@example.test', 'Other', 'Member', false, false, true, true, '2026-01-01', 'sql'),
  ('10000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'hidden@example.test', 'Hidden', 'Member', true, false, true, true, '2026-01-01', 'sql'),
  -- Three older, unclaimed profiles share an email; the newest is completed.
  ('20000000-0000-4000-8000-000000000001', NULL, ' old@example.TEST', 'Old A', 'Member', false, false, false, false, '2025-01-01', NULL),
  ('20000000-0000-4000-8000-000000000002', NULL, 'old@example.test', 'Old B', 'Member', false, false, false, true, '2025-02-01', NULL),
  ('20000000-0000-4000-8000-000000000003', NULL, 'old@example.test', 'Old C', 'Member', false, false, true, false, '2025-03-01', NULL),
  -- Linked by another account between the claim's pick and its update.
  ('20000000-0000-4000-8000-000000000004', NULL, 'raced@example.test', 'Raced', 'Member', false, false, false, false, '2025-01-01', NULL),
  -- Held by other statements for the whole claim.
  ('20000000-0000-4000-8000-000000000007', NULL, 'busy@example.test', 'Busy', 'Member', false, false, false, false, '2025-01-01', NULL),
  -- Similar addresses, for the admin search.
  ('20000000-0000-4000-8000-000000000005', NULL, 'a_b@example.test', 'Underscore', 'Member', false, false, false, false, '2025-01-01', NULL),
  ('20000000-0000-4000-8000-000000000006', NULL, 'axb@example.test', 'Lookalike', 'Member', false, false, false, false, '2025-01-01', NULL);
INSERT INTO public.presence_sessions (user_id, last_seen, expires_at) VALUES
  ('10000000-0000-4000-8000-000000000002', now(), now() + interval '5 minutes'),
  ('10000000-0000-4000-8000-000000000003', now(), now() + interval '5 minutes');
INSERT INTO public.ideas (creator_id, title) VALUES
  ('10000000-0000-4000-8000-000000000002', 'Visible idea'),
  ('10000000-0000-4000-8000-000000000003', 'Hidden member''s idea');
INSERT INTO public.projects (id, creator_id, title) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Member project');
INSERT INTO public.project_members (project_id, user_id, role) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'pending');

-- Stands in for concurrency the test can't produce in one session:
--   raced  another account links the profile as the claim updates it;
--   busy   the profile can never be updated just now.
CREATE FUNCTION pg_temp.raced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = '20000000-0000-4000-8000-000000000004' AND OLD.user_id IS NULL THEN
    NEW.user_id := 'a0000000-0000-4000-8000-0000000000ff';
  END IF;
  IF OLD.id = '20000000-0000-4000-8000-000000000007' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER raced BEFORE UPDATE ON public.community FOR EACH ROW EXECUTE FUNCTION pg_temp.raced();

-- ===========================================================================
-- A member can't read other members' emails.
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'member@example.test');

SELECT pg_temp.fails('SELECT email FROM public.community', 'permission denied', 'member selects email');
SELECT pg_temp.fails('SELECT * FROM public.community', 'permission denied', 'member selects * (PostgREST select=*)');
SELECT pg_temp.fails($q$SELECT id FROM public.community WHERE email = 'other@example.test'$q$, 'permission denied', 'member filters on email');
SELECT pg_temp.fails($q$SELECT id FROM public.community WHERE email ILIKE '%other%'$q$, 'permission denied', 'member searches email');
SELECT pg_temp.fails('SELECT id FROM public.community ORDER BY email', 'permission denied', 'member sorts on email');
SELECT pg_temp.fails('SELECT c FROM public.community c', 'permission denied', 'member selects the whole row');
SELECT pg_temp.fails($q$UPDATE public.community SET bio = 'x' WHERE user_id = auth.uid() RETURNING email$q$, 'permission denied', 'member reads email through RETURNING');
SELECT pg_temp.fails($q$UPDATE public.community SET bio = bio WHERE email = 'member@example.test'$q$, 'permission denied', 'member probes email through an UPDATE filter');

-- The views and functions return no email.
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community_with_last_seen WHERE email IS NOT NULL), '0', 'community_with_last_seen returns no email');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.admin_ideas_overview WHERE creator_email IS NOT NULL), '0', 'admin_ideas_overview returns no email');
SELECT pg_temp.eq((public.get_start_sequence_data('a0000000-0000-4000-8000-000000000002') -> 'profile' ->> 'email'), NULL, 'get_start_sequence_data returns no email for another member');
SELECT pg_temp.eq((public.get_start_sequence_data('a0000000-0000-4000-8000-000000000002') -> 'profile' ->> 'name'), 'Other', 'get_start_sequence_data still works, as the member');
SELECT pg_temp.eq((public.get_project_interest_requests('30000000-0000-4000-8000-000000000001') -> 'requests' -> 0 -> 'user' ->> 'email'), NULL, 'project owners get no requester email');
SELECT pg_temp.eq((public.get_project_interest_requests('30000000-0000-4000-8000-000000000001') -> 'requests' -> 0 -> 'user' ->> 'name'), 'Other', 'project owners still get the request');

-- The admin functions refuse members.
SELECT pg_temp.fails($q$SELECT * FROM public.admin_member_emails(ARRAY['10000000-0000-4000-8000-000000000002'::uuid])$q$, 'not_authorized', 'member calls admin_member_emails');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_find_members_by_email('other')$q$, 'not_authorized', 'member calls admin_find_members_by_email');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_search_people('other')$q$, 'not_authorized', 'member calls admin_search_people');

-- ===========================================================================
-- Everything else a member does still works, and the hidden-profile rule is
-- unchanged (the views included: they still run as the member).
-- ===========================================================================
SELECT pg_temp.eq((SELECT count(*)::text FROM (
  SELECT id, user_id, name, bio, skills, interests, availability, role, user_role, image_url, avatar_storage_path,
         photo_visible, photo_consent_at, is_hidden, connection_count, created_at, updated_at, onboarding_completed,
         profile_completed, xp, level, login_streak, last_login, projects_created, projects_joined,
         endorsements_given, endorsements_received, is_disabled, image_path, status
  FROM public.community) t), '11', 'member reads every other column of the profiles they can see');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000003'), '0', 'a hidden profile stays hidden from other members');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community_with_last_seen WHERE id = '10000000-0000-4000-8000-000000000003'), '0', 'and from them through community_with_last_seen');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community_with_last_seen WHERE id = '10000000-0000-4000-8000-000000000002' AND presence_last_seen IS NOT NULL), '1', 'community_with_last_seen still works for its other columns');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.admin_ideas_overview WHERE creator_name = 'Hidden'), '0', 'admin_ideas_overview still applies the hidden-profile rule');
SELECT pg_temp.eq((SELECT bio FROM public.community WHERE id = '10000000-0000-4000-8000-000000000001'), NULL, 'member reads their own profile');
UPDATE public.community SET bio = 'Updated' WHERE user_id = auth.uid();
SELECT pg_temp.eq((SELECT bio FROM public.community WHERE user_id = auth.uid()), 'Updated', 'member updates their own profile');
SELECT pg_temp.eq(public.get_community_id_from_auth()::text, '10000000-0000-4000-8000-000000000001', 'the connection helper still finds the member by email (as its owner)');

-- A new member: sign-in creates their profile with the sign-in email and
-- reads it back by named columns.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000005', 'new@example.test');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, NULL, 'a new member has nothing to claim');
INSERT INTO public.community (user_id, email, name) VALUES (auth.uid(), 'new@example.test', 'New')
  RETURNING id, user_id, name;
SELECT pg_temp.eq((SELECT name FROM public.community WHERE user_id = auth.uid()), 'New', 'a new profile is created with the sign-in email, and read back by named columns');
SELECT pg_temp.fails($q$INSERT INTO public.community (user_id, email, name) VALUES (auth.uid(), 'x@example.test', 'X') RETURNING email$q$, 'permission denied', 'member reads email back from an INSERT');

-- ===========================================================================
-- Claiming an older profile, on the server only.
-- ===========================================================================
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000004', 'Old@Example.test');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '20000000-0000-4000-8000-000000000003', 'claim picks the completed profile');
RESET ROLE;
SELECT pg_temp.eq((SELECT string_agg(coalesce(user_id::text, '-') || '/' || is_hidden::text, ',' ORDER BY id)
                   FROM public.community WHERE id IN ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003')),
                  '-/false,-/false,a0000000-0000-4000-8000-000000000004/false',
                  'only that profile is linked; the other duplicates are left exactly as they were');
SET LOCAL ROLE authenticated;
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '20000000-0000-4000-8000-000000000003', 'claiming again returns the linked profile');
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000006', 'raced@example.test');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, NULL, 'a profile another account linked meanwhile is not returned');
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000007', 'busy@example.test');
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'try again', 'a profile that can''t be linked just now is an error to retry, not "none"');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'Not authenticated', 'claim without an account');
RESET ROLE;

-- ===========================================================================
-- Visitors.
-- ===========================================================================
SET LOCAL ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.fails('SELECT email FROM public.community', 'permission denied', 'visitor selects email');
SELECT pg_temp.fails('SELECT * FROM public.community', 'permission denied', 'visitor selects *');
SELECT pg_temp.fails($q$SELECT id FROM public.community WHERE email = 'other@example.test'$q$, 'permission denied', 'visitor filters on email');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000002'), '1', 'visitors still read visible profiles');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000003'), '0', 'and not hidden ones');
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'permission denied', 'visitors can''t call the claim');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_member_emails(ARRAY['10000000-0000-4000-8000-000000000002'::uuid])$q$, 'permission denied', 'visitors can''t call admin_member_emails');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_find_members_by_email('other')$q$, 'permission denied', 'visitors can''t call admin_find_members_by_email');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_search_people('other')$q$, 'permission denied', 'visitors can''t call admin_search_people');
RESET ROLE;

-- ===========================================================================
-- Admins: emails only through the admin functions.
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-00000000000a', 'admin@example.test');
SELECT pg_temp.eq((SELECT string_agg(email, ',' ORDER BY email) FROM public.admin_member_emails(
                     ARRAY['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003']::uuid[])),
                  'hidden@example.test,other@example.test', 'admin gets emails, hidden members included');
SELECT pg_temp.eq((SELECT string_agg(name, ',') FROM public.admin_find_members_by_email('  OTHER@example.test ', true)), 'Other', 'admin finds an exact email, ignoring case and spaces');
SELECT pg_temp.eq((SELECT string_agg(name, ',' ORDER BY name) FROM public.admin_find_members_by_email('old@')), 'Old A,Old B,Old C', 'admin searches part of an email');
SELECT pg_temp.eq((SELECT string_agg(name, ',') FROM public.admin_find_members_by_email('a_b')), 'Underscore', '"_" in an admin search matches only "_"');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.admin_find_members_by_email('')), '0', 'an empty search returns nothing');
SELECT pg_temp.fails('SELECT email FROM public.community', 'permission denied', 'admins don''t read the column directly either');
-- The People list: search by name or email, filters, sort, paging.
SELECT pg_temp.eq((SELECT string_agg(c.name || ':' || s.total_count, ',' ORDER BY s.ord)
                   FROM (SELECT x.id, x.total_count, row_number() OVER () AS ord
                         FROM public.admin_search_people('old@', p_sort => 'name', p_ascending => true, p_offset => 1, p_limit => 1) x) s
                   JOIN public.community c ON c.id = s.id),
                  'Old B:3', 'admin search pages through email matches, with the total');
SELECT pg_temp.eq((SELECT string_agg(c.name, ',') FROM public.admin_search_people('hidd') s JOIN public.community c ON c.id = s.id), 'Hidden', 'admin search matches names, hidden members included');
SELECT pg_temp.eq((SELECT string_agg(c.name, ',') FROM public.admin_search_people('', p_hidden => true) s JOIN public.community c ON c.id = s.id), 'Hidden', 'admin search filters');
SELECT pg_temp.eq((SELECT c.name FROM public.admin_search_people('example.test', p_sort => 'email', p_ascending => false, p_limit => 1) s JOIN public.community c ON c.id = s.id), 'Raced',
                  'admin search sorts by email (raced@ last alphabetically; by name it would be Underscore)');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_search_people('', p_sort => 'email; drop table x')$q$, 'unsupported sort', 'admin search accepts only known sorts');
RESET ROLE;
INSERT INTO public.community (email, name) SELECT 'bulk-' || n || '@example.test', 'Bulk ' || lpad(n::text, 3, '0') FROM generate_series(1, 250) n;
SET LOCAL ROLE authenticated;
SELECT pg_temp.eq((SELECT count(*) || '/' || max(total_count) FROM public.admin_search_people('bulk-', p_sort => 'name', p_ascending => true, p_offset => 200, p_limit => 100)),
                  '50/250', 'every match is reachable by paging (no cap on matches)');
SELECT pg_temp.as_user('a0000000-0000-4000-8000-00000000000d', 'disabled.admin@example.test');
SELECT pg_temp.fails($q$SELECT * FROM public.admin_member_emails(ARRAY['10000000-0000-4000-8000-000000000002'::uuid])$q$, 'not_authorized', 'a disabled admin is refused');
RESET ROLE;

-- ===========================================================================
-- Catalog.
-- ===========================================================================
SELECT pg_temp.eq((has_column_privilege('anon', 'public.community', 'email', 'SELECT')
                   OR has_column_privilege('authenticated', 'public.community', 'email', 'SELECT'))::text, 'false', 'no SELECT on email for anon or authenticated');
SELECT pg_temp.eq((has_column_privilege('authenticated', 'public.community', 'email', 'INSERT')
                   AND has_column_privilege('authenticated', 'public.community', 'email', 'UPDATE'))::text, 'true', 'INSERT and UPDATE on email are unchanged');
SELECT pg_temp.eq((SELECT string_agg(relname || ':' || array_to_string(reloptions, ','), ' ' ORDER BY relname) FROM pg_class
                   WHERE oid IN ('public.community_with_last_seen'::regclass, 'public.admin_ideas_overview'::regclass)),
                  'admin_ideas_overview:security_invoker=true community_with_last_seen:security_invoker=true', 'both views still run as the caller');
SELECT pg_temp.eq(has_function_privilege('anon', 'public.claim_community_profile_by_email()', 'EXECUTE')::text, 'false', 'visitors can''t execute the claim');
SELECT pg_temp.eq(has_schema_privilege('authenticated', 'buildspace_rollback', 'USAGE')::text, 'false', 'the rollback copies are not reachable by members');

ROLLBACK;
\o
\echo 'member email privacy checks passed'
