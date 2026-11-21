# Home: participate or discover

Home adapts to actual participation: members with owned/joined projects or
accepted connections see pending attention first, then project shortcuts and a
compact finder. Members with neither start with discovery. This is not a claim
about the date of their last visit or whether an account is new. Loading or
failed project data does not invent participation. All sections remain available.

The optional finder searches by idea, interest or skill. Results appear under
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

For participating members, the reading order is attention, projects, finder,
recommendation, open invitations and optional interests. For discovery members,
the finder leads, followed by attention/recommendation, projects, invitations and
optional interests. DOM order matches the reading and keyboard order on phone
and desktop. Existing nodes are moved, never recreated to change modes, and
changes wait until a member leaves an active input. Project and opportunity
cards retain real descriptions, needs and organizer/deadline information when
available; View details makes the whole-card action explicit. No feed is added.
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
