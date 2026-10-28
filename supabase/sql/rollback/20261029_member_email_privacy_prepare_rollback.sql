-- ROLLBACK for supabase/sql/migrations/20261029_member_email_privacy_prepare.sql
--
-- Restores, from the copies part A saved before changing anything
-- (buildspace_rollback.member_email_privacy):
--   - get_start_sequence_data(uuid) and get_project_interest_requests(uuid),
--     which return email again;
--   - community_with_last_seen and admin_ideas_overview, which include email
--     again, with their saved options;
--   - the previous claim_community_profile_by_email() and its grants
--     (visitors can call it again, and it can again return a profile it
--     didn't link);
-- and drops the two admin email functions and the copies.
--
-- Roll back part B (20261029b_member_email_privacy_lock_rollback.sql) first:
-- the restored views read email, and fail for everyone while members can't.
-- This stops if part B is still in effect. Re-running it after it has
-- completed does nothing.

BEGIN;

DO $$
DECLARE
  r record;
  a record;
BEGIN
  IF to_regclass('buildspace_rollback.member_email_privacy') IS NULL THEN
    RAISE NOTICE 'Nothing to roll back: part A''s copies are not present';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM buildspace_rollback.member_email_privacy WHERE kind = 'grant') THEN
    RAISE EXCEPTION 'Part B is still applied; run 20261029b_member_email_privacy_lock_rollback.sql first';
  END IF;

  FOR r IN SELECT * FROM buildspace_rollback.member_email_privacy WHERE kind = 'function' LOOP
    EXECUTE r.definition;
    -- Restore the function's grants as saved, where part A changed them
    -- (the claim's).
    CONTINUE WHEN (SELECT coalesce(proacl, acldefault('f', proowner))::text
                   FROM pg_proc WHERE oid = r.name::regprocedure) = r.acl;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.name);
    FOR a IN SELECT DISTINCT grantee FROM aclexplode(
               (SELECT proacl FROM pg_proc WHERE oid = r.name::regprocedure)) WHERE grantee <> 0 LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.name, pg_get_userbyid(a.grantee));
    END LOOP;
    FOR a IN SELECT grantee, privilege_type FROM aclexplode(r.acl::aclitem[]) LOOP
      EXECUTE format('GRANT %s ON FUNCTION %s TO %s', a.privilege_type, r.name,
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END);
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM buildspace_rollback.member_email_privacy WHERE kind = 'view' LOOP
    EXECUTE format('CREATE OR REPLACE VIEW %s%s AS %s', r.name,
      CASE WHEN r.options IS NULL THEN '' ELSE ' WITH (' || array_to_string(r.options, ', ') || ')' END,
      r.definition);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.admin_member_emails(uuid[]);
DROP FUNCTION IF EXISTS public.admin_find_members_by_email(text, boolean);
DROP TABLE IF EXISTS buildspace_rollback.member_email_privacy;
DROP SCHEMA IF EXISTS buildspace_rollback;

NOTIFY pgrst, 'reload schema';

COMMIT;
