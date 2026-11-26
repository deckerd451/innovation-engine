# Human Potential Engine — experience contract

## Principle
Complexity belongs in the engine, not the member interface. Preserve the existing Today and My Space journeys. Do not introduce a new top-level navigation destination for HPE in the initial pilot.

## Proposed first experience
Offer one optional next-step card in the existing Today experience: a plain-language opportunity, a short explanation of why it fits, one primary action, and a dismiss option. Reuse existing project and assistance flows. If no useful match exists, show no card rather than inventing a match.

Ask about aspirations only when relevant, with an optional short answer and skip. Do not require profile completion, assessments, onboarding questionnaires, or capability taxonomy knowledge. Keep advanced settings progressively disclosed. Do not expose psychological scores, rankings, or AI jargon.

## Acceptance criteria
- Existing members can ignore the feature and continue their current journey.
- No additional required onboarding fields or top-level tabs.
- At most one HPE recommendation card visible initially.
- One primary action per card; dismiss and opt-out accessible.
- Plain-language explanation; no unsupported claims about the member.
- Existing keyboard, screen-reader, mobile safe-area and XSS protections remain intact.
- Feature disabled by default until reviewed.
- No notifications by default; no engagement streaks or pressure.
- Optional research consent is separate from normal participation.

## Pilot usability gates (proposed targets, not measured results)
Observe at least five representative members completing the opportunity journey without coaching before widening rollout. Target at least 80% unassisted task completion and median time under 60 seconds to understand and act on a relevant card (excluding sign-in and actual contribution). Record confusion, abandonment and accessibility issues; compare against the existing experience. Do not treat these small-sample results as statistically conclusive. Iterate on observed friction before adding features.

## Implementation sequence
Audit Today recommendation rendering and existing assistance routing before changing UI. Reuse components and authorization. Add feature-flagged card and regression tests only after identifying integration points. Validate using the existing browser, responsive, accessibility and XSS checks described in docs/VALIDATION.md.
