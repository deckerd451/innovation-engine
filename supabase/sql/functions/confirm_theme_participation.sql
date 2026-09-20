-- ================================================================
-- CONFIRM CURRENT THEME PARTICIPATION
-- ================================================================
-- Explicit user intent only. The server owns the confirmation window;
-- clients cannot supply confirmation or expiry timestamps.

CREATE OR REPLACE FUNCTION public.confirm_theme_participation(p_theme_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_status TEXT;
  v_theme_expires_at TIMESTAMPTZ;
  v_confirmed_at TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No community profile found for current user');
  END IF;

  SELECT status, expires_at
    INTO v_status, v_theme_expires_at
  FROM theme_circles
  WHERE id = p_theme_id;

  IF v_status IS DISTINCT FROM 'active'
     OR (v_theme_expires_at IS NOT NULL AND v_theme_expires_at <= v_confirmed_at) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Theme is no longer current');
  END IF;

  v_expires_at := v_confirmed_at + interval '30 days';
  IF v_theme_expires_at IS NOT NULL AND v_theme_expires_at < v_expires_at THEN
    v_expires_at := v_theme_expires_at;
  END IF;

  INSERT INTO theme_participants (
    theme_id,
    community_id,
    engagement_level,
    participation_confirmed_at,
    participation_expires_at
  )
  VALUES (
    p_theme_id,
    v_community_id,
    'participating',
    v_confirmed_at,
    v_expires_at
  )
  ON CONFLICT (theme_id, community_id)
  DO UPDATE SET
    engagement_level = 'participating',
    participation_confirmed_at = EXCLUDED.participation_confirmed_at,
    participation_expires_at = EXCLUDED.participation_expires_at;

  RETURN jsonb_build_object(
    'success', true,
    'engagement_level', 'participating',
    'participation_confirmed_at', v_confirmed_at,
    'participation_expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_theme_participation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_theme_participation(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_theme_participation(UUID) TO authenticated;
