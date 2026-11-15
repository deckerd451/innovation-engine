-- ============================================================
-- BUILDSPACE: upvotes, skills and BLE-suggestion lockdown
-- Project: mqbsjlgnsirqsmfnreqd
--
-- 1. increment_upvotes / decrement_upvotes: SECURITY DEFINER, callable
--    by anyone, change any idea's count with no limit. No app code
--    calls them -> server-side only.
-- 2. skills: policies let any signed-in user INSERT rows and UPDATE
--    every row (rename skills, change usage_count). The app only reads
--    skills -> drop the two write policies; public read stays.
-- 3. infer_ble_edges: SECURITY DEFINER, callable by signed-out users,
--    builds suggested edges for EVERYONE at a beacon/group, with any
--    lookback window. Still used by ble-passive-networking.js ->
--    signed-in members only, and it now creates suggestions only for
--    pairs that include the caller. Lookback capped at 24 hours.
--    Name, parameters, defaults and return type are unchanged.
--
-- Safety guard: the migration stops before changing anything if
-- another database function depends on what is being removed.
-- ============================================================
begin;

do $$
declare v_list text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname not in ('increment_upvotes', 'decrement_upvotes')
    and p.prosrc ~* '\m(increment|decrement)_upvotes\M';
  if v_list is not null then
    raise exception 'STOPPED, nothing changed: these functions call the upvote functions: %', v_list;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not p.prosecdef
    and p.prosrc ~* '\m(insert\s+into|update)\s+(public\.)?"?skills"?\M';
  if v_list is not null then
    raise exception 'STOPPED, nothing changed: these functions write to skills as the user: %', v_list;
  end if;
end $$;

-- 1. Upvotes: server-side only
revoke execute on function public.increment_upvotes(uuid) from public, anon, authenticated;
revoke execute on function public.decrement_upvotes(uuid) from public, anon, authenticated;
grant  execute on function public.increment_upvotes(uuid) to service_role;
grant  execute on function public.decrement_upvotes(uuid) to service_role;
alter function public.increment_upvotes(uuid) set search_path = public, pg_temp;
alter function public.decrement_upvotes(uuid) set search_path = public, pg_temp;

-- 2. Skills: read-only from the app
drop policy if exists "Allow authenticated users to add skills"    on public.skills;
drop policy if exists "Allow authenticated users to update skills" on public.skills;

-- 3. BLE suggestions: caller's own pairs only
create or replace function public.infer_ble_edges(
  p_group_id uuid default null::uuid,
  p_min_overlap_seconds integer default 120,
  p_lookback_minutes integer default 240
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  inserted_count int := 0;
  v_member uuid := public.authz_current_member_id();
  v_lookback int := least(greatest(coalesce(p_lookback_minutes, 240), 1), 1440);
  v_min_overlap int := greatest(coalesce(p_min_overlap_seconds, 120), 30);
begin
  if v_member is null then
    raise exception 'Sign in as a community member to generate suggestions'
      using errcode = '42501';
  end if;

  with recent as (
    select
      ps.user_id,
      ps.context_id as beacon_id,
      min(ps.created_at) as start_ts,
      max(coalesce(ps.last_seen, ps.updated_at, ps.created_at)) as end_ts,
      avg(coalesce(ps.energy, 0)) as avg_energy
    from public.presence_sessions ps
    join public.beacons b on b.id = ps.context_id
    where ps.context_type = 'beacon'
      and ps.created_at >= now() - make_interval(mins => v_lookback)
      and (p_group_id is null or b.group_id = p_group_id)
    group by ps.user_id, ps.context_id
  ),
  pairs as (
    select
      r1.beacon_id,
      least(r1.user_id, r2.user_id) as from_user_id,
      greatest(r1.user_id, r2.user_id) as to_user_id,
      greatest(r1.start_ts, r2.start_ts) as overlap_start,
      least(r1.end_ts, r2.end_ts) as overlap_end,
      greatest(
        0,
        extract(epoch from (least(r1.end_ts, r2.end_ts) - greatest(r1.start_ts, r2.start_ts)))
      )::int as overlap_seconds,
      ((r1.avg_energy + r2.avg_energy) / 2.0) as avg_energy
    from recent r1
    join recent r2
      on r1.beacon_id = r2.beacon_id
     and r1.user_id < r2.user_id
    where v_member in (r1.user_id, r2.user_id)
  ),
  candidates as (
    select * from pairs where overlap_seconds >= v_min_overlap
  ),
  ins as (
    insert into public.interaction_edges (
      from_user_id, to_user_id, status, type,
      beacon_id, overlap_seconds, confidence, meta
    )
    select
      c.from_user_id, c.to_user_id, 'suggested', 'ble_proximity',
      c.beacon_id, c.overlap_seconds,
      least(1.0, 0.45 + (c.overlap_seconds / 900.0) + (c.avg_energy / 10.0))::numeric,
      jsonb_build_object(
        'overlap_start', c.overlap_start,
        'overlap_end', c.overlap_end,
        'avg_energy', c.avg_energy
      )
    from candidates c
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from ins;

  return inserted_count;
end $function$;

revoke execute on function public.infer_ble_edges(uuid, integer, integer) from public, anon;
grant  execute on function public.infer_ble_edges(uuid, integer, integer) to authenticated, service_role;

commit;
