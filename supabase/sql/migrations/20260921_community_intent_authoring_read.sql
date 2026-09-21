-- Read the signed-in member's current authored statements without opening
-- the intelligence tables to direct client reads.  Authoring writes remain
-- behind the transactional intent functions from the foundation migration.
CREATE OR REPLACE FUNCTION public.get_my_community_intents()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author UUID;
BEGIN
  SELECT id INTO v_author
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'intents', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'intents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'intent_type', i.intent_type,
        'subject_key', i.subject_key,
        'subject_label', i.subject_label,
        'statement', i.statement,
        'visibility', i.visibility,
        'starts_at', i.starts_at,
        'last_confirmed_at', i.last_confirmed_at,
        'expires_at', i.expires_at,
        'active', i.active
      ) ORDER BY i.intent_type, i.starts_at DESC)
      FROM public.community_intent_statements i
      WHERE i.author_community_id = v_author
        AND i.active = true
        AND i.voided_at IS NULL
        AND i.starts_at <= now()
        AND (i.expires_at IS NULL OR i.expires_at > now())
        AND i.visibility IN ('public', 'nearify', 'private')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_community_intents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_community_intents() TO authenticated;
