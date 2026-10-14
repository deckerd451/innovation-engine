# Validation

This repo has no bundler. Validation lives in hand-written scripts under
`scripts/tests/`. This documents what's deterministic and runnable locally,
what CI runs, and what still requires a human in a browser.

## Continuous integration

`.github/workflows/ci.yml` runs on GitHub-hosted runners for every pull
request into `main` and every push to `main`, with a read-only token and no
secrets:

| Check | Runs |
|---|---|
| `unit` | `npm test`, `npm run lint` and `npm run test:xss` |
| `db-authz` | `npm run test:db` against a throwaway PostgreSQL cluster on the runner |
| `migration-hygiene` | `npm run check:migrations`: each new migration is named `YYYYMMDD[letter]_snake_case.sql` and has `supabase/sql/rollback/<name>_rollback.sql` |

`.github/workflows/codeql.yml` runs CodeQL for JavaScript on the same events
and weekly. Nothing in CI connects to Supabase or applies a migration;
production migrations are applied by hand.

## Deterministic local checks

```
npm test    # runs the offline regression suite (scripts/validate.js)
npm run lint  # node --check syntax validation of every tracked .js file (scripts/lint.js)
```

Both are dependency-free (only Node built-ins) and require no network access,
database connection, or browser.

`npm test` runs every `scripts/tests/*.js` file that starts with a
`#!/usr/bin/env node` shebang -- that shebang is this repo's existing
convention for "runs headless with plain Node," as opposed to files meant to
be pasted into a browser devtools console. Each of those files asserts
against this codebase's own source/SQL text directly, or exercises real
modules inside a `node:vm` sandbox / fake-global stubs (fake `window`,
`document`, `localStorage`, `supabase` client) -- never a real browser and
never a live database or network call.

## Member-content XSS regression (needs Google Chrome)

```
npm run test:xss   # CHROME_PATH=... to override; XSS_TEST_ROOT=<checkout> to test other code
```

Loads the real profile, messaging, Browse Projects, recommendation,
connection-toast, XP-notification and legacy admin rendering code in headless
Chrome against a stub client whose member names, skills, project titles and
photo URLs try to break out of element text, quoted attributes and inline
handler strings. Every element is hovered, focused and clicked. It fails if
any injected script runs, if the text is not shown literally, or if a handler
receives anything but the raw value. Run against the code before the fix, it
fails on all seven reachable surfaces.

## Rendered mobile journey (needs Google Chrome)

```
npm run test:browser   # or: node scripts/tests/browser/run-assistance-journey.mjs <screenshotDir>
```

Serves the repo locally and drives the real `index.html` in headless Chrome
at iPhone size over the DevTools protocol (Node built-ins only). Only
`supabaseClient.js` is replaced, by a stub backed by the test-only fake
client and fixtures in `scripts/tests/fixtures/` (placeholder names, never
seeded anywhere). Taps are dispatched at element coordinates, so a control
covered by another surface or the tab bar fails. Screenshots are written for
human review; external CDNs are blocked, so the graph shows its fallback
toast. It verifies the My Space → assistance → progress → return journey,
tab isolation, permission states and a desktop regression smoke. It does not
exercise real Supabase auth or RLS.

## Assistance permission boundary against PostgreSQL

On a disposable local database only:

```
psql -d ie_test -f scripts/tests/fixtures/supabase-minimal-bootstrap.sql
psql -d ie_test -f supabase/sql/tables/PROJECT_TASKS_SCHEMA.sql
psql -d ie_test -f supabase/sql/migrations/20261011_capability_memory.sql
psql -d ie_test -f scripts/tests/assistance-rls-db.sql
```

Runs the repository's real RLS policies and triggers as the `authenticated`
role: private packages, another team's tasks and the stats RPC stay hidden;
new learning cannot be forged or claim evidence; shared learning is readable
by a later member. All rows are rolled back.

`npm run test:db` runs these steps on a throwaway cluster it creates and
removes itself (needs `initdb`, `pg_ctl` and `psql` on `PATH`), followed by
`scripts/tests/run-authz-db.sh` when that suite is present.

## Nearify contract

`test-nearify-live-presence-boundary.js` checks the iOS call shapes against a
committed excerpt in `scripts/tests/fixtures/nearify-ios/`, because
nearify-ios is a separate private repository. When it is available
(`NEARIFY_IOS_ROOT`, or a `../nearify-ios` sibling checkout) the same
assertions also run against the real app; CI checks the excerpt only.

## Known gaps

- **No `npm run build`.** This is a static HTML/CSS/JS site with no bundler
  or compilation step, so there is nothing to build. `npm run lint`'s syntax
  check is the closest deterministic stand-in.
- **Four scripts require a signed-in browser and cannot run headless**, and
  are intentionally excluded from `npm test` (no shebang, by convention):
  - `scripts/tests/test-project-tasks.js` -- live-database smoke test against
    a real signed-in Supabase session; paste into the dashboard's browser
    console (see the file header).
  - `scripts/tests/test-profile-linking.js` -- browser-console profile
    linking check, run after signing in.
  - `scripts/tests/test-opportunity-integration.js` -- browser-console
    Opportunity Engine integration check.
  - `scripts/tests/seed-ai-healthcare-console.js` -- not a test; a
    browser-console data-seeding script.
- **No lint/style tool** (ESLint, Prettier, etc.) is configured. `npm run
  lint` only catches syntax errors, not style or correctness issues beyond
  what the regression suite in `npm test` covers.
- **No live Supabase connection is available in this environment.** Several
  offline tests (e.g. `test-admin-analytics-rpc-security.js`,
  `test-connection-identity-integrity.js`, `test-retention-analytics-sql.js`)
  say so explicitly in their headers and verify migration SQL text/structure
  instead of executing it against a real database.
