# Private consent foundation — staging only

Participation consent is adult self-attestation and Charleston scope, not age verification. Research consent is a distinct opt-in. Withdrawal deletes dependent records via foreign keys. Research withdrawal does not remove participation consent. Authenticated clients cannot set identities or enrollment timestamps. No application administrator read policy is introduced; privileged database operators still have access.

One response per research enrollment, eligible after 720 hours. This is an individual enrollment-relative window, not yet the fixed cohort window required by the outcome protocol. Do not collect real responses until cohort dates, response cutoff, retention/deletion schedule, consent copy, and reporting authorization are finalized. No client integration or production migration in this PR. Rollback destroys pilot records; use only under an approved data-handling plan.

Before release: execute migration and rollback on disposable PostgreSQL, verify cross-account denial, anonymous denial, cascade withdrawal, timestamp spoof denial, and early response denial. Integrate authenticated client with logout/race guards and test mobile/desktop. Keep pilot disabled.
