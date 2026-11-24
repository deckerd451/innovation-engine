-- Rollback for 20261124e_zork_events_service_only.sql. Restores the previous rule exactly.
begin;
create policy "Users can manage their zork events by username" on public.zork_events
  for all to authenticated
  using ((username in (select zork_events.username from profiles where (profiles.id = auth.uid()))))
  with check ((username in (select zork_events.username from profiles where (profiles.id = auth.uid()))));
commit;
