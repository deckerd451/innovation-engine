# HPE release gates

Preserve the intentional HPE participation flags already enabled on `main`. `HPEResearchPilot` remains off. See the [activation runbook](HPE_PRIVATE_CONSENT_RELEASE.md); do not disable participation merely to satisfy outdated guidance.

- Confirm the exact PR head passes required CI checks and review the tested migrations and rollbacks.
- Confirm at least 25 current pathways from the [official-source review](HPE_PROVIDER_EVIDENCE_2026-11-26.md). The [renewal workflow](HPE_OPPORTUNITY_OPERATIONS.md) prepares a daily queue and excludes expired items from current inventory.
- Prefer isolated staging for authenticated checks when it is available. If it is unavailable and the release owner accepts the residual risk, perform read-only schema checks first, then use designated synthetic test accounts and clearly labeled test projects for controlled production validation. Never use other members' data or send unsolicited invitations. Repository tests remain synthetic and are not production validation.
- Keep optional research off until the cohort, retention and deletion procedure, consent language and reporting access have been approved and tested. For a client regression, revert the release commit while preserving pilot consent and withdrawal access; pause flags only for a specific privacy or security incident with a withdrawal plan.
