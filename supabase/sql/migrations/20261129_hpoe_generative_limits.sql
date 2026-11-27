BEGIN;
CREATE TABLE public.hpoe_generation_usage (
  day date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 2),
  PRIMARY KEY (day,user_id)
);
ALTER TABLE public.hpoe_generation_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hpoe_generation_usage FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.hpoe_reserve_generation(p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.hpoe_audience WHERE user_id=p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.hpoe_opt_in WHERE user_id=p_actor) THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(782319, 1);
  IF (SELECT coalesce(sum(requests),0) FROM public.hpoe_generation_usage WHERE day=d) >= 20 THEN RETURN false; END IF;
  INSERT INTO public.hpoe_generation_usage(day,user_id,requests) VALUES(d,p_actor,1)
  ON CONFLICT(day,user_id) DO UPDATE SET requests=public.hpoe_generation_usage.requests+1
  WHERE public.hpoe_generation_usage.requests < 2;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.hpoe_reserve_generation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hpoe_reserve_generation(uuid) TO service_role;
COMMIT;
