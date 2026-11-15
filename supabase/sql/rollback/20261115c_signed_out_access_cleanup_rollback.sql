-- ============================================================
-- BUILDSPACE: emergency rollback for the signed-out access cleanup.
-- Use ONLY if a signed-out page breaks. Better: tell Claude which
-- function broke and re-open just that one, e.g.
--   grant execute on function public.<name>(<args>) to anon;
-- This full rollback restores Supabase's previous defaults for FUTURE
-- functions only. It does not re-open existing functions (that would
-- re-open the holes fixed today).
-- ============================================================
begin;
alter default privileges for role postgres grant execute on functions to public;
alter default privileges for role postgres in schema public grant execute on functions to anon;
commit;
