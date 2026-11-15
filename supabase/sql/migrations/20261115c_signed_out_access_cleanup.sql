-- ============================================================
-- BUILDSPACE: signed-out access cleanup
-- Project: mqbsjlgnsirqsmfnreqd
--
-- Why: Postgres lets EVERYONE (the PUBLIC group) run new functions,
-- and Supabase also grants them to anon by default. Earlier migrations
-- that only did "revoke ... from anon" never took effect.
--
-- What this does, decided from the LIVE database at run time:
--  * Trigger functions: nobody can call them directly any more.
--    (Triggers keep firing; Postgres doesn't check EXECUTE for that.)
--  * Other functions: signed-out access removed; signed-in users keep
--    exactly the access they had (re-granted explicitly, because some
--    had it only through PUBLIC).
--  * NOT touched: functions used by signed-out pages (site-visit tracking, email unsubscribe),
--    and functions used inside security rules, column defaults, check
--    constraints or views (Postgres runs those as the visitor).
--  * Future functions: no longer runnable by PUBLIC/anon by default.
--    A new function meant for signed-out visitors needs an explicit
--    "grant execute on function ... to anon;" in its migration.
--
-- Run preview_20261115c_signed_out_cleanup.sql first to see the exact list.
-- ============================================================
begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE (mqbsjlgnsirqsmfnreqd). Nothing was changed.';
  end if;
end $guard$;

do $mig$
declare r record; n_lock int := 0;
begin
  for r in
    with keep_guest(name) as (values ('record_site_visit'), ('unsubscribe_campaign_email')),
    fn as (
      select p.oid, p.proname,
             format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
             p.prosecdef as definer,
             p.prorettype = 'trigger'::regtype as is_trigger,
             p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind in ('f','p')
        and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    ),
    ctx as (   -- places where Postgres runs a function AS THE VISITOR
      select coalesce(qual,'') || ' ' || coalesce(with_check,'') as t
        from pg_policies where schemaname = 'public'
      union all
      select pg_get_expr(d.adbin, d.adrelid)
        from pg_attrdef d join pg_class c on c.oid = d.adrelid
        join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
      union all
      select pg_get_constraintdef(co.oid)
        from pg_constraint co join pg_namespace n on n.oid = co.connamespace
       where n.nspname = 'public' and co.contype = 'c'
      union all
      select pg_get_viewdef(c.oid)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('v','m')
      union all
      select f.prosrc from fn f        -- helpers called by kept, non-definer functions
       where not f.definer and f.proname in (select name from keep_guest)
    ),
    plan as (
      select f.sig, f.proname, f.is_trigger,
             has_function_privilege('anon', f.oid, 'EXECUTE')          as anon_now,
             has_function_privilege('authenticated', f.oid, 'EXECUTE') as auth_now,
             case
               when f.proname in (select name from keep_guest)
                 then 'KEEP: used by signed-out pages'
               when exists (select 1 from ctx where ctx.t ~ ('\m' || f.proname || '\s*\('))
                 then 'KEEP: used by security rules, defaults or views'
               when f.is_trigger
                 then 'LOCK: trigger, nobody needs to call it directly'
               else 'LOCK: signed-in only'
             end as action
      from fn f
    )
    select * from plan
    where action like 'LOCK%' and (anon_now or (is_trigger and auth_now))
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.is_trigger then
      execute format('revoke execute on function %s from authenticated', r.sig);
    elsif r.auth_now then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    execute format('grant execute on function %s to service_role', r.sig);
    n_lock := n_lock + 1;
  end loop;
  raise notice 'Locked % functions', n_lock;
end $mig$;

-- Future functions created by the postgres role (SQL Editor, migrations)
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

commit;
