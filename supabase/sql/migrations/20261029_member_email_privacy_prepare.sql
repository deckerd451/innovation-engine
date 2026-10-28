-- Member email privacy, part A of 2: prepare. Removes no access.
--
-- Members can read every other member's email today: anon and authenticated
-- hold SELECT on all of public.community, and the hidden-profile policy
-- limits rows, not columns. Part B (20261029b_member_email_privacy_lock.sql)
-- takes SELECT on community.email away from anon and authenticated. Before
-- that can happen, everything that reads the column with the caller's
-- privileges, or hands it to them, has to stop. This part:
--
--   1. Keeps exact copies of everything it changes, for the rollback, in a
--      schema the API doesn't expose (buildspace_rollback).
--   2. get_start_sequence_data(uuid) (SECURITY INVOKER) and
--      get_project_interest_requests(uuid) (SECURITY DEFINER, project owners)
--      return email as null. The key stays, so the result shape is the same;
--      the website reads neither value. Each is rewritten from production's
--      own definition, changing only that one expression, and stops if the
--      expression isn't found exactly once.
--   3. community_with_last_seen and admin_ideas_overview (security_invoker
--      views) return email as null: a security_invoker view that reads
--      community.email fails for every query once part B is applied, even
--      queries that don't ask for email. Each is rewritten from production's
--      own definition; its column names and types, its options
--      (security_invoker) and its grants stay the same, and it stops if any
--      of that would change or if the view would still read email.
--   4. claim_community_profile_by_email() is replaced. It still matches the
--      caller's sign-in email on the server, returns the caller's linked
--      profile, and picks one unclaimed profile (completed, then onboarded,
--      then oldest), leaving any others exactly as they are. Unlike the
--      deployed version it returns only a profile it actually linked (it
--      used to return the picked id even when another account linked it
--      first), and visitors (anon) can no longer call it. With this, sign-in
--      needs no email lookup of its own.
--   5. Adds two admin-only functions, so the admin People panel can keep
--      showing and searching emails once part B is applied:
--        admin_member_emails(uuid[])              emails for given profiles
--        admin_find_members_by_email(text, bool)  search by email
--      Both refuse anyone whose own profile isn't user_role 'Admin' and
--      enabled.
--
-- No table, column, policy or row changes. Hidden-profile protection is
-- untouched. Idempotent: a re-run changes nothing and keeps the first copies.
--
-- Before applying: run the preflight in docs/SECURITY_MEMBER_EMAIL_PRIVACY.md.
-- Rollback: supabase/sql/rollback/20261029_member_email_privacy_prepare_rollback.sql
-- (roll part B back first if it was applied).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preconditions: stop rather than guess.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['id', 'user_id', 'email', 'name', 'user_role', 'is_disabled', 'profile_completed', 'onboarding_completed', 'created_at', 'updated_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'community' AND column_name = v_col) THEN
      RAISE EXCEPTION 'community.% is missing; not applying', v_col;
    END IF;
  END LOOP;
  IF to_regprocedure('public.get_start_sequence_data(uuid)') IS NULL
     OR to_regprocedure('public.get_project_interest_requests(uuid)') IS NULL
     OR to_regclass('public.community_with_last_seen') IS NULL
     OR to_regclass('public.admin_ideas_overview') IS NULL THEN
    RAISE EXCEPTION 'an expected function or view is missing; not applying (see the preflight)';
  END IF;
  IF to_regprocedure('public.claim_community_profile_by_email()') IS NOT NULL
     AND pg_get_function_result('public.claim_community_profile_by_email()'::regprocedure) <> 'uuid' THEN
    RAISE EXCEPTION 'claim_community_profile_by_email() does not return uuid; not applying';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rollback copies (not exposed by the API; owner-only).
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS buildspace_rollback;
REVOKE ALL ON SCHEMA buildspace_rollback FROM PUBLIC;
CREATE TABLE IF NOT EXISTS buildspace_rollback.member_email_privacy (
  name text PRIMARY KEY,   -- regprocedure / regclass, or 'grant:<role>'
  kind text NOT NULL CHECK (kind IN ('function', 'view', 'grant')),
  definition text,         -- pg_get_functiondef / pg_get_viewdef
  options text[],          -- view reloptions
  acl text,                -- function ACL
  saved_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON buildspace_rollback.member_email_privacy FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON SCHEMA buildspace_rollback FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON buildspace_rollback.member_email_privacy FROM anon, authenticated';
END $$;

-- The first run's copies are kept; a re-run never overwrites them.
INSERT INTO buildspace_rollback.member_email_privacy (name, kind, definition, acl)
SELECT p.oid::regprocedure::text, 'function', pg_get_functiondef(p.oid),
       coalesce(p.proacl, acldefault('f', p.proowner))::text
FROM pg_proc p
WHERE p.oid IN (
  SELECT to_regprocedure(f) FROM unnest(ARRAY[
    'public.get_start_sequence_data(uuid)',
    'public.get_project_interest_requests(uuid)',
    'public.claim_community_profile_by_email()'
  ]) f WHERE to_regprocedure(f) IS NOT NULL
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO buildspace_rollback.member_email_privacy (name, kind, definition, options)
SELECT c.oid::regclass::text, 'view', pg_get_viewdef(c.oid, true), c.reloptions
FROM pg_class c
WHERE c.oid IN ('public.community_with_last_seen'::regclass, 'public.admin_ideas_overview'::regclass)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Functions that read community.email: return null instead, changing
--    nothing else in production's definition.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_def text;
  v_count int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.get_start_sequence_data(uuid)', $x$'email', c.email,$x$, $x$'email', NULL::text,$x$, 'c'),
      ('public.get_project_interest_requests(uuid)', $x$'email', requester.email,$x$, $x$'email', NULL::text,$x$, 'requester')
    ) AS t(fn, old_expr, new_expr, alias)
  LOOP
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_count := (length(v_def) - length(replace(v_def, r.old_expr, ''))) / length(r.old_expr);
    IF v_count = 1 THEN
      EXECUTE replace(v_def, r.old_expr, r.new_expr);
    ELSIF v_count = 0 AND position(r.new_expr IN v_def) > 0 THEN
      RAISE NOTICE '% already returns email as null', r.fn;
    ELSE
      RAISE EXCEPTION '% does not contain % exactly once (found %); not applying -- compare it with the preflight',
        r.fn, r.old_expr, v_count;
    END IF;
    IF pg_get_functiondef(r.fn::regprocedure) ~* ('\m' || r.alias || '\.email\M') THEN
      RAISE EXCEPTION '% still reads %.email; not applying', r.fn, r.alias;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Views: return email as null. Rewritten from production's definition:
--    each <community alias>.email output column becomes NULL::<type> under
--    the same name; options and grants are kept and checked.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_attnum smallint;
  v_type text;
  r record;
  v_def text;
  v_new text;
  v_alias text;
  v_aliases text[];
  v_cols_before text;
  v_cols_after text;
BEGIN
  SELECT attnum, format_type(atttypid, atttypmod) INTO v_attnum, v_type
  FROM pg_attribute WHERE attrelid = 'public.community'::regclass AND attname = 'email' AND NOT attisdropped;

  FOR r IN SELECT c.oid, c.oid::regclass::text AS name, c.reloptions, c.relacl
           FROM pg_class c
           WHERE c.oid IN ('public.community_with_last_seen'::regclass, 'public.admin_ideas_overview'::regclass)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
                   WHERE rw.ev_class = r.oid AND d.refobjid = 'public.community'::regclass AND d.refobjsubid = v_attnum) THEN
      RAISE NOTICE '% no longer reads community.email', r.name;
      CONTINUE;
    END IF;

    v_def := pg_get_viewdef(r.oid, true);
    -- How the view names community: an alias after FROM/JOIN, or the bare name.
    SELECT array_agg(DISTINCT m[1]) INTO v_aliases
    FROM regexp_matches(v_def, '(?:FROM|JOIN)\s+(?:public\.)?community\s+(?:AS\s+)?([a-z_][a-z0-9_]*)', 'gi') AS m
    WHERE lower(m[1]) NOT IN ('on', 'where', 'left', 'right', 'inner', 'full', 'cross', 'join', 'natural',
                              'group', 'order', 'limit', 'union', 'window', 'having', 'using', 'lateral');
    IF v_def ~* '(FROM|JOIN)\s+(public\.)?community\M\s*($|\)|ON\M|WHERE\M|LEFT\M|RIGHT\M|JOIN\M|INNER\M|CROSS\M|GROUP\M|ORDER\M|LIMIT\M|,|;)' THEN
      v_aliases := array_append(coalesce(v_aliases, '{}'), 'community');
    END IF;
    IF v_aliases IS NULL THEN
      RAISE EXCEPTION '% reads community.email, but how it names community was not recognised; not applying', r.name;
    END IF;

    v_new := v_def;
    FOREACH v_alias IN ARRAY v_aliases LOOP
      -- "<alias>.email AS <name>" keeps <name>; a bare "<alias>.email" is named email.
      v_new := regexp_replace(v_new, '\m' || v_alias || '\.email\M\s+AS\s+([a-z_][a-z0-9_]*)', 'NULL::' || v_type || ' AS \1', 'gi');
      v_new := regexp_replace(v_new, '\m' || v_alias || '\.email\M', 'NULL::' || v_type || ' AS email', 'gi');
    END LOOP;

    SELECT string_agg(attname || ' ' || format_type(atttypid, atttypmod), ', ' ORDER BY attnum) INTO v_cols_before
    FROM pg_attribute WHERE attrelid = r.oid AND attnum > 0 AND NOT attisdropped;

    -- Options are restated: CREATE OR REPLACE VIEW without them resets
    -- security_invoker, and the view would then bypass the hidden-profile
    -- policy.
    EXECUTE format('CREATE OR REPLACE VIEW %s%s AS %s', r.name,
      CASE WHEN r.reloptions IS NULL THEN '' ELSE ' WITH (' || array_to_string(r.reloptions, ', ') || ')' END,
      v_new);

    SELECT string_agg(attname || ' ' || format_type(atttypid, atttypmod), ', ' ORDER BY attnum) INTO v_cols_after
    FROM pg_attribute WHERE attrelid = r.oid AND attnum > 0 AND NOT attisdropped;
    IF v_cols_after IS DISTINCT FROM v_cols_before THEN
      RAISE EXCEPTION '% columns would change (% -> %); not applying', r.name, v_cols_before, v_cols_after;
    END IF;
    IF (SELECT reloptions FROM pg_class WHERE oid = r.oid) IS DISTINCT FROM r.reloptions
       OR (SELECT relacl FROM pg_class WHERE oid = r.oid) IS DISTINCT FROM r.relacl THEN
      RAISE EXCEPTION '% options or grants would change; not applying', r.name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
               WHERE rw.ev_class = r.oid AND d.refobjid = 'public.community'::regclass AND d.refobjsubid = v_attnum) THEN
      RAISE EXCEPTION '% still reads community.email after the rewrite; not applying', r.name;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Claiming an older profile, server-side only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_community_profile_by_email()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Already linked: that's the member's profile.
  SELECT id INTO v_id FROM community WHERE user_id = v_uid ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  -- Pick one unclaimed profile with this email and link it in the same
  -- statement; others with the same email are left exactly as they are.
  -- A profile another sign-in is linking is skipped, and one linked in the
  -- meantime no longer matches user_id IS NULL, so only a profile this call
  -- actually linked is returned.
  UPDATE community c
  SET user_id = v_uid, updated_at = now()
  WHERE c.id = (
      SELECT u.id FROM community u
      WHERE u.user_id IS NULL AND lower(trim(u.email)) = v_email
      ORDER BY coalesce(u.profile_completed, false) DESC,
               coalesce(u.onboarding_completed, false) DESC,
               u.created_at ASC NULLS LAST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    AND c.user_id IS NULL
  RETURNING c.id INTO v_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Another sign-in of this same account may have linked a profile while
  -- this one waited.
  SELECT id INTO v_id FROM community WHERE user_id = v_uid ORDER BY created_at LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_community_profile_by_email() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.claim_community_profile_by_email() FROM anon'; END $$;
GRANT EXECUTE ON FUNCTION public.claim_community_profile_by_email() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin-only email access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_member_emails(p_ids uuid[])
RETURNS TABLE (id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community a
                 WHERE a.user_id = auth.uid() AND a.user_role = 'Admin' AND a.is_disabled IS NOT TRUE) THEN
    RAISE EXCEPTION 'not_authorized: admin required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_ids), 0) > 1000 THEN
    RAISE EXCEPTION 'at most 1000 profiles at a time' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT c.id, c.email FROM community c WHERE c.id = ANY (p_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_find_members_by_email(p_query text, p_exact boolean DEFAULT false)
RETURNS TABLE (id uuid, name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text := lower(trim(coalesce(p_query, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM community a
                 WHERE a.user_id = auth.uid() AND a.user_role = 'Admin' AND a.is_disabled IS NOT TRUE) THEN
    RAISE EXCEPTION 'not_authorized: admin required' USING ERRCODE = '42501';
  END IF;
  IF v_query = '' THEN
    RETURN;
  END IF;
  IF p_exact THEN
    RETURN QUERY
      SELECT c.id, c.name, c.email FROM community c
      WHERE lower(trim(c.email)) = v_query
      ORDER BY c.created_at
      LIMIT 200;
  ELSE
    -- "%" and "_" in the search match only themselves.
    RETURN QUERY
      SELECT c.id, c.name, c.email FROM community c
      WHERE c.email ILIKE '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      ORDER BY c.name
      LIMIT 200;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_member_emails(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_find_members_by_email(text, boolean) FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_member_emails(uuid[]) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_find_members_by_email(text, boolean) FROM anon';
END $$;
GRANT EXECUTE ON FUNCTION public.admin_member_emails(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_find_members_by_email(text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
