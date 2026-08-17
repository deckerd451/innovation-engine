-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ============================================================================
-- PROJECT TASKS
-- ============================================================================
-- Lightweight, persistent tasks living inside an existing Project.
-- Mirrors the projects / project_members conventions already in this schema:
--   - UUID primary key via gen_random_uuid()
--   - creator/owner references point at public.community(id), not auth.users(id)
--   - RLS scoped through community.user_id = auth.uid()
--   - Only the project creator may mutate tasks (same bar as "edit project")
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  owner_id UUID REFERENCES public.community(id) ON DELETE SET NULL,
  related_url TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.community(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.community(id) ON DELETE SET NULL,
  CONSTRAINT project_tasks_title_not_blank CHECK (btrim(title) <> '')
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
-- project_id + status covers the Needs Attention / In Progress groupings and
-- the "unfinished task count" aggregate query used by the Projects list.
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status ON public.project_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_completed ON public.project_tasks(project_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_tasks_owner ON public.project_tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks(status);

-- ----------------------------------------------------------------------------
-- Centralized status/timestamp behavior (persistence-layer, not client-side)
-- ----------------------------------------------------------------------------
-- Setting status = 'done' stamps completed_at; moving away from 'done' clears
-- it. This runs on INSERT and UPDATE so it's consistent no matter which
-- client (web app, future coding agent) writes the row.
CREATE OR REPLACE FUNCTION public.set_project_task_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = NOW();
  END IF;

  IF NEW.status = 'done' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at = NOW();
    END IF;
  ELSE
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_tasks_timestamps ON public.project_tasks;
CREATE TRIGGER trg_project_tasks_timestamps
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_project_task_timestamps();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- Anyone who can see projects (all authenticated users, per the existing
-- "Users can view all projects" policy) can see that project's tasks.
DROP POLICY IF EXISTS "Users can view tasks for visible projects" ON public.project_tasks;
CREATE POLICY "Users can view tasks for visible projects"
  ON public.project_tasks FOR SELECT
  TO authenticated
  USING (true);

-- Only the project creator may create/edit/delete tasks — the same bar the
-- existing "Users can update own projects" policy uses for project edits.
DROP POLICY IF EXISTS "Project creators can create tasks" ON public.project_tasks;
CREATE POLICY "Project creators can create tasks"
  ON public.project_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE creator_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Project creators can update tasks" ON public.project_tasks;
CREATE POLICY "Project creators can update tasks"
  ON public.project_tasks FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE creator_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Project creators can delete tasks" ON public.project_tasks;
CREATE POLICY "Project creators can delete tasks"
  ON public.project_tasks FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE creator_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ project_tasks table, indexes, trigger and RLS policies created';
END $$;
