BEGIN;
-- Private, opt-in records. No public or administrator-facing read policy.
CREATE TABLE public.hpe_participation_consent (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
 consent_version integer NOT NULL CHECK (consent_version = 1),
 adult_confirmed boolean NOT NULL CHECK (adult_confirmed),
 scope text NOT NULL CHECK (scope = 'charleston-sc'),
 enrolled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hpe_research_consent (
 user_id uuid PRIMARY KEY REFERENCES public.hpe_participation_consent(user_id) ON DELETE CASCADE DEFAULT auth.uid(),
 consent_version integer NOT NULL CHECK (consent_version = 1),
 enrolled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hpe_outcome_response (
 user_id uuid PRIMARY KEY REFERENCES public.hpe_research_consent(user_id) ON DELETE CASCADE DEFAULT auth.uid(),
 response text NOT NULL CHECK (response IN ('yes','no','prefer_not_to_answer')),
 submitted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hpe_participation_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpe_research_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpe_outcome_response ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hpe_participation_consent, public.hpe_research_consent, public.hpe_outcome_response FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.hpe_participation_consent, public.hpe_research_consent, public.hpe_outcome_response TO authenticated;
GRANT INSERT (consent_version, adult_confirmed, scope) ON public.hpe_participation_consent TO authenticated;
GRANT INSERT (consent_version) ON public.hpe_research_consent TO authenticated;
GRANT INSERT (response), UPDATE (response) ON public.hpe_outcome_response TO authenticated;
CREATE POLICY hpe_participation_read ON public.hpe_participation_consent FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY hpe_participation_join ON public.hpe_participation_consent FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY hpe_participation_leave ON public.hpe_participation_consent FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY hpe_research_read ON public.hpe_research_consent FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY hpe_research_join ON public.hpe_research_consent FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY hpe_research_leave ON public.hpe_research_consent FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY hpe_response_read ON public.hpe_outcome_response FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY hpe_response_insert ON public.hpe_outcome_response FOR INSERT TO authenticated WITH CHECK (
 user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.hpe_research_consent c WHERE c.user_id = auth.uid() AND now() >= c.enrolled_at + interval '720 hours')
);
CREATE POLICY hpe_response_correct ON public.hpe_outcome_response FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY hpe_response_delete ON public.hpe_outcome_response FOR DELETE TO authenticated USING (user_id = auth.uid());
COMMIT;
