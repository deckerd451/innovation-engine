-- ============================================================
-- BUILDSPACE verification for 20261115_onboarding_cleanup_authz
-- Run AFTER the migration. Changes nothing: every call made here is
-- rejected before it writes, and the whole run is rolled back anyway.
-- Expected result: one row saying "ALL CHECKS PASSED".
-- Any failure stops with an error starting with "FAIL:".
-- ============================================================
begin;

do $$
declare
  r json;
  v_me    uuid := gen_random_uuid();   -- pretend signed-in user
  v_other uuid := gen_random_uuid();   -- someone else's id
begin
  -- 1. Permissions
  if has_function_privilege('anon', 'public.complete_onboarding(uuid)', 'EXECUTE')
  or has_function_privilege('anon', 'public.update_onboarding_step(uuid,integer)', 'EXECUTE')
  or has_function_privilege('anon', 'public.update_login_timestamp(uuid)', 'EXECUTE') then
    raise exception 'FAIL: signed-out users can still run an onboarding/login function';
  end if;
  if not has_function_privilege('authenticated', 'public.complete_onboarding(uuid)', 'EXECUTE')
  or not has_function_privilege('authenticated', 'public.update_onboarding_step(uuid,integer)', 'EXECUTE') then
    raise exception 'FAIL: signed-in users lost access to onboarding (would break start-onboarding.js)';
  end if;
  if has_function_privilege('authenticated', 'public.clean_old_daily_suggestions()', 'EXECUTE')
  or has_function_privilege('anon', 'public.cleanup_old_suggestions()', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.cleanup_old_suggestions()', 'EXECUTE') then
    raise exception 'FAIL: cleanup functions are still callable from the app';
  end if;

  -- 2. Signed in as v_me, targeting v_other: must be refused
  perform set_config('request.jwt.claim.sub', v_me::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);

  r := public.complete_onboarding(v_other);
  if coalesce(r->>'error', '') <> 'Not allowed' then
    raise exception 'FAIL: complete_onboarding accepted another member''s id: %', r;
  end if;
  r := public.update_onboarding_step(v_other, 3);
  if coalesce(r->>'error', '') <> 'Not allowed' then
    raise exception 'FAIL: update_onboarding_step accepted another member''s id: %', r;
  end if;
  begin
    perform public.update_login_timestamp(v_other);
    raise exception 'FAIL: update_login_timestamp accepted another member''s id';
  exception when insufficient_privilege then null;
  end;

  -- 3. Own id is accepted (fake user has no profile, so "Profile not found" = passed the check)
  r := public.complete_onboarding(v_me);
  if coalesce(r->>'error', '') <> 'Profile not found' then
    raise exception 'FAIL: complete_onboarding rejected the caller''s own id: %', r;
  end if;

  -- 4. No session: must be refused
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  r := public.update_onboarding_step(v_other, 3);
  if coalesce(r->>'error', '') <> 'Not signed in' then
    raise exception 'FAIL: update_onboarding_step ran without a session: %', r;
  end if;

  -- 5. Deployed code is the new version
  if pg_get_functiondef('public.complete_onboarding(uuid)'::regprocedure) not like '%auth.uid()%'
  or pg_get_functiondef('public.update_login_timestamp(uuid)'::regprocedure) not like '%auth.uid()%' then
    raise exception 'FAIL: deployed function bodies are not the fixed versions';
  end if;
end $$;

rollback;

select 'ALL CHECKS PASSED' as result;
