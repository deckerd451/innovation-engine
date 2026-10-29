-- ROLLBACK for supabase/sql/migrations/20261029b_member_email_privacy_lock.sql
--
-- Gives back table-level SELECT on community to the roles that held it
-- before the lock (saved by part B), and removes the column-level grants
-- the lock added. Members and visitors can read every member's email again.
-- Part A's changes stay (roll it back separately, after this).
--
-- Emergency alternative, one statement, same effect on access:
--   GRANT SELECT ON public.community TO anon, authenticated;
-- (it leaves the column-level grants in place; run this file later to tidy
-- up). Idempotent.

BEGIN;

DO $$
DECLARE
  v_cols text;
  v_roles text[];
  v_role text;
BEGIN
  IF to_regclass('buildspace_rollback.member_email_privacy') IS NOT NULL THEN
    SELECT array_agg(substr(name, 7)) INTO v_roles
    FROM buildspace_rollback.member_email_privacy WHERE kind = 'grant';
  END IF;
  IF v_roles IS NULL THEN
    -- No saved holders (part B never applied, or already rolled back):
    -- restore the documented production state if the lock is in effect.
    IF has_column_privilege('anon', 'public.community', 'email', 'SELECT')
       AND has_column_privilege('authenticated', 'public.community', 'email', 'SELECT') THEN
      RAISE NOTICE 'Nothing to roll back: email is readable';
      RETURN;
    END IF;
    v_roles := ARRAY['anon', 'authenticated'];
  END IF;

  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.community'::regclass AND attnum > 0 AND NOT attisdropped;

  FOREACH v_role IN ARRAY v_roles LOOP
    EXECUTE format('REVOKE SELECT (%s) ON public.community FROM %I', v_cols, v_role);
    EXECUTE format('GRANT SELECT ON public.community TO %I', v_role);
  END LOOP;

  IF to_regclass('buildspace_rollback.member_email_privacy') IS NOT NULL THEN
    DELETE FROM buildspace_rollback.member_email_privacy WHERE kind = 'grant';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
