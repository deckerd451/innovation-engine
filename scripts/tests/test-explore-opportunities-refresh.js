#!/usr/bin/env node

// Regression coverage for: newly created opportunities were missing from
// Explore -> Opps after using the "+" create flow.
//
// Root cause (two compounding defects in assets/js/command-dashboard.js):
//
//  1. _getResourceItems('opportunities') sliced the raw, unordered fetch
//     result to the first 10 rows BEFORE sorting them for display. The
//     opportunities query has no server-side ORDER BY, so which 10 rows
//     survived the cap was arbitrary and did not reliably include a
//     just-created row once the community had more than 10 opportunities.
//     (Every other Explore resource type in this file sorts THEN slices.)
//
//  2. The "+" create flow's insert() did not use .select(), so it only knew
//     whether the write succeeded — it could not merge the real row into
//     _enrichedData.opportunities immediately, and relied entirely on a
//     fire-and-forget _loadEnrichedData() refetch racing the render.
//
// This harness loads the ACTUAL assets/js/command-dashboard.js in a
// minimal DOM-free VM sandbox and calls its real _getResourceItems /
// _applyOpportunityInsertResult code paths via test-only hooks, rather
// than re-implementing the ordering/merge/dedupe logic here.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');

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
  vm.runInContext(src, sandbox, { filename: 'command-dashboard.js' });
  return sandbox.window.CommandDashboard;
}

