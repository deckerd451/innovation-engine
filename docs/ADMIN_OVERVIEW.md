# Admin panel: overview and task navigation

The panel opens on Overview. Five persistent destinations replace the previous
Visitors/People/Manage/Privacy arrangement:

- Overview: aggregate community traffic over seven rolling days, account
  adoption, active profiles, daily visits, and follow-up actions.
- Traffic: the existing period and Community/Admin/browser/All views.
- People: the existing directory, filters, profile management, claim emails,
  access controls, and bulk actions. The unclaimed Overview action opens the
  directory with its visible account-status filter set to Unclaimed.
- Community: current participation counts, full unconnected-profile review,
  existing project and organization management, and detailed network analytics.
- Settings & Privacy: existing visibility/photo-consent tools, tracking
  explanations, and system diagnostics. Production email/auth configuration
  remains in Supabase. No credentials are exposed by this UI.

On phones the five destinations form a horizontally scrollable row with
44px minimum touch targets. The shell has one vertical content scroller;
header and navigation do not cover the content. Keyboard focus stays inside
the existing dialog, and selected navigation state follows nested tools.

## Data and definitions

`admin-overview.js` uses the existing admin-only site-visit and network RPCs,
and the existing claim-count service. It does not download raw visit rows,
connections, product events or messages. No new tracking is added.
Independent reports load concurrently with bounded waits. A failed report
shows Unavailable, never zero; other reports remain usable. Refresh retries.
Responses for removed sections cannot replace the currently selected section.

Traffic excludes recognized admin accounts and browser activity as in Traffic.
Profile and network aggregates use their existing definitions, which include
admin profiles, and are labelled accordingly. Active profiles use 30-day
last-seen activity; this is not an action-based engagement measure. Claimed
accounts are a current total; new profiles are not new claims. Returning-browser
rates, campaign attribution and new claims over time are explicitly marked
Not yet available under Measurement coverage.

The chart counts each session by its existing last_seen_at timestamp, matching
the visit report. A seven-day rolling window crosses eight UTC dates, with
partial first and last days. All dates, including zero days, are shown. The
chart is an accessible ordered list with date/count text; no chart library,
tracking package or external request is added.

## Release: SQL first, then merge

1. In the Supabase SQL Editor, apply
   `supabase/sql/migrations/20261114c_admin_overview_daily_visits.sql`.
   It replaces the existing admin-only visitor-report function to include a
   `daily` array. It preserves the signature, grants, classification, and
   existing response fields; it adds no tables or data collection.
2. Merge the website PR after review and CI pass. Wait for Pages deployment.
3. Reload Admin. Overview should be selected. Verify the seven-day community
   total against Traffic and add the daily counts to confirm they match.
4. Check People, Community project/organization tools, member review, network
   analytics, and Settings & Privacy. No email is sent by opening these views.

If the SQL update is omitted, other reports continue to work and the chart
says Not yet available instead of estimating from the truncated recent list.

For rollback, revert the website PR and apply
`supabase/sql/rollback/20261114c_admin_overview_daily_visits_rollback.sql`.
The rollback restores the previous report without daily buckets; no visit
records are deleted. The new frontend also degrades gracefully with that
older report.

## Verification

- Offline regression suite: `npm test`.
- Actual local Chrome with synthetic reports: `node scripts/tests/browser/run-admin-overview.mjs`.
- Phone touch/project regression: `node scripts/tests/browser/run-mobile-admin-layout.mjs`.
- Existing traffic, claim-email, member-review, and accessibility journeys.
- Disposable PostgreSQL: `scripts/tests/admin-overview-daily-db.sql` in
  `npm run test:db`. Tests require daily totals equal the selected report,
  zero-filled dates, hourly totals, anonymous/member denial, and rollback.

All fixtures are local and synthetic. Production SQL and deployment are manual;
local test success does not assert they have been applied.
