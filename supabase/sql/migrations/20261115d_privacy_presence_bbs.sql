-- ============================================================
-- BUILDSPACE: members-only presence and BBS
-- Project: mqbsjlgnsirqsmfnreqd
--
-- presence_sessions (who is active, where, when), bbs_messages (chat
-- with real names), bbs_online and bbs_presence could be read by anyone
-- on the internet without signing in. Only the signed-in dashboard uses
-- them, so reading is now limited to signed-in members. Writing rules
-- are unchanged.
-- ============================================================
begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE (mqbsjlgnsirqsmfnreqd). Nothing was changed.';
  end if;
end $guard$;

drop policy if exists "Users can view all presence sessions" on public.presence_sessions;
drop policy if exists "Signed-in members can view presence sessions" on public.presence_sessions;
create policy "Signed-in members can view presence sessions"
  on public.presence_sessions for select to authenticated using (true);

drop policy if exists bbs_messages_public_read on public.bbs_messages;
drop policy if exists bbs_messages_member_read on public.bbs_messages;
create policy bbs_messages_member_read
  on public.bbs_messages for select to authenticated using (true);

drop policy if exists "Public read access to online users" on public.bbs_online;
drop policy if exists "Signed-in members can see who is online" on public.bbs_online;
create policy "Signed-in members can see who is online"
  on public.bbs_online for select to authenticated using (true);

drop policy if exists "Public read access to presence" on public.bbs_presence;
drop policy if exists "Signed-in members can see BBS presence" on public.bbs_presence;
create policy "Signed-in members can see BBS presence"
  on public.bbs_presence for select to authenticated using (true);

commit;
