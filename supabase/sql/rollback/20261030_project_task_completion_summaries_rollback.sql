-- Roll back task completion summaries.
-- Destructive: this removes every completion summary saved in the column.

ALTER TABLE public.project_tasks
  DROP COLUMN IF EXISTS completion_note;
