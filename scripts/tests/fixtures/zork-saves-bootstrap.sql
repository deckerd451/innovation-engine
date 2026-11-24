-- Fixture: zork_saves as live on 2026-11-24. Throwaway clusters only.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
CREATE TABLE public.community (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.zork_saves (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, username text NOT NULL UNIQUE,
  save_data text NOT NULL, updated_at timestamptz DEFAULT now());
GRANT ALL ON TABLE public.zork_saves TO anon, authenticated;
ALTER TABLE public.zork_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own zork saves" ON public.zork_saves USING ((auth.role() = 'anon'::text));
INSERT INTO public.zork_saves (username, save_data) VALUES ('Guest1234', 'bGVnYWN5');
