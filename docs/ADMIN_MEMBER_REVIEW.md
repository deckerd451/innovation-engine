# Analytics member review

## Deployment order

Before merging/deploying the frontend, apply
`supabase/sql/migrations/20261113_admin_unconnected_review.sql` in the production
Supabase SQL editor as the database owner. This creates one read-only RPC; it
changes no member records. This task has not applied it to production.

Then merge/deploy the frontend. Open Analytics → Connect isolated members →
Review members. Review loads 25 people per page and opens the existing People
management drawer for an explicitly selected person. No invitations, messages,
introductions, or account changes happen automatically.

If the migration is missing, the review shows a setup message and offers Refresh;
existing Analytics, Visitors and People management continue working.

Rollback: deploy the previous frontend, then apply
`supabase/sql/rollback/20261113_admin_unconnected_review_rollback.sql`.
Only the new RPC is removed; no member data is deleted.

## Count and privacy contract

Both Analytics and the review use `coalesce(connection_count, 0) = 0` on
`public.community`. This is the existing recorded counter, not a fresh graph
recount. Null counters, unclaimed accounts, hidden and disabled profiles remain
included, matching the existing total; no silent eligibility filter is added.
Pagination sorts by created date descending (null last), then ID to break ties.
The total and page are computed from one database snapshot.

Analytics and a later review are separate requests. If the total changes between
them, the review shows its current count and the earlier Analytics snapshot.
Refresh and page navigation always query current data. A vanished last page
returns to a valid page, and zero matches has an explicit empty state.

The RPC rejects anonymous and non-admin callers on the server. Only id, name and
skills are returned; email, photos and raw connections are not returned. Manage
person uses existing admin People authorization for the detailed record. All
review names/skills are inserted with textContent or setAttribute, not HTML.

## Verification

- `npm run test:admin-review` (CHROME_PATH selects Chrome): synthetic mobile
  pagination beyond ten people, complete count, quoted names, empty/changed
  results, retry/missing setup, and selected-person handoff. Runs in CI.
- `npm run test:db`: disposable PostgreSQL authorization, all 72 eligible fixture
  members (including null counters/hidden/disabled), stable non-overlapping
  pagination, field minimization, invalid arguments, empty list and rollback.
- No live Supabase records or real messages were used in these tests.
