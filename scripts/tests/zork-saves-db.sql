\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; END $$;
\set k1 '1111111111111111111111111111111111111111111111111111111111111111'
\set k2 '2222222222222222222222222222222222222222222222222222222222222222'
SET ROLE anon;
SELECT public.zork_save(:'k1', 'c2F2ZS0x');
SELECT pg_temp.ok(public.zork_load(:'k1') = 'c2F2ZS0x', 'visitor saves and loads with their key');
SELECT public.zork_save(:'k1', 'c2F2ZS0y');
SELECT pg_temp.ok(public.zork_load(:'k1') = 'c2F2ZS0y', 'saving again replaces the save');
SELECT pg_temp.ok(public.zork_load(:'k2') IS NULL, 'another key loads nothing');
SELECT pg_temp.ok(public.zork_load('Guest1234') IS NULL, 'a guest name is not a key');
DO $$ BEGIN PERFORM public.zork_save('short', 'eA=='); RAISE EXCEPTION 'FAIL: short key accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
DO $$ BEGIN PERFORM public.zork_save(repeat('a', 64), repeat('x', 262145)); RAISE EXCEPTION 'FAIL: oversized save accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
-- Direct table access after phase B
DO $$ BEGIN PERFORM 1 FROM public.zork_saves; RAISE EXCEPTION 'FAIL: visitor can read the table';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.zork_saves; RAISE EXCEPTION 'FAIL: visitor can delete';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.zork_saves WHERE username = 'Guest1234') = 0, 'legacy name-based save expired');
SELECT pg_temp.ok((SELECT count(*) FROM public.zork_saves) = 1, 'key-based save kept');
SELECT pg_temp.ok((SELECT position('1111' IN save_key_hash) = 0 AND username NOT LIKE '%1111%' FROM public.zork_saves), 'the key itself is not stored');
