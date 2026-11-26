# HPE opportunity operations

The daily HPE opportunity freshness workflow is read-only. Download its opportunity-review artifact for expiry, candidate and link evidence reports. A reachable link is not verification.

## Renewal procedure

1. Inspect the official provider page and confirm the program description and participation route. Resolve redirects manually.
2. Prepare a complete replacement inventory review array, including retained programs. Each record requires title, organization, sourceUrl, reviewStatus (verified), reviewedAt, deadline, reviewer, evidenceNote and availability (provider_confirmation_required). Do not reuse or advance review timestamps without actual review.
3. Run node scripts/opportunity-publication.js reviews.json > proposed-inventory.json. A nonzero exit means do not use the output.
4. Compare the proposal with data/hpe-published-opportunities.json. Confirm intentional removals, geography and expiry. Keep reviewer notes outside public inventory and avoid personal data.
5. Submit the proposed inventory through a pull request and run validation. Never write directly to production.

The seven-day review limit is not a provider application deadline. The pilot remains opt-in and disabled by default. Independent provider discovery, authenticated review and member outcome measurement remain separate work.
