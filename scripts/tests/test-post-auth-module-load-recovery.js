#!/usr/bin/env node

// Regression coverage for the residual reachability gap identified in the
// Admin Console Audit: index.html's post-auth module loader had no
// onerror/retry handling, so a one-off script-load failure for
// admin-analytics.js left window.openAnalyticsModal permanently undefined
// for the session with no way to recover short of a full page reload --
// indistinguishable from "not authorized" or "still loading".
//
// Actually loading index.html's script (a raw DOM script fetch/inject) in
// a Node test is disproportionate for what's being checked here; this
// verifies the loader's actual source text has the required structure:
// bounded retry-with-backoff on error, a recorded/queryable failure state,
// and an on-demand retry entry point -- plus that dashboard-actions.js's
// Analytics click handler actually distinguishes "failed to load" from
// "not yet loaded" rather than always showing the same generic toast.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const loaderMatch = html.match(/const AUTH_MODULES = \[[\s\S]*?window\.retryPostAuthModule[\s\S]*?\};/);
assert.ok(loaderMatch, 'the post-auth module loader block must be present');
const loader = loaderMatch[0];

// admin-analytics.js and adminPrivacyPanel.js must both still be registered.
assert.match(loader, /assets\/js\/admin-analytics\.js/, 'admin-analytics.js must remain a post-auth module');
assert.match(loader, /assets\/js\/adminPrivacyPanel\.js/, 'adminPrivacyPanel.js must be registered as a post-auth module');

// A failed script load must retry (bounded) with backoff, not just fail once.
assert.match(loader, /s\.onerror\s*=\s*function/, 'each dynamically injected script must have an onerror handler');
assert.match(loader, /MAX_RETRIES/, 'retries must be bounded, not infinite');
assert.match(loader, /setTimeout\(function\(\)\s*\{\s*loadScript\(m, attempt \+ 1\);\s*\}/,
  'a failed load must be retried by re-invoking the same loader, not abandoned');

// After retries are exhausted, the failure must be recorded somewhere a
// caller (e.g. dashboard-actions.js's Analytics tab) can query -- not just
// logged to the console and forgotten.
assert.match(loader, /window\.__POST_AUTH_MODULE_ERRORS__\.push\(m\.src\)/,
  'exhausted-retry failures must be recorded on window.__POST_AUTH_MODULE_ERRORS__');
assert.match(loader, /new CustomEvent\('post-auth-module-error'/,
  'exhausted-retry failures must also be dispatched as an event for listeners');

// An on-demand retry entry point must exist, so a failed module can recover
// without a full page reload.
assert.match(loader, /window\.retryPostAuthModule\s*=\s*function/,
  'a manual retry entry point must be exposed for callers to use after a failure');

// --- dashboard-actions.js: the click handler must await canonical Analytics ---
const dashboardActions = fs.readFileSync(path.join(root, 'assets/js/dashboard-actions.js'), 'utf8');
// dashboard-actions.js has more than one "analyticsBtn" (a separate, unrelated
// Filter View button also uses that variable name) -- anchor on the actual
// Open Analytics Dashboard button's id to isolate the right handler.
const btnIdx = dashboardActions.indexOf("getElementById('open-analytics-dashboard-btn')");
assert.ok(btnIdx > -1, 'the open-analytics-dashboard-btn element must be looked up');
const afterBtn = dashboardActions.slice(btnIdx);
const clickHandlerMatch = afterBtn.match(/analyticsBtn\.addEventListener\('click', async \(\) => \{[\s\S]*?\n {6}\}\);/);
assert.ok(clickHandlerMatch, 'the Open Analytics Dashboard click handler must be present');
const handler = clickHandlerMatch[0];

assert.match(handler, /await import\('\.\/admin-analytics\.js\?v=admin-analytics-rpc-await-20260822b'\)/,
  'the click must await the same canonical module URL registered by the post-auth loader');
assert.match(handler, /typeof window\.openAnalyticsModal !== 'function'[\s\S]*throw new Error/,
  'the click must verify canonical Analytics initialized before changing panel lifecycle');
assert.match(handler, /adminPanel\.remove\(\)[\s\S]*await window\.openAnalyticsModal\(\)/,
  'the Admin Panel must yield to and then open the canonical Analytics modal in one click');
assert.match(handler, /catch \(error\)[\s\S]*analyticsBtn\.disabled = false/,
  'a failed load must leave the Admin workflow retryable without refreshing');
assert.doesNotMatch(handler, /try the button again in a moment|still loading/,
  'the user action must no longer terminate at the asynchronous-loader race');

assert.match(html, /dashboard-actions\.js\?v=admin-analytics-lifecycle-20260822a/,
  'the production entry script must carry a cache-buster for the repaired lifecycle');

console.log('✅ test-post-auth-module-load-recovery passed');
