# HPE opportunity operations

The daily HPE opportunity freshness workflow generates a pathway-level renewal queue, current inventory and provider evidence in its opportunity-review artifact. Items are due within two days of expiry and excluded from current inventory at expiry. The Home view applies the same seven-day ceiling and honors earlier cutoffs. Link checks and candidate feeds help prioritize reviews. A successful HTTP response does not extend a review or confirm a shift.

1. Open each official provider page and verify the role, Charleston coverage, adult eligibility and next step. Use `pathwayId` to retain the identity of an unchanged role. Remove rows that the evidence no longer supports.
2. Update [the reviewed evidence](../data/hpe-release-reviewed-evidence.json) for each independently rechecked pathway. Record the actual review time and any earlier deadline. For recurring entries, the deadline is the recheck cutoff. Scheduled entries also require a future start and an application cutoff no later than that start.
3. Run `node scripts/opportunity-publication.js data/hpe-release-reviewed-evidence.json > proposed-inventory.json`. When it succeeds, review the diff and replace `data/hpe-published-opportunities.json` with the proposal. CI checks that the published file reproduces exactly from reviewed evidence.
4. Submit both files through the normal PR and deployment process. Before pilot activation, run `node scripts/opportunity-renewal.js --current-inventory` and confirm at least 25 fresh pathways. Keep the pilot off if there are fewer than 25 at launch.

Renewal automates expiry, queueing and preparation of the current inventory. Republishing an extended review requires fresh official-source evidence and the normal PR review.
