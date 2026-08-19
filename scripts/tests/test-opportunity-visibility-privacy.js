#!/usr/bin/env node

// Regression coverage for the Explore -> Opps privacy/eligibility gap found
// while repairing the new-opportunity refresh bug (commit d05551e4):
// assets/js/command-dashboard.js loaded every row from `opportunities` with
// no is_public/status/deadline filtering at all, so private/draft/closed
// rows from ANY user could render in the public Explore browser.
//
// Verified visibility contract (matches two independent, already-live
// implementations in this codebase — assets/js/intelligence/daily-brief-
// engine.js's isEligiblePublicOpportunity()/Reflection fetch, and assets/js/
// organizations/opportunities.js's getOpportunities(), used by
// opportunities.html's public browse/search page):
//   - status === 'open'                              (excludes closed/filled/draft)
//   - is_public === true, strictly                    (excludes false AND null)
//   - application_deadline is null OR still in the future
// There is no evidence anywhere in the codebase of a "show my own private/
// draft opportunities" exception (contract B) — org admin management
// (organization-admin.html) is a separate, unfiltered, creator/org-scoped
// surface, not Explore.
//
// This harness loads the ACTUAL assets/js/command-dashboard.js in a
// minimal DOM-free VM sandbox and exercises its real
// _isEligibleExploreOpportunity / _getResourceItems / post-create merge
// code paths via test-only hooks, rather than re-implementing the
// eligibility contract here. Explore/Search source-level consistency is
// checked directly against assets/js/dashboardPane.js and
// assets/js/command-dashboard.js's actual query text.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const cdSrc = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
const dpSrc = fs.readFileSync(path.join(root, 'assets/js/dashboardPane.js'), 'utf8');

function loadCommandDashboard() {
  const noop = () => {};
  const fakeEl = () => ({
    addEventListener: noop,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {},
    dataset: {},
    appendChild: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute: noop,
    getAttribute: () => null,
    remove: noop,
    children: [],
    textContent: '',
  });
  const documentShim = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    addEventListener: noop,
    body: fakeEl(),
  };
  const sandbox = {
    console,
    window: {}, // no window.supabase -> _loadEnrichedData() no-ops safely
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams,
    localStorage: { getItem: () => null, setItem: noop },
    Set, Map, Promise, Date,
  };
  sandbox.document = documentShim;
  sandbox.window.document = documentShim;
  sandbox.window.location = { search: '', hostname: 'localhost' };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cdSrc, sandbox, { filename: 'command-dashboard.js' });
  return sandbox.window.CommandDashboard;
}

function iso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

function toPlain(x) {
  return JSON.parse(JSON.stringify(x));
}

const CommandDashboard = loadCommandDashboard();
const isEligible = (opp) => CommandDashboard.__testIsEligibleExploreOpportunity(opp);

// --- 1) Public/open opportunity is visible ---
{
  assert.equal(isEligible({ id: 'a', status: 'open', is_public: true }), true);
}

// --- 2) is_public === false is excluded ---
{
  assert.equal(isEligible({ id: 'b', status: 'open', is_public: false }), false);
}

// --- 3) is_public === null is excluded when the field exists ---
{
  assert.equal(isEligible({ id: 'c', status: 'open', is_public: null }), false);
}
// A row whose SELECT didn't request is_public at all (field truly absent,
// not null) is not penalized for a projection the caller controls elsewhere.
{
  assert.equal(isEligible({ id: 'c2', status: 'open' }), true);
}

// --- 4) draft/private opportunities are excluded per the verified contract ---
{
  assert.equal(isEligible({ id: 'd', status: 'draft', is_public: true }), false, 'draft status excluded even if is_public is true');
  assert.equal(isEligible({ id: 'd2', status: 'open', is_public: false }), false, 'private (is_public=false) excluded even if status is open');
}

// --- 5) closed/expired opportunities are excluded ---
{
  assert.equal(isEligible({ id: 'e', status: 'closed', is_public: true }), false, 'closed status excluded');
  assert.equal(isEligible({ id: 'e2', status: 'filled', is_public: true }), false, 'filled status excluded');
  assert.equal(isEligible({ id: 'e3', status: 'open', is_public: true, application_deadline: iso(-1) }), false, 'past deadline excluded even if status is open');
  assert.equal(isEligible({ id: 'e4', status: 'open', is_public: true, application_deadline: iso(3) }), true, 'future deadline remains eligible');
  assert.equal(isEligible({ id: 'e5', status: 'open', is_public: true, application_deadline: null }), true, 'null deadline remains eligible');
}

