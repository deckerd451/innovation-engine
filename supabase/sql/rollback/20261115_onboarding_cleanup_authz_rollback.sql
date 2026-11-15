-- ============================================================
-- BUILDSPACE emergency rollback for 20261115_onboarding_cleanup_authz
-- Use ONLY if onboarding breaks for real users.
-- Restores the previous function bodies (from
-- supabase/sql/fixes/RUN_THIS_TO_FIX_ONBOARDING.sql and
-- supabase/sql/reference/PHASE3_START_REDESIGN.sql), which trust the
-- auth_user_id parameter. Signed-out access stays removed, so the
-- exposure is limited to signed-in users until a re-fix.
-- ============================================================
begin;

create or replace function public.complete_onboarding(auth_user_id uuid)
returns json as $$
declare
  user_community_id uuid;
begin
  select id into user_community_id from community where user_id = auth_user_id limit 1;
  if user_community_id is null then
    return json_build_object('error', 'Profile not found', 'success', false);
  end if;
  update community
  set onboarding_completed = true, onboarding_completed_at = now(), onboarding_step = 100
  where id = user_community_id;
  return json_build_object('success', true, 'message', 'Onboarding completed');
end;
$$ language plpgsql security definer;

create or replace function public.update_onboarding_step(auth_user_id uuid, step_number integer)
returns json as $$
declare
  user_community_id uuid;
begin
  select id into user_community_id from community where user_id = auth_user_id limit 1;
  if user_community_id is null then
    return json_build_object('error', 'Profile not found', 'success', false);
  end if;
  update community
  set onboarding_step = step_number, onboarding_started_at = coalesce(onboarding_started_at, now())
  where id = user_community_id;
  return json_build_object('success', true, 'step', step_number);
end;
$$ language plpgsql security definer;

create or replace function public.update_login_timestamp(auth_user_id uuid)
returns void as $$
begin
  update community set previous_login_at = last_login, last_login = now()
  where user_id = auth_user_id;
end;
$$ language plpgsql security definer;

-- CREATE OR REPLACE keeps existing grants, so anon stays revoked.
commit;
