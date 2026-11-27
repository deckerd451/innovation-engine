# Home possibilities redesign

The previous Home experience presented a general search box and a second input inside the collaboration disclosure. Live testing exposed a discoverability problem when the collaboration submit control looked like inline text. The new entry uses one clearly labeled field and an Explore button. A restrained teal gradient, warmer headline and larger controls draw attention to the prompt, while the rest of Home uses the existing layout and components.

| Viewport | Before | After |
|---|---|---|
| 390 × 844 | [Mobile before](ux/before-mobile.png) | [Mobile after](ux/after-mobile.png) |
| 1280 × 844 | [Desktop before](ux/before-desktop.png) | [Desktop after](ux/after-desktop.png) |

The captures use the same synthetic member and browser fixture. The baseline is main at `11f9ce05`. The fixture has no live service calls.

## Routing and controls

- Ordinary names, skills and keywords use existing community search. Requests beginning with “Search for” or “Find” go directly to search. Explicit learning requests retain the existing participation-pilot learning behavior.
- For an eligible account, a supported collaboration idea can yield one proposal, with the listed skills that explain it, prerequisites, a first step and a voluntary invitation. When no match is available, Home offers a starter plan with a solo first action, roles to confirm, resources to verify, and targeted community discovery. The member can open the existing editable project form or save one idea in this browser to check again later. The raw idea stays in the browser for the collaboration flow.
- Participation settings and Collaboration settings sit under the prompt. Enrollment and withdrawal remain available as before. A pending collaboration invitation retains its own actionable label. Existing inbox attention still takes priority. The server-side audience, account checks and feature flags use the existing values and policies.

## Validation

Browser coverage exercises the prompt at phone and desktop widths, Enter to submit, explicit search, no-match fallback, proposal, consent, invitation and withdrawal. Separate suites cover small-screen layout, focus, accessibility checks, search and project navigation, and XSS. The screenshot and browser paths use synthetic accounts. No representative-user sessions were conducted.

For a moderated follow-up, show a participant the Home page and ask them to find someone with a skill, explore an idea with a connection and then leave the collaboration pilot. Avoid pointing at any control. Observe their first action, whether they can explain the result, and whether they locate withdrawal without help.

## Starter plans and consent

The three supported ideas use reviewed starter plans. A plan remains useful before anyone agrees to collaborate. Profile skills are attributed as listings. Resources and participation are unconfirmed. Links search existing community records, with no availability guarantee. Opening a draft does not create or publish a project. The project form retains its existing submission action.

Saving an idea stores its supported topic key under the current account in this browser. It never stores the draft text, another member's identity, or a match. Reopening checks current eligibility and candidate evidence. The member can forget it in Collaboration settings. Leaving collaboration also clears it. Before opting in, eligible members can use starter plans with their own profile information, without querying potential collaborators. The experimental composer is called only if its own flag is enabled and the member has opted in. This change does not enable it.
