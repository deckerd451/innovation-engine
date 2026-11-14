-- Pure professional-context calculation shared by Nearify-facing RPCs.
-- No identities, table access, candidate selection, or permission decisions.
CREATE OR REPLACE FUNCTION public.nearify_professional_context_score(
  p_shared_projects BIGINT,
  p_mutual_connections BIGINT,
  p_shared_organizations BIGINT,
  p_shared_skills BIGINT
)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT (p_shared_projects > 0)::int * 5
       + (p_mutual_connections > 0)::int * 4
       + (p_shared_organizations > 0)::int * 4
       + LEAST(p_shared_skills, 3) * 2;
$$;

REVOKE ALL ON FUNCTION public.nearify_professional_context_score(BIGINT, BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nearify_professional_context_score(BIGINT, BIGINT, BIGINT, BIGINT) TO authenticated, service_role;
