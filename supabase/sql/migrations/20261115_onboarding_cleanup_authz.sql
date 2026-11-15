-- ============================================================
-- BUILDSPACE: onboarding/login caller checks + cleanup lockdown
-- Project: mqbsjlgnsirqsmfnreqd
--
-- Problem: complete_onboarding, update_onboarding_step and
-- update_login_timestamp are SECURITY DEFINER, executable by anon,
-- and update whichever auth_user_id they are given. Anyone could
-- change any member's onboarding state or login timestamps.
-- The two daily-suggestion cleanup functions are executable by anyone.
--
-- Fix: the three functions now act only on auth.uid(). The
-- auth_user_id parameter is kept (start-onboarding.js passes it),
-- but a value that isn't the caller is rejected. Function names,
-- parameters and return types are unchanged.
--
-- Note: revoking from anon alone does nothing while PUBLIC still has
-- EXECUTE (anon inherits PUBLIC). Every revoke below includes PUBLIC.
-- ============================================================
begin;

create or replace function public.complete_onboarding(auth_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  user_community_id uuid;
begin
  if v_caller is null then
    return json_build_object('error', 'Not signed in', 'success', false);
  end if;
  if auth_user_id is not null and auth_user_id <> v_caller then
    return json_build_object('error', 'Not allowed', 'success', false);
  end if;

  select id into user_community_id
  from public.community
  where user_id = v_caller
  limit 1;

  if user_community_id is null then
    return json_build_object('error', 'Profile not found', 'success', false);
  end if;

  update public.community
  set onboarding_completed = true,
      onboarding_completed_at = now(),
      onboarding_step = 100
  where id = user_community_id;

  return json_build_object('success', true, 'message', 'Onboarding completed');
end;
$$;

create or replace function public.update_onboarding_step(auth_user_id uuid, step_number integer)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  user_community_id uuid;
begin
  if v_caller is null then
    return json_build_object('error', 'Not signed in', 'success', false);
  end if;
  if auth_user_id is not null and auth_user_id <> v_caller then
    return json_build_object('error', 'Not allowed', 'success', false);
  end if;

  select id into user_community_id
  from public.community
  where user_id = v_caller
  limit 1;

  if user_community_id is null then
    return json_build_object('error', 'Profile not found', 'success', false);
  end if;

  update public.community
  set onboarding_step = step_number,
      onboarding_started_at = coalesce(onboarding_started_at, now())
  where id = user_community_id;

  return json_build_object('success', true, 'step', step_number);
end;
$$;

create or replace function public.update_login_timestamp(auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if auth_user_id is not null and auth_user_id <> v_caller then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.community
  set previous_login_at = last_login,
      last_login = now()
  where user_id = v_caller;
end;
$$;

-- Signed-in users only
revoke execute on function public.complete_onboarding(uuid)             from public, anon;
revoke execute on function public.update_onboarding_step(uuid, integer) from public, anon;
revoke execute on function public.update_login_timestamp(uuid)          from public, anon;
grant  execute on function public.complete_onboarding(uuid)             to authenticated, service_role;
grant  execute on function public.update_onboarding_step(uuid, integer) to authenticated, service_role;
grant  execute on function public.update_login_timestamp(uuid)          to authenticated, service_role;

-- Maintenance functions: server-side only (no app code calls these)
revoke execute on function public.clean_old_daily_suggestions() from public, anon, authenticated;
revoke execute on function public.cleanup_old_suggestions()     from public, anon, authenticated;
grant  execute on function public.clean_old_daily_suggestions() to service_role;
grant  execute on function public.cleanup_old_suggestions()     to service_role;

commit;
