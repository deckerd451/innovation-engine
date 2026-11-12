-- Removes collected aggregate visits as well as the functions. Export counts first if needed.
BEGIN;
DROP FUNCTION IF EXISTS public.get_admin_site_visits(integer, boolean, uuid);
DROP FUNCTION IF EXISTS public.record_site_visit(uuid, uuid);
DROP TABLE IF EXISTS public.site_visit_sessions;
COMMIT;
