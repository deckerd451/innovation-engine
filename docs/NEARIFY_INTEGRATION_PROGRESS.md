# Nearify / BUILDSPACE integration follow-through

Latest operational status: [legacy deprecation and completed audit](NEARIFY_LEGACY_INGESTION_DEPRECATION.md).
Earlier preparation-stage notes below remain historical context.

Recorded 2026-11-14. Deployment evidence below was supplied by the operator
through SQL exports and an iOS smoke test, not direct database access by Codex.

## Verified work

- BUILDSPACE PR #341 and Nearify Web PR #337 merged: ownership contract and
  professional-score extraction. Production helper returned 19 for (1,1,1,3),
  and both deployed RPCs reference it.
- BUILDSPACE PR #342 merged and deployed: event-presence writes resolve the
  member from auth.uid(), reject conflicting supplied identities, and revoke
  anonymous execution. Export confirmed anon=false, authenticated=true and
  search_path=public, pg_temp.
- Linked iOS account joined Show & Tell and checked in: BUILDSPACE stored
  joined/true. Finish Event then produced joined/false, as intended.
- RSVP withdrawal has NOT been verified. Do not describe Finish Event as unjoin.
- The database function mentioning legacy interaction ingestion did so in a
  comment only. No actual SQL caller was established by that search.
- Reviewed source did not establish an active legacy ingestion caller in the
  current native bridge, Nearify Web, or BUILDSPACE Edge Functions/workflows.
  An unreferenced browser helper still contains a legacy RPC call.
- Stored evidence included one qr_confirmed edge created 2026-04-03.
  track_functions=none. Correctly filtered unified logs showed no matching
  messages in the available 60-minute window, including the smoke test.
  These findings DO NOT prove older/external callers are absent.

## 1. Ownership baseline

Use RELATIONSHIP_OWNERSHIP.md. Saves, mutual saves, connection approval,
messaging authorization and directional disclosure remain distinct. Neither
profile linking nor QR evidence constitutes bilateral connection consent.

## 2. Deployed service inventory — pending operator evidence

Compare deployed Edge Function names in BOTH Supabase projects with source.
BUILDSPACE tracked functions: campaign-email, campaign-email-events,
send-claim-emails. Nearify Web tracked function: og-image. Names alone do not
prove code parity; unexpected functions need source/deployment provenance and
an owner before their ingestion behavior can be cleared.

Do not read/export secrets. Inspect source for ingest_nearify_interaction,
qr_confirmed, and requests to the BUILDSPACE project's RPC endpoint. Services
outside these repositories, schedules, and third-party automation may still
use service_role credentials. Record owners and request shapes, not keys.

## 3. Legacy QR acceptance — staged resolution, not deployed

Keep existing service-role-only grants while inventory is incomplete. Do not
silently change a trusted endpoint's semantics based on one quiet hour.
The exported body still upgrades qr_confirmed into an accepted connection.
It also references interaction_edges.updated_at, which the live table lacks;
that schema drift must be checked before building on this endpoint.

Next implementation: prepare a versioned evidence-only path after exporting
live interaction_edges columns, indexes and constraints. Preserve provenance
and idempotency. QR/proximity evidence must not INSERT/UPDATE connections or
permission/disclosure tables. Restrict ingestion to trusted services. Explicit
member request/recipient approval remains the connection transition.

Acceptance checks: recording a QR leaves existing accepted, pending, blocked,
declined and absent connections untouched; duplicate submissions are safe;
unauthorized roles cannot ingest; malformed/self evidence fails; existing
connections are never bulk rewritten. Rollout requires caller inventory,
owner verification, migration tests, and explicit migration of known callers.
Then retire the old automatic-promotion endpoint with a documented rollback.

## 4. RSVP withdrawal — recommended product contract

Finish Event: end live participation, preserve RSVP and relationship history.
Leave Event: explicit, separately confirmed withdrawal of one selected event;
available even after finishing, while not checked in, and with multiple RSVPs.
It should not require checking in first and should not clear other RSVPs.
Do not remove connection history or contact disclosures as a side effect.

Code review found finishCurrentEvent clears currentEventID while retaining
joinedEventIDs. Existing leaveEvent uses currentEventID; reusing it for a
post-finish event card without an explicit event identifier is unsafe. A native
change needs event-scoped withdrawal, primary-backend success before local
removal, then best-effort BUILDSPACE left projection, plus lifecycle tests.
This document does not assert that UI is shipped or that withdrawal succeeded.

## 5. Remaining duplication review

The two identical SQL professional score formulas are consolidated already.
Live enrichment and event discovery have different candidate sets (including
versus excluding existing accepted connections); retain those boundaries.
Relationship enrichment adds context to an independently selected person;
Nearify's relationship decision engine owns that selection. Browser Daily
Brief includes extra context/theme/opportunity reasons and different counting.
Do not force these into one ranking algorithm because weights look similar.

Further extraction should share verified fact computation with parity tests,
not authorization decisions or a cross-product connected boolean. No further
behavior-preserving extraction was established in this pass.

## 6. Measurement available now, and remaining gaps

Run supabase/sql/reports/nearify_integration_snapshot.sql through existing
SQL-admin access. It is read-only, aggregate-only, and adds no client grants.
It counts unique linked members, authorization, joined/live membership and
project-membership overlap. Multiple events/projects do not multiply people.
Left rows with stale is_live=true are excluded from live membership.

This is a CURRENT snapshot. It is not a join/finish event history, proof of
bridge reliability, project activity, or evidence that an event caused a
collaboration. Do not infer conversion from overlap or from overwritten
presence timestamps. Revoked authorization remains distinct from an identity
link. No new per-person telemetry or automatic cross-project tracking is added.

Future measurements require explicit success/failure events and defined
observation windows: link completion rate, bridge projection success/attempts,
and project actions after an event. Existing BUILDSPACE product telemetry and
Nearify guest funnel analytics serve different populations and cannot simply
be summed or joined by equal UUIDs. Collect only what the agreed metric needs,
respect existing identity/context boundaries, and avoid contact/message content.

## Completion conditions

Items 1 and the initial part of 5 are complete; 2 and 3 remain pending service
inventory/live schema; 4 has a recommended contract and requires native work;
6 has a tested snapshot report, while conversion/reliability tracking remains
future work. None of these remaining items requires merging the products.
