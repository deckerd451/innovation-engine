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
--   - Project creators and accepted members may work with tasks
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

-- Project tasks are private to the creator and accepted project members.
-- Existing membership semantics use role = 'pending' for unaccepted requests;
-- every other project_members role is an accepted membership.
DROP POLICY IF EXISTS "Users can view tasks for visible projects" ON public.project_tasks;
DROP POLICY IF EXISTS "Project team can view tasks" ON public.project_tasks;
CREATE POLICY "Project team can view tasks"
  ON public.project_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_tasks.project_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_members pm
      JOIN public.community c ON c.id = pm.user_id
      WHERE pm.project_id = project_tasks.project_id
        AND pm.role IS DISTINCT FROM 'pending'
        AND c.user_id = auth.uid()
    )
  );

-- Creators and accepted members may create and edit tasks.
DROP POLICY IF EXISTS "Project creators can create tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Project team can create tasks" ON public.project_tasks;
CREATE POLICY "Project team can create tasks"
  ON public.project_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_tasks.project_id AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      JOIN public.community c ON c.id = pm.user_id
      WHERE pm.project_id = project_tasks.project_id
        AND pm.role IS DISTINCT FROM 'pending' AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Project creators can update tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Project team can update tasks" ON public.project_tasks;
CREATE POLICY "Project team can update tasks"
  ON public.project_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_tasks.project_id AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      JOIN public.community c ON c.id = pm.user_id
      WHERE pm.project_id = project_tasks.project_id
        AND pm.role IS DISTINCT FROM 'pending' AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_tasks.project_id AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      JOIN public.community c ON c.id = pm.user_id
      WHERE pm.project_id = project_tasks.project_id
        AND pm.role IS DISTINCT FROM 'pending' AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Project creators can delete tasks" ON public.project_tasks;
CREATE POLICY "Project creators can delete tasks"
  ON public.project_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_tasks.project_id AND c.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ project_tasks table, indexes, trigger and RLS policies created';
END $$;
