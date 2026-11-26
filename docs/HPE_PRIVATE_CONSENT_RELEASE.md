# HPE production migration and activation

## Before deploying

1. Keep `HPEParticipationPilot`, `HPEPersistentConsent` and `HPEResearchPilot` unset in production. Use the exact reviewed PR revision after required checks pass. Confirm the release owner has approved deployment.
2. Apply the migration sequence below to staging first. Use two separate test accounts on phone and desktop. Verify Home starts in its ordinary mode, consent requires a deliberate action, active consent survives refresh, switching accounts clears the previous account's state, and leaving deletes the stored consent. Verify one adult Charleston-area account can open a provider pathway, dismiss one role without dismissing another on the same page, and still reach usual Home features.
3. Confirm the current inventory contains at least 25 reviewed pathways with `node scripts/opportunity-renewal.js --current-inventory`, and verify the daily freshness workflow is available. See [opportunity operations](HPE_OPPORTUNITY_OPERATIONS.md).

## Migrate and deploy

Take an approved database recovery point. Confirm migration history in the intended Supabase project. With the normal privileged migration connection, apply missing scripts in order, with stop-on-error enabled, or run the equivalent tracked deployment process. Each script manages its own transaction.

```sh
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/migrations/20261126_hpe_private_consent.sql
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/migrations/20261127_hpe_explicit_consent_identity.sql
```

Deploy the reviewed static-site revision with all three flags off and check ordinary signed-in and signed-out Home. Once the gates pass, add this script in the deployment revision of `index.html` immediately before the deferred `assets/js/home-view.js` script, then deploy that revision through the normal release process.

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

For a full schema rollback, confirm the data-handling decision before proceeding. The second command drops the pilot tables and their data.

```sh
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/rollback/20261127_hpe_explicit_consent_identity_rollback.sql
psql "$HPE_RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/sql/rollback/20261126_hpe_private_consent_rollback.sql
```
