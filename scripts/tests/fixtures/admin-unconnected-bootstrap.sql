-- Applied after site-visits-bootstrap.sql in a disposable database only.
ALTER TABLE public.community ADD COLUMN id uuid DEFAULT gen_random_uuid(),
 ADD COLUMN name text, ADD COLUMN skills text, ADD COLUMN created_at timestamptz,
 ADD COLUMN connection_count integer, ADD COLUMN is_hidden boolean DEFAULT false,
 ADD COLUMN is_disabled boolean DEFAULT false, ADD COLUMN email text;
ALTER TABLE public.community ENABLE ROW LEVEL SECURITY;
INSERT INTO public.community(user_id,user_role,connection_count) VALUES
 ('00000000-0000-4000-8000-000000000001','Admin',1),
 ('00000000-0000-4000-8000-000000000002','Member',2);
INSERT INTO public.community(id,name,skills,created_at,connection_count,is_hidden,is_disabled,email)
 SELECT md5(i::text)::uuid, 'Person '||i, 'Design', '2026-01-01'::timestamptz,
 CASE WHEN i%2=0 THEN 0 ELSE NULL END, i%3=0, i%4=0, 'private@example.test'
 FROM generate_series(1,72) i;
INSERT INTO public.community(name,connection_count) VALUES ('Negative counter',-1),('Connected',4);
