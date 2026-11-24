-- Fixture: production-shaped tables and the signed-out read rules that were
-- live on 2026-11-24 (schema dump + live id-only checks). Throwaway clusters only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;

CREATE TABLE public.community (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, name text NOT NULL, email text);
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.community(id),
  title text, description text, budget text, status text DEFAULT 'open');
CREATE TABLE public.project_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES public.projects(id),
  user_id uuid NOT NULL REFERENCES public.community(id), role text DEFAULT 'member');
CREATE TABLE public.endorsements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), endorser_community_id uuid, endorsed_community_id uuid, skill text NOT NULL);
CREATE TABLE public.theme_circles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, status text DEFAULT 'active');
CREATE TABLE public.theme_participants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), theme_id uuid REFERENCES public.theme_circles(id), community_id uuid REFERENCES public.community(id));
CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, status text DEFAULT 'active');
CREATE TABLE public.organization_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES public.organizations(id),
  community_id uuid REFERENCES public.community(id), role text DEFAULT 'member', title text, bio text, status text DEFAULT 'active');
CREATE TABLE public.organization_followers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES public.organizations(id), community_id uuid REFERENCES public.community(id));
CREATE TABLE public.team_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, auth_user_id uuid, community_user_id uuid, message text);

CREATE FUNCTION public.authz_current_member_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT c.id FROM community c WHERE c.user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.authz_org_role(p_organization_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT m.role FROM organization_members m
  WHERE m.organization_id = p_organization_id AND m.community_id = public.authz_current_member_id() AND m.status = 'active'
  ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC LIMIT 1 $$;

-- Supabase default: table privileges for API roles; RLS decides rows.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
REVOKE SELECT ON public.community FROM anon, authenticated;
GRANT SELECT (id, user_id, name) ON public.community TO anon, authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['community','projects','project_members','endorsements','theme_circles','theme_participants',
                           'organizations','organization_members','organization_followers','team_members'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP; END $$;

CREATE POLICY "Authenticated users can view profiles and presence" ON public.community FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can view open/active projects" ON public.projects FOR SELECT USING (status = ANY (ARRAY['open','active','completed']));
CREATE POLICY projects_select_authenticated ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can view project members" ON public.project_members FOR SELECT USING (true);
CREATE POLICY "Project members are viewable by everyone" ON public.project_members FOR SELECT USING (true);
CREATE POLICY "Anyone can view endorsements" ON public.endorsements FOR SELECT USING (true);
CREATE POLICY "Public read access to active themes" ON public.theme_circles FOR SELECT USING (status = 'active');
ALTER TABLE public.theme_circles ADD COLUMN created_by uuid;
-- theme_participants as live (2026-11-24); _my_theme_ids() copied from production.
CREATE FUNCTION public._my_theme_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select tp.theme_id from theme_participants tp
   where tp.community_id in (select id from community where user_id = auth.uid())
  union
  select tc.id from theme_circles tc
   where tc.created_by in (select id from community where user_id = auth.uid()) $$;
CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT false $$;
CREATE POLICY "Members can see who is in their circles" ON public.theme_participants FOR SELECT TO authenticated
  USING ((theme_id IN (SELECT _my_theme_ids())) OR is_admin(auth.uid()));
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING (status = 'active');
CREATE POLICY "Organization members are viewable by everyone" ON public.organization_members FOR SELECT USING (status = 'active');
CREATE POLICY allow_select ON public.organization_members FOR SELECT USING (true);
CREATE POLICY org_members_select_safe ON public.organization_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community c WHERE c.id = organization_members.community_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can view followers" ON public.organization_followers FOR SELECT USING (true);
CREATE POLICY "Anyone can view team members" ON public.team_members FOR SELECT USING (true);

-- Seed: owner Olive (org admin), member Max, applicant Pat (pending), outsider Rae.
INSERT INTO public.community (id, user_id, name, email) VALUES
 ('00000000-0000-0000-0000-0000000000a1','a1000000-0000-0000-0000-000000000001','Olive','olive@example.com'),
 ('00000000-0000-0000-0000-0000000000a2','a1000000-0000-0000-0000-000000000002','Max','max@example.com'),
 ('00000000-0000-0000-0000-0000000000a3','a1000000-0000-0000-0000-000000000003','Pat','pat@example.com'),
 ('00000000-0000-0000-0000-0000000000a4','a1000000-0000-0000-0000-000000000004','Rae','rae@example.com');
INSERT INTO public.organizations (id, name, slug) VALUES ('0a000000-0000-0000-0000-000000000001','Lowcountry Labs','lowcountry-labs');
INSERT INTO public.organization_members (organization_id, community_id, role, title, bio, status) VALUES
 ('0a000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','owner','Founder','Olive bio','active'),
 ('0a000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2','member','Engineer','Max bio','active'),
 ('0a000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','member',null,'Pat pending bio','pending');
INSERT INTO public.organization_followers (organization_id, community_id) VALUES ('0a000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4');
INSERT INTO public.projects (id, creator_id, title, budget, status) VALUES ('0b000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2','Flood sensors','$500','active');
INSERT INTO public.project_members (project_id, user_id) VALUES ('0b000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a4');
INSERT INTO public.endorsements (endorser_community_id, endorsed_community_id, skill) VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Python');
INSERT INTO public.theme_circles (id, title) VALUES ('0c000000-0000-0000-0000-000000000001','AI');
INSERT INTO public.theme_participants (theme_id, community_id) VALUES ('0c000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.team_members (auth_user_id, community_user_id, message) VALUES ('a1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000a4','Private join note');
