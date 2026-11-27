DO $$
DECLARE actor uuid;
BEGIN
  IF has_function_privilege('authenticated','public.hpoe_reserve_generation(uuid)','EXECUTE') OR has_function_privilege('anon','public.hpoe_reserve_generation(uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.hpoe_reserve_generation(uuid)','EXECUTE') THEN RAISE EXCEPTION 'RPC privileges incorrect'; END IF;
  IF has_table_privilege('authenticated','public.hpoe_generation_usage','SELECT') THEN RAISE EXCEPTION 'Usage exposed'; END IF;
  IF public.hpoe_reserve_generation(gen_random_uuid()) THEN RAISE EXCEPTION 'Unknown actor accepted'; END IF;
  FOR i IN 1..11 LOOP
    actor := gen_random_uuid();
    INSERT INTO auth.users(id) VALUES(actor);
    INSERT INTO public.hpoe_audience(user_id) VALUES(actor);
    IF public.hpoe_reserve_generation(actor) THEN RAISE EXCEPTION 'Missing consent accepted'; END IF;
    INSERT INTO public.hpoe_opt_in(user_id) VALUES(actor);
    IF i <= 10 THEN
      IF NOT public.hpoe_reserve_generation(actor) OR NOT public.hpoe_reserve_generation(actor) THEN RAISE EXCEPTION 'Eligible reservation denied'; END IF;
      IF public.hpoe_reserve_generation(actor) THEN RAISE EXCEPTION 'Account cap exceeded'; END IF;
    ELSE
      IF public.hpoe_reserve_generation(actor) THEN RAISE EXCEPTION 'Global cap exceeded'; END IF;
    END IF;
  END LOOP;
END $$;
