-- claim_community_profile_by_email as deployed (modelled in
-- fixtures/claim-profile-production-model.sql) against PostgreSQL: a
-- disposable local database, synthetic profiles only. Run by
-- scripts/tests/run-db-tests.sh. Sign-in relies on it to link an older
-- profile without the website reading members' email addresses; these
-- checks pin down the behaviour sign-in has to allow for (auth.js
-- fetchUserProfile; scripts/tests/test-signin-profile-claim.js).
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
  ('a0000000-0000-4000-8000-000000000003', 'three@example.test'),
  ('a0000000-0000-4000-8000-000000000004', 'none@example.test'),
  ('a0000000-0000-4000-8000-000000000005', 'theirs@example.test'),
  ('a0000000-0000-4000-8000-000000000006', 'raced@example.test');
INSERT INTO public.community (id, user_id, email, name, profile_completed, onboarding_completed, created_at) VALUES
  -- One older profile, stored with different case and spaces.
  ('10000000-0000-4000-8000-000000000001', NULL, '  one@example.TEST ', 'One', false, false, '2026-01-01'),
  -- Three older profiles share an email; the newest is completed.
  ('10000000-0000-4000-8000-000000000002', NULL, 'two@example.test', 'Two A', false, false, '2026-01-01'),
  ('10000000-0000-4000-8000-000000000003', NULL, 'Two@Example.test', 'Two B', false, true, '2026-02-01'),
  ('10000000-0000-4000-8000-000000000004', NULL, 'two@example.test', 'Two C', true, false, '2026-03-01'),
  -- None completed: onboarded before oldest.
  ('10000000-0000-4000-8000-000000000005', NULL, 'three@example.test', 'Three A', false, false, '2026-01-01'),
  ('10000000-0000-4000-8000-000000000006', NULL, 'three@example.test', 'Three B', false, true, '2026-02-01'),
  -- Belongs to another account.
  ('10000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-0000000000ff', 'theirs@example.test', 'Theirs', true, true, '2026-01-01'),
  -- Picked, but linked by another account before the function's update.
  ('10000000-0000-4000-8000-000000000008', NULL, 'raced@example.test', 'Raced', false, false, '2026-01-01');

-- Stands in for another sign-in linking a profile between the function's
-- pick and its update (WHERE user_id IS NULL then matches nothing).
CREATE FUNCTION pg_temp.raced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = '10000000-0000-4000-8000-000000000008' AND OLD.user_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER raced BEFORE UPDATE ON public.community FOR EACH ROW EXECUTE FUNCTION pg_temp.raced();

SET LOCAL ROLE authenticated;

-- One older profile: claimed, matched despite case and spaces.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '10000000-0000-4000-8000-000000000001', 'one older profile is claimed');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000001'), 'a0000000-0000-4000-8000-000000000001', 'it is linked to the account');
SET LOCAL ROLE authenticated;
-- Claiming again: the linked profile is returned, not an error.
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '10000000-0000-4000-8000-000000000001', 'a linked member gets their own profile back');

-- Duplicates: one is picked (completed first) and linked; the others are
-- left unclaimed and visible, so sign-in hides them.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '10000000-0000-4000-8000-000000000004', 'duplicates: the completed profile is picked');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000004'), 'a0000000-0000-4000-8000-000000000002', 'and linked');
SELECT pg_temp.eq((SELECT count(*)::text FROM public.community WHERE lower(trim(email)) = 'two@example.test' AND user_id IS NULL AND NOT is_hidden), '2', 'the other duplicates are left unclaimed and visible');
SET LOCAL ROLE authenticated;

-- None completed: onboarded before oldest.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '10000000-0000-4000-8000-000000000006', 'onboarded is picked before oldest');

-- Nothing to claim, and another account's profile is not taken.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000004');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, NULL, 'no older profile: nothing claimed');
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, NULL, 'a profile linked to another account is not claimed');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000007'), 'a0000000-0000-4000-8000-0000000000ff', 'it stays with its account');
SET LOCAL ROLE authenticated;

-- The update links nothing, yet the id is returned: sign-in must check the
-- profile is linked to the member before using it.
SELECT pg_temp.as_member('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.eq(public.claim_community_profile_by_email()::text, '10000000-0000-4000-8000-000000000008', 'an id is returned even when the update linked nothing');
RESET ROLE;
SELECT pg_temp.eq((SELECT user_id::text FROM public.community WHERE id = '10000000-0000-4000-8000-000000000008'), NULL, 'and that profile is not linked to the caller');

-- Signed out: refused, for members and visitors (who may call it, as in
-- production, but are rejected).
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member(NULL);
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'Not authenticated', 'no account: refused');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.fails('SELECT public.claim_community_profile_by_email()', 'Not authenticated', 'visitors: refused');
RESET ROLE;

ROLLBACK;
\o
\echo 'claim_community_profile_by_email (deployed behaviour) checks passed'
