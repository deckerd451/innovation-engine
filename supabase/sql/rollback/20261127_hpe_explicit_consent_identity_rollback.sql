BEGIN;
REVOKE INSERT (user_id) ON public.hpe_participation_consent, public.hpe_research_consent, public.hpe_outcome_response FROM authenticated;
COMMIT;
