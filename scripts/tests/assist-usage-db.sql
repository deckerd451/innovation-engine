-- DISPOSABLE LOCAL DATABASE ONLY. Exercises the intelligence usage ledger
-- (supabase/sql/migrations/20261014_buildspace_assist_usage.sql) for real:
-- members cannot read or call it; the service role is limited per member per
-- hour/day and by a global request and token budget. Everything rolls back.
--   psql -d ie_test -f scripts/tests/fixtures/supabase-minimal-bootstrap.sql
--   psql -d ie_test -f supabase/sql/migrations/20261014_buildspace_assist_usage.sql
--   psql -d ie_test -f scripts/tests/assist-usage-db.sql
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.community (id, user_id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', '0a000000-0000-4000-8000-000000000001', 'Member A'),
  ('22222222-2222-4222-8222-222222222222', '0a000000-0000-4000-8000-000000000002', 'Member B');
UPDATE public.assistance_ai_limits SET member_requests_per_hour = 2, member_requests_per_day = 3, global_requests_per_day = 5, global_tokens_per_day = 10000;

DO $$
DECLARE r JSONB; first_id UUID; denied BOOLEAN;
BEGIN
  -- Members (authenticated) can neither read the ledger nor claim budget.
  PERFORM set_config('request.jwt.claim.sub', '0a000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM 1 FROM public.assistance_ai_usage; denied := false; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'members can read the usage ledger'; END IF;
  BEGIN PERFORM public.claim_assistance_ai_request('11111111-1111-4111-8111-111111111111', 'anthropic', 'm', 10); denied := false; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'members can claim budget directly'; END IF;
  BEGIN PERFORM public.settle_assistance_ai_request(gen_random_uuid(), 'ok', 0, 0); denied := false; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'members can settle usage directly'; END IF;
  BEGIN UPDATE public.assistance_ai_limits SET global_tokens_per_day = 999999999; denied := false; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'members can raise the budget'; END IF;
  RESET ROLE;

  SET LOCAL ROLE service_role;
  r := public.claim_assistance_ai_request('11111111-1111-4111-8111-111111111111', 'anthropic', 'm', 1000);
  IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'first claim refused: %', r; END IF;
  first_id := (r->>'id')::uuid;
  PERFORM public.settle_assistance_ai_request(first_id, 'ok', 300, 200);
  PERFORM public.settle_assistance_ai_request(first_id, 'ok', 0, 0); -- second settle is ignored
  r := public.claim_assistance_ai_request('11111111-1111-4111-8111-111111111111', 'anthropic', 'm', 1000);
  IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'second claim refused: %', r; END IF;
  r := public.claim_assistance_ai_request('11111111-1111-4111-8111-111111111111', 'anthropic', 'm', 1000);
  IF r->>'reason' <> 'rate_limited' THEN RAISE EXCEPTION 'hourly limit not enforced: %', r; END IF;
  r := public.claim_assistance_ai_request('99999999-9999-4999-8999-999999999999', 'anthropic', 'm', 10);
  IF r->>'reason' <> 'no_profile' THEN RAISE EXCEPTION 'unknown member accepted: %', r; END IF;
  -- Global token budget: settled usage counts actual tokens, open claims their reservation.
  r := public.claim_assistance_ai_request('22222222-2222-4222-8222-222222222222', 'anthropic', 'm', 9000);
  IF r->>'reason' <> 'budget_exhausted' THEN RAISE EXCEPTION 'token budget not enforced: %', r; END IF;
  r := public.claim_assistance_ai_request('22222222-2222-4222-8222-222222222222', 'anthropic', 'm', 5000);
  IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'claim within budget refused: %', r; END IF;
  RESET ROLE;
  IF (SELECT input_tokens + output_tokens FROM public.assistance_ai_usage WHERE id = first_id) <> 500 THEN RAISE EXCEPTION 'settlement not recorded once'; END IF;
  -- Member daily limit (rolling 24h) and global request cap.
  UPDATE public.assistance_ai_usage SET created_at = now() - interval '2 hours' WHERE member_id = '11111111-1111-4111-8111-111111111111';
  SET LOCAL ROLE service_role;
  r := public.claim_assistance_ai_request('11111111-1111-4111-8111-111111111111', 'anthropic', 'm', 10);
  IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'third daily claim refused: %', r; END IF;
  r := public.claim_assistance_ai_request('11111111-1111-4111-8111-111111111111', 'anthropic', 'm', 10);
  IF r->>'reason' NOT IN ('member_daily_limit', 'rate_limited') THEN RAISE EXCEPTION 'daily limit not enforced: %', r; END IF;
  RESET ROLE;
  UPDATE public.assistance_ai_limits SET member_requests_per_hour = 100, member_requests_per_day = 100, global_tokens_per_day = 100000000;
  SET LOCAL ROLE service_role;
  r := public.claim_assistance_ai_request('22222222-2222-4222-8222-222222222222', 'anthropic', 'm', 10);
  IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'fifth global claim refused: %', r; END IF;
  r := public.claim_assistance_ai_request('22222222-2222-4222-8222-222222222222', 'anthropic', 'm', 10);
  IF r->>'reason' <> 'budget_exhausted' THEN RAISE EXCEPTION 'global request cap not enforced: %', r; END IF;
  RESET ROLE;
END $$;
SELECT 'assistance usage ledger checks passed' AS result;
ROLLBACK;
