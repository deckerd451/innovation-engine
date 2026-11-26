# HPE release gates

Keep all pilot flags unset until the release process in [the activation runbook](HPE_PRIVATE_CONSENT_RELEASE.md) is complete.

- Confirm the exact PR head passes required CI checks and review the tested migrations and rollbacks.
- Confirm at least 25 current pathways from the [official-source review](HPE_PROVIDER_EVIDENCE_2026-11-26.md). The [renewal workflow](HPE_OPPORTUNITY_OPERATIONS.md) prepares a daily queue and excludes expired items from current inventory.
- In staging, exercise real Supabase sign-in, participation consent, withdrawal and account switching. Repository tests use a disposable PostgreSQL cluster and synthetic browser sessions.
- Keep optional research off until the cohort, retention and deletion procedure, consent language and reporting access have been approved and tested.
