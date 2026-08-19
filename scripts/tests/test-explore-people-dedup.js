#!/usr/bin/env node

// Regression coverage for the Explore -> People duplicate-person bug.
//
// Root cause: `connections` can contain more than one row for the same
// pair of people (e.g. an accepted row exists in both directions), so the
// raw peer-id list built in _loadEnrichedData() could contain the same
// person's canonical community id twice. _getResourceItems('people') then
// rendered one card per array entry instead of one per person.
//
// This harness loads the ACTUAL assets/js/command-dashboard.js in a
// minimal DOM-free VM sandbox and calls its real _getResourceItems /
// _dedupeById code path via the test-only __testGetPeopleResourceItems
// hook, rather than re-implementing the dedupe logic here.

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
    window: {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams,
    localStorage: { getItem: () => null, setItem: noop },
    Set, Map, Promise,
  };
  sandbox.document = documentShim;
  sandbox.window.document = documentShim;
  sandbox.window.location = { search: '', hostname: 'localhost' };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'command-dashboard.js' });
  return sandbox.window.CommandDashboard;
}

const CommandDashboard = loadCommandDashboard();
assert.equal(typeof CommandDashboard.__testGetPeopleResourceItems, 'function',
  'command-dashboard.js must expose the people-resource test hook');

// The vm sandbox is a separate realm, so arrays/objects returned from it
// have a different Array.prototype/Object.prototype than this process's.
// Normalize through JSON so assert.deepEqual compares values, not realms.
function getPeopleItems(userId, enrichedData) {
  const raw = CommandDashboard.__testGetPeopleResourceItems(userId, enrichedData);
  return JSON.parse(JSON.stringify(raw));
}

// --- Same canonical person, two connection rows -> exactly one card ---
{
  const items = getPeopleItems('me', {
    acceptedConnections: [
      { id: 'community-descartes', name: 'Descartes' },
      { id: 'community-descartes', name: 'Descartes' }, // duplicate row (e.g. bidirectional accept)
    ],
    pendingConnections: [],
  });
  assert.equal(items.length, 1, 'Duplicate rows for the same person id must collapse to one Explore card');
  assert.equal(items[0].id, 'community-descartes');
}

// --- Two different people who share a display name stay distinct ---
{
  const items = getPeopleItems('me', {
    acceptedConnections: [
      { id: 'community-descartes-a', name: 'Descartes' },
      { id: 'community-descartes-b', name: 'Descartes' },
    ],
    pendingConnections: [],
  });
  assert.equal(items.length, 2, 'Distinct ids sharing a display name must NOT be merged');
  const ids = items.map(i => i.id).sort();
  assert.deepEqual(ids, ['community-descartes-a', 'community-descartes-b']);
}

// --- Accepted status wins if the same peer also appears as pending ---
{
  const items = getPeopleItems('me', {
    acceptedConnections: [{ id: 'peer-1', name: 'Ada' }],
    pendingConnections: [{ id: 'peer-1', name: 'Ada' }],
  });
  assert.equal(items.length, 1, 'A peer present in both lists must render exactly once');
  assert.equal(items[0].pending, undefined, 'The retained card must be the accepted (non-pending) one');
}

// --- Unrelated people keep their relative order ---
{
  const items = getPeopleItems('me', {
    acceptedConnections: [
      { id: 'a1', name: 'Ada' },
      { id: 'a1', name: 'Ada' }, // duplicate, should not shift Bob/Carl
      { id: 'b1', name: 'Bob' },
      { id: 'c1', name: 'Carl' },
    ],
    pendingConnections: [],
  });
  assert.deepEqual(items.map(i => i.id), ['a1', 'b1', 'c1']);
}

console.log('Explore people dedup: all checks passed');
