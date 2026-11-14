-- Stop/migrate v2 callers first. Retain encounter evidence and all legacy state.
BEGIN;
DROP FUNCTION IF EXISTS public.ingest_nearify_evidence_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT);
COMMIT;
