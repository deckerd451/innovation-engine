-- ============================================================
-- Innovation Engine: Zork event logs, server-side only
-- Project: mqbsjlgnsirqsmfnreqd
--
-- Removes the signed-in rule on zork_events. Its condition compares the row's
-- username with itself, so it does not limit members to their own rows.
-- No website or app code reads or writes this table; the service role keeps
-- full access. Nothing becomes more visible to anyone.
-- Rollback: supabase/sql/rollback/20261124e_zork_events_service_only_rollback.sql
-- Test: scripts/tests/zork-events-db.sql (in run-db-tests.sh)
-- ============================================================

begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE (mqbsjlgnsirqsmfnreqd). Nothing was changed.';
  end if;
end $guard$;

drop policy if exists "Users can manage their zork events by username" on public.zork_events;

do $check$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zork_events'
             and not (roles = array['service_role']::name[])) then
    raise exception 'Self-check failed: zork_events still has a rule for visitors or members. Nothing was changed.';
  end if;
end $check$;

commit;
