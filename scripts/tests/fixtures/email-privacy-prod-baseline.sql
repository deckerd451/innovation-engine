-- DISPOSABLE LOCAL DATABASE ONLY. Never run this against a Supabase project.
--
-- A model of production's member-email surface, for the email-privacy
-- migrations (supabase/sql/migrations/20261029_member_email_privacy_prepare.sql
-- and 20261029b_member_email_privacy_lock.sql). Synthetic schema only.
--
-- What is copied from production, or from files production was verified to
-- match:
--   - Table grants: anon and authenticated hold every privilege on
--     community (read-only catalog check, 2026-10-28).
--   - get_start_sequence_data(uuid): applied from
--     supabase/sql/functions/get_start_sequence_data.sql (md5(prosrc)
--     97558dd2...). Production's copy (e23d29fa..., 2026-10-29) is the same
--     text with trailing spaces removed from each line: the same logic, and
--     the same single 'email', c.email, expression part A rewrites.
--   - get_community_id_from_auth(): the production definition, as in
--     notification-connection-prod-baseline.sql.
--   - The claim function: the model of the deployed version
--     (claim-profile-production-model.sql; production md5 aa77d108...).
-- What is modelled, because production's text has not been read:
--   - The community SELECT policy: visible profiles, the member's own, and
--     admins (its behaviour was verified in production; its text was not).
--   - community_with_last_seen and admin_ideas_overview: security_invoker
--     views that include email (as production's do), with plausible bodies.
--     The migration rewrites whatever production's bodies are, and stops if
--     it can't do so exactly.
--   - get_project_interest_requests(uuid): applied from
--     20260822c_project_interest_followups.sql; production's copy is checked
--     before rollout (docs/SECURITY_MEMBER_EMAIL_PRIVACY.md, preflight).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.email', true), '') $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.community (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  email text,
  bio text,
  skills text,
  interests text[],
  availability text,
  role text,
  user_role text DEFAULT 'Member',
  status text,
  image_url text,
  image_path text,
  avatar_storage_path text,
  photo_visible boolean DEFAULT false,
  photo_consent_at timestamptz,
  is_hidden boolean DEFAULT false,
  is_disabled boolean DEFAULT false,
  connection_count integer DEFAULT 0,
  onboarding_completed boolean DEFAULT false,
  profile_completed boolean DEFAULT false,
  xp integer DEFAULT 0,
  level integer DEFAULT 1,
  login_streak integer DEFAULT 0,
  last_login timestamptz,
  projects_created integer DEFAULT 0,
  projects_joined integer DEFAULT 0,
  endorsements_given integer DEFAULT 0,
  endorsements_received integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.community ENABLE ROW LEVEL SECURITY;

-- Model of production's hidden-profile rule (behaviour verified 2026-10-28):
-- strangers see visible profiles; members see their own; admins see all.
CREATE OR REPLACE FUNCTION public.fixture_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM community WHERE user_id = auth.uid() AND user_role = 'Admin')
$$;
CREATE POLICY "community visible, own or admin" ON public.community FOR SELECT
  USING (is_hidden IS NOT TRUE OR user_id = auth.uid() OR public.fixture_is_admin());
CREATE POLICY "community insert own" ON public.community FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "community admin insert" ON public.community FOR INSERT TO authenticated
  WITH CHECK (public.fixture_is_admin());
CREATE POLICY "community update own or admin" ON public.community FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.fixture_is_admin())
  WITH CHECK (user_id = auth.uid() OR public.fixture_is_admin());

-- Production table grants: anon and authenticated hold every privilege.
GRANT ALL ON public.community TO anon, authenticated, service_role;

-- Presence, and the two views that include email.
CREATE TABLE public.presence_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  last_seen timestamptz,
  expires_at timestamptz
);
GRANT ALL ON public.presence_sessions TO anon, authenticated, service_role;

CREATE VIEW public.community_with_last_seen WITH (security_invoker = true) AS
SELECT c.id, c.user_id, c.name, c.email, c.bio, c.skills, c.availability, c.user_role,
       c.image_url, c.connection_count, c.projects_created,
       ps.last_seen AS presence_last_seen, ps.expires_at AS presence_expires_at
FROM public.community c
LEFT JOIN LATERAL (
  SELECT s.last_seen, s.expires_at FROM public.presence_sessions s
  WHERE s.user_id = c.id ORDER BY s.last_seen DESC NULLS LAST LIMIT 1
) ps ON true;
GRANT ALL ON public.community_with_last_seen TO anon, authenticated, service_role;

CREATE TABLE public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON public.ideas TO anon, authenticated, service_role;

CREATE VIEW public.admin_ideas_overview WITH (security_invoker = true) AS
SELECT i.id, i.title, i.created_at, community.name AS creator_name, community.email AS creator_email
FROM public.ideas i
LEFT JOIN public.community ON community.id = i.creator_id;
GRANT ALL ON public.admin_ideas_overview TO anon, authenticated, service_role;

-- Tables get_start_sequence_data and get_project_interest_requests read
-- (only the columns they use).
CREATE TABLE public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid, to_user_id uuid, status text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_1_id uuid, participant_2_id uuid);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid, sender_id uuid, read boolean DEFAULT false, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid, title text, status text DEFAULT 'open', required_skills text[]
);
CREATE TABLE public.project_bids (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, user_id uuid, status text);
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.community(id) ON DELETE CASCADE,
  role text, joined_at timestamptz DEFAULT now(), left_at timestamptz
);
CREATE TABLE public.theme_circles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, expires_at timestamptz);
CREATE TABLE public.theme_participants (theme_id uuid, community_id uuid, joined_at timestamptz DEFAULT now());
CREATE TABLE public.opportunities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
CREATE TABLE public.activity_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_user_id uuid, created_at timestamptz DEFAULT now());
GRANT ALL ON public.connections, public.conversations, public.messages, public.projects, public.project_bids,
  public.project_members, public.theme_circles, public.theme_participants, public.opportunities, public.activity_log
  TO anon, authenticated, service_role;

-- Identity helper (production definition): matches by email, as the owner.
CREATE OR REPLACE FUNCTION public.get_community_id_from_auth()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT id
  FROM community
  WHERE email = auth.email()
  LIMIT 1;
$function$;
