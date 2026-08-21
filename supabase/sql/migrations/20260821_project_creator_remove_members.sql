-- Allow a project's originator to remove team members while retaining the
-- existing behavior that lets a member leave a project themselves.

DROP POLICY IF EXISTS "Users can leave projects" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can delete members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators and members can delete memberships" ON public.project_members;

CREATE POLICY "Project creators and members can delete memberships"
  ON public.project_members
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT c.id
      FROM public.community c
      WHERE c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.community creator ON creator.id = p.creator_id
      WHERE p.id = project_members.project_id
        AND creator.user_id = auth.uid()
    )
  );
