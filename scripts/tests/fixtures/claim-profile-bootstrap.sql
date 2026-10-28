-- DISPOSABLE LOCAL DATABASE ONLY. Never run this against a Supabase project.
-- The minimum claim_community_profile_by_email needs: Supabase's roles and
-- auth.uid(), auth.users, and the community columns it reads and writes.
-- Used by run-db-tests.sh with scripts/tests/claim-profile-db.sql.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
CREATE TABLE public.community (
  id uuid PRIMARY KEY,
  user_id uuid,
  email text,
  name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
