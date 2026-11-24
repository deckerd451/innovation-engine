-- Rollback for 20261124d_zork_saves_close_public_access.sql.
-- Restores the previous access rule and grants. Re-opens direct public read/write
-- of guest saves; use only for a functional regression. Deleted legacy saves are gone.
begin;
grant all on table public.zork_saves to anon, authenticated;
create policy "Users manage their own zork saves" on public.zork_saves using ((auth.role() = 'anon'::text));
commit;
