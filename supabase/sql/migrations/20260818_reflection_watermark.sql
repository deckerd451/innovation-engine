-- Durable boundary for the canonical Network Reflection.
-- This is intentionally not an event ledger and carries no UI state.
ALTER TABLE public.community
  ADD COLUMN IF NOT EXISTS reflection_last_visited_at timestamptz,
  ADD COLUMN IF NOT EXISTS reflection_previous_visited_at timestamptz;

COMMENT ON COLUMN public.community.reflection_last_visited_at IS
  'Most recent successfully rendered canonical Network Reflection visit.';
COMMENT ON COLUMN public.community.reflection_previous_visited_at IS
  'Prior Reflection visit boundary, retained for a future since-last-visit comparison.';
