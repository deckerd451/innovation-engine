# HPE production migration and activation

## Before deploying

1. Preserve the intentional participation pilot state already present on `main`: `HPEPersistentConsent` and `HPEParticipationPilot` are enabled by the recorded pilot decision. Do not unset them merely to conform to this runbook. `HPEResearchPilot` remains unset; research stays off. This PR does not change these flags.
2. When an isolated staging project is available, verify the migration sequence there with separate synthetic accounts. If staging is unavailable and the release owner accepts the residual risk, validate schema compatibility read-only and limit production validation to designated test accounts and clearly labeled test projects. Require deliberate consent, verify account switching and withdrawal, and do not use or alter other members' data.
3. Confirm the current inventory contains at least 25 reviewed pathways with `node scripts/opportunity-renewal.js --current-inventory`, and verify the daily freshness workflow is available. See [opportunity operations](HPE_OPPORTUNITY_OPERATIONS.md).

## Migrate and deploy

Take an approved database recovery point. Confirm migration history in the intended Supabase project. With the normal privileged migration connection, apply missing scripts in order, with stop-on-error enabled, or run the equivalent tracked deployment process. Each script manages its own transaction.

```sh
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/migrations/20261126_hpe_private_consent.sql
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/migrations/20261127_hpe_explicit_consent_identity.sql
```

The participation flags below are already intentionally enabled on `main`. Preserve them in the reviewed deployment; do not add a separate flag toggle as a release gate. Verify signed-in and signed-out Home and confirm that enrollment still requires an explicit member action.

```html
<script>
  window.HPEPersistentConsent = true;
  window.HPEParticipationPilot = true;
</script>
```

Leave `window.HPEResearchPilot` unset. Enrollment is voluntary and separate for each account. The flag is a client feature control. Database row policies enforce account ownership.

## Research and retention

Participation uses adult self-attestation and Charleston scope. Research is a separate opt-in and requires an approved enrollment and retention policy before configuring the single fixed cohort. The research window lasts 720 hours and the follow-up cutoff is within 168 hours of its end. Enrollment closes at the start of the window. Research withdrawal deletes the response and preserves participation eligibility. Participation withdrawal or account deletion cascades through research consent and responses. Privileged database operators have access. Agree a retention and backup expiry schedule and rehearse deletion and aggregate reporting before enabling research.

## Roll back

Turn off the pilot and research client flags, redeploy, and verify Home returns to ordinary behavior. Turning flags off preserves stored records. Preserve the approved withdrawal and deletion route for existing participants during a pause.

For a client regression in a release that does not change these migrations, revert the release commit and retain pilot flags and database rows so existing members can still reach consent and withdrawal controls. Pause a pilot only for a privacy or security incident, with an explicit withdrawal plan. For a full schema rollback, confirm the data-handling decision before proceeding. The second command drops the pilot tables and their data.

```sh
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/rollback/20261127_hpe_explicit_consent_identity_rollback.sql
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/rollback/20261126_hpe_private_consent_rollback.sql
```
