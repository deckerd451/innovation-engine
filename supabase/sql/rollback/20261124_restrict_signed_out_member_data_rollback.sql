-- Rollback for 20261124_restrict_signed_out_member_data.sql
-- Restores the previous signed-out read rules exactly. Re-exposes member data;
-- use only to undo a functional regression.
begin;
drop policy if exists "Signed-in members can view endorsements" on public.endorsements;
create policy "Anyone can view endorsements" on public.endorsements for select using (true);
drop policy if exists "Signed-in members can view project members" on public.project_members;
create policy "Anyone can view project members" on public.project_members for select using (true);
create policy "Project members are viewable by everyone" on public.project_members for select using (true);
drop policy if exists "Signed-in members can view open/active projects" on public.projects;
create policy "Anyone can view open/active projects" on public.projects for select
  using (status = any (array['open', 'active', 'completed']));
drop policy if exists "Signed-in members can view organization followers" on public.organization_followers;
create policy "Users can view followers" on public.organization_followers for select using (true);
drop policy if exists "Signed-in members can view team members" on public.team_members;
create policy "Anyone can view team members" on public.team_members for select using (true);
drop policy if exists "Signed-in members can view active organization members" on public.organization_members;
drop policy if exists "Organization admins can view their organization's members" on public.organization_members;
create policy "Organization members are viewable by everyone" on public.organization_members for select using (status = 'active');
create policy allow_select on public.organization_members for select using (true);
commit;
