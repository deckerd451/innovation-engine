-- Assistance journey permission boundary (Scenario E / Gate 5 / Gate 6).
-- Run against a disposable local database after:
--   scripts/tests/fixtures/supabase-minimal-bootstrap.sql
--   supabase/sql/tables/PROJECT_TASKS_SCHEMA.sql
--   supabase/sql/migrations/20261011_capability_memory.sql
-- All test rows are rolled back.
\set ON_ERROR_STOP on
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
INSERT INTO public.community (id, user_id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Member A'),
  ('22222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 'Member B');
INSERT INTO public.projects (id, title, creator_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A project', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B private project', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.project_members VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'pending');
INSERT INTO public.project_tasks (id, project_id, title) VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'select speaker(s)'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Choose keynote speakers for investor day');
INSERT INTO public.capability_packages (id, project_id, creator_id, title, goal, steps, permission_mode) VALUES
  ('99999999-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Keynote shortlist', 'Pick keynote speakers', '["x"]', 'private'),
  ('99999999-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Recruit speakers via sponsors', 'Confirm hackathon speakers', '["x"]', 'community');

-- Act as member A (pending on B's project, so not part of B's team).
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ok boolean; BEGIN
  SELECT count(*) INTO n FROM public.capability_packages WHERE id = '99999999-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'private package of another member is visible'; END IF;
  SELECT count(*) INTO n FROM public.capability_packages WHERE id = '99999999-0000-4000-8000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'community package is not visible'; END IF;
  SELECT count(*) INTO n FROM public.get_capability_attempt_stats(ARRAY['99999999-0000-4000-8000-000000000001'::uuid]);
  IF n <> 0 THEN RAISE EXCEPTION 'stats RPC reveals a private package'; END IF;
  SELECT count(*) INTO n FROM public.project_tasks WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  IF n <> 0 THEN RAISE EXCEPTION 'pending member can read another team task'; END IF;
  UPDATE public.project_tasks SET status = 'done' WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'pending member updated another team task'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.project_tasks (project_id, title) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'injected');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'pending member created a task in another team project'; END IF;
  -- Own task: notes and progress can be saved through the normal update path.
  UPDATE public.project_tasks SET description = 'notes', status = 'in_progress' WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'team member cannot save progress on own task'; END IF;
  -- Learning: cannot impersonate another creator; cannot claim evidence.
  ok := false;
  BEGIN
    INSERT INTO public.capability_packages (project_id, creator_id, title, goal, steps, permission_mode)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'forged', 'forged', '["x"]', 'community');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'member saved learning as someone else'; END IF;
  INSERT INTO public.capability_packages (id, project_id, creator_id, title, goal, steps, permission_mode, evidence_status)
  VALUES ('99999999-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Choosing speakers: what worked', 'Select speakers for a student hackathon', '["Agree criteria","Invite top three"]', 'community', 'proven');
  IF (SELECT evidence_status FROM public.capability_packages WHERE id = '99999999-0000-4000-8000-000000000003') <> 'untested' THEN
    RAISE EXCEPTION 'new learning claimed evidence it does not have';
  END IF;
END $$;
RESET ROLE;

-- A later member (B) can retrieve A's shared learning, still untested.
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.capability_packages WHERE id = '99999999-0000-4000-8000-000000000003' AND evidence_status = 'untested') THEN
    RAISE EXCEPTION 'shared learning is not retrievable by a later member';
  END IF;
END $$;
RESET ROLE;
SELECT 'assistance RLS boundary checks passed' AS result;
ROLLBACK;
