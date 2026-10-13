-- Buildspace intelligence layer: usage ledger and spending safeguards.
--
-- Additive only. Members have no direct access to either table or function:
-- the buildspace-assist Edge Function claims a slot (with the service role)
-- before any model call and settles actual token usage afterwards. A request
-- that is never settled keeps its full reservation, so failures can only make
-- the budget more conservative, never less.
--
-- Limits are rolling windows (last hour / last 24 hours) and can be changed
-- without a deploy:  UPDATE public.assistance_ai_limits SET ... ;

CREATE TABLE IF NOT EXISTS public.assistance_ai_limits (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  member_requests_per_hour INTEGER NOT NULL DEFAULT 12 CHECK (member_requests_per_hour >= 0),
  member_requests_per_day INTEGER NOT NULL DEFAULT 40 CHECK (member_requests_per_day >= 0),
  global_requests_per_day INTEGER NOT NULL DEFAULT 500 CHECK (global_requests_per_day >= 0),
  global_tokens_per_day BIGINT NOT NULL DEFAULT 3000000 CHECK (global_tokens_per_day >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.assistance_ai_limits (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.assistance_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'claimed',
  reserved_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_assistance_ai_usage_member ON public.assistance_ai_usage(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistance_ai_usage_created ON public.assistance_ai_usage(created_at DESC);

ALTER TABLE public.assistance_ai_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistance_ai_usage ENABLE ROW LEVEL SECURITY;
-- No policies: neither table is readable or writable by anon/authenticated.
REVOKE ALL ON public.assistance_ai_limits FROM anon, authenticated;
REVOKE ALL ON public.assistance_ai_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_assistance_ai_request(p_member_id UUID, p_provider TEXT, p_model TEXT, p_reserve_tokens INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limits public.assistance_ai_limits%ROWTYPE;
  member_hour INTEGER;
  member_day INTEGER;
  global_day INTEGER;
  global_tokens BIGINT;
  new_id UUID;
BEGIN
  -- Serialize claims so concurrent requests cannot overspend together.
  PERFORM pg_advisory_xact_lock(hashtext('buildspace_assist_budget'));
  SELECT * INTO limits FROM public.assistance_ai_limits WHERE id;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'reason', 'budget_exhausted'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community WHERE id = p_member_id) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_profile');
  END IF;

  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'), count(*)
    INTO member_hour, member_day
    FROM public.assistance_ai_usage WHERE member_id = p_member_id AND created_at > now() - interval '24 hours';
  SELECT count(*), coalesce(sum(CASE WHEN settled_at IS NULL THEN reserved_tokens ELSE coalesce(input_tokens, 0) + coalesce(output_tokens, 0) END), 0)
    INTO global_day, global_tokens
    FROM public.assistance_ai_usage WHERE created_at > now() - interval '24 hours';

  IF member_hour >= limits.member_requests_per_hour THEN RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited'); END IF;
  IF member_day >= limits.member_requests_per_day THEN RETURN jsonb_build_object('allowed', false, 'reason', 'member_daily_limit'); END IF;
  IF global_day >= limits.global_requests_per_day OR global_tokens + greatest(p_reserve_tokens, 0) > limits.global_tokens_per_day THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'budget_exhausted');
  END IF;

  INSERT INTO public.assistance_ai_usage (member_id, provider, model, reserved_tokens)
  VALUES (p_member_id, left(coalesce(p_provider, 'unknown'), 32), left(p_model, 80), greatest(p_reserve_tokens, 0))
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('allowed', true, 'id', new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_assistance_ai_request(p_id UUID, p_status TEXT, p_input_tokens INTEGER, p_output_tokens INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assistance_ai_usage
     SET status = left(coalesce(p_status, 'unknown'), 40),
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
         settled_at = now()
   WHERE id = p_id AND settled_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.claim_assistance_ai_request(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_assistance_ai_request(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.claim_assistance_ai_request(UUID, TEXT, TEXT, INTEGER) TO service_role;
  GRANT EXECUTE ON FUNCTION public.settle_assistance_ai_request(UUID, TEXT, INTEGER, INTEGER) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
