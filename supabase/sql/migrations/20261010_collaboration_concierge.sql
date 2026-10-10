-- Collaboration Concierge context for the existing connection-request flow.
-- The connection remains the consent gate; these columns only carry the
-- purpose, prompt, scheduling choice, and completion state of that request.

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS context_type TEXT,
  ADD COLUMN IF NOT EXISTS context_reason TEXT,
  ADD COLUMN IF NOT EXISTS context_prompt TEXT,
  ADD COLUMN IF NOT EXISTS context_outcome TEXT,
  ADD COLUMN IF NOT EXISTS context_status TEXT,
  ADD COLUMN IF NOT EXISTS context_schedule TEXT,
  ADD COLUMN IF NOT EXISTS context_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS context_completed_by UUID REFERENCES public.community(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'connections_context_type_check'
      AND conrelid = 'public.connections'::regclass
  ) THEN
    ALTER TABLE public.connections
      ADD CONSTRAINT connections_context_type_check
      CHECK (context_type IS NULL OR context_type IN ('collaboration_concierge'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'connections_context_status_check'
      AND conrelid = 'public.connections'::regclass
  ) THEN
    ALTER TABLE public.connections
      ADD CONSTRAINT connections_context_status_check
      CHECK (context_status IS NULL OR context_status IN ('pending', 'accepted', 'declined', 'completed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_connections_context_status
  ON public.connections (context_type, context_status)
  WHERE context_type IS NOT NULL;
