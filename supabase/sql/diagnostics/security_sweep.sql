-- ============================================================
-- READ-ONLY SECURITY SWEEP (Supabase / PostgreSQL)
-- Run once in BUILDSPACE and once in Nearify (SQL Editor).
-- Makes no changes. Returns one JSON object.
-- Returns no function bodies, row data, or secrets: only names,
-- signatures, privileges, and yes/no flags.
-- ============================================================
with fn as (
  select
    n.nspname                                        as schema,
    p.proname                                        as name,
    pg_get_function_identity_arguments(p.oid)        as args,
    p.prosecdef                                      as security_definer,
    has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
    coalesce(array_to_string(p.proconfig, ',') ~* 'search_path=', false) as has_search_path,
    -- Does the body look up the caller itself?
    (p.prosrc ~* 'auth\.uid\s*\(' or p.prosrc ~* 'auth\.jwt\s*\('
       or p.prosrc ~* 'current_profile_id\s*\(')    as resolves_caller,
    -- Does it accept a person/account id as a parameter?
    pg_get_function_identity_arguments(p.oid)
      ~* '(user|profile|member|community|owner|account|person)_?id' as takes_identity_param,
    -- Does it change data? (conservative text match)
    p.prosrc ~* '\m(insert|update|delete)\M'        as writes_data
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in (
      'pg_catalog','information_schema','pg_toast','auth','storage','realtime',
      'extensions','graphql','graphql_public','pgsodium','pgsodium_masks','vault',
      'supabase_functions','supabase_migrations','net','cron','pgbouncer',
      '_realtime','_analytics')
    and p.prokind in ('f','p')
    -- skip functions that belong to installed extensions
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
),
fn_flagged as (
  select *,
    case
      when security_definer and anon_exec and writes_data and not resolves_caller
        then 'HIGH: anyone can call, bypasses RLS, writes data, never checks caller'
      when security_definer and (anon_exec or auth_exec) and takes_identity_param
           and writes_data and not resolves_caller
        then 'HIGH: trusts a supplied id for writes without checking caller'
      when security_definer and (anon_exec or auth_exec) and not resolves_caller
        then 'REVIEW: callable, bypasses RLS, no caller check found'
      when security_definer and (anon_exec or auth_exec) and takes_identity_param
        then 'REVIEW: takes an id parameter; confirm it is compared to the caller'
      when security_definer and not has_search_path
        then 'REVIEW: SECURITY DEFINER without a fixed search_path'
      else 'ok'
    end as finding
  from fn
),
tbl as (
  select
    n.nspname as schema,
    c.relname as name,
    c.relrowsecurity as rls_enabled,
    (select count(*) from pg_policies pol
      where pol.schemaname = n.nspname and pol.tablename = c.relname) as policy_count,
    has_table_privilege('anon', c.oid, 'SELECT')                      as anon_read,
    has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE')        as anon_write,
    has_table_privilege('authenticated', c.oid, 'SELECT')             as auth_read,
    has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as auth_write
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname = 'public'
),
pol as (
  select schemaname, tablename, policyname, cmd, roles::text[] as roles,
    coalesce(regexp_replace(qual, '[\s()]', '', 'g'), '') = 'true'       as using_always_true,
    coalesce(regexp_replace(with_check, '[\s()]', '', 'g'), '') = 'true' as check_always_true
  from pg_policies
  where schemaname = 'public'
),
vw as (
  select
    n.nspname as schema,
    c.relname as name,
    case c.relkind when 'm' then 'materialized view' else 'view' end as kind,
    coalesce(c.reloptions::text[] && array['security_invoker=true','security_invoker=on','security_invoker=1'], false) as security_invoker,
    has_table_privilege('anon', c.oid, 'SELECT')          as anon_read,
    has_table_privilege('authenticated', c.oid, 'SELECT') as auth_read
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('v','m') and n.nspname = 'public'
)
select jsonb_build_object(
  'database', current_database(),
  'checked_at', now(),

  'summary', jsonb_build_object(
    'functions_checked',            (select count(*) from fn),
    'security_definer_functions',   (select count(*) from fn where security_definer),
    'definer_callable_by_anon',     (select count(*) from fn where security_definer and anon_exec),
    'function_findings_high',       (select count(*) from fn_flagged where finding like 'HIGH%'),
    'function_findings_review',     (select count(*) from fn_flagged where finding like 'REVIEW%'),
    'tables_without_rls_exposed',   (select count(*) from tbl where not rls_enabled
                                       and (anon_read or anon_write or auth_read or auth_write)),
    'always_true_policies',         (select count(*) from pol where (using_always_true or check_always_true)
                                       and roles && array['public','anon','authenticated']),
    'views_bypassing_rls',          (select count(*) from vw where not security_invoker and (anon_read or auth_read))
  ),

  'functions', (select coalesce(jsonb_agg(jsonb_build_object(
        'function', schema || '.' || name || '(' || args || ')',
        'finding', finding,
        'anon', anon_exec, 'authenticated', auth_exec,
        'writes_data', writes_data,
        'checks_caller', resolves_caller,
        'fixed_search_path', has_search_path)
      order by finding, name), '[]'::jsonb)
    from fn_flagged where finding <> 'ok'),

  'tables_without_rls', (select coalesce(jsonb_agg(jsonb_build_object(
        'table', schema || '.' || name,
        'anon_read', anon_read, 'anon_write', anon_write,
        'authenticated_read', auth_read, 'authenticated_write', auth_write)
      order by name), '[]'::jsonb)
    from tbl where not rls_enabled and (anon_read or anon_write or auth_read or auth_write)),

  'tables_rls_on_no_policies', (select coalesce(jsonb_agg(schema || '.' || name order by name), '[]'::jsonb)
    from tbl where rls_enabled and policy_count = 0),

  'always_true_policies', (select coalesce(jsonb_agg(jsonb_build_object(
        'table', tablename, 'policy', policyname, 'command', cmd, 'roles', roles,
        'using_true', using_always_true, 'check_true', check_always_true)
      order by tablename, policyname), '[]'::jsonb)
    from pol where (using_always_true or check_always_true)
      and roles && array['public','anon','authenticated']),

  'views_bypassing_rls', (select coalesce(jsonb_agg(jsonb_build_object(
        'view', schema || '.' || name, 'kind', kind,
        'anon_read', anon_read, 'authenticated_read', auth_read)
      order by name), '[]'::jsonb)
    from vw where not security_invoker and (anon_read or auth_read))
) as security_sweep;
