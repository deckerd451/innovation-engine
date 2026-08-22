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

-- Interest visibility trusts opportunities.posted_by, so ownership must not
-- be transferable through the broader organization-editor UPDATE policy.
CREATE OR REPLACE FUNCTION public.prevent_opportunity_poster_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.posted_by IS DISTINCT FROM OLD.posted_by THEN
    RAISE EXCEPTION 'opportunity posted_by cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_opportunity_poster_change ON public.opportunities;
CREATE TRIGGER prevent_opportunity_poster_change
  BEFORE UPDATE OF posted_by ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_opportunity_poster_change();

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

-- Persist an attention item for the canonical poster. This deliberately uses
-- the existing in-app notification system: no email address or delivery
-- credential is exposed to the interested member or browser.
CREATE OR REPLACE FUNCTION public.notify_opportunity_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_poster_id UUID;
  v_opportunity_title TEXT;
  v_interested_name TEXT;
BEGIN
  SELECT o.posted_by, o.title
    INTO v_poster_id, v_opportunity_title
  FROM public.opportunities o
  WHERE o.id = NEW.opportunity_id;

  -- The recipient always comes from the opportunity row, never client input.
  IF v_poster_id IS NULL OR v_poster_id = NEW.community_id THEN
    RETURN NEW;
  END IF;

  SELECT c.name
    INTO v_interested_name
  FROM public.community c
  WHERE c.id = NEW.community_id;

  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  VALUES (
    v_poster_id,
    'opportunity_interest',
    COALESCE(NULLIF(v_interested_name, ''), 'A community member') || ' is interested in your opportunity',
    'Review their interest and contact them through Innovation Engine messaging.',
    'opportunity.html?id=' || NEW.opportunity_id::TEXT,
    jsonb_build_object(
      'opportunity_id', NEW.opportunity_id,
      'interested_community_id', NEW.community_id,
      'opportunity_title', v_opportunity_title
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_opportunity_interest() FROM PUBLIC;

DROP TRIGGER IF EXISTS notify_opportunity_interest ON public.opportunity_interests;
CREATE TRIGGER notify_opportunity_interest
  AFTER INSERT ON public.opportunity_interests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_opportunity_interest();

COMMENT ON TABLE public.opportunity_interests IS
  'Private expressions of interest, visible only to the interested member and opportunity poster.';
