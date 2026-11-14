# Evidence-only Nearify ingestion v2

Latest operational status: [legacy deprecation and completed audit](NEARIFY_LEGACY_INGESTION_DEPRECATION.md).
Earlier preparation-stage notes below remain historical context.

Prepared replacement, not a migrated caller or deployed service. The legacy
`ingest_nearify_interaction` function and its grants remain unchanged.

## Contract

`ingest_nearify_evidence_v2` is executable by service_role only (and the database
owner for maintenance). Never call it with a service key from a browser/native
app. An authorized trusted backend must first validate the event and evidence
source; this RPC does not establish that two people physically met.

Inputs: event UUID, two opaque Nearify profile IDs, optional signal type
(qr_confirmed/proximity/ble_proximity), confidence 0–100, occurrence timestamp,
and event display name. Nearify IDs must match the stored identity-map spelling;
they are not BUILDSPACE community IDs or auth IDs. Both mapped members must
have authorized Nearify context use; reconfirmation/revocation is not sufficient.

Creates a `suggested` interaction edge with structured provenance. `qr_confirmed`
describes encounter evidence, not relationship consent. No connection,
messaging permission, or contact disclosure is written. Existing graph consumers
may display this evidence; do not equate appearing under “People you met” with
an accepted connection or proven physical encounter.

Canonical pair + event + signal type is the idempotency key, using a new partial
unique expression index scoped to source=nearify-evidence-v2 and version=2. Retries return the existing edge without modifying
its status, confidence, provenance or timestamp. Reversed pair order is the same
key; separate signal types are separate evidence. Historical evidence is outside this index and retry lookup; a v2 call may
create its own edge for a pair/event/signal already present in legacy data.
Duplicate historical edges are not relabeled or removed. Conflicting retry payloads retain the first stored evidence.
New evidence returns edge_created=true; a duplicate returns false. Both return
connection_created=false and connection_promoted=false, meaning this invocation
did not create/promote a connection, not that no connection already exists.

No arbitrary metadata is accepted. No updated_at column is assumed. Required overlap_seconds is written as 0,
meaning no measured overlap duration is supplied, not proven co-presence. The live
legacy function referenced that absent column. Enabled user triggers on the
edge table cause v2 calls to fail closed until reviewed; an indirect trigger
must not turn evidence into a connection. Do not disable production triggers
blindly to make the check pass. Internal constraint triggers are permitted.

## Deployment and caller cutover

1. Run `supabase/sql/diagnostics/nearify_evidence_v2_preflight.sql` through the
   existing SQL-admin workflow. Review columns, status/type constraints,
   expression index and triggers. The operator preflight confirmed no updated_at, required overlap_seconds,
   no pair/event/signal unique index, suggested as an allowed status, and no
   user triggers. This revision matches those constraints. Index creation
   takes a table lock; schedule appropriately for production traffic.
2. Review and apply `supabase/sql/migrations/20261114c_nearify_evidence_v2.sql`.
   Additive: no caller switches and no historical row changes are performed.
3. Identify a trusted caller owner and verify its payload/event validation.
   Switch that caller explicitly to the v2 contract. Do not point existing
   browser helpers at a service-only endpoint or put a service key in an app.
4. Verify edge creation, repeat submission, unchanged connections and absence
   of permission effects on a controlled test pair. Preserve ignored/blocked
   evidence. Member consent uses existing explicit request/accept mechanisms.
5. Only retire the old endpoint after known callers are migrated and the
   remaining external-use uncertainty is resolved. The quiet 60-minute log
   window is insufficient to establish historical inactivity.

Rollback drops the v2 RPC and its partial index, retaining evidence rows. Stop v2 callers first;
do not automatically fall back to legacy QR auto-acceptance on RPC errors.

## Audit findings

Operator inventory: BUILDSPACE deploys send-claim-emails; Nearify deploys og-image
and send-message-push. The supplied send-message-push code reads Nearify
conversation/profile/device-token records and sends Apple push notifications;
no BUILDSPACE call, ingestion call or local imports were present. This clears
that supplied version, not arbitrary future deployments. Other external jobs
with service credentials remain unverified.

## Tests

Run with @electric-sql/pglite installed in an isolated dependency directory:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
  node scripts/tests/test-nearify-evidence-v2.mjs
```

Covers grants, QR/proximity evidence, pair reversal/idempotency, bad identities
and parameters, authorization, preservation of blocked edges and all existing
connection states, fail-closed user triggers, a schema with no updated_at,
source/migration parity, rollback and reapplication. Physical encounter truth,
live schema/index compatibility and external caller migration remain deployment
checks; the fixture is not a substitute for the preflight.
