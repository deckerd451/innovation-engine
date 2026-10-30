-- Add concise completion summaries to project tasks.
-- Additive only: existing rows retain NULL until a member adds a summary.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS completion_note TEXT;

COMMENT ON COLUMN public.project_tasks.completion_note IS
  'Brief member-written summary of what was accomplished when this task was completed.';
