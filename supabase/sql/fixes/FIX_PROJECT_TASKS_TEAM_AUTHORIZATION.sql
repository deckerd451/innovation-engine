-- Idempotent production follow-up for an existing public.project_tasks table.
-- Does not recreate the table or alter/delete task data.

BEGIN;

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tasks for visible projects" ON public.project_tasks;
DROP POLICY IF EXISTS "Project team can view tasks" ON public.project_tasks;
CREATE POLICY "Project team can view tasks"
  ON public.project_tasks FOR SELECT TO authenticated
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
  );

DROP POLICY IF EXISTS "Project creators can create tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Project team can create tasks" ON public.project_tasks;
CREATE POLICY "Project team can create tasks"
  ON public.project_tasks FOR INSERT TO authenticated
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
  ON public.project_tasks FOR UPDATE TO authenticated
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

-- Recreate the creator-only delete policy to make its intended scope explicit.
DROP POLICY IF EXISTS "Project creators can delete tasks" ON public.project_tasks;
CREATE POLICY "Project creators can delete tasks"
  ON public.project_tasks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_tasks.project_id AND c.user_id = auth.uid()
    )
  );

COMMIT;
