# Nearify event-presence authorization fix

The production definition exported on 2026-11-14 accepts caller-supplied
community/auth/Nearify identities without binding them to the session. It is
SECURITY DEFINER and executable by both anon and authenticated. This permits
writes to another member's commitment row when their identity is known.

The audit's apparent database caller of `ingest_nearify_interaction` was only
a comment in this function; it does not actually call interaction ingestion.
There is one stored qr_confirmed edge dated 2026-04-03, but function tracking
is disabled, so this does not prove external ingestion is unused. The legacy
service-role ingestion caller audit remains open and separate from this fix.

## Behavior

- Resolve the actor only from auth.uid() and their community mapping.
- Keep all seven parameters and JSON response keys for existing native clients.
- Supplied identity parameters assert ownership; each non-null assertion must
  match. A matching parameter cannot conceal another mismatched parameter.
- Nearify profile assertions must map to the signed-in member. Comparison is
  case-insensitive to accommodate Swift UUID string casing.
- Missing JWT or mismatched assertions raise SQLSTATE 42501 without writing.
- Anonymous execution is explicitly revoked, including role-specific grants.
- service_role retains EXECUTE, but now also needs a member JWT context for
  this user-facing RPC. No arbitrary service-identity override is introduced.
- Existing join/leave upsert behavior, is_live behavior, and separate context
  authorization stay unchanged. This is not a connection or messaging grant.

The reviewed native InnovationEngineBridgeService authenticates independently
to BUILDSPACE and supplies its current Nearify profile ID. Its existing call
continues to work when that profile is linked to the authenticated member.
An unmapped/mismatched account now fails instead of writing for another person.

## Deployment

Run the complete transaction in:
`supabase/sql/migrations/20261114b_nearify_event_presence_authz.sql`.
No production migration was applied while preparing this change. Compare the
current definition to the exported snapshot before deployment if it has changed.
Existing compromised/historical rows are not altered automatically.

Verify anon EXECUTE is false, authenticated EXECUTE is true, and the definition
resolves community from auth.uid(). Smoke-test a linked user's native join/leave.
Verify anonymous and another member's identity cannot change a presence row.

Emergency rollback:
`supabase/sql/rollback/20261114b_nearify_event_presence_authz_rollback.sql`
restores the old body with clients disabled (anon AND authenticated). This
intentionally pauses native BUILDSPACE presence mirroring instead of reopening
impersonation. Primary Nearify event actions are independent of the bridge.
Reapply the fixed migration to restore native mirroring.

## Validation

Run the executable PostgreSQL regression test:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
  node scripts/tests/test-nearify-event-presence-authz.mjs
```

It covers anonymous and missing-session rejection, forged/mixed identity
assertions, the native profile-ID call, own writes with and without assertions,
idempotency, missing community profiles, validation failures, isolation of
other members' rows, retained live-flag semantics, explicit anonymous grants,
pinned search_path, and safe rollback/reapplication. It uses a fresh in-memory
PostgreSQL database and no production credentials or personal data.
