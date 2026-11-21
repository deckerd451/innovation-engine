# Home: find a way to participate

Home leads with one optional idea/interest/skill finder. Results appear under
the input, state why words match, and open existing limited profiles or project
details. A blank profile does not block discovery. Search failures and no-match
results remain distinct; typing survives other Home updates. Old requests cannot
paint into another member's or a detached Home view.

The next section surfaces one primary inbound action (with additional pending
actions in a disclosure), otherwise one person suggestion, otherwise one
reasoned project/opportunity invitation. A suggested person leads with View
profile; Connect and Not now retain their existing behavior. No activity, task
priority, popularity or match explanation is invented by this layout.

Your projects shows two rows and offers the full list on demand. The member's
connections remain accessible through You and existing network navigation.
Looking for help shows at most three open invitations and omits the invitation
already displayed as the next step. An optional interests invitation remains
for profiles listing neither interests nor skills; there is no duplicate quiet
setup card. The Pulse promotion and skill-count shortcuts have been removed
from Home. The standalone Pulse page and its member-safe RPC remain available
at their existing URL.

The reading order is finder, next step, own projects, open invitations, optional
interests. Desktop places projects beside the next step; phone uses one column.
No database migration, email deployment or production data edits are required.
Existing search sampling limits are unchanged by this frontend redesign.

Checks:
- `npm test` and `npm run lint`.
- `CHROME_PATH=... node scripts/tests/browser/run-home-purpose-flow.mjs`
  covers widths 320/390/768/1280, priority, ownership-independent member layout,
  deduplication, typed-input preservation, invitation navigation and axe checks.
  It runs in CI using synthetic accounts.
- `CHROME_PATH=... node scripts/tests/browser/run-home-idea.mjs <output-dir>`
  covers phone/desktop matching, no-match and vague queries, profile privacy,
  project opening and browsing, and editable example text.
- `CHROME_PATH=... npm run test:a11y` checks the wider app's keyboard and
  accessibility flows. These synthetic checks do not certify Safari/VoiceOver
  or production authentication behavior.
