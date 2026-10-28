-- DISPOSABLE LOCAL DATABASE ONLY. Never run this against a Supabase project.
-- A model of claim_community_profile_by_email AS DEPLOYED (production
-- definition read 2026-10-28: md5(prosrc) aa77d10868ae792a041ec395a0e894f6,
-- returns uuid, SECURITY DEFINER, search_path public, executable by anon and
-- authenticated). Written from that definition's reported behaviour, not
-- copied from it, so its fingerprint differs; the repository's
-- sql/claim_community_profile_by_email.sql is an older, different version
-- (it refuses duplicates and already-linked callers).
--   - Rejects unauthenticated calls.
--   - Returns the caller's already-linked profile.
--   - Otherwise picks one unclaimed profile whose lower(trim(email))
--     matches: profile_completed DESC, onboarding_completed DESC,
--     created_at ASC. Other matches are left as they were.
--   - Links it only if user_id IS NULL, and returns its id whether or not
--     the update linked it.
--   - Returns NULL when nothing matches.
-- Used by run-db-tests.sh with scripts/tests/claim-profile-db.sql.
CREATE OR REPLACE FUNCTION public.claim_community_profile_by_email()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_id FROM community WHERE user_id = v_uid LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT id INTO v_id
  FROM community
  WHERE user_id IS NULL
    AND lower(trim(email)) = v_email
  ORDER BY profile_completed DESC, onboarding_completed DESC, created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE community
  SET user_id = v_uid, updated_at = now()
  WHERE id = v_id AND user_id IS NULL;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_community_profile_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_community_profile_by_email() TO anon, authenticated;
