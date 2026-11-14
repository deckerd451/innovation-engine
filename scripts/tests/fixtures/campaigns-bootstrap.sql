-- Only after site-visits-bootstrap and admin-claim-email-bootstrap in a disposable DB.
ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN email_confirmed_at timestamptz;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-4000-8000-000000000001','admin@example.test',now()),
 ('00000000-0000-4000-8000-000000000002','member@example.test',now()),
 ('00000000-0000-4000-8000-000000000003','other-admin@example.test',now());
INSERT INTO public.community(id,user_id,user_role,email) VALUES('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','Admin','other-admin@example.test');
ALTER TABLE public.community ADD COLUMN last_seen_at timestamptz, ADD COLUMN is_hidden boolean DEFAULT false, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN skills text;
UPDATE public.community SET name='Organizer' WHERE user_role='Admin';
UPDATE public.community SET last_seen_at=now(),skills='Web, Python' WHERE user_id='00000000-0000-4000-8000-000000000002';
INSERT INTO public.community(id,name,email,user_role,user_id,last_seen_at,skills)
 SELECT ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Participant '||i,'person'||i||'@example.test','Member',NULL,now(),'Web, Python' FROM generate_series(1,9) i;
UPDATE public.community SET name='Claim Email Test' WHERE id='30000000-0000-4000-8000-000000000009';
CREATE TABLE public.projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,is_public boolean,is_hidden boolean DEFAULT false);
INSERT INTO public.projects(status,is_public,is_hidden) VALUES('active',true,false),('active',false,false),('archived',true,false);
CREATE TABLE public.opportunities(status text,is_public boolean,application_deadline timestamptz);
INSERT INTO public.opportunities VALUES('open',true,NULL),('open',false,NULL),('open',true,now()-interval '1 day');
CREATE TABLE public.connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),from_user_id uuid,to_user_id uuid,status text,created_at timestamptz DEFAULT now());
INSERT INTO public.connections(from_user_id,to_user_id,status) SELECT '30000000-0000-4000-8000-000000000001',('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'accepted' FROM generate_series(2,7) i;
