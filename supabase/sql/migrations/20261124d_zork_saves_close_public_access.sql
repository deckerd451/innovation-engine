-- ============================================================
-- Innovation Engine: guest Zork saves, phase B (closing)
-- Project: mqbsjlgnsirqsmfnreqd
--
-- Apply ONLY after the CharlestonHacks website saves and loads through
-- zork_save()/zork_load() (phase A) and that release is live.
--
-- Removes direct table access for visitors and members (saves are reachable
-- only through the two functions, by key) and deletes saves created by the
-- old name-based method, which cannot be safely re-associated (approved:
-- old guest saves expire).
-- Rollback: supabase/sql/rollback/20261124d_zork_saves_close_public_access_rollback.sql
--   (restores access rules only; deleted legacy saves cannot be restored)
-- ============================================================

begin;

do $guard$ begin
  if to_regclass('public.community') is null or to_regclass('public.event_attendees') is not null then
    raise exception 'WRONG PROJECT: this file is for BUILDSPACE (mqbsjlgnsirqsmfnreqd). Nothing was changed.';
  end if;
  if to_regprocedure('public.zork_save(text, text)') is null then
    raise exception 'Apply 20261124c_zork_saves_private_keys.sql first. Nothing was changed.';
  end if;
end $guard$;

drop policy if exists "Users manage their own zork saves" on public.zork_saves;
revoke all on table public.zork_saves from anon, authenticated;
delete from public.zork_saves where save_key_hash is null;

do $check$ begin
  if has_table_privilege('anon', 'public.zork_saves', 'SELECT')
     or has_table_privilege('anon', 'public.zork_saves', 'UPDATE')
     or has_table_privilege('anon', 'public.zork_saves', 'DELETE') then
    raise exception 'Self-check failed: visitors still have direct access to zork_saves. Nothing was changed.';
  end if;
end $check$;

commit;
