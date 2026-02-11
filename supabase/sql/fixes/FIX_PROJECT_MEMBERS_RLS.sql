-- Fix RLS policies for project_members table to allow project creators to approve/decline requests
-- This fixes the issue where project creators can't update or delete project_members records

-- Drop existing policies
DROP POLICY IF EXISTS "Project creators can manage members" ON public.project_members;
DROP POLICY IF EXISTS "Users can leave projects" ON public.project_members;

-- Recreate UPDATE policy with correct logic
CREATE POLICY "Project creators can manage members"
  ON public.project_members FOR UPDATE
  TO authenticated
  USING (
    -- Allow if user is the project creator
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_members.project_id
      AND c.user_id = auth.uid()
    )
  );

-- Recreate DELETE policy with correct logic
CREATE POLICY "Project creators can delete members"
  ON public.project_members FOR DELETE
  TO authenticated
  USING (
    -- Allow if user is the project creator OR if user is deleting their own membership
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.community c ON c.id = p.creator_id
      WHERE p.id = project_members.project_id
      AND c.user_id = auth.uid()
    )
    OR
    user_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'project_members'
ORDER BY policyname;
