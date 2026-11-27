BEGIN;
DROP FUNCTION IF EXISTS public.hpoe_reserve_generation(uuid);
DROP TABLE IF EXISTS public.hpoe_generation_usage;
COMMIT;
