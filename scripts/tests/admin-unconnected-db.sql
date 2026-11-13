SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_unconnected_members(); RAISE EXCEPTION 'anonymous review allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_unconnected_members(); RAISE EXCEPTION 'signed-out review allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM public.get_admin_unconnected_members(); RAISE EXCEPTION 'member review allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ DECLARE a jsonb; b jsonb; c jsonb; n integer; BEGIN
 a:=public.get_admin_unconnected_members(0,25);
 b:=public.get_admin_unconnected_members(25,25);
 c:=public.get_admin_unconnected_members(50,25);
 IF (a->>'total')::integer<>72 OR (b->>'total')::integer<>72 OR (c->>'total')::integer<>72 THEN RAISE EXCEPTION 'Eligibility count mismatch'; END IF;
 IF jsonb_array_length(a->'members')<>25 OR jsonb_array_length(b->'members')<>25 OR jsonb_array_length(c->'members')<>22 THEN RAISE EXCEPTION 'Incomplete pages'; END IF;
 SELECT count(DISTINCT x->>'id') INTO n FROM jsonb_array_elements((a->'members')||(b->'members')||(c->'members')) x;
 IF n<>72 THEN RAISE EXCEPTION 'Missing or overlapping members'; END IF;
 IF a<>public.get_admin_unconnected_members(0,25) THEN RAISE EXCEPTION 'Unstable pagination'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(a->'members') x WHERE x ? 'email' OR x ? 'user_id' OR x ? 'is_hidden') THEN RAISE EXCEPTION 'Extra private fields'; END IF;
 BEGIN PERFORM public.get_admin_unconnected_members(-1,25); RAISE EXCEPTION 'negative offset allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.get_admin_unconnected_members(0,51); RAISE EXCEPTION 'unbounded page allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.get_admin_unconnected_members(NULL,25); RAISE EXCEPTION 'null offset allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF jsonb_array_length(public.get_admin_unconnected_members(100,25)->'members')<>0 THEN RAISE EXCEPTION 'End page not empty'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.community WHERE coalesce(connection_count,0)=0;
SET ROLE authenticated;
DO $$ BEGIN
 IF public.get_admin_unconnected_members()->>'total'<>'0' THEN RAISE EXCEPTION 'Empty count wrong'; END IF;
END $$;
RESET ROLE;
