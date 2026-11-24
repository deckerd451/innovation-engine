-- Fixture: zork_events rules as live on 2026-11-24 (after 20261124b). Throwaway clusters only.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE public.community (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.zork_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text, event text);
GRANT ALL ON public.zork_events TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated;
ALTER TABLE public.zork_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage zork events" ON public.zork_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage their zork events by username" ON public.zork_events FOR ALL TO authenticated
  USING ((username IN (SELECT zork_events.username FROM profiles WHERE (profiles.id = auth.uid()))))
  WITH CHECK ((username IN (SELECT zork_events.username FROM profiles WHERE (profiles.id = auth.uid()))));
INSERT INTO public.profiles VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.zork_events (username, event) VALUES ('someone-else', 'x');
