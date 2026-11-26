BEGIN;

CREATE TABLE public.hpoe_opt_in (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);

CREATE TABLE public.hpoe_collaboration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator uuid NOT NULL REFERENCES public.hpoe_opt_in(user_id) ON DELETE CASCADE,
  invitee uuid NOT NULL REFERENCES public.hpoe_opt_in(user_id) ON DELETE CASCADE,
  recipe text NOT NULL CHECK (recipe IN ('garden', 'workshop', 'resource-guide')),
  phase text NOT NULL DEFAULT 'invited' CHECK (phase IN ('invited', 'accepted', 'started', 'declined')),
  initiator_confirmed boolean NOT NULL DEFAULT false,
  invitee_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (initiator <> invitee),
  CHECK (phase = 'started' OR NOT (initiator_confirmed OR invitee_confirmed))
);

-- One open invitation per sender and one open collaboration per pair.
CREATE UNIQUE INDEX hpoe_one_pending_invite ON public.hpoe_collaboration (initiator)
  WHERE phase = 'invited';
CREATE UNIQUE INDEX hpoe_open_pair ON public.hpoe_collaboration
  (least(initiator, invitee), greatest(initiator, invitee))
  WHERE phase IN ('invited', 'accepted') OR (phase = 'started' AND NOT (initiator_confirmed AND invitee_confirmed));
CREATE INDEX hpoe_incoming ON public.hpoe_collaboration (invitee, created_at DESC);

ALTER TABLE public.hpoe_opt_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpoe_collaboration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hpoe_opt_in, public.hpoe_collaboration FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.hpoe_opt_in TO authenticated;
CREATE POLICY hpoe_own_opt_in ON public.hpoe_opt_in FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY hpoe_participant_read ON public.hpoe_collaboration FOR SELECT TO authenticated
  USING (auth.uid() IN (initiator, invitee));
CREATE POLICY hpoe_participant_delete ON public.hpoe_collaboration FOR DELETE TO authenticated
  USING (auth.uid() IN (initiator, invitee));

