-- Rollback for 20261124b_restrict_signed_out_community_content.sql
-- Restores the previous public read rules exactly. Use only for a functional regression.
begin;
drop policy if exists "Signed-in members can view ideas" on public.ideas;
create policy "Anyone can view ideas" on public.ideas for select using (true);
drop policy if exists "Signed-in members can view idea upvotes" on public.idea_upvotes;
create policy "Anyone can view upvotes" on public.idea_upvotes for select using (true);
drop policy if exists "Signed-in members can view idea comments" on public.idea_comments;
create policy "Anyone can view comments" on public.idea_comments for select using (true);
drop policy if exists "Signed-in members can view project comments" on public.project_comments;
create policy "Allow all users to view all comments" on public.project_comments for select using (true);
drop policy if exists "Signed-in members can view project upvotes" on public.project_upvotes;
create policy "Allow all users to view all upvotes" on public.project_upvotes for select using (true);
drop policy if exists "Signed-in members can view signals" on public.signals;
create policy "Public read access to signals" on public.signals for select using (true);
drop policy if exists "Signed-in members can view theme actions" on public.theme_actions;
create policy "Public read access to theme actions" on public.theme_actions for select using (true);
drop policy if exists "Signed-in members can view cards" on public.cynq_cards;
create policy "Public read access to cards" on public.cynq_cards for select using (true);
create policy "Public read access to zork events" on public.zork_events for select using (true);
commit;
