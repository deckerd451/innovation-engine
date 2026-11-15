-- ============================================================
-- BUILDSPACE verification for 20261115d_privacy_presence_bbs
-- Run AFTER the migration. Read-only (rolled back).
-- Expected result: one row starting "ALL CHECKS PASSED".
-- ============================================================
begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE. Nothing was changed.';
  end if;
end $guard$;

do $v$
declare t text; v_all bigint; v_anon bigint; v_member bigint; v_who uuid := gen_random_uuid();
begin
  foreach t in array array['presence_sessions', 'bbs_messages', 'bbs_online', 'bbs_presence'] loop
    if exists (select 1 from pg_policies
               where schemaname = 'public' and tablename = t
                 and cmd in ('SELECT', 'ALL')
                 and roles && array['public', 'anon']::name[]) then
      raise exception 'FAIL: %: a read rule still includes signed-out visitors', t;
    end if;

    execute format('select count(*) from public.%I', t) into v_all;

    perform set_config('role', 'anon', true);
    execute format('select count(*) from public.%I', t) into v_anon;
    perform set_config('role', 'none', true);

    perform set_config('request.jwt.claim.sub', v_who::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute format('select count(*) from public.%I', t) into v_member;
    perform set_config('role', 'none', true);

    if v_anon <> 0 then raise exception 'FAIL: %: signed-out visitors can still read % rows', t, v_anon; end if;
    if v_member <> v_all then raise exception 'FAIL: %: signed-in members see % of % rows', t, v_member, v_all; end if;
  end loop;
end $v$;

rollback;

select 'ALL CHECKS PASSED' as result;
