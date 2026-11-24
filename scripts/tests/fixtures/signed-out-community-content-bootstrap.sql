-- Fixture: community-content tables with the read rules live on 2026-11-24. Throwaway clusters only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
CREATE TABLE public.community (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.ideas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, created_by_auth_id uuid, created_by_community_id uuid);
CREATE TABLE public.idea_upvotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, auth_user_id uuid, community_user_id uuid);
CREATE TABLE public.idea_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, auth_user_id uuid, content text);
CREATE TABLE public.project_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, content text);
CREATE TABLE public.project_upvotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.signals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, created_by uuid);
CREATE TABLE public.theme_actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, created_by uuid);
CREATE TABLE public.cynq_cards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text);
CREATE TABLE public.zork_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text, action text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ideas','idea_upvotes','idea_comments','project_comments','project_upvotes','signals','theme_actions','cynq_cards','zork_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('INSERT INTO public.%I DEFAULT VALUES', t);
  END LOOP; END $$;
CREATE POLICY "Anyone can view ideas" ON public.ideas FOR SELECT USING (true);
CREATE POLICY "Anyone can view upvotes" ON public.idea_upvotes FOR SELECT USING (true);
CREATE POLICY "Anyone can view comments" ON public.idea_comments FOR SELECT USING (true);
CREATE POLICY "Allow all users to view all comments" ON public.project_comments FOR SELECT USING (true);
CREATE POLICY "Allow all users to view all upvotes" ON public.project_upvotes FOR SELECT USING (true);
CREATE POLICY "Public read access to signals" ON public.signals FOR SELECT USING (true);
CREATE POLICY "Public read access to theme actions" ON public.theme_actions FOR SELECT USING (true);
CREATE POLICY "Public read access to cards" ON public.cynq_cards FOR SELECT USING (true);
CREATE POLICY "Public read access to zork events" ON public.zork_events FOR SELECT USING (true);
CREATE POLICY "Users can manage their zork events by username" ON public.zork_events TO authenticated
  USING (username IN (SELECT zork_events.username FROM profiles WHERE profiles.id = auth.uid()));
