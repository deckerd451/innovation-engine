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

-- Used by the theme_participants policy above. Not SECURITY DEFINER: it reads
-- community with the caller's access, so signed-out callers always get false.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.community c
    where c.user_id = uid
      and c.user_role = 'Admin'
      and coalesce(c.is_disabled,false) = false
  );
$function$;

-- presence_sessions policies in production (names differ from 20261115d;
-- reading is limited to signed-in members' own sessions):
--   "Users can view their own presence sessions"   SELECT  to authenticated
--   "Users can insert their own presence sessions" INSERT
--   "Users can update their own presence sessions" UPDATE
--   "Users can delete their own presence sessions" DELETE
--   each scoped to user_id IN (select id from community where user_id = auth.uid())
