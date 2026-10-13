-- DISPOSABLE LOCAL DATABASE ONLY. Assertion helpers for the authorization
-- tests; installed into schema `t` after the baseline fixture.
CREATE SCHEMA IF NOT EXISTS t;
GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role;

-- Act as a member (or as an anonymous / service caller). Claims are local to
-- the current transaction; the caller still issues SET LOCAL ROLE itself.
CREATE OR REPLACE FUNCTION t.act(p_user uuid, p_role text DEFAULT 'authenticated') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  PERFORM set_config('request.jwt.claim.email', COALESCE((SELECT c.email FROM public.community c WHERE c.user_id = p_user LIMIT 1), ''), true);
END $$;

-- The statement must be refused with insufficient_privilege (42501): RLS
-- WITH CHECK, missing grants, column grants and the connection trigger all
-- report this code. Any other error is a test failure, not a denial.
CREATE OR REPLACE FUNCTION t.denied(p_sql text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION 'NOT DENIED: %', p_label;
END $$;

CREATE OR REPLACE FUNCTION t.allowed(p_sql text, p_label text, p_expected_rows int DEFAULT 1) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'BLOCKED LEGITIMATE ACTION: % (% %)', p_label, SQLSTATE, SQLERRM;
  END;
  IF n <> p_expected_rows THEN
    RAISE EXCEPTION 'UNEXPECTED ROW COUNT for %: expected %, got %', p_label, p_expected_rows, n;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION t.rows(p_sql text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- The write must not take effect: either row-level security filters it to
-- zero rows, or a grant/trigger refuses it. Use where either layer is a
-- correct outcome.
CREATE OR REPLACE FUNCTION t.blocked(p_sql text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  IF n <> 0 THEN
    RAISE EXCEPTION 'NOT BLOCKED: % (% row(s) changed)', p_label, n;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION t.eq(p_actual bigint, p_expected bigint, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  END IF;
END $$;

-- Ground truth, independent of the caller's RLS view.
CREATE OR REPLACE FUNCTION t.notes(p_recipient uuid, p_type text) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.notifications WHERE user_id = p_recipient AND type = p_type $$;

CREATE OR REPLACE FUNCTION t.connection(p_id uuid) RETURNS public.connections
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.connections WHERE id = p_id $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;
