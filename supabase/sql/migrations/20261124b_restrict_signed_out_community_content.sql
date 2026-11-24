-- ============================================================
-- Innovation Engine: signed-in read access for community content
-- Project: mqbsjlgnsirqsmfnreqd
--
-- What: ideas, idea comments/upvotes, project comments/upvotes, signals,
-- theme actions and CYNQ cards become readable by signed-in members only
-- (same rows as today for members). Zork event logs lose public read; the
-- existing signed-in rule on zork_events is unchanged.
-- Nothing becomes more visible to anyone.
--
-- Self-check: aborts unless a signed-out visitor sees no rows afterwards.
-- Rollback: supabase/sql/rollback/20261124b_restrict_signed_out_community_content_rollback.sql
-- Test: scripts/tests/run-signed-out-community-content-db.sh
-- ============================================================

begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE (mqbsjlgnsirqsmfnreqd). Nothing was changed.';
  end if;
end $guard$;

drop policy if exists "Anyone can view ideas" on public.ideas;
drop policy if exists "Signed-in members can view ideas" on public.ideas;
create policy "Signed-in members can view ideas" on public.ideas for select to authenticated using (true);

drop policy if exists "Anyone can view upvotes" on public.idea_upvotes;
drop policy if exists "Signed-in members can view idea upvotes" on public.idea_upvotes;
create policy "Signed-in members can view idea upvotes" on public.idea_upvotes for select to authenticated using (true);

drop policy if exists "Anyone can view comments" on public.idea_comments;
drop policy if exists "Signed-in members can view idea comments" on public.idea_comments;
create policy "Signed-in members can view idea comments" on public.idea_comments for select to authenticated using (true);

drop policy if exists "Allow all users to view all comments" on public.project_comments;
drop policy if exists "Signed-in members can view project comments" on public.project_comments;
create policy "Signed-in members can view project comments" on public.project_comments for select to authenticated using (true);

drop policy if exists "Allow all users to view all upvotes" on public.project_upvotes;
drop policy if exists "Signed-in members can view project upvotes" on public.project_upvotes;
create policy "Signed-in members can view project upvotes" on public.project_upvotes for select to authenticated using (true);

drop policy if exists "Public read access to signals" on public.signals;
drop policy if exists "Signed-in members can view signals" on public.signals;
create policy "Signed-in members can view signals" on public.signals for select to authenticated using (true);

drop policy if exists "Public read access to theme actions" on public.theme_actions;
drop policy if exists "Signed-in members can view theme actions" on public.theme_actions;
create policy "Signed-in members can view theme actions" on public.theme_actions for select to authenticated using (true);

drop policy if exists "Public read access to cards" on public.cynq_cards;
drop policy if exists "Signed-in members can view cards" on public.cynq_cards;
create policy "Signed-in members can view cards" on public.cynq_cards for select to authenticated using (true);

-- zork_events: no public read. "Users can manage their zork events by username" stays.
drop policy if exists "Public read access to zork events" on public.zork_events;

do $check$
declare t text; n bigint;
begin
  execute 'set local role anon';
  foreach t in array array['ideas','idea_upvotes','idea_comments','project_comments','project_upvotes',
                           'signals','theme_actions','cynq_cards','zork_events'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'Self-check failed: signed-out visitors can still read % rows of %. Nothing was changed.', n, t;
    end if;
  end loop;
  execute 'reset role';
end
$check$;

commit;
