-- Append-only, project-owner-private communication history for pending join
-- requests. Email rows mean only that a native mailto handoff was initiated.

CREATE TABLE IF NOT EXISTS public.project_interest_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_member_id UUID NOT NULL REFERENCES public.project_members(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('message', 'email')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_interest_followups_request_time
  ON public.project_interest_followups(project_member_id, initiated_at DESC);

ALTER TABLE public.project_interest_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project owners can view request follow-ups" ON public.project_interest_followups;
CREATE POLICY "Project owners can view request follow-ups"
  ON public.project_interest_followups FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members pm
      JOIN public.projects p ON p.id = pm.project_id
      JOIN public.community owner ON owner.id = p.creator_id
      WHERE pm.id = project_interest_followups.project_member_id
        AND owner.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Project owners can create request follow-ups" ON public.project_interest_followups;
CREATE POLICY "Project owners can create request follow-ups"
  ON public.project_interest_followups FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_members pm
      JOIN public.projects p ON p.id = pm.project_id
      JOIN public.community owner ON owner.id = p.creator_id
      WHERE pm.id = project_interest_followups.project_member_id
        AND pm.role = 'pending'
        AND owner.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.record_project_interest_followup(
  p_project_member_id UUID,
  p_channel TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_followup_id UUID;
BEGIN
  IF p_channel NOT IN ('message', 'email') THEN
    RAISE EXCEPTION 'invalid follow-up channel' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_interest_followups (project_member_id, channel)
  VALUES (p_project_member_id, p_channel)
  RETURNING id INTO v_followup_id;

  RETURN v_followup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_project_interest_followup(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_project_interest_followup(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.project_interest_followups IS
  'Append-only project-owner-private history of Message or native Email follow-up initiated for a pending join request; never delivery status.';

-- The legacy project_members SELECT policy is intentionally not used to
-- expose requester email. This RPC returns pending-request contact details
-- only after deriving the actual project owner from canonical identities.
CREATE OR REPLACE FUNCTION public.get_project_interest_requests(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title TEXT;
  v_requests JSONB;
BEGIN
  SELECT p.title INTO v_title
  FROM public.projects p
  JOIN public.community owner ON owner.id = p.creator_id
  WHERE p.id = p_project_id
    AND owner.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authorized: project owner required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pm.id,
      'user', jsonb_build_object(
        'id', requester.id,
        'name', requester.name,
        'email', requester.email,
        'image_url', requester.image_url,
        'bio', requester.bio,
        'skills', requester.skills
      ),
      'followups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', f.id,
          'channel', f.channel,
          'initiated_at', f.initiated_at
        ) ORDER BY f.initiated_at DESC)
        FROM public.project_interest_followups f
        WHERE f.project_member_id = pm.id
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb) INTO v_requests
  FROM public.project_members pm
  JOIN public.community requester ON requester.id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND pm.role = 'pending';

  RETURN jsonb_build_object('project_title', v_title, 'requests', v_requests);
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_interest_requests(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_interest_requests(UUID) TO authenticated;
