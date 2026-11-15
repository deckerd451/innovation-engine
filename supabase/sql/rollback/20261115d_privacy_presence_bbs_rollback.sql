-- ============================================================
-- BUILDSPACE emergency rollback for 20261115d_privacy_presence_bbs
-- Use ONLY if a signed-out page needs presence or BBS data.
-- Restores the previous public read rules.
-- ============================================================
begin;
drop policy if exists "Signed-in members can view presence sessions" on public.presence_sessions;
create policy "Users can view all presence sessions" on public.presence_sessions for select using (true);

drop policy if exists bbs_messages_member_read on public.bbs_messages;
create policy bbs_messages_public_read on public.bbs_messages for select to authenticated, anon using (true);

drop policy if exists "Signed-in members can see who is online" on public.bbs_online;
create policy "Public read access to online users" on public.bbs_online for select using (true);

drop policy if exists "Signed-in members can see BBS presence" on public.bbs_presence;
create policy "Public read access to presence" on public.bbs_presence for select using (true);
commit;
