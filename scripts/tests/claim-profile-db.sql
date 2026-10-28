-- claim_community_profile_by_email (sql/claim_community_profile_by_email.sql)
-- against PostgreSQL: a disposable local database, synthetic profiles only.
-- Run by scripts/tests/run-db-tests.sh. Sign-in relies on it to link an
-- older profile without the website reading members' email addresses.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
BEGIN;

-- Expect an error whose message contains p_expected.
CREATE OR REPLACE FUNCTION pg_temp.fails(p_sql text, p_expected text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_expected in SQLERRM) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'FAILED: % (wrong error: %)', p_label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAILED: % (no error)', p_label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.eq(p_actual text, p_expected text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_member(p_uid uuid) RETURNS void
LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true) $$;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'One@Example.test'),
  ('a0000000-0000-4000-8000-000000000002', 'two@example.test'),
  ('a0000000-0000-4000-8000-000000000003', 'linked@example.test'),
  ('a0000000-0000-4000-8000-000000000004', 'none@example.test'),
  ('a0000000-0000-4000-8000-000000000005', 'theirs@example.test');
INSERT INTO public.community (id, user_id, email, name) VALUES
  -- One older profile, stored with different case and spaces.
  ('10000000-0000-4000-8000-000000000001', NULL, '  one@example.TEST ', 'One'),
  -- Two older profiles share an email.
  ('10000000-0000-4000-8000-000000000002', NULL, 'two@example.test', 'Two A'),
  ('10000000-0000-4000-8000-000000000003', NULL, 'Two@Example.test', 'Two B'),
  -- Already linked to this account, plus an older one with the same email.
  ('10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 'linked@example.test', 'Linked'),
  ('10000000-0000-4000-8000-000000000005', NULL, 'linked@example.test', 'Linked old'),
  -- Belongs to another account.
  ('10000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-0000000000ff', 'theirs@example.test', 'Theirs');

SET LOCAL ROLE authenticated;

-- One older profile: claimed, matched despite case and spaces.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '10000000-0000-4000-8000-000000000001', 'one older profile is claimed');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000001'), 'a0000000-0000-4000-8000-000000000001', 'it is linked to the account');
SET LOCAL ROLE authenticated;
-- Claiming again: already linked, nothing changes.
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'already linked', 'a second claim is refused');

-- Two older profiles share the email: refused, both left unclaimed (the
-- website's fallback then consolidates them).
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'Multiple orphaned community profiles', 'duplicates are refused');
RESET ROLE;
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community WHERE email ILIKE 'two@example.test' AND user_id IS NULL), '2', 'duplicates are left as they were');
SET LOCAL ROLE authenticated;

-- Already linked elsewhere: refused, the older profile is not taken.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'already linked', 'a linked member cannot claim another profile');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000005'), NULL, 'the older profile stays unclaimed');
SET LOCAL ROLE authenticated;

-- Nothing to claim, and another account's profile is not taken.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000004');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, NULL, 'no older profile: nothing claimed');
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, NULL, 'a profile linked to another account is not claimed');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000006'), 'a0000000-0000-4000-8000-0000000000ff', 'it stays with its account');

-- Signed out: refused; and visitors may not run it at all.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member(NULL);
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'Not authenticated', 'no account: refused');
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.claim_community_profile_by_email()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: visitors can run the claim function';
  END IF;
END $$;

ROLLBACK;
\o
\echo 'claim_community_profile_by_email checks passed'
