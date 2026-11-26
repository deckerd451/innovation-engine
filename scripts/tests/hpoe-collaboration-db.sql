BEGIN;
INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-00000000000' || n)::uuid
FROM generate_series(1,5) AS n;
INSERT INTO public.community(id,user_id,name,skills,is_hidden,is_disabled)
SELECT ('10000000-0000-4000-8000-00000000000' || n)::uuid,
       ('00000000-0000-4000-8000-00000000000' || n)::uuid,
       'Synthetic ' || n, ARRAY['gardening'], n = 4, false
FROM generate_series(1,5) AS n;
INSERT INTO public.connections
SELECT '10000000-0000-4000-8000-000000000001',
       ('10000000-0000-4000-8000-00000000000' || n)::uuid,
       CASE WHEN n = 5 THEN 'pending' ELSE 'accepted' END
FROM generate_series(2,5) AS n;
INSERT INTO public.hpoe_audience SELECT id FROM auth.users WHERE id <> '00000000-0000-4000-8000-000000000005';
INSERT INTO public.hpoe_opt_in SELECT id FROM auth.users
WHERE id NOT IN ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005');

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF has_function_privilege('public.hpoe_candidates(uuid)', 'EXECUTE') OR
     has_table_privilege('public.hpoe_opt_in', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous permissions';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.hpoe_status(auth.uid()) WHERE eligible OR enrolled OR pending) THEN
    RAISE EXCEPTION 'Unaudienced account reports availability';
  END IF;
  BEGIN
    INSERT INTO public.hpoe_opt_in VALUES (auth.uid());
    RAISE EXCEPTION 'Unaudienced opt-in accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE a uuid := auth.uid(); invite uuid;
BEGIN
  IF (SELECT count(*) FROM public.hpoe_candidates(a)) <> 1 THEN
    RAISE EXCEPTION 'Unconsented, hidden or pending candidate returned';
  END IF;
  IF EXISTS (SELECT FROM public.hpoe_candidates('00000000-0000-4000-8000-000000000002')) THEN
    RAISE EXCEPTION 'Stale account request accepted';
  END IF;
  IF has_table_privilege('public.hpoe_collaboration','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Direct collaboration privileges';
  END IF;
  BEGIN
    INSERT INTO public.hpoe_opt_in VALUES ('00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Cross-account opt-in allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.hpoe_invite(a,'10000000-0000-4000-8000-000000000003','garden');
    RAISE EXCEPTION 'Unconsented invitation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  invite := public.hpoe_invite(a,'10000000-0000-4000-8000-000000000002','garden');
  PERFORM set_config('hpoe.test_invite',invite::text,true);
  BEGIN
    PERFORM public.hpoe_invite(a,'10000000-0000-4000-8000-000000000002','garden');
    RAISE EXCEPTION 'Duplicate invitation accepted';
  EXCEPTION WHEN unique_violation OR insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.hpoe_advance(a,invite,'accept');
    RAISE EXCEPTION 'Sender accepted their own invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $$
DECLARE a uuid := auth.uid(); invite uuid := current_setting('hpoe.test_invite')::uuid;
BEGIN
  IF EXISTS (SELECT FROM public.hpoe_my_collaborations(a)) THEN RAISE EXCEPTION 'Cross-account read'; END IF;
  BEGIN
    PERFORM public.hpoe_advance(a,invite,'remove');
    RAISE EXCEPTION 'Cross-account deletion';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE a uuid := auth.uid(); invite uuid := current_setting('hpoe.test_invite')::uuid;
BEGIN
  IF NOT EXISTS (SELECT FROM public.hpoe_my_collaborations(a)
                 WHERE incoming AND phase = 'invited' AND peer_profile_id IS NULL) THEN
    RAISE EXCEPTION 'Pending invitation disclosed identity or missing';
  END IF;
  BEGIN
    PERFORM public.hpoe_advance(a,invite,'confirm');
    RAISE EXCEPTION 'Early confirmation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS (SELECT FROM public.hpoe_status(a) WHERE pending) THEN
    RAISE EXCEPTION 'Private invitation indicator missing';
  END IF;
  PERFORM public.hpoe_advance(a,invite,'accept');
  IF EXISTS (SELECT FROM public.hpoe_status(a) WHERE pending) THEN
    RAISE EXCEPTION 'Private invitation indicator did not clear';
  END IF;
  IF NOT EXISTS (SELECT FROM public.hpoe_my_collaborations(a)
                 WHERE phase = 'accepted' AND peer_profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'No accepted collaboration';
  END IF;
  PERFORM public.hpoe_advance(a,invite,'start');
  PERFORM public.hpoe_advance(a,invite,'confirm');
  IF NOT EXISTS (SELECT FROM public.hpoe_my_collaborations(a) WHERE own_confirmed AND NOT jointly_confirmed) THEN
    RAISE EXCEPTION 'One member manufactured joint outcome';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE a uuid := auth.uid(); invite uuid := current_setting('hpoe.test_invite')::uuid;
BEGIN
  PERFORM public.hpoe_advance(a,invite,'confirm');
  IF NOT EXISTS (SELECT FROM public.hpoe_my_collaborations(a) WHERE jointly_confirmed) THEN
    RAISE EXCEPTION 'Joint outcome not recorded';
  END IF;
END $$;
RESET ROLE;
INSERT INTO public.hpoe_collaboration (initiator,invitee,recipe,phase,created_at)
SELECT '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002','workshop','declined',now()+make_interval(secs => n)
FROM generate_series(1,21) AS n;
SET LOCAL ROLE authenticated;
DO $$
DECLARE a uuid := auth.uid();
BEGIN
  IF (SELECT count(*) FROM public.hpoe_my_collaborations(a,0)) <> 21 OR
     EXISTS (SELECT FROM public.hpoe_my_collaborations(a,0) WHERE jointly_confirmed) OR
     NOT EXISTS (SELECT FROM public.hpoe_my_collaborations(a,20) WHERE jointly_confirmed) THEN
    RAISE EXCEPTION 'Older collaboration cannot be retrieved';
  END IF;
END $$;
RESET ROLE;
DELETE FROM public.hpoe_audience WHERE user_id = '00000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM public.hpoe_status(auth.uid()) WHERE enrolled AND NOT eligible) THEN
    RAISE EXCEPTION 'Withdrawal access lost after revocation';
  END IF;
  DELETE FROM public.hpoe_opt_in WHERE user_id = auth.uid();
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.hpoe_collaboration) THEN RAISE EXCEPTION 'Opt-out left records'; END IF;
END $$;
ROLLBACK;
