-- ============================================================
-- BUILDSPACE verification for 20261115b_upvotes_skills_ble_authz
-- Run AFTER the migration. Changes nothing (all calls are refused
-- before writing, and the run is rolled back).
-- Expected result: one row saying "ALL CHECKS PASSED".
-- ============================================================
begin;

do $$
declare v_stranger uuid := gen_random_uuid();
begin
  -- 1. Upvotes: no app access
  if has_function_privilege('anon', 'public.increment_upvotes(uuid)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.increment_upvotes(uuid)', 'EXECUTE')
  or has_function_privilege('anon', 'public.decrement_upvotes(uuid)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.decrement_upvotes(uuid)', 'EXECUTE') then
    raise exception 'FAIL: upvote functions are still callable from the app';
  end if;

  -- 2. Skills: no write policies left, read still allowed
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'skills'
               and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'FAIL: skills still has a write policy';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'skills' and cmd = 'SELECT') then
    raise exception 'FAIL: skills lost its read policy (would break skill lists)';
  end if;

  -- 3. BLE suggestions: signed-in only, members only
  if has_function_privilege('anon', 'public.infer_ble_edges(uuid,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL: signed-out users can still run infer_ble_edges';
  end if;
  if not has_function_privilege('authenticated', 'public.infer_ble_edges(uuid,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL: signed-in members lost access to infer_ble_edges (would break BLE)';
  end if;

  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  begin
    perform public.infer_ble_edges(null, 120, 240);
    raise exception 'FAIL: infer_ble_edges ran for someone with no community profile';
  exception when insufficient_privilege then null;
  end;

  if pg_get_functiondef('public.infer_ble_edges(uuid,integer,integer)'::regprocedure)
     not like '%v_member in (r1.user_id, r2.user_id)%' then
    raise exception 'FAIL: deployed infer_ble_edges is not the fixed version';
  end if;
end $$;

rollback;

select 'ALL CHECKS PASSED' as result;
