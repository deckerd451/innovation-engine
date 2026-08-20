# Validation

This repo has no bundler and no CI-wired test runner. Validation has always
lived in hand-written scripts under `scripts/tests/`, run manually and
inconsistently. This documents what's deterministic and runnable locally
today, and what still requires a human in a browser.

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
