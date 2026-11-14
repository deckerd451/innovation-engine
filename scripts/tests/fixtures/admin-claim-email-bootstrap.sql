-- After site-visits-bootstrap.sql, only in a disposable database.
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.community ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ADD COLUMN name text, ADD COLUMN email text, ADD COLUMN is_disabled boolean DEFAULT false;
INSERT INTO public.community(id,user_id,user_role,email) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Admin','admin@example.test'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Member','member@example.test');
INSERT INTO public.community(id,user_role,email) VALUES
 ('20000000-0000-4000-8000-000000000001','Member','eligible@example.test'),
 ('20000000-0000-4000-8000-000000000002','Member',NULL),
 ('20000000-0000-4000-8000-000000000003','Member','disabled@example.test'),
 ('20000000-0000-4000-8000-000000000004','Member','duplicate@example.test'),
 ('20000000-0000-4000-8000-000000000005','Member','DUPLICATE@example.test');
UPDATE public.community SET is_disabled=true WHERE email='disabled@example.test';
