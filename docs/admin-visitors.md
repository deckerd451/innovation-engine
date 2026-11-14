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
Visitors as an admin; both should appear in totals. Admin accounts and recognized admin browsers are excluded by default; Include admin/browser activity reveals a clearly labelled combined view.
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

## Admin/community separation update (20261114)

Apply `supabase/sql/migrations/20261114_admin_visit_separation.sql` in the
Supabase SQL Editor before merging the matching frontend. This replaces only
the reporting function, preserves existing permissions and all visit records,
and adds Last hour alongside the existing periods. The existing `p_days` RPC
parameter accepts 0 for the last hour, or 1–90 for rolling days. The UI hides
old totals with a setup message if this migration has not been applied.

Admin/browser activity includes visits by any current admin account, the
report viewer's current browser, and all visits from browsers with an admin
visit anywhere in retained history. This separates signed-out visits and
member testing on a recognized admin browser. A shared browser can therefore
exclude real member activity too. It does not identify a separate test account
in a private window, cleared storage or a previously unknown signed-out device.
Counts are estimates, not proof of who visited; no IP fingerprinting is added.
Historical admin-browser activity is reclassified at report time, not deleted.

A separate admin/browser subtotal remains visible. The checkbox explicitly
switches the main cards and recent list to combined traffic. Last hour is a
rolling window based on the existing last-seen timestamp; refresh is manual.

Rollback the UI and apply
`supabase/sql/rollback/20261114_admin_visit_separation_rollback.sql` to restore
the original report without deleting data. Regression coverage:
`node scripts/tests/browser/run-visitor-separation.mjs` and the database suite
`admin-visit-separation-db.sql` in `npm run test:db`.

## Three report views (20261114b)

Apply `supabase/sql/migrations/20261114b_visitor_report_views.sql` before
releasing the new UI. It adds the admin-only `get_admin_site_visit_report` RPC
with a validated `p_view` of community (default), internal, or all. The previous
RPC is retained for older clients. No table or collection changes are needed.
Each view computes its own exact aggregate browser count and recent list;
internal browser counts cannot be calculated by subtracting distinct counts.

The page defaults to Community visits, with cards for Visits, Estimated browsers,
Guest visits and Member visits. A muted admin/browser activity card shows the
excluded subtotal. The View selector offers Community, Admin/browser and All;
the heading and recent list label follow the selection. Admin/browser activity
is recognized activity, not a guarantee that all testing has been identified.

For rollback, restore the previous UI and run
`supabase/sql/rollback/20261114b_visitor_report_views_rollback.sql`.
Regression coverage runs in the existing visitor browser CI step and database
suite, including both unauthorized roles and invalid view parameters.

## Admin overview navigation

The panel now opens on Overview; this report is under Traffic. Community tools
contain Projects, Organizations and detailed network analytics. Existing People
management and Privacy controls are preserved. See `docs/ADMIN_OVERVIEW.md` for
the redesign, daily-chart migration, data definitions, and release checks.
