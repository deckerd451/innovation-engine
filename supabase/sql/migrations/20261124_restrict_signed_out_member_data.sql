-- ============================================================
-- BUILDSPACE / Innovation Engine: signed-out access to member data
-- Project: mqbsjlgnsirqsmfnreqd
--
-- What: limits read access on member-related tables (endorsements,
-- project_members, projects, organization_followers, team_members,
-- organization_members) to signed-in members. Signed-in access is unchanged;
-- organization owners/admins explicitly keep seeing their organization's
-- pending membership requests.
--
-- Not changed: theme_participants (live policy already scoped to the member's
-- own circles; must not be widened), organizations, theme_circles.
--
-- Self-check: the transaction aborts unless a signed-out visitor sees no rows
-- in the affected tables afterwards.
-- Rollback: supabase/sql/rollback/20261124_restrict_signed_out_member_data_rollback.sql
-- Test: scripts/tests/run-signed-out-member-data-db.sh
-- ============================================================

begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE (mqbsjlgnsirqsmfnreqd). Nothing was changed.';
  end if;
end $guard$;

-- endorsements
drop policy if exists "Anyone can view endorsements" on public.endorsements;
drop policy if exists "Signed-in members can view endorsements" on public.endorsements;
create policy "Signed-in members can view endorsements"
  on public.endorsements for select to authenticated using (true);

-- project_members
drop policy if exists "Anyone can view project members" on public.project_members;
drop policy if exists "Project members are viewable by everyone" on public.project_members;
drop policy if exists "Signed-in members can view project members" on public.project_members;
create policy "Signed-in members can view project members"
  on public.project_members for select to authenticated using (true);

-- projects (projects_select_authenticated already lets members read all rows;
-- this keeps at least the previously public set even if that policy is absent)
drop policy if exists "Anyone can view open/active projects" on public.projects;
drop policy if exists "Signed-in members can view open/active projects" on public.projects;
create policy "Signed-in members can view open/active projects"
  on public.projects for select to authenticated
  using (status = any (array['open', 'active', 'completed']));

-- organization_followers
drop policy if exists "Users can view followers" on public.organization_followers;
drop policy if exists "Signed-in members can view organization followers" on public.organization_followers;
create policy "Signed-in members can view organization followers"
  on public.organization_followers for select to authenticated using (true);

-- team_members (idea teams: auth ids and join messages)
drop policy if exists "Anyone can view team members" on public.team_members;
drop policy if exists "Signed-in members can view team members" on public.team_members;
create policy "Signed-in members can view team members"
  on public.team_members for select to authenticated using (true);

-- organization_members
drop policy if exists allow_select on public.organization_members;
drop policy if exists "Organization members are viewable by everyone" on public.organization_members;
drop policy if exists "Signed-in members can view active organization members" on public.organization_members;
create policy "Signed-in members can view active organization members"
  on public.organization_members for select to authenticated
  using (status = 'active');
drop policy if exists "Organization admins can view their organization's members" on public.organization_members;
create policy "Organization admins can view their organization's members"
  on public.organization_members for select to authenticated
  using (public.authz_org_role(organization_id) = any (array['owner', 'admin']));
-- org_members_select_safe (members see their own rows) is unchanged.

-- Self-check (runs as a signed-out visitor; aborts everything if it fails)
do $check$
declare t text; n bigint;
begin
  execute 'set local role anon';
  foreach t in array array['endorsements','project_members','projects','organization_followers',
                           'team_members','organization_members'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'Self-check failed: signed-out visitors can still read % rows of %. Nothing was changed.', n, t;
    end if;
  end loop;
  execute 'reset role';
end
$check$;

commit;
