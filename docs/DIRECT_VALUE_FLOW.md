# Direct value flow

The primary paths use at most four app actions, counting successful sign-in as the first logical step:

- Sign in → open a Home opportunity → I'm interested (three).
- Sign in → search → open an opportunity result → I'm interested (four).
- Sign in → Explore → View profile → Connect (four; Explore starts with People).
- Sign in → open a Home project → Request to join (three).

These complete a private interest or membership/connection request, not acceptance by another person. Authentication-provider consent, account recovery, and responses from other members are not controlled by this UI. No extra setup form or confirmation is introduced.

Opportunity panels reuse the canonical opportunity interest service and its existing RLS/notification rules. One button shares or withdraws interest without another page. Poster identity is near the title, with abbreviated names for non-admin viewers. Closed, private and expired opportunities do not solicit interest. Poster management stays available, while matching-people details are out of the member's action path. Project ownership moves from a separate bottom card to the title area; the existing workspace and join controls remain.

Home uses a keyword-based Search the community form across People, Projects, Skills, Organizations and Opportunities. Results are grouped without requiring a category choice. Hidden people, self and duplicate identities are excluded; stranger names and skills retain preview restrictions. Opportunities must be public, open and unexpired. Search does not inspect private messages or email addresses. Editing a query clears obsolete results. Capped previews currently load at most 1,000 people and 500 rows for each other entity type; large-community pagination is separate work.

Validation uses synthetic accounts and in-memory writes. `run-direct-value-flow.mjs` checks in-place interest, withdrawal, closed state, repeat taps, identity changes, poster management, project ownership, all-category search, and query clearing at 320px, 390px and 1280px. The test is included in CI. No database migration or production outreach is part of this change.
