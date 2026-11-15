-- ============================================================
-- BUILDSPACE: PREVIEW of the signed-out access cleanup. READ-ONLY.
-- Lists every function a signed-out visitor can run today and what
-- the cleanup migration would do to it. Changes nothing.
-- ============================================================
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
select jsonb_build_object(
  'will_lock', (select coalesce(jsonb_agg(jsonb_build_array(proname, action) order by action, proname), '[]')
                from plan where action like 'LOCK%' and (anon_now or (is_trigger and auth_now))),
  'will_keep', (select coalesce(jsonb_agg(jsonb_build_array(proname, action) order by action, proname), '[]')
                from plan where action like 'KEEP%' and anon_now),
  'counts', jsonb_build_object(
     'lock',      (select count(*) from plan where action like 'LOCK%' and (anon_now or (is_trigger and auth_now))),
     'keep_open', (select count(*) from plan where action like 'KEEP%' and anon_now))
) as preview;
