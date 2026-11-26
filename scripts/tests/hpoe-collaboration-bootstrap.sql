CREATE TABLE auth.users (id uuid PRIMARY KEY);
ALTER TABLE public.community ADD COLUMN is_hidden boolean, ADD COLUMN is_disabled boolean;
CREATE TABLE public.connections (from_user_id uuid, to_user_id uuid, status text);
