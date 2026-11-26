BEGIN;
-- Explicit owner binding prevents stale browser requests from enrolling a different account.
-- Existing INSERT policies still require user_id = auth.uid().
GRANT INSERT (user_id) ON public.hpe_participation_consent, public.hpe_research_consent, public.hpe_outcome_response TO authenticated;
COMMIT;