// --- 6) Newly created public/open opportunity still appears immediately
//        (preserves commit d05551e4 behavior: the "+" form always creates
//        status='open', is_public=true). ---
{
  const newRow = { id: 'new-uuid', title: 'Community Garden Lead', status: 'open', is_public: true, created_at: new Date().toISOString() };
  const merged = toPlain(CommandDashboard.__testApplyOpportunityInsertResult('me', { opportunities: [] }, { data: newRow, error: null }));
  assert.equal(merged.length, 1);
  const items = toPlain(CommandDashboard.__testGetOpportunityResourceItems('me', { opportunities: merged }));
  assert.deepEqual(items.map(i => i.id), ['new-uuid'], 'Eligible new opportunity is visible in the Explore list immediately');
}
// A hypothetical ineligible insert result (e.g. a future caller that
// doesn't hardcode status/is_public) is merged into state but never
// rendered, and is logged rather than silently dropped as if refresh failed.
{
  const originalWarn = console.warn;
  let warned = false;
  console.warn = (...args) => { if (args.join(' ').includes('not eligible for Explore')) warned = true; };
  let items;
  try {
    const draftRow = { id: 'draft-uuid', title: 'Unpublished Draft', status: 'draft', is_public: true, created_at: new Date().toISOString() };
    CommandDashboard.__testApplyOpportunityInsertResult('me', { opportunities: [] }, { data: draftRow, error: null });
    items = toPlain(CommandDashboard.__testGetOpportunityResourceItems('me', { opportunities: [draftRow] }));
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(items.length, 0, 'A draft/ineligible created row never renders in Explore');
  assert.ok(warned, 'Ineligibility is logged, not silently treated as a refresh failure');
}

// --- 7) Current user's own private/draft opportunity: contract A applies
//        uniformly — there is no creator-visibility exception in Explore. ---
{
  const ownPrivate = { id: 'own-private', status: 'draft', is_public: false, posted_by: 'me', created_at: new Date().toISOString() };
  assert.equal(isEligible(ownPrivate), false, 'Explore has no verified exception for the creator\'s own private/draft opportunities');
}

// --- 8) Explore and Search apply the identical visibility contract. ---
{
  const contractPieces = [
    /\.eq\(['"]status['"],\s*['"]open['"]\)/,
    /\.eq\(['"]is_public['"],\s*true\)/,
    /application_deadline\.is\.null,application_deadline\.gt\./,
  ];
  // Explore (command-dashboard.js's opportunities fetch)
  for (const re of contractPieces) assert.match(cdSrc, re, `Explore query missing: ${re}`);
  // Search: dashboardPane.js has two opportunity search sites (predictive
  // suggestions + full modal results) — both must carry the full contract.
  const oppBlocks = dpSrc.split(/category === "all" \|\| category === "opportunities"/).slice(1);
  assert.equal(oppBlocks.length, 2, 'Expected exactly two opportunity search call sites in dashboardPane.js');
  for (const block of oppBlocks) {
    const scoped = block.slice(0, 500);
    for (const re of contractPieces) assert.match(scoped, re, `Search query missing: ${re}`);
  }
}

// --- 9) Dedup remains id-based, never title-based, when eligible
//        opportunities happen to share a title. ---
{
  const dupTitleA = { id: 'idA', title: 'Volunteer Coordinator', status: 'open', is_public: true, created_at: iso(-2) };
  const dupTitleB = { id: 'idB', title: 'Volunteer Coordinator', status: 'open', is_public: true, created_at: iso(-1) };
  const merged = toPlain(CommandDashboard.__testApplyOpportunityInsertResult('me', { opportunities: [dupTitleA] }, { data: dupTitleB, error: null }));
  assert.deepEqual(merged.map(o => o.id).sort(), ['idA', 'idB'], 'Same-title, different-id opportunities both remain (no title-based dedup)');
}

// --- 10) Opportunity row selection still reaches the canonical
//         ExplorerCoordinator.selectOpportunity() path (unchanged by this
//         privacy fix). ---
{
  const oppSelectionCalls = (cdSrc.match(/ExplorerCoordinator\??\.selectOpportunity/g) || []).length;
  assert.ok(oppSelectionCalls >= 2, 'Both row-click and action-button handlers must still call ExplorerCoordinator.selectOpportunity');
}

console.log('Explore opportunity visibility/privacy: all checks passed');
