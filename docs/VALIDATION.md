# Validation

This repo has no bundler and no CI-wired test runner. Validation has always
lived in hand-written scripts under `scripts/tests/`, run manually and
inconsistently. This documents what's deterministic and runnable locally
today, and what still requires a human in a browser.

## Deterministic local checks

```
npm test    # runs the offline regression suite (scripts/validate.js)
npm run lint  # node --check syntax validation of every tracked .js/.mjs file and the Edge Function entry (scripts/lint.js)
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

## Tailored help (buildspace-assist) — see docs/BUILDSPACE_ASSIST_SERVICE.md

Run by `npm test`:

- `test-assist-contract.js` — request bounds and every output gate (generic or
  repeated questions, blank worksheets, platitudes, echoes, overclaims), plus
  the retrieval layer's own permission filter when a query over-returns.
- `test-assist-service.js` — the real handler/retrieval/prompt/validator and
  Anthropic adapter against the fixture community, scenarios A, B, D–F, H, I.
  The model is a scripted stand-in (`fixtures/assist-model-outputs.js`), so
  these prove data flow, permissions and failure handling, **not** answer quality.
- `test-assistance-intelligence.js` — browser module: flag, transport errors,
  normalisation, routing (familiar objectives never call the service).

The rendered journey also runs the real service code in the page (scenarios
A–C, E–H, J for “Supply Agents”). Usage ledger against PostgreSQL:

```
psql -d ie_test -f scripts/tests/fixtures/supabase-minimal-bootstrap.sql
psql -d ie_test -f supabase/sql/migrations/20261014_buildspace_assist_usage.sql
psql -d ie_test -f scripts/tests/assist-usage-db.sql
```

Live quality (paid; needs an authorized key, never run in CI):
`node scripts/eval/assist-eval.mjs --live` — writes a report with automated
effort measures and a blank human rubric per case.

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
