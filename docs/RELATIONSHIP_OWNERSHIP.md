# Relationship ownership and consolidation

Status: proposed contract, backed by repository inspection on 2026-11-14.
This defines implementation boundaries; it does not assert deployed state or
migrate existing relationships. BUILDSPACE snapshot: 0e56419; Nearify Web:
c66b928. Native evidence: InnovationEngineBridgeService and
BuildspaceRelationshipEnrichmentStore in deckerd451/nearify-ios.

## Ownership map

| Fact | Authority | Meaning and allowed propagation |
| --- | --- | --- |
| Login/session | Each project's auth.users | Project-local identity; never interchange auth UUIDs. |
| Public profile | BUILDSPACE community; Nearify profiles | Linked explicitly through nearify_identity_map; no automatic profile merge. |
| Cross-product context authorization | BUILDSPACE community_experience_authorizations | Separate from identity linking and person-to-person connection. Revocable. |
| Event participation/live presence | Nearify event flow | Mirror commitment separately from explicit live check-in. An RSVP does not establish physical presence. |
| One-sided save | Nearify person_saves and relationship RPCs | “I want to remember this person.” Does not grant messaging, disclose contact details, or accept a BUILDSPACE connection. |
| Mutual saving | Nearify relationships.status=confirmed | Both saved each other; not permission to message. |
| Nearify messaging approval | Nearify connections and web_can_message | Recipient approval and block rules control access; relationship scores and saves cannot grant it. |
| Personal contact disclosure | Nearify contact_disclosures | Directional and separately revocable. Messaging approval does not disclose email/phone. |
| BUILDSPACE connection | BUILDSPACE connections | Local pending/accepted lifecycle. Nearify save/mutual-save statuses are not aliases. |
| Encounter evidence | Nearify; BUILDSPACE interaction_edges for ingested evidence | Preserve provenance. Proximity alone cannot imply consent or an accepted connection. |
| Projects, organizations, opportunities | BUILDSPACE | Provide authorized professional context; do not manufacture Nearify encounters or messaging permission. |

Nearify's `connectionState.CONNECTED` means mutual saving in that UI helper;
it is not an authorization predicate. Use backend `web_can_message`/permission
RPCs for messaging and explicit disclosure RPCs for contact information.

## Bridge contract

Native linking uses a separate BUILDSPACE OAuth session. Resolve the caller
from that session and candidates through the identity map. Never infer a
cross-product identity from equal UUIDs or a client-supplied caller ID.

The live-attendee RPC enriches a list Nearify has already selected as live;
it does not establish physical presence. Between-event relationship enrichment
explains Nearify's already-selected person and must not change the selection,
relationship history, or permissions. Failures yield no enrichment and must
not block Nearify's primary action. Preserve hidden-profile and authorization
gates and avoid exposing durable BUILDSPACE identifiers.

Unlinking revokes the bridge/context authorization; it does not delete either
account. Signing out clears local bridge credentials, rather than silently
revoking the server-side link.

## Legacy exception requiring explicit review

`sql/nearify_ingestion_pipeline.sql` and `nearify_identity_bridge.sql` contain
an ingestion branch that turns `qr_confirmed` into an accepted BUILDSPACE
connection. The October membership/proximity authorization migration restricts
`ingest_nearify_interaction` to service_role and replaces client edge promotion
with a pending request / reciprocal acceptance flow. Those later restrictions
must not be overwritten by reapplying the older bootstrap SQL.

Do not forward Nearify's unilateral account-QR save or mutual-save event as
`qr_confirmed` to that legacy ingestion path. Before changing or expanding the
integration, audit the deployed RPC grants and every trusted ingestion caller.
Either verify the event carries explicit bilateral BUILDSPACE consent, or
introduce a versioned evidence-only ingestion path and migrate callers. This
change does not silently rewrite existing accepted connections or remove a
legacy path whose production consumers have not been verified.

## Duplication inventory and first consolidation

| Logic | Decision |
| --- | --- |
| Professional score in get_nearify_event_recommendations and get_nearify_live_attendee_signals | Extract identical arithmetic into nearify_professional_context_score. Keep event baseline +6 at the event call site. |
| Candidate eligibility in those RPCs | Keep separate: event discovery excludes existing accepted connections; live enrichment intentionally includes them. |
| Visibility, context authorization, identity resolution | Keep at each RPC boundary; a shared arithmetic helper must not bypass them. |
| Relationship enrichment and live signals | Share the ownership contract; keep response schemas and candidate selection separate. |
| Browser Daily Brief and SQL context scores | Similar weights, different evidence/counting and purpose. Do not replace with a single ranking algorithm. |
| Nearify intelligence-algo / native relationship decisions | Nearify-owned event/relationship decisions, not duplicates of BUILDSPACE professional matching. |
| Save, connection, messaging, contact disclosure | Separate state machines; do not consolidate into one connected boolean. |

The first extraction has no table access, no identity input, and no permission
side effects. It preserves repeated-skill counting and the existing skill cap;
normalizing/deduplicating terms would be a separate behavior change.

## Review and deployment

Apply `supabase/sql/migrations/20261114_nearify_context_score.sql` as one
transaction after comparing the two deployed RPC definitions to this snapshot.
Abort deployment if definitions differ; reconcile newer filters before applying.
The migration retains the existing RPC signatures/grant statements, and grants
the new invoker-only arithmetic helper to authenticated/service_role. No
production migration has been applied by this work.

Rollback: `supabase/sql/rollback/20261114_nearify_context_score_rollback.sql`
restores both prior RPC bodies before dropping the helper. Later migrations
must be considered before applying a historical rollback.

Validation: execute the context-score PostgreSQL test in
`scripts/tests/test-nearify-context-score.mjs` with PGlite available via
`PGLITE_MODULE`. It compares old/new RPC results on representative fixtures,
checks score parity and authorization/filter cases, and exercises rollback.

Remaining: production grant/caller audit for the legacy ingestion exception,
usage/maintenance measurements, and any cross-product migration. A full product,
identity, or database merger is outside this change.
