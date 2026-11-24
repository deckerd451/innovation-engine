-- Rollback for 20261124c_zork_saves_private_keys.sql (run phase B rollback first if B was applied).
begin;
drop function if exists public.zork_save(text, text);
drop function if exists public.zork_load(text);
delete from public.zork_saves where save_key_hash is not null;
drop index if exists public.zork_saves_save_key_hash_idx;
alter table public.zork_saves drop column if exists save_key_hash;
commit;