CREATE FUNCTION public.hpoe_candidates(p_actor uuid)
RETURNS TABLE (profile_id uuid, name text, skills jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, p.name::text, to_jsonb(p.skills)
  FROM public.community AS me
  JOIN public.hpoe_opt_in AS own ON own.user_id = me.user_id
  JOIN public.community AS p ON p.id <> me.id
  JOIN public.hpoe_opt_in AS peer ON peer.user_id = p.user_id
  WHERE me.user_id = auth.uid() AND me.user_id = p_actor
    AND me.is_hidden IS NOT TRUE AND me.is_disabled IS NOT TRUE
    AND p.is_hidden IS NOT TRUE AND p.is_disabled IS NOT TRUE
    AND EXISTS (
      SELECT 1 FROM public.connections AS c
      WHERE c.status = 'accepted'
        AND ((c.from_user_id = me.id AND c.to_user_id = p.id)
          OR (c.to_user_id = me.id AND c.from_user_id = p.id))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.hpoe_collaboration AS prior
      WHERE least(prior.initiator, prior.invitee) = least(me.user_id, p.user_id)
        AND greatest(prior.initiator, prior.invitee) = greatest(me.user_id, p.user_id)
        AND (prior.phase IN ('invited', 'accepted')
          OR (prior.phase = 'started' AND NOT (prior.initiator_confirmed AND prior.invitee_confirmed))
          OR (prior.phase = 'declined' AND prior.created_at >= now() - interval '30 days'))
    )
  ORDER BY p.id
  LIMIT 50;
$$;

CREATE FUNCTION public.hpoe_invite(p_actor uuid, p_profile_id uuid, p_recipe text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invitee uuid;
  v_id uuid;
BEGIN
  SELECT p.user_id INTO v_invitee
  FROM public.hpoe_candidates(p_actor) AS candidate
  JOIN public.community AS p ON p.id = candidate.profile_id
  WHERE candidate.profile_id = p_profile_id;

  IF v_invitee IS NULL THEN
    RAISE EXCEPTION 'This member is unavailable for collaboration' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hpoe_collaboration (initiator, invitee, recipe)
  VALUES (auth.uid(), v_invitee, p_recipe)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.hpoe_advance(p_actor uuid, p_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF p_actor IS DISTINCT FROM v_actor OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Account changed' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'remove' THEN
    DELETE FROM public.hpoe_collaboration
    WHERE id = p_id AND v_actor IN (initiator, invitee);
    IF FOUND THEN RETURN; END IF;
  END IF;

  UPDATE public.hpoe_collaboration
  SET phase = CASE p_action
      WHEN 'accept' THEN 'accepted'
      WHEN 'decline' THEN 'declined'
      WHEN 'start' THEN 'started'
      ELSE phase END,
    initiator_confirmed = initiator_confirmed OR (p_action = 'confirm' AND initiator = v_actor),
    invitee_confirmed = invitee_confirmed OR (p_action = 'confirm' AND invitee = v_actor)
  WHERE id = p_id AND v_actor IN (initiator, invitee)
    AND ((p_action = 'decline' AND phase = 'invited' AND invitee = v_actor)
      OR (p_action = 'accept' AND phase = 'invited' AND invitee = v_actor AND EXISTS (
        SELECT 1 FROM public.community AS sender
        JOIN public.community AS recipient ON recipient.user_id = v_actor
        JOIN public.connections AS relationship ON relationship.status = 'accepted'
          AND ((relationship.from_user_id = sender.id AND relationship.to_user_id = recipient.id)
            OR (relationship.to_user_id = sender.id AND relationship.from_user_id = recipient.id))
        WHERE sender.user_id = initiator
          AND sender.is_hidden IS NOT TRUE AND sender.is_disabled IS NOT TRUE
          AND recipient.is_hidden IS NOT TRUE AND recipient.is_disabled IS NOT TRUE
      ))
      OR (p_action = 'start' AND phase = 'accepted')
      OR (p_action = 'confirm' AND phase = 'started'));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This collaboration action is unavailable' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.hpoe_my_collaborations(p_actor uuid)
RETURNS TABLE (id uuid, incoming boolean, recipe text, phase text,
  own_confirmed boolean, jointly_confirmed boolean, peer_profile_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT c.id, c.invitee = p_actor, c.recipe, c.phase,
    CASE WHEN c.invitee = p_actor THEN c.invitee_confirmed ELSE c.initiator_confirmed END,
    c.invitee_confirmed AND c.initiator_confirmed, p.id
  FROM public.hpoe_collaboration AS c
  LEFT JOIN public.community AS me ON me.user_id = p_actor
  LEFT JOIN public.community AS p
    ON c.phase IN ('accepted', 'started')
    AND p.user_id = CASE WHEN c.invitee = p_actor THEN c.initiator ELSE c.invitee END
    AND p.is_hidden IS NOT TRUE AND p.is_disabled IS NOT TRUE
    AND me.is_hidden IS NOT TRUE AND me.is_disabled IS NOT TRUE
    AND EXISTS (
      SELECT 1 FROM public.connections AS relationship
      WHERE relationship.status = 'accepted'
        AND ((relationship.from_user_id = me.id AND relationship.to_user_id = p.id)
          OR (relationship.to_user_id = me.id AND relationship.from_user_id = p.id))
    )
  WHERE p_actor = auth.uid() AND p_actor IN (c.initiator, c.invitee)
  ORDER BY (c.phase = 'invited') DESC, c.created_at DESC, c.id
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.hpoe_candidates(uuid), public.hpoe_invite(uuid, uuid, text),
  public.hpoe_advance(uuid, uuid, text), public.hpoe_my_collaborations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hpoe_candidates(uuid), public.hpoe_invite(uuid, uuid, text),
  public.hpoe_advance(uuid, uuid, text), public.hpoe_my_collaborations(uuid) TO authenticated;

COMMIT;
