-- Signed-out visitors can't read member data; signed-in behaviour is unchanged.
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; END $$;

-- Visitor (anon)
SET ROLE anon;
SELECT pg_temp.ok((SELECT count(*) FROM public.endorsements) = 0, 'visitor: no endorsements');
SELECT pg_temp.ok((SELECT count(*) FROM public.project_members) = 0, 'visitor: no project members');
SELECT pg_temp.ok((SELECT count(*) FROM public.projects) = 0, 'visitor: no projects');
SELECT pg_temp.ok((SELECT count(*) FROM public.theme_participants) = 0, 'visitor: no theme participants');
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_members) = 0, 'visitor: no organization members');
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_followers) = 0, 'visitor: no organization followers');
SELECT pg_temp.ok((SELECT count(*) FROM public.team_members) = 0, 'visitor: no team members or join messages');
SELECT pg_temp.ok((SELECT count(*) FROM public.organizations) = 1, 'visitor: organizations still public');
SELECT pg_temp.ok((SELECT count(*) FROM public.theme_circles) = 1, 'visitor: active themes still public');
RESET ROLE;

-- Ordinary signed-in member (Max): same reads as before the change
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', false);
SELECT pg_temp.ok((SELECT count(*) FROM public.endorsements) = 1, 'member: endorsements');
SELECT pg_temp.ok((SELECT count(*) FROM public.project_members) = 1, 'member: project members');
SELECT pg_temp.ok((SELECT count(*) FROM public.projects) = 1, 'member: projects');
SELECT pg_temp.ok((SELECT count(*) FROM public.theme_participants) = 1, 'member: theme participants');
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_followers) = 1, 'member: organization followers');
SELECT pg_temp.ok((SELECT count(*) FROM public.team_members) = 1, 'member: team members');
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_members WHERE status = 'active') = 2, 'member: active organization members');
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_members WHERE status = 'pending') = 0, 'member: cannot see other people''s pending requests');

-- Applicant (Pat) still sees their own pending request
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', false);
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_members WHERE status = 'pending') = 1, 'applicant: own pending request');

-- Organization owner (Olive) still sees pending requests to approve
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', false);
SELECT pg_temp.ok((SELECT count(*) FROM public.organization_members) = 3, 'org owner: all members including pending');
RESET ROLE;
\echo '   ok'
