-- Admin/SQL-editor report only; no grants or client-facing RPC are added.
-- Current-state indicators, NOT historical conversion or bridge success rates.
-- Returns aggregate counts only; never names, emails, profile IDs, or event IDs.
WITH linked AS (
  SELECT DISTINCT community_id FROM public.nearify_identity_map
), authorized AS (
  SELECT DISTINCT l.community_id FROM linked l
  JOIN public.community_experience_authorizations a USING (community_id)
  WHERE a.experience = 'nearify' AND a.status = 'authorized'
), joined AS (
  SELECT DISTINCT community_id FROM public.nearify_event_presence
  WHERE status = 'joined'
), live AS (
  SELECT DISTINCT community_id FROM public.nearify_event_presence
  WHERE status = 'joined' AND is_live = true
), project_members AS (
  SELECT DISTINCT user_id AS community_id FROM public.project_members
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'measurement_kind', 'current_state_snapshot',
  'linked_members', (SELECT count(*) FROM linked),
  'linked_and_context_authorized_members', (SELECT count(*) FROM authorized),
  'linked_members_with_joined_event', (
    SELECT count(*) FROM linked JOIN joined USING (community_id)
  ),
  'linked_members_with_live_event', (
    SELECT count(*) FROM linked JOIN live USING (community_id)
  ),
  'linked_members_with_project_membership', (
    SELECT count(*) FROM linked JOIN project_members USING (community_id)
  ),
  'linked_joined_members_with_project_membership', (
    SELECT count(*) FROM linked JOIN joined USING (community_id)
    JOIN project_members USING (community_id)
  )
) AS nearify_integration_snapshot;
