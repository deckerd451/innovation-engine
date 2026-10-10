-- Apply before deploying photo-consent-20261010a. This changes display consent;
-- public Storage objects require a separate private-storage migration.
BEGIN;

ALTER TABLE public.community
  ADD COLUMN IF NOT EXISTS photo_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_consent_at timestamptz;
ALTER TABLE public.community ALTER COLUMN photo_visible SET DEFAULT false;

-- Legacy true values were defaults/admin choices, never member opt-in.
-- Reapplying preserves choices recorded after this migration.
UPDATE public.community SET photo_visible = false
WHERE photo_consent_at IS NULL AND photo_visible IS DISTINCT FROM false;

CREATE OR REPLACE FUNCTION public.enforce_photo_consent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New profiles always start private. Opt-in is a separate owner action.
    NEW.photo_visible := false;
    NEW.photo_consent_at := NULL;
  ELSE
    IF auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid()
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Only the profile owner may change photo consent'
        USING ERRCODE = '42501';
    END IF;
    NEW.photo_consent_at := CASE WHEN NEW.photo_visible THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_photo_consent ON public.community;
CREATE TRIGGER enforce_photo_consent
  BEFORE INSERT OR UPDATE OF photo_visible, photo_consent_at ON public.community
  FOR EACH ROW EXECUTE FUNCTION public.enforce_photo_consent();

CREATE OR REPLACE FUNCTION public.set_my_photo_visibility(p_visible boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_consent_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_visible IS NULL THEN
    RAISE EXCEPTION 'Authentication and a visibility choice are required'
      USING ERRCODE = '42501';
  END IF;
  -- Update all rows owned by this auth identity, including legacy duplicates.
  UPDATE public.community SET photo_visible = p_visible
  WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT photo_consent_at INTO v_consent_at FROM public.community
  WHERE user_id = auth.uid() LIMIT 1;
  RETURN jsonb_build_object('photo_visible', p_visible, 'photo_consent_at', v_consent_at);
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_photo_visibility(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_photo_visibility(boolean) TO authenticated;
COMMENT ON COLUMN public.community.photo_consent_at IS
  'Server-recorded member opt-in. Legacy photo_visible=true alone is not consent.';

COMMIT;