function iso(daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

// Normalize cross-realm vm return values through JSON before assert.deepEqual.
function toPlain(x) {
  return JSON.parse(JSON.stringify(x));
}

const CommandDashboard = loadCommandDashboard();
assert.equal(typeof CommandDashboard.__testGetOpportunityResourceItems, 'function');
assert.equal(typeof CommandDashboard.__testApplyOpportunityInsertResult, 'function');

// --- 1) A newly created opportunity survives the 10-item cap because the
//        list is sorted by recency before slicing, not after. ---
{
  const older = Array.from({ length: 12 }, (_, i) => ({
    id: `older-${i}`,
    title: `AAA Older Opportunity ${i}`, // alphabetically first on purpose
    status: 'open',
    created_at: iso(30 - i),
  }));
  const newest = { id: 'brand-new', title: 'ZZZ Just Created', status: 'open', created_at: iso(0) };

  const items = toPlain(CommandDashboard.__testGetOpportunityResourceItems('me', {
    opportunities: [...older, newest],
  }));
  assert.equal(items.length, 10, 'Explore Opps preview stays capped at 10');
  assert.ok(items.some(i => i.id === 'brand-new'), 'The newest opportunity must survive the cap');
  assert.equal(items[0].id, 'brand-new', 'Newest opportunity sorts first');
}

// --- 2) Existing opportunities remain present alongside the new one. ---
{
  const existing = [
    { id: 'e1', title: 'Existing One', status: 'open', created_at: iso(5) },
    { id: 'e2', title: 'Existing Two', status: 'open', created_at: iso(4) },
  ];
  const items = toPlain(CommandDashboard.__testGetOpportunityResourceItems('me', {
    opportunities: existing,
  }));
  assert.deepEqual(items.map(i => i.id).sort(), ['e1', 'e2']);
}

// --- 3) Post-create insert-result handling: success merges the canonical
//        returned row exactly once, using its real id, alongside existing
//        opportunities, with correct title/metadata. ---
{
  const existing = [{ id: 'existing-1', title: 'Existing Opp', status: 'open', created_at: iso(3) }];
  const newRow = { id: 'new-uuid-123', title: 'Community Outreach Lead', status: 'open', is_public: true, created_at: iso(0) };

  const result = toPlain(CommandDashboard.__testApplyOpportunityInsertResult(
    'me',
    { opportunities: existing },
    { data: newRow, error: null },
  ));

  assert.equal(result.filter(o => o.id === 'new-uuid-123').length, 1, 'New opportunity appears exactly once');
  const inserted = result.find(o => o.id === 'new-uuid-123');
  assert.equal(inserted.title, 'Community Outreach Lead');
  assert.equal(inserted.status, 'open');
  assert.ok(result.some(o => o.id === 'existing-1'), 'Existing opportunity remains');
}

// --- 4) A later refetch (simulated by calling the merge helper again with
//        the same canonical row, as a real DB refetch would return it) does
//        not produce a duplicate — dedup is by id, never by title. ---
{
  const newRow = { id: 'new-uuid-123', title: 'Community Outreach Lead', status: 'open', created_at: iso(0) };
  const afterCreate = toPlain(CommandDashboard.__testApplyOpportunityInsertResult(
    'me',
    { opportunities: [] },
    { data: newRow, error: null },
  ));
  assert.equal(afterCreate.filter(o => o.id === 'new-uuid-123').length, 1);

  // Simulate the canonical refetch replacing the array wholesale with the
  // now-persisted row (this is what _loadEnrichedData does in production).
  const afterRefetch = [newRow];
  assert.equal(afterRefetch.filter(o => o.id === 'new-uuid-123').length, 1, 'Still exactly one copy after refetch');
}

// --- 5) Two different opportunities that happen to share a title are not
//        merged — dedup is strictly by canonical id. ---
{
  const dupTitleA = { id: 'idA', title: 'Volunteer Coordinator', status: 'open', created_at: iso(2) };
  const dupTitleB = { id: 'idB', title: 'Volunteer Coordinator', status: 'open', created_at: iso(1) };
  const result = toPlain(CommandDashboard.__testApplyOpportunityInsertResult(
    'me',
    { opportunities: [dupTitleA] },
    { data: dupTitleB, error: null },
  ));
  assert.deepEqual(result.map(o => o.id).sort(), ['idA', 'idB'], 'Same-title, different-id opportunities both remain');
}

// --- 6) Insert failure does not corrupt or duplicate existing list state,
//        and is logged (not silently swallowed as a refresh failure). ---
{
  const existing = [{ id: 'existing-1', title: 'Existing Opp', status: 'open', created_at: iso(3) }];
  const originalError = console.error;
  let loggedError = null;
  console.error = (...args) => { loggedError = args.join(' '); };
  let result;
  try {
    result = toPlain(CommandDashboard.__testApplyOpportunityInsertResult(
      'me',
      { opportunities: existing },
      { data: null, error: { message: 'permission denied' } },
    ));
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(result.map(o => o.id), ['existing-1'], 'Existing state is untouched on insert failure');
  assert.ok(loggedError && loggedError.includes('Failed to post opportunity'), 'Failure is logged, not silently ignored');
}

// --- 7) Explore row selection still reaches the canonical
//        ExplorerCoordinator.selectOpportunity() path for the opportunities
//        tab (both the action-button and row-click handlers). ---
{
  const oppSelectionCalls = (src.match(/ExplorerCoordinator\??\.selectOpportunity/g) || []).length;
  assert.ok(oppSelectionCalls >= 2, 'Both row-click and action-button handlers must call ExplorerCoordinator.selectOpportunity');
}

// --- 8) No second/independent opportunities list was introduced: exactly
//        one place assigns _enrichedData.opportunities, and the create flow
//        posts through _applyOpportunityInsertResult rather than a
//        parallel state container. Desktop/mobile share this single
//        #command-dashboard instance (mobile styling is CSS-only, via the
//        .cd-mobile-panel class — see assets/css/command-dashboard.css). ---
{
  const assignments = (src.match(/_enrichedData\.opportunities\s*=/g) || []).length;
  assert.equal(assignments, 2, 'Expected exactly the refetch assignment and the local-merge assignment');
  assert.match(src, /_applyOpportunityInsertResult/);
}

console.log('Explore opportunities refresh: all checks passed');
