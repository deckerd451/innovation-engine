-- Capability memory pilot
-- Turns proven project work into permissioned, reusable packages and records
-- whether a later member actually benefited from using one.

CREATE TABLE IF NOT EXISTS public.capability_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  goal TEXT NOT NULL CHECK (btrim(goal) <> ''),
  summary TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_notes TEXT,
  success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  permission_mode TEXT NOT NULL DEFAULT 'private' CHECK (permission_mode IN ('private', 'community')),
  evidence_status TEXT NOT NULL DEFAULT 'untested' CHECK (evidence_status IN ('untested', 'tested', 'proven')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.capability_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id UUID NOT NULL REFERENCES public.capability_packages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  baseline_hours NUMERIC(10,2) CHECK (baseline_hours IS NULL OR baseline_hours >= 0),
  actual_hours NUMERIC(10,2) CHECK (actual_hours IS NULL OR actual_hours >= 0),
  baseline_cost NUMERIC(12,2) CHECK (baseline_cost IS NULL OR baseline_cost >= 0),
  actual_cost NUMERIC(12,2) CHECK (actual_cost IS NULL OR actual_cost >= 0),
  outcome_status TEXT NOT NULL DEFAULT 'planned' CHECK (outcome_status IN ('planned', 'in_progress', 'succeeded', 'not_succeeded')),
  quality_note TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capability_packages_project ON public.capability_packages(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_packages_visibility ON public.capability_packages(permission_mode, evidence_status);
CREATE INDEX IF NOT EXISTS idx_capability_attempts_capability ON public.capability_attempts(capability_id, outcome_status);
CREATE INDEX IF NOT EXISTS idx_capability_attempts_member ON public.capability_attempts(member_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_capability_memory_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_capability_packages_timestamps ON public.capability_packages;
CREATE TRIGGER trg_capability_packages_timestamps
  BEFORE UPDATE ON public.capability_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_capability_memory_timestamps();

DROP TRIGGER IF EXISTS trg_capability_attempts_timestamps ON public.capability_attempts;
CREATE TRIGGER trg_capability_attempts_timestamps
  BEFORE UPDATE ON public.capability_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_capability_memory_timestamps();

ALTER TABLE public.capability_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capability_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community can view shared capability packages" ON public.capability_packages;
CREATE POLICY "Community can view shared capability packages"
  ON public.capability_packages FOR SELECT TO authenticated
  USING (
    permission_mode = 'community'
    OR creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Creators can create capability packages" ON public.capability_packages;
CREATE POLICY "Creators can create capability packages"
  ON public.capability_packages FOR INSERT TO authenticated
  WITH CHECK (creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Creators can update capability packages" ON public.capability_packages;
CREATE POLICY "Creators can update capability packages"
  ON public.capability_packages FOR UPDATE TO authenticated
  USING (creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()))
  WITH CHECK (creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Creators can delete capability packages" ON public.capability_packages;
CREATE POLICY "Creators can delete capability packages"
  ON public.capability_packages FOR DELETE TO authenticated
  USING (creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can view own capability attempts" ON public.capability_attempts;
CREATE POLICY "Members can view own capability attempts"
  ON public.capability_attempts FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.capability_packages p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = capability_attempts.capability_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can create own capability attempts" ON public.capability_attempts;
CREATE POLICY "Members can create own capability attempts"
  ON public.capability_attempts FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.capability_packages p
      WHERE p.id = capability_attempts.capability_id
        AND (p.permission_mode = 'community' OR p.creator_id = member_id)
    )
  );

DROP POLICY IF EXISTS "Members can update own capability attempts" ON public.capability_attempts;
CREATE POLICY "Members can update own capability attempts"
  ON public.capability_attempts FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()))
  WITH CHECK (
    member_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.capability_packages p
      WHERE p.id = capability_attempts.capability_id
        AND (p.permission_mode = 'community' OR p.creator_id = member_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capability_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.capability_attempts TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_capability_evidence()
RETURNS TRIGGER AS $$
DECLARE successful_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO successful_count
  FROM public.capability_attempts
  WHERE capability_id = NEW.capability_id AND outcome_status = 'succeeded';
  UPDATE public.capability_packages
  SET evidence_status = CASE WHEN successful_count >= 2 THEN 'proven' WHEN successful_count >= 1 THEN 'tested' ELSE 'untested' END,
      updated_at = now()
  WHERE id = NEW.capability_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_refresh_capability_evidence ON public.capability_attempts;
CREATE TRIGGER trg_refresh_capability_evidence
  AFTER INSERT OR UPDATE OF outcome_status ON public.capability_attempts
  FOR EACH ROW EXECUTE FUNCTION public.refresh_capability_evidence();

-- Aggregate-only evidence for package cards. Individual attempt rows remain
-- private; the UI receives counts and medians, never member identities.
CREATE OR REPLACE FUNCTION public.get_capability_attempt_stats(capability_ids UUID[])
RETURNS TABLE (
  capability_id UUID,
  total_attempts BIGINT,
  successful_attempts BIGINT,
  median_hours_saved NUMERIC,
  median_cost_saved NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.capability_id,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE a.outcome_status = 'succeeded')::BIGINT,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY (a.baseline_hours - a.actual_hours))
      FILTER (WHERE a.baseline_hours IS NOT NULL AND a.actual_hours IS NOT NULL))::numeric,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY (a.baseline_cost - a.actual_cost))
      FILTER (WHERE a.baseline_cost IS NOT NULL AND a.actual_cost IS NOT NULL))::numeric
  FROM public.capability_attempts a
  JOIN public.capability_packages p ON p.id = a.capability_id
  WHERE a.capability_id = ANY(capability_ids)
    AND (p.permission_mode = 'community' OR p.creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()))
  GROUP BY a.capability_id;
$$;

REVOKE ALL ON FUNCTION public.get_capability_attempt_stats(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_capability_attempt_stats(UUID[]) TO authenticated;
