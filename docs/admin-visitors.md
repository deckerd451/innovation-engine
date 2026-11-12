# Admin visitors overview

The admin panel opens on Visitors. People is a direct tab; its secondary filters
are under More filters. Projects and organizations remain under Manage, and
Detailed member analytics opens the existing analytics tools. Privacy remains a
separate tab.

## Deployment

This change requires a manual database migration as well as the frontend release.
Before releasing the frontend, an authorized Supabase administrator should apply
`supabase/sql/migrations/20261112_site_visits.sql` to the Innovation Engine project.
It creates only a new table and two functions; it does not alter community data,
existing member telemetry, sign-in or access roles. No application key changes
are required. Without the migration, the app still works and Visitors reports
that database setup is needed, rather than showing misleading zero totals.

Verify using a signed-out browser and a signed-in non-admin account. Reopen
Visitors as an admin; both should appear in totals. The viewer's account and
current browser are excluded by default; Include my visits reveals them.
Only authenticated profiles with `community.user_role = 'Admin'` may report.
Guests and members can record visits but have no direct table access.

Rollback: remove the frontend collector script from index.html first, then apply
`supabase/sql/rollback/20261112_site_visits_rollback.sql`. This deletes collected
visit records. The original authenticated product telemetry is unchanged.

## What the numbers mean

Tracking covers loads of index.html, including visitors who never sign in.
A random browser ID is stored in localStorage. A visit is reused on reload for
30 minutes since the last recorded page load or authentication change, and
renewed afterwards. Interaction within an already-open page does not extend it. Signing in upgrades the same
visit; signing out or changing accounts starts a new visit. No heartbeat runs.
The server sets timestamps and derives the account from the verified session;
clients cannot submit an account ID. A guest later signing in becomes a
signed-in visit, so the two categories are mutually exclusive.

Estimated browsers are not distinct people. Clearing storage, multiple browsers,
private mode, bots and blocked requests affect totals. Anonymous visits from
another browser cannot be identified as the admin's own. There is no historical
backfill. No email, name, IP address, user agent, referrer, query string or page
URL is collected in this table. Browser Do Not Track and Global Privacy Control
are honored; unavailable storage skips collection. Guest session identifiers are
unguessable tokens, not proof that a visitor is human; totals are approximate.

Reports are limited to at most 90 days. Each recording call removes up to 100
records older than 90 days; on an inactive site expired records remain until
the next visit or an authorized administrator removes them. Existing Supabase access logs have their own retention policy.

## Tests

`npm test` covers identity reuse, sign-in upgrades, logout and expiry.
`npm run test:db` uses a disposable PostgreSQL database to check guest writes,
anonymous/member read denial, admin-only reporting, self-exclusion, takeover
prevention and rollback. No test connects to a production Supabase project.

For rendered UI and collector checks, run
`node scripts/tests/browser/run-admin-visitors.mjs` with Playwright installed.
`CHROME_PATH` and `PLAYWRIGHT_MODULE` can select existing local tools. This test
serves only local files and mocks database/authentication responses; it is not
proof that a production migration has been applied.
