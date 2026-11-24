-- ============================================================
-- Objects that exist in production (mqbsjlgnsirqsmfnreqd) but were not in
-- this repository. Recorded from the live database on 2026-11-24 so the
-- repository matches production. Reference only: production already has
-- these; re-running is a no-op. Not a migration.
-- ============================================================

-- Used by the theme_participants read policy below.
CREATE OR REPLACE FUNCTION public._my_theme_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tp.theme_id from theme_participants tp
   where tp.community_id in (select id from community where user_id = auth.uid())
  union
  select tc.id from theme_circles tc
   where tc.created_by in (select id from community where user_id = auth.uid())
$function$;

-- theme_participants read access in production: members see participants
-- of circles they are in or created; admins see all. There is no public
-- read rule (the older "Public read access to participants" and
-- "Users can view all theme participants" rules are not present live).
-- DROP POLICY IF EXISTS "Members can see who is in their circles" ON public.theme_participants;
-- CREATE POLICY "Members can see who is in their circles" ON public.theme_participants
--   FOR SELECT TO authenticated
--   USING ((theme_id IN (SELECT _my_theme_ids())) OR is_admin(auth.uid()));

-- Still to record (definition not yet captured):
--   public.is_admin(uid uuid)  -- SELECT pg_get_functiondef('public.is_admin(uuid)'::regprocedure);
--   the presence_sessions read policy (live name differs from 20261115d):
--   SELECT policyname, roles, qual FROM pg_policies WHERE tablename = 'presence_sessions';
