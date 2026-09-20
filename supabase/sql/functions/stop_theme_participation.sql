-- ================================================================
-- STOP CURRENT THEME PARTICIPATION
-- ================================================================
-- Stopping is explicit and preserves the lightweight interested state.

CREATE OR REPLACE FUNCTION public.stop_theme_participation(p_theme_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  UPDATE theme_participants
  SET engagement_level = 'interested',
      participation_confirmed_at = NULL,
      participation_expires_at = NULL
  WHERE theme_id = p_theme_id
    AND community_id = v_community_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_updated > 0, 'engagement_level', 'interested');
END;
$$;

REVOKE ALL ON FUNCTION public.stop_theme_participation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_theme_participation(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.stop_theme_participation(UUID) TO authenticated;
