-- ============================================================
-- BUILDSPACE emergency rollback for 20261115b_upvotes_skills_ble_authz
-- Use ONLY if something visibly breaks. Run only the section you need.
-- Signed-out access is NOT restored anywhere.
-- ============================================================

-- A. BLE suggestions broke -> restore the previous (all-pairs) body
begin;
create or replace function public.infer_ble_edges(
  p_group_id uuid default null::uuid,
  p_min_overlap_seconds integer default 120,
  p_lookback_minutes integer default 240
)
returns integer
language plpgsql
security definer
as $function$
declare inserted_count int := 0;
begin
  with recent as (
    select ps.user_id, ps.context_id as beacon_id,
      min(ps.created_at) as start_ts,
      max(coalesce(ps.last_seen, ps.updated_at, ps.created_at)) as end_ts,
      avg(coalesce(ps.energy, 0)) as avg_energy
    from public.presence_sessions ps
    join public.beacons b on b.id = ps.context_id
    where ps.context_type = 'beacon'
      and ps.created_at >= now() - make_interval(mins => p_lookback_minutes)
      and (p_group_id is null or b.group_id = p_group_id)
    group by ps.user_id, ps.context_id
  ),
  pairs as (
    select r1.beacon_id,
      least(r1.user_id, r2.user_id) as from_user_id,
      greatest(r1.user_id, r2.user_id) as to_user_id,
      greatest(r1.start_ts, r2.start_ts) as overlap_start,
      least(r1.end_ts, r2.end_ts) as overlap_end,
      greatest(0, extract(epoch from (least(r1.end_ts, r2.end_ts) - greatest(r1.start_ts, r2.start_ts))))::int as overlap_seconds,
      ((r1.avg_energy + r2.avg_energy) / 2.0) as avg_energy
    from recent r1
    join recent r2 on r1.beacon_id = r2.beacon_id and r1.user_id < r2.user_id
  ),
  candidates as (select * from pairs where overlap_seconds >= p_min_overlap_seconds),
  ins as (
    insert into public.interaction_edges (from_user_id, to_user_id, status, type,
      beacon_id, overlap_seconds, confidence, meta)
    select c.from_user_id, c.to_user_id, 'suggested', 'ble_proximity', c.beacon_id,
      c.overlap_seconds,
      least(1.0, 0.45 + (c.overlap_seconds / 900.0) + (c.avg_energy / 10.0))::numeric,
      jsonb_build_object('overlap_start', c.overlap_start, 'overlap_end', c.overlap_end, 'avg_energy', c.avg_energy)
    from candidates c
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from ins;
  return inserted_count;
end $function$;
commit;

-- B. Something needed to add/update skills -> restore the two policies
-- begin;
-- create policy "Allow authenticated users to add skills" on public.skills
--   for insert to authenticated with check (true);
-- create policy "Allow authenticated users to update skills" on public.skills
--   for update to authenticated using (true);
-- commit;

-- C. Something needed the upvote functions -> signed-in access only
-- grant execute on function public.increment_upvotes(uuid) to authenticated;
-- grant execute on function public.decrement_upvotes(uuid) to authenticated;
