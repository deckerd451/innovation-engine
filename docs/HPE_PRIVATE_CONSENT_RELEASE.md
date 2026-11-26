# Private consent foundation — staging only

Participation consent is adult self-attestation and Charleston scope, not age verification. Research consent is a distinct opt-in. Withdrawal deletes dependent records via foreign keys. Research withdrawal does not remove participation consent. Authenticated clients cannot set identities or enrollment timestamps. No application administrator read policy is introduced; privileged database operators still have access.

One response per research enrollment in a single operator-configured fixed 720-hour cohort window, with a follow-up cutoff no later than 168 hours after the end. Enrollment closes at window start. Do not collect real responses until cohort dates, response cutoff, retention/deletion schedule, consent copy, and reporting authorization are finalized. Client integration is staged behind HPEParticipationPilot, HPEPersistentConsent and HPEResearchPilot (all require explicit true). No production migration or activation. Rollback destroys pilot records; use only under an approved data-handling plan.

Before release: execute migration and rollback on disposable PostgreSQL, verify cross-account denial, anonymous denial, cascade withdrawal, timestamp spoof denial, and early response denial. Validate the staged authenticated client, including logout/race guards, on mobile and desktop. Keep pilot disabled.
