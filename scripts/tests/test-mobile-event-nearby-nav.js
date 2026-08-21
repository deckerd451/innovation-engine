#!/usr/bin/env node

// Focused regression coverage for the two visible mobile bottom-nav actions.
// Event must continue to route through BLE Event Mode (and must not silently
// join the hard-coded WebEventPresence test event). Nearby must open its
// existing suggestions UI and preserve a card when a backend mutation fails.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const mobileNavSrc = fs.readFileSync(path.join(root, 'assets/js/mobile-nav.js'), 'utf8');
const bleSrc = fs.readFileSync(path.join(root, 'assets/js/ble-passive-networking.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// The shipped controls and routes remain present and distinct.
assert.match(indexSrc, /id="mob-tab-event-mode"[^>]+data-tab="event-mode"/);
assert.match(indexSrc, /id="mob-tab-suggestions"[^>]+data-tab="suggestions"/);
assert.match(mobileNavSrc, /BLEPassiveNetworking\.startEventMode\(\)/);
assert.match(mobileNavSrc, /showMobileSuggestionsModal\(\)/);
assert.doesNotMatch(
  mobileNavSrc,
  /WebEventPresence\.joinEvent/,
  'mobile Event must not join the hard-coded test event without an event selection path'
);

function loadBleWithSupabase(supabase) {
  const noop = () => {};
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    navigator: {},
    localStorage: { getItem: () => null, setItem: noop },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    setInterval: noop,
    clearInterval: noop,
  };
  sandbox.window = sandbox;
  sandbox.window.dispatchEvent = noop;
  vm.createContext(sandbox);
  vm.runInContext(bleSrc, sandbox, { filename: 'ble-passive-networking.js' });
  return sandbox.BLEPassiveNetworking.initialize(supabase, 'community-me')
    .then(() => sandbox.BLEPassiveNetworking);
}

(async () => {
  // Supabase resolves API failures; it does not reject the promise. Those
  // resolved errors must be reported as failure so mobile-nav keeps the card.
  const rpcError = { message: 'promotion rejected' };
  const updateError = { message: 'update rejected' };
  const supabase = {
    from(table) {
      if (table === 'beacons') {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }
      assert.equal(table, 'interaction_edges');
      return {
        update: () => ({ eq: async () => ({ data: null, error: updateError }) }),
      };
    },
    rpc: async () => ({ data: null, error: rpcError }),
  };

  const ble = await loadBleWithSupabase(supabase);
  assert.equal(await ble.acceptSuggestion('edge-1'), false);
  assert.equal(await ble.ignoreSuggestion('edge-1'), false);

  console.log('✅ test-mobile-event-nearby-nav passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
