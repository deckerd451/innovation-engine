-- ============================================================
-- BUILDSPACE / Innovation Engine: signed-out access to member data
-- Project: mqbsjlgnsirqsmfnreqd
--
-- Why: signed-out visitors (the public API key) can still read rows that
-- describe members: who endorsed whom for what, who works on which project,
-- every open project's details, organization members' titles/bios/permissions,
-- who follows which organization, and idea team members (including their
-- join messages and sign-in account ids). Verified live 2026-11-24 with
-- one-row, id-only requests. Members never chose to make these public.
--
-- What this does: the same rows stay readable to signed-in members, exactly
-- as today. Only signed-out access is removed.
--   * endorsements, project_members, projects, organization_followers,
--     team_members: public read -> signed-in read
--   * organization_members: removes "allow_select" (USING true for everyone),
--     which overrode the narrower rules. Signed-in members keep reading active
--     members; members keep seeing their own rows; organization owners/admins
--     explicitly keep seeing pending requests for their own organizations
--     (previously they only could because of allow_select).
--
-- NOT changed: theme_participants (live policy, verified 2026-11-24, already
-- limits members to their own circles; this migration must not widen it),
-- organizations and theme_circles (organization-level public
-- information), zork_saves (guest game saves, needs an app change; see
-- docs/community-capability-profile in the CharlestonHacks repo).
--
-- Visible effect for signed-out visitors: organization pages no longer list
-- members or follower rows; project lists are empty until sign-in.
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

commit;
