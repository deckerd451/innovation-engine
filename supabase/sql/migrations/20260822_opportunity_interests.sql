-- Members can privately express interest in an opportunity. Only the member
-- and the opportunity poster can read an interest; the public browse surface
-- never gains access to interested-member identities.

CREATE TABLE IF NOT EXISTS public.opportunity_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_interests_opportunity
  ON public.opportunity_interests(opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_interests_community
  ON public.opportunity_interests(community_id, created_at DESC);

ALTER TABLE public.opportunity_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members and posters can view opportunity interests" ON public.opportunity_interests;
CREATE POLICY "Members and posters can view opportunity interests"
  ON public.opportunity_interests
  FOR SELECT
  TO authenticated
  USING (
    community_id IN (SELECT c.id FROM public.community c WHERE c.user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.opportunities o
      JOIN public.community poster ON poster.id = o.posted_by
      WHERE o.id = opportunity_interests.opportunity_id
        AND poster.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can express opportunity interest" ON public.opportunity_interests;
CREATE POLICY "Members can express opportunity interest"
  ON public.opportunity_interests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    community_id IN (SELECT c.id FROM public.community c WHERE c.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_interests.opportunity_id
        AND o.status = 'open'
        AND o.is_public = TRUE
        AND (o.application_deadline IS NULL OR o.application_deadline > NOW())
        AND o.posted_by <> opportunity_interests.community_id
    )
  );

DROP POLICY IF EXISTS "Members can withdraw opportunity interest" ON public.opportunity_interests;
CREATE POLICY "Members can withdraw opportunity interest"
  ON public.opportunity_interests
  FOR DELETE
  TO authenticated
  USING (
    community_id IN (SELECT c.id FROM public.community c WHERE c.user_id = auth.uid())
  );

COMMENT ON TABLE public.opportunity_interests IS
  'Private expressions of interest, visible only to the interested member and opportunity poster.';
