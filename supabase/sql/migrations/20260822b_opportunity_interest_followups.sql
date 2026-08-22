-- Durable, poster-private history of follow-up initiated for an opportunity
-- interest. This is relationship history, not delivery tracking: an email row
-- records only that the poster deliberately invoked the email-app handoff.

CREATE TABLE IF NOT EXISTS public.opportunity_interest_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_interest_id UUID NOT NULL
    REFERENCES public.opportunity_interests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('message', 'email')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_interest_followups_interest_time
  ON public.opportunity_interest_followups(opportunity_interest_id, initiated_at DESC);

ALTER TABLE public.opportunity_interest_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posters can view opportunity interest follow-ups"
  ON public.opportunity_interest_followups;
CREATE POLICY "Posters can view opportunity interest follow-ups"
  ON public.opportunity_interest_followups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.opportunity_interests oi
      JOIN public.opportunities o ON o.id = oi.opportunity_id
      JOIN public.community poster ON poster.id = o.posted_by
      WHERE oi.id = opportunity_interest_followups.opportunity_interest_id
        AND poster.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Posters can create opportunity interest follow-ups"
  ON public.opportunity_interest_followups;
CREATE POLICY "Posters can create opportunity interest follow-ups"
  ON public.opportunity_interest_followups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.opportunity_interests oi
      JOIN public.opportunities o ON o.id = oi.opportunity_id
      JOIN public.community poster ON poster.id = o.posted_by
      WHERE oi.id = opportunity_interest_followups.opportunity_interest_id
        AND poster.user_id = auth.uid()
    )
  );

-- Resolve the interest server-side so callers cannot attach history to an
-- unrelated relationship. SECURITY INVOKER keeps the INSERT subject to RLS.
CREATE OR REPLACE FUNCTION public.record_opportunity_interest_followup(
  p_opportunity_id UUID,
  p_interested_community_id UUID,
  p_channel TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_interest_id UUID;
  v_followup_id UUID;
BEGIN
  IF p_channel NOT IN ('message', 'email') THEN
    RAISE EXCEPTION 'invalid follow-up channel' USING ERRCODE = '22023';
  END IF;

  SELECT oi.id INTO v_interest_id
  FROM public.opportunity_interests oi
  WHERE oi.opportunity_id = p_opportunity_id
    AND oi.community_id = p_interested_community_id;

  IF v_interest_id IS NULL THEN
    RAISE EXCEPTION 'opportunity interest not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.opportunity_interest_followups (
    opportunity_interest_id,
    channel
  ) VALUES (
    v_interest_id,
    p_channel
  )
  RETURNING id INTO v_followup_id;

  RETURN v_followup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_opportunity_interest_followup(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_opportunity_interest_followup(UUID, UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.opportunity_interest_followups IS
  'Append-only poster-private history that message or email follow-up was initiated for an opportunity interest; it does not represent delivery.';
