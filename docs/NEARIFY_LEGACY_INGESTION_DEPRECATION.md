# Legacy Nearify ingestion: deprecated

Status recorded 2026-11-14 from repository review and operator-supplied
production exports. This is a repository/documentation deprecation. It does not
revoke production access, delete data, switch callers, or retire the endpoint.

## Required path for future integrations

Use `public.ingest_nearify_evidence_v2` from a trusted backend with service_role.
See [Evidence v2](NEARIFY_EVIDENCE_V2.md) for the contract and rollout constraints.
Never expose service credentials to a browser or native app. This endpoint
records suggested encounter evidence and cannot grant person-to-person consent.
Connection approval and messaging permissions remain explicit, separate flows.

Do not add callers of `ingest_nearify_interaction`, import the legacy browser
helper, or fall back to legacy ingestion on a v2 error. Its qr_confirmed branch
can automatically accept a BUILDSPACE connection and its exported body assumes
an updated_at column absent from production interaction_edges.

## Verified scope and limits of the caller audit

- Reviewed BUILDSPACE/Nearify Web code and current native bridge did not identify
  an active legacy caller. The unreferenced browser helper still contains one.
- BUILDSPACE deployed function inventory: send-claim-emails. Its reviewed source
  contains no legacy ingestion call.
- Nearify inventory: og-image and send-message-push. The supplied push source
  sends APNs message notifications and contains no BUILDSPACE/ingestion call.
- BUILDSPACE trigger inventory: no matching HTTP/legacy-ingestion hooks.
- Nearify inventory: public.messages / messages_send_message_push_insert /
  notify_send_message_push(), enabled, no textual legacy-ingestion reference.
  This is consistent with the reviewed push service; it is not proof that
  arbitrary future versions cannot change their behavior.
- Neither database has a cron.job table. This does not exclude external jobs
  or scheduling mechanisms other than pg_cron.
- The apparent SQL caller in ingest_nearify_event_presence was a comment only.
- One stored qr_confirmed edge dated 2026-04-03 was reported. track_functions
  was disabled. The available 60-minute message-log filter returned no matches.
  These observations do not establish historical inactivity.

No production caller was identified to migrate within this scope. Unmanaged
external scripts/services with trusted credentials remain unverified. Keep the
legacy service-role-only restriction; do not claim the endpoint is disabled.

## V2 deployment and controlled test

PRs #344/#345 merged; operator confirmed service_role EXECUTE=true,
anon/authenticated EXECUTE=false, and the v2 partial unique index exists.
Live preflight confirmed required overlap_seconds, no updated_at, no global
pair/event/signal unique index, and no user triggers on interaction_edges.

The operator ran the rollback-only controlled test against two existing
authorized linked accounts. Assertions passed for suggested QR evidence,
zero supplied overlap, reversed-pair retry deduplication, unchanged pair
connection rows, and automatic rollback of all test evidence. This was an
SQL-admin test, not production traffic from a migrated caller or physical
proof of an encounter. No caller has been switched by this work.

## Retirement is a separate change

Before revoking legacy service access, establish accountable ownership of
trusted credentials/callers and an observation plan beyond the quiet hour.
If a caller is discovered, verify its event/evidence validation and migrate it
explicitly to v2; never blindly alias incompatible payloads. Then propose a
separate retirement migration with rollback and operational notice to its
known owners. Do not rewrite accepted historical connections as part of
retirement. Existing bootstrap/reference SQL is historical, not a deployment
recipe; reapplying it can restore obsolete behavior or grants.

Other open work remains separate: event-scoped RSVP withdrawal and longitudinal
integration measurement. Finish Event correctly ends live participation while
preserving the RSVP.
