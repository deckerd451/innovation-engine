#!/usr/bin/env node
// Map discovery suggestions follow one on/off setting (Settings → "Suggest
// people and projects on the map"), on by default.
//
// Imports the ACTUAL state manager and discovery trigger manager and drives
// them through the paths into Discovery the map uses: the 2-second
// automatic triggers, the physics loop (shouldTransitionToDiscovery →
// transitionToDiscovery), and a manual trigger. Before this change, turning
// discovery off only stopped the automatic triggers, and the "already in
// discovery" check compared the whole state object with 'discovery' (never
// equal), so discovery re-triggered while already showing. It also checks
// the stored setting in settings-modal.js (default on; an earlier "off" in
// the old Discovery Preferences dialog is kept).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
global.window = { addEventListener: () => {}, dispatchEvent: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quiet = () => { const saved = [console.log, console.warn]; console.log = console.warn = () => {}; return () => { [console.log, console.warn] = saved; }; };

(async () => {
  const restore = quiet();
  const { StateManager, storedDiscoveryEnabled } = await import(pathToFileURL(path.join(root, 'assets/js/unified-network/state-manager.js')).href);
  const { DiscoveryTriggerManager } = await import(pathToFileURL(path.join(root, 'assets/js/unified-network/discovery-trigger-manager.js')).href);

  // A map where Discovery is due: an unconnected node with relevant
  // presence and no strong next action (the physics-loop conditions), and
  // an automatic trigger condition met.
  const nodes = [
    { id: 'me', isMyNetwork: true, effectivePull: 0.2, presenceEnergy: 0 },
    { id: 'suggested', isMyNetwork: false, effectivePull: 0.65, presenceEnergy: 0.5 },
  ];
  function setup() {
    const sm = new StateManager();
    sm._lastTransitionTime = 0; // past the 2-minute rate limit
    const tm = new DiscoveryTriggerManager(sm, { getAllNodes: () => nodes }, {});
    // The automatic conditions are tested elsewhere; here one is simply met.
    for (const check of ['checkMomentumTrigger', 'checkStrongActionAbsence', 'checkRelevantPresence', 'checkTemporalOpportunities', 'checkInactivityTrigger']) tm[check] = () => false;
    tm.checkSmallGraphTrigger = () => true;
    const fired = [];
    tm.on('discovery-triggered', (event) => fired.push(event.reasons.join(',')));
    return { sm, tm, fired };
  }
  const mode = (sm) => sm.getState().mode;
  // Each scenario runs and reports on its own, so a failure names the defect.
  const failures = [];
  const scenario = async (name, fn) => {
    try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); }
  };

  // On by default, at the current default pace (one discovery per 2 minutes).
  await scenario('on by default', async () => {
    const { sm, tm, fired } = setup();
    assert.equal(tm.getPreferences().enabled, true, 'discovery suggestions are on by default');
    assert.equal(tm.getMinimumInterval(), 120000, 'default pace: at most one discovery every 2 minutes');
    assert.equal(sm.shouldTransitionToDiscovery(nodes), true, 'physics loop: Discovery is due on this map');
    tm.checkTriggers();
    await sleep(150);
    assert.deepEqual(fired, ['smallGraph'], 'automatic trigger fires when on');
    assert.equal(mode(sm), 'discovery', 'the map enters Discovery');
    sm.updateGuidedNodes(nodes);
    assert.deepEqual(sm.getState().guidedNodes, ['suggested'], 'the unconnected, relevant node is suggested');
  });

  // Already in Discovery: the automatic check must not trigger again (the
  // old check compared the whole state object with 'discovery').
  await scenario('already in Discovery', async () => {
    const { sm, tm, fired } = setup();
    tm.checkTriggers();
    await sleep(150);
    assert.equal(mode(sm), 'discovery');
    tm.lastDiscoveryTime = 0;
    tm.checkTriggers();
    assert.deepEqual(fired, ['smallGraph'], 'no new discovery while already in Discovery');
  });

  // Off: no way into Discovery — automatic, physics loop or manual.
  await scenario('off: automatic trigger', async () => {
    const { sm, tm, fired } = setup();
    tm.setPreferences({ enabled: false });
    assert.equal(tm.getPreferences().enabled, false);
    tm.checkTriggers();
    await sleep(150);
    assert.deepEqual(fired, [], 'no automatic discovery when off');
    assert.equal(mode(sm), 'my-network');
  });
  await scenario('off: physics loop', async () => {
    const { sm, tm } = setup();
    tm.setPreferences({ enabled: false });
    // What api.js's physics loop does on each tick.
    if (sm.shouldTransitionToDiscovery(nodes)) sm.transitionToDiscovery();
    await sleep(150);
    sm.updateGuidedNodes(nodes);
    assert.equal(mode(sm), 'my-network', 'physics loop: no Discovery when off');
    assert.deepEqual(sm.getState().guidedNodes, [], 'nothing is suggested when off');
  });
  await scenario('off: manual trigger', async () => {
    const { sm, tm, fired } = setup();
    tm.setPreferences({ enabled: false });
    tm.forceDiscovery();
    await sleep(150);
    assert.deepEqual(fired, [], 'no manual discovery when off');
    assert.equal(mode(sm), 'my-network');
  });

  // Turned off while suggestions show: leave Discovery and clear them.
  await scenario('turned off during Discovery', async () => {
    const { sm, tm } = setup();
    tm.forceDiscovery();
    await sleep(150);
    sm.updateGuidedNodes(nodes);
    assert.equal(mode(sm), 'discovery');
    assert.deepEqual(sm.getState().guidedNodes, ['suggested']);
    tm.setPreferences({ enabled: false });
    await sleep(150);
    assert.equal(mode(sm), 'my-network', 'turning off leaves Discovery');
    assert.deepEqual(sm.getState().guidedNodes, [], 'turning off clears the suggestions');
  });

  // Turned off during the move into Discovery: it does not land there.
  await scenario('turned off mid-transition', async () => {
    const { sm, tm } = setup();
    sm.transitionToDiscovery();
    tm.setPreferences({ enabled: false });
    await sleep(250);
    assert.equal(mode(sm), 'my-network', 'turning off mid-transition ends in My Network');
  });

  // The map starts with the saved setting, before any discovery check runs
  // (it was once applied only after the map's setup, leaving a gap).
  await scenario('starts with the saved setting', async () => {
    const stores = [
      [{ 'discovery-suggestions-enabled': 'false' }, false, 'saved off'],
      [{ 'unified-network-preferences': JSON.stringify({ enabled: false }) }, false, 'old dialog off'],
      [{}, true, 'nothing saved'],
    ];
    for (const [store, expected, label] of stores) {
      const savedStorage = global.localStorage;
      global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: () => {}, removeItem: () => {} };
      try {
        const sm = new StateManager();
        sm._lastTransitionTime = 0;
        assert.equal(sm.isDiscoveryEnabled(), expected, `${label}: the map starts ${expected ? 'on' : 'off'}`);
        const tm = new DiscoveryTriggerManager(sm, { getAllNodes: () => nodes }, {});
        tm.checkSmallGraphTrigger = () => true;
        const fired = [];
        tm.on('discovery-triggered', () => fired.push(1));
        tm.checkTriggers(); // the first 2-second check after the map starts
        await sleep(150);
        assert.equal(fired.length, expected ? 1 : 0, `${label}: first check ${expected ? 'can' : 'cannot'} start discovery`);
      } finally { global.localStorage = savedStorage; }
    }
  });

  // Changed in Settings after the page loaded but before the map started:
  // the map starts with the latest saved value.
  await scenario('saved while the map starts', async () => {
    const store = {};
    const savedStorage = global.localStorage;
    global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: () => {}, removeItem: () => {} };
    try {
      const sm = new StateManager(); // module loaded: on
      assert.equal(sm.isDiscoveryEnabled(), true);
      store['discovery-suggestions-enabled'] = 'false'; // Settings saved "off"
      sm.initialize();
      assert.equal(sm.isDiscoveryEnabled(), false, 'the map starts with the latest saved setting');
    } finally { global.localStorage = savedStorage; }
  });

  // Turning off mid-way: one clean move back, no duplicate transition events.
  await scenario('clean transition events', async () => {
    const { sm } = setup();
    const events = [];
    sm.on('mode-changing', (e) => events.push(`changing:${e.to}`));
    sm.on('mode-changed', (e) => events.push(`changed:${e.mode}`));
    sm.transitionToDiscovery();
    sm.setDiscoveryEnabled(false);
    sm.setDiscoveryEnabled(false);
    await sleep(250);
    assert.deepEqual(events, ['changing:discovery', 'changed:my-network'], 'into Discovery, turned off: lands on My Network once');
    assert.equal(mode(sm), 'my-network');

    // Already on the way back to My Network: turning off adds nothing.
    const { sm: sm2 } = setup();
    sm2.transitionToDiscovery();
    await sleep(150);
    const events2 = [];
    sm2.on('mode-changing', (e) => events2.push(`changing:${e.to}`));
    sm2.on('mode-changed', (e) => events2.push(`changed:${e.mode}`));
    sm2.transitionToMyNetwork();
    sm2.setDiscoveryEnabled(false);
    await sleep(250);
    assert.deepEqual(events2, ['changing:my-network', 'changed:my-network'], 'already leaving Discovery: one transition');
  });

  // On again: discovery works as before.
  await scenario('turned back on', async () => {
    const { sm, tm, fired } = setup();
    tm.setPreferences({ enabled: false });
    tm.setPreferences({ enabled: true });
    tm.checkTriggers();
    await sleep(150);
    assert.deepEqual(fired, ['smallGraph'], 'automatic trigger fires again when turned back on');
    assert.equal(mode(sm), 'discovery');
  });
  restore();

  // The stored setting (settings-modal.js): default on; the switch's saved
  // value wins; an "off" from the old dialog is kept until changed.
  await scenario('stored setting', async () => {
  const settingsSource = fs.readFileSync(path.join(root, 'assets/js/settings-modal.js'), 'utf8');
  function settingWith(store) {
    const context = {
      window: { addEventListener: () => {}, dispatchEvent: () => {} },
      document: { addEventListener: () => {}, getElementById: () => null },
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    };
    vm.runInNewContext(settingsSource, context);
    const fromSettings = context.window.SettingsModal.discoverySuggestionsEnabled();
    // The map reads the same value (state-manager.js).
    const fromMap = storedDiscoveryEnabled(context.localStorage);
    assert.equal(fromMap, fromSettings, `Settings and the map agree for ${JSON.stringify(store)}`);
    return fromSettings;
  }
  assert.equal(settingWith({}), true, 'on by default');
  assert.equal(settingWith({ 'discovery-suggestions-enabled': 'false' }), false, 'saved off');
  assert.equal(settingWith({ 'discovery-suggestions-enabled': 'true' }), true, 'saved on');
  assert.equal(settingWith({ 'unified-network-preferences': JSON.stringify({ frequency: 'normal', enabled: false }) }), false, 'old dialog: automatic discovery unchecked stays off');
  assert.equal(settingWith({ 'unified-network-preferences': JSON.stringify({ frequency: 'off', enabled: true }) }), false, 'old dialog: frequency Off stays off');
  assert.equal(settingWith({ 'unified-network-preferences': JSON.stringify({ frequency: 'high', enabled: true }) }), true, 'old dialog: on stays on');
  assert.equal(settingWith({ 'unified-network-preferences': JSON.stringify({ enabled: false }), 'discovery-suggestions-enabled': 'true' }), true, 'the new switch overrides the old dialog');
  assert.equal(settingWith({ 'unified-network-preferences': '{not json' }), true, 'an unreadable old value falls back to on');
  });

  if (failures.length) throw new Error(`${failures.length} discovery scenario(s) failed:\n  - ${failures.join('\n  - ')}`);
  console.log('Discovery setting tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
