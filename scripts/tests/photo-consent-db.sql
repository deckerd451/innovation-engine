-- Run after the photo consent migration. All test changes are rolled back.
BEGIN;
CREATE TEMP TABLE photo_test_users AS
SELECT id, user_id FROM public.community WHERE user_id IS NOT NULL ORDER BY id LIMIT 2;
DO $$ BEGIN
  IF (SELECT count(*) FROM photo_test_users) < 2 THEN RAISE EXCEPTION 'Need two test identities'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM photo_test_users ORDER BY id LIMIT 1),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r := public.set_my_photo_visibility(true);
 IF (r->>'photo_visible')::boolean IS DISTINCT FROM true OR r->>'photo_consent_at' IS NULL THEN
   RAISE EXCEPTION 'Owner opt-in failed';
 END IF;
 r := public.set_my_photo_visibility(false);
 IF (r->>'photo_visible')::boolean IS DISTINCT FROM false OR r->>'photo_consent_at' IS NOT NULL THEN
   RAISE EXCEPTION 'Owner opt-out failed';
 END IF;
END $$;
RESET ROLE;
-- Exercise the trigger with database-owner privileges so RLS cannot hide a
-- failure in the consent guard itself. JWT still belongs to the first owner.
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  UPDATE public.community SET photo_visible=true
  WHERE id=(SELECT id FROM photo_test_users ORDER BY id OFFSET 1 LIMIT 1);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-owner consent was accepted'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  PERFORM public.set_my_photo_visibility(true);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous RPC accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Owner opt-in/out, non-owner rejection, anonymous rejection passed; all changes rolled back' AS result;
