-- Member email privacy, part B of 2: lock. Members and visitors can no
-- longer read community.email.
--
-- anon and authenticated keep SELECT on every other community column; only
-- email is taken away (a column privilege; rows are still governed by the
-- unchanged hidden-profile policy). INSERT and UPDATE are untouched, so new
-- profiles are still created with the sign-in email. Server-side functions
-- that need email run as their owner and keep working: the claim, the
-- connection helper get_community_id_from_auth(), and the admin email
-- functions from part A.
--
-- What changes for callers:
--   - Selecting email, or filtering or sorting on it, fails with "permission
--     denied" -- including select=* (PostgREST) and RETURNING email.
--   - Admins read emails through admin_member_emails() and
--     admin_find_members_by_email() (part A), not the table.
--
-- Apply part A and deploy the website that uses it first (rollout order:
-- docs/SECURITY_MEMBER_EMAIL_PRIVACY.md). Before locking, this stops if
-- anything would still read the column with a caller's privileges: a view,
-- a policy, or a SECURITY INVOKER function -- those would fail outright --
-- or if the grants aren't what it expects.
--
-- New community columns added later are NOT readable by anon/authenticated
-- until granted: GRANT SELECT (new_column) ON public.community TO anon, authenticated;
--
-- Rollback: supabase/sql/rollback/20261029b_member_email_privacy_lock_rollback.sql
-- (or, in an emergency, the single statement
--   GRANT SELECT ON public.community TO anon, authenticated;
-- which makes email readable again at once).
-- Idempotent.

BEGIN;

DO $$
DECLARE
  v_attnum smallint;
  v_found text;
BEGIN
  -- Part A first.
  IF to_regclass('buildspace_rollback.member_email_privacy') IS NULL
     OR to_regprocedure('public.admin_member_emails(uuid[])') IS NULL
     OR to_regprocedure('public.admin_find_members_by_email(text,boolean)') IS NULL
     OR to_regprocedure('public.admin_search_people(text,text,boolean,boolean,boolean,text,boolean,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Part A (20261029_member_email_privacy_prepare.sql) is not applied; not locking';
  END IF;

  SELECT attnum INTO v_attnum FROM pg_attribute
  WHERE attrelid = 'public.community'::regclass AND attname = 'email' AND NOT attisdropped;

  -- Views and materialized views reading community.email would fail
  -- (views) or keep exposing it (materialized views).
  SELECT string_agg(DISTINCT rw.ev_class::regclass::text, ', ') INTO v_found
  FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
  WHERE d.classid = 'pg_rewrite'::regclass
    AND d.refobjid = 'public.community'::regclass AND d.refobjsubid = v_attnum
    AND rw.ev_class <> 'public.community'::regclass;
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'These views still read community.email: %; not locking', v_found;
  END IF;

  -- Policies (any table, any schema) that mention community and email.
  SELECT string_agg(format('%I.%I: %s', schemaname, tablename, policyname), '; ') INTO v_found
  FROM pg_policies
  WHERE (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '\memail\M'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '\mcommunity\M';
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'These policies mention community and email: %; review them before locking', v_found;
  END IF;

  -- SECURITY INVOKER functions outside the platform schemas that mention
  -- community and email. get_start_sequence_data only keeps an 'email' key
  -- (set to null by part A), so it is allowed while it reads no .email.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_found
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE NOT p.prosecdef
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions',
                          'graphql', 'graphql_public', 'pgsodium', 'pgsodium_masks', 'vault', 'net', 'cron',
                          'supabase_functions', 'supabase_migrations', 'pgbouncer', 'buildspace_rollback')
    AND n.nspname NOT LIKE 'pg\_%'
    AND p.prokind IN ('f', 'p')
    AND p.prosrc ~* '\mcommunity\M' AND p.prosrc ~* '\memail\M'
    AND NOT (p.oid = 'public.get_start_sequence_data(uuid)'::regprocedure AND p.prosrc !~* '\.email\M');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'These SECURITY INVOKER functions mention community and email: %; review them before locking', v_found;
  END IF;

  -- Grants must be as expected, so the rollback can restore them exactly.
  IF has_table_privilege('public', 'public.community', 'SELECT') THEN
    RAISE EXCEPTION 'PUBLIC holds SELECT on community; not locking (revoking from anon/authenticated would not be enough)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM buildspace_rollback.member_email_privacy WHERE kind = 'grant')
     AND EXISTS (SELECT 1 FROM pg_attribute a, aclexplode(a.attacl) x
                 WHERE a.attrelid = 'public.community'::regclass AND x.privilege_type = 'SELECT'
                   AND x.grantee IN ('anon'::regrole, 'authenticated'::regrole)) THEN
    RAISE EXCEPTION 'community already has column-level SELECT grants; not locking (unexpected state)';
  END IF;
END $$;

-- Who holds table-level SELECT now, for the rollback (first run only).
INSERT INTO buildspace_rollback.member_email_privacy (name, kind)
SELECT 'grant:' || r, 'grant'
FROM unnest(ARRAY['anon', 'authenticated']) r
WHERE has_table_privilege(r, 'public.community', 'SELECT')
ON CONFLICT (name) DO NOTHING;

-- The lock: table-level SELECT off, every column except email back on.
DO $$
DECLARE
  v_cols text;
  r record;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.community'::regclass AND attnum > 0 AND NOT attisdropped AND attname <> 'email';

  FOR r IN SELECT substr(name, 7) AS role FROM buildspace_rollback.member_email_privacy WHERE kind = 'grant' LOOP
    EXECUTE format('REVOKE SELECT ON public.community FROM %I', r.role);
    EXECUTE format('GRANT SELECT (%s) ON public.community TO %I', v_cols, r.role);
  END LOOP;

  IF has_column_privilege('anon', 'public.community', 'email', 'SELECT')
     OR has_column_privilege('authenticated', 'public.community', 'email', 'SELECT') THEN
    RAISE EXCEPTION 'email is still readable by anon or authenticated after the lock';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
