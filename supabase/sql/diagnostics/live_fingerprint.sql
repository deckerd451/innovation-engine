-- ============================================================
-- READ-ONLY FINGERPRINT for comparing the live database to GitHub
-- Run once in BUILDSPACE and once in Nearify (SQL Editor).
-- Makes no changes. Returns one JSON object.
-- Function bodies are NOT returned, only a short hash of each
-- (whitespace removed), so it's safe to paste.
-- ============================================================
with fn as (
  select
    p.proname                                   as name,
    pg_get_function_identity_arguments(p.oid)   as args,
    left(md5(regexp_replace(p.prosrc, '\s', '', 'g')), 12) as body_hash,
    p.prosecdef                                 as security_definer,
    has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
),
tbl as (
  select c.relname as name, c.relrowsecurity as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
)
select jsonb_build_object(
  'database',   current_database(),
  'checked_at', now(),
  -- [name, args, body_hash, security_definer, anon_exec, authenticated_exec]
  'functions',  (select coalesce(jsonb_agg(jsonb_build_array(
                    name, args, body_hash, security_definer, anon_exec, auth_exec)
                  order by name, args), '[]'::jsonb) from fn),
  'rls_on',     (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from tbl where rls),
  'rls_off',    (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from tbl where not rls),
  'policies',   (select coalesce(jsonb_agg(tablename || '.' || policyname
                    order by tablename, policyname), '[]'::jsonb)
                 from pg_policies where schemaname = 'public')
) as fingerprint;
