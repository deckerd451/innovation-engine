\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.n(r text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c bigint; BEGIN EXECUTE format('SET LOCAL ROLE %I', r); SELECT count(*) INTO c FROM public.zork_events; RESET ROLE; RETURN c; END $$;
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN IF pg_temp.n('authenticated') <> 0 THEN RAISE EXCEPTION 'FAIL: member still reads others'' zork events'; END IF; END $$;
DO $$ BEGIN IF pg_temp.n('anon') <> 0 THEN RAISE EXCEPTION 'FAIL: visitor reads zork events'; END IF; END $$;
DO $$ BEGIN IF pg_temp.n('service_role') <> 1 THEN RAISE EXCEPTION 'FAIL: service role lost access'; END IF; END $$;
COMMIT;
