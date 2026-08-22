#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');

assert.match(index, /organization-manager\.js[^\n]*module: true,[\s\S]*OrganizationManager\?\.init[\s\S]*OrganizationManager\.init\(window\.supabase\)/,
  'the authenticated app must load and initialize the canonical organization manager');
assert.match(src, /await window\.OrganizationManager\.createOrganization\(\{[\s\S]*name,[\s\S]*description: desc \|\| null/,
  'Explorer organization creation must await the canonical authorization-aware mutation');
assert.doesNotMatch(src, /resourceType === 'organizations'[\s\S]{0,300}_showAddConfirmation/,
  'Explorer must not claim an organization was added without persistence');
assert.match(src, /\.from\('organizations'\)\s*\.select\('id, name, description, created_at'\)\s*\.order\('created_at', \{ ascending: false \}\)/,
  'canonical reconciliation must fetch newest organizations first so a new row survives the capped preview');
assert.match(src, /if \(!window\.OrganizationManager\?\.createOrganization\) \{[\s\S]*?window\.retryPostAuthModule\?\.\('organization-manager\.js'\);/,
  'an unavailable organization manager must restart the existing post-auth module loader');

const noop = () => {};
const fakeEl = () => ({
  addEventListener: noop,
  classList: { add: noop, remove: noop, toggle: noop },
  style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [],
  setAttribute: noop, remove: noop, textContent: '',
});
const documentShim = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: fakeEl,
  body: fakeEl(),
};
const sandbox = {
  console,
  document: documentShim,
  window: { document: documentShim, location: { search: '', hostname: 'localhost' } },
  setTimeout, clearTimeout, setInterval, clearInterval,
  URLSearchParams, localStorage: { getItem: () => null, setItem: noop },
  Set, Map, Promise, Date,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'command-dashboard.js' });

const result = sandbox.window.CommandDashboard.__testApplyOrganizationCreateResult(
  'me',
  {
    organizations: [{ id: 'existing', name: 'Existing Org' }],
    myOrgIds: new Set(),
  },
  { id: 'new-org', name: 'New Org', description: 'Persisted' },
);
const plain = JSON.parse(JSON.stringify(result));
assert.deepEqual(plain.organizations.map(org => org.id), ['new-org', 'existing']);
assert.deepEqual(plain.myOrgIds, ['new-org']);

console.log('Explore organization creation: all checks passed');
