-- ============================================================
-- BUILDSPACE: verification for the signed-out access cleanup.
-- Run AFTER the migration. Changes nothing (rolled back).
-- Expected result: one row starting "ALL CHECKS PASSED".
-- ============================================================
begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE. Nothing was changed.';
  end if;
end $guard$;

do $v$
declare v_left text; v_lost text; v_kept int;
begin
  -- 1. Nothing left that should have been locked
  select string_agg(proname, ', ') into v_left from (
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
    select proname from plan
    where action like 'LOCK%' and (anon_now or (is_trigger and auth_now))
  ) x;
  if v_left is not null then
    raise exception 'FAIL: still open to signed-out visitors: %', v_left;
  end if;

  -- 2. Signed-out pages still work
  select string_agg(k, ', ') into v_lost
  from (values ('record_site_visit'), ('unsubscribe_campaign_email')) as g(k)
  where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = g.k)
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = g.k
                      and has_function_privilege('anon', p.oid, 'EXECUTE'));
  if v_lost is not null then
    raise exception 'FAIL: signed-out pages lost access to: %', v_lost;
  end if;

  -- 3. Functions used by security rules are still usable by visitors
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'is_admin'
               and not has_function_privilege('authenticated', p.oid, 'EXECUTE')) then
    raise exception 'FAIL: is_admin is no longer usable by signed-in users';
  end if;

  -- 4. New functions are no longer open to signed-out visitors by default
  create function public.zz_default_priv_probe() returns int language sql as 'select 1';
  if has_function_privilege('anon', 'public.zz_default_priv_probe()', 'EXECUTE') then
    raise exception 'FAIL: new functions are still open to signed-out visitors by default';
  end if;
  if not has_function_privilege('authenticated', 'public.zz_default_priv_probe()', 'EXECUTE') then
    raise exception 'FAIL: new functions are no longer usable by signed-in users by default';
  end if;
end $v$;

rollback;

select 'ALL CHECKS PASSED' as result;
