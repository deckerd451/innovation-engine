-- DISPOSABLE LOCAL DATABASE ONLY. Creates the minimum Supabase surface
-- (authenticated role, auth.uid(), community/projects/project_members) that
-- the repository migrations expect, so RLS can be exercised offline.
-- Never run this against a Supabase project.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO service_role;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TABLE IF NOT EXISTS public.community (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, name text, skills text[], interests text[]);
CREATE TABLE IF NOT EXISTS public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, description text, status text DEFAULT 'active', creator_id uuid REFERENCES public.community(id), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.project_members (project_id uuid REFERENCES public.projects(id), user_id uuid REFERENCES public.community(id), role text);
GRANT SELECT ON public.community, public.projects, public.project_members TO authenticated;
-- Supabase grants new public tables and functions to anon/authenticated by
-- default; mirror that so migrations must revoke or rely on RLS explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
