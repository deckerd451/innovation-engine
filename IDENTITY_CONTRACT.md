# Identity Contract

## Canonical IDs

- auth.users.id = authenticated actor identity
- community.id = public graph/profile identity
- community.user_id = mapping from community profile to auth user

## Rules

- Use auth.users.id for:
  - RLS checks
  - ownership checks
  - session/user lookup
  - auditing actor identity

- Use community.id for:
  - graph nodes
  - connections
  - interaction edges
  - memberships and public relationships
  - UI person references

- Never use generic user_id in new code unless it explicitly means auth.users.id.
- Prefer auth_user_id or community_id / community_user_id as column names.

- Confirmed table semantics

- project_members.user_id = community.id
- presence_sessions.user_id = community.id
- project_requests.user_id = unverified (no rows yet)
