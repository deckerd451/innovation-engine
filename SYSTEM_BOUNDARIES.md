# System boundaries

BUILDSPACE (Innovation Engine) owns community profiles, the collaboration
network, projects, organizations, opportunities, and professional context.
Its web client uses Supabase project `mqbsjlgnsirqsmfnreqd`.

Nearify Web owns event discovery and participation, saved people,
relationship history, follow-up, and Nearify messaging flows. Its client uses
Supabase project `unndeygygkgodmmdnlup`. Nearify iOS also owns native live-event
interaction and consumes BUILDSPACE context through its optional bridge.

These are separate identity and data domains, not one shared backend.
`auth.users.id` is local to each project and is used for session/RLS checks.
BUILDSPACE public identity is `community.id` (`community.user_id` maps to auth).
Nearify public identity is `profiles.id` (`profiles.user_id` maps to auth).
Never compare or substitute IDs across projects.

The iOS bridge authenticates separately to BUILDSPACE and links the Nearify
profile through `nearify_identity_map`. Context sharing has separate,
revocable authorization through `community_experience_authorizations`.
Linking accounts does not itself connect two people or authorize messaging.

See [Relationship ownership](docs/RELATIONSHIP_OWNERSHIP.md) for the state map,
legacy ingestion exception, and consolidation scope. Repository definitions
and migration comments are not proof that a migration is deployed.
