# Human Potential Engine — proposed engineering charter

## Mission
Expand voluntary opportunities to belong, grow, exercise agency and contribute. Human dignity is unconditional; participation is not a condition of access to support.

## Existing foundation
Reuse the static application, project assistance journeys, capability memory and existing Supabase authorization boundaries. See docs/VALIDATION.md and package.json. This is a preliminary audit, not a complete dependency inventory.

## Incremental delivery
1. Inventory existing member, project, recommendation and consent interfaces.
2. Add optional aspirations, learning interests and participation preferences, private by default, editable and deletable.
3. Extend opportunity matching to include learning, mentorship, community service and paid opportunities. Explain matches; allow dismissal and opt-out. Never rank human worth.
4. Track member-confirmed meaningful participation, not clicks or time spent. Support correction and deletion.
5. Introduce separate voluntary research consent and aggregate reporting. Do not expose individual well-being responses to matching or administrators.
6. Pilot with community partners and evaluate before expanding. Keep existing functionality available.

## Pilot protocol
Proposed 90-day pilot, target 100 consenting adult participants, subject to recruitment and partner capacity. Establish baseline before intervention; use randomized invitation or staggered rollout where feasible. Define primary endpoint before collecting data: proportion of enrolled participants with at least one self-confirmed meaningful contribution during a fixed 30-day window. Report denominator, missing follow-up, uncertainty and comparison group results. A missing response is not proof of nonparticipation. Secondary endpoints: sustained participation, voluntary validated measures of relatedness, autonomy and competence, and reported barriers. No crime-reduction claim from this pilot.

## Safeguards
No criminal-risk prediction, psychological profiling, sensitive-trait inference, coercive engagement or public individual scores. Do not substitute unpaid labor for paid work. Consent must be revocable. Collect minimum data; establish retention and deletion policy before collecting research data. No minors in initial research pilot without a separately reviewed protocol. Suppress small aggregate cells and assess reidentification risk. Human review for complaints and matching harms.

## Release gates
Feature flag off by default; review schema and RLS, rollback migration, accessibility, XSS, browser and regression tests per docs/VALIDATION.md. No live migrations or deployment until approved. Publish limitations and adverse outcomes alongside positive results.

## Next implementation
Start with a pure aggregate participation metric and deterministic tests, then integrate only after event and consent schema audit. Do not treat the metric as an individual score or use it for recommendation ranking.
