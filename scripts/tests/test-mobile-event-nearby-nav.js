#!/usr/bin/env node

// Mobile Event/Nearby are Nearify-context surfaces. BLE remains available to
// legacy desktop/test modules, but must not be reachable from these tabs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const nav = fs.readFileSync(path.join(root, 'assets/js/mobile-nav.js'), 'utf8');
const contextSrc = fs.readFileSync(path.join(root, 'assets/js/nearify-mobile-context.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.doesNotMatch(nav, /BLEPassiveNetworking|navigator\.bluetooth|requestDevice|infer_ble_edges/);
assert.match(nav, /NearifyMobileContext\?\.showEvent/);
assert.match(nav, /NearifyMobileContext\?\.showNearby/);
assert.match(index, /nearify-mobile-context\.js/);
assert.match(nav, /openThemeDiscoveryModal/);
assert.match(contextSrc, /get_nearify_event_recommendations/);
assert.match(contextSrc, /nearify_event_presence/);
assert.match(contextSrc, /community_id/);
assert.doesNotMatch(contextSrc, /navigator\.bluetooth|infer_ble_edges/);

function queryResult(data, error = null) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    limit() { return query; },
    maybeSingle: async () => ({ data, error }),
    then(resolve) { return Promise.resolve({ data, error }).then(resolve); },
  };
  return query;
}

function loadContext(supabase) {
  const document = {
    head: { appendChild() {} },
    createElement() { return { textContent: '', appendChild() {} }; },
  };
  const sandbox = { console, document, window: null, supabase };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(contextSrc, sandbox, { filename: 'nearify-mobile-context.js' });
  return sandbox.NearifyMobileContext;
}

(async () => {
  let requestedEvent;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'auth-me' } }, error: null }) },
    from(table) {
      if (table === 'community') return queryResult({ id: 'community-me' });
      assert.equal(table, 'nearify_event_presence');
      return queryResult([{ nearify_event_id: 'event-1', event_name: 'Nearify Live', status: 'joined' }]);
    },
    rpc(name, args) {
      if (name === 'get_nearify_authorization_status') return Promise.resolve({ data: { status: 'authorized' }, error: null });
      assert.equal(name, 'get_nearify_event_recommendations');
      requestedEvent = args.p_nearify_event_id;
      return Promise.resolve({ data: { success: true, recommendations: [{ name: 'Grounded person' }] }, error: null });
    },
  };
  const context = loadContext(supabase);
  const loaded = await context.loadContext();
  assert.equal(loaded.event.event_name, 'Nearify Live');
  assert.equal(requestedEvent, 'event-1');
  assert.deepEqual(loaded.recommendations.map((person) => person.name), ['Grounded person']);

  const noEvent = loadContext({
    auth: supabase.auth,
    from(table) { return table === 'community' ? queryResult({ id: 'community-me' }) : queryResult([]); },
    rpc: async (name) => { if (name === 'get_nearify_authorization_status') return { data: { status: 'authorized' }, error: null }; throw new Error('must not call recommendations without an event'); },
  });
  const empty = await noEvent.loadContext();
  assert.equal(empty.event, null);
  assert.equal(empty.recommendations.length, 0);

  const unauthorized = loadContext({
    auth: supabase.auth,
    from(table) { return table === 'community' ? queryResult({ id: 'community-me' }) : queryResult([{ nearify_event_id: 'event-1', status: 'joined' }]); },
    rpc: async (name) => name === 'get_nearify_authorization_status'
      ? ({ data: { status: 'revoked' }, error: null })
      : ({ data: { success: true, recommendations: [{ name: 'must not leak' }] }, error: null }),
  });
  assert.equal((await unauthorized.loadContext()).recommendations.length, 0);
  console.log('✅ test-mobile-event-nearby-nav passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
