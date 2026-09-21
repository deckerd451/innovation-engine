#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = require('node:path').resolve(__dirname, '..', '..');
const source = fs.readFileSync(require('node:path').join(root, 'profile.js'), 'utf8');
const readRpc = fs.readFileSync(require('node:path').join(root, 'supabase/sql/migrations/20260921_community_intent_authoring_read.sql'), 'utf8');
const index = fs.readFileSync(require('node:path').join(root, 'index.html'), 'utf8');

const sandbox = {
  window: {
    CHProfile: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
  },
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
  console,
  crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(source, sandbox, { filename: 'profile.js' });
const normalize = sandbox.window.CHProfile.normalizeIntentSubject;

assert.equal(normalize('Product design'), 'product_design');
assert.equal(normalize('  Café & Events  '), 'cafe_and_events');
assert.equal(normalize('UX design'), 'ux_design');
assert.notEqual(normalize('UX design'), normalize('Product design'), 'subjects do not silently merge');

assert.match(source, /begin_community_intent/);
assert.match(source, /confirm_community_intent/);
assert.match(source, /end_community_intent/);
assert.match(source, /p_client_operation_id: operationId/);
assert.match(source, /get_my_community_intents/);
assert.match(source, /intentTypeLabel\(type\)/);
assert.match(source, /visibility.*nearify/);
assert.match(source, /Only you can see this/);
assert.match(source, /I can help with/);
assert.match(source, /I’m looking for/);
assert.match(source, /active\)/);
assert.doesNotMatch(source, /community_intent_statements["'`\)]\s*\)/, 'client must not read the intent table directly');
assert.match(readRpc, /SECURITY DEFINER/);
assert.match(readRpc, /SET search_path = public/);
assert.match(readRpc, /auth\.uid\(\)/);
assert.match(readRpc, /GRANT EXECUTE ON FUNCTION public\.get_my_community_intents\(\) TO authenticated/);
assert.match(readRpc, /i\.active = true/);
assert.match(index, /profile\.js\?v=community-intent-20260921/);

console.log('✅ community intent authoring truth/idempotency checks passed');
