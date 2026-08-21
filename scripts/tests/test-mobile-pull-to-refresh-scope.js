#!/usr/bin/env node

// Regression coverage for: mobile pull-to-refresh fired on any downward
// touch-drag anywhere in the app -- dragging a graph node, scrolling inside
// a modal or the node panel, using the bottom tab bar -- not just a genuine
// pull-down-to-reload gesture on idle background.
//
// Root cause (assets/js/mobile-enhancements.js, addPullToRefresh): the
// gesture armed on touchstart whenever `window.scrollY === 0`. #main-content
// is `position: fixed; overflow: hidden`, so the page never scrolls and
// window.scrollY is always 0 -- the guard did nothing. Any accidental
// >80px downward drag anywhere in the app (which is the entire UI, since
// the graph/modals/panels/tab bar all live inside #main-content) called
// location.reload() after 500ms, discarding in-progress navigation.
//
// This loads the ACTUAL assets/js/mobile-enhancements.js in a minimal VM
// sandbox, drives its real touchstart/touchmove/touchend listeners on
// #main-content with fake touch events, and asserts location.reload() only
// fires when the gesture starts on genuine idle background -- not on the
// graph SVG, a modal, the node panel, the tab bar, or a button/link/input.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'assets/js/mobile-enhancements.js'), 'utf8');

function makeTarget(matchesExclude) {
  return {
    closest(_selector) {
      return matchesExclude ? {} : null;
    },
  };
}

function runGesture(target) {
  const noop = () => {};
  const listeners = {};
  const mainContent = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const documentShim = {
    getElementById: (id) => (id === 'main-content' ? mainContent : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: noop,
    body: { classList: { add: noop, remove: noop } },
  };

  let reloadCalls = 0;
  const sandbox = {
    console,
    navigator: { userAgent: 'iPhone' },
    document: documentShim,
    location: { reload: () => { reloadCalls += 1; } },
    addEventListener: noop,
    // triggerRefresh() defers the reload by setTimeout(fn, 500); run it
    // synchronously so the test doesn't need a real event loop.
    setTimeout: (fn, ms) => { if (ms === 500) fn(); return 0; },
    clearTimeout: noop,
  };
  sandbox.window = sandbox;
  sandbox.window.scrollY = 0;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'mobile-enhancements.js' });

  assert.equal(typeof sandbox.initMobileEnhancements, 'function');
  sandbox.initMobileEnhancements();
  assert.equal(typeof listeners.touchstart, 'function', 'touchstart must be wired on #main-content');
  assert.equal(typeof listeners.touchmove, 'function', 'touchmove must be wired on #main-content');
  assert.equal(typeof listeners.touchend, 'function', 'touchend must be wired on #main-content');

  listeners.touchstart({ target, touches: [{ clientY: 100 }] });
  listeners.touchmove({ touches: [{ clientY: 220 }] }); // 120px downward drag
  listeners.touchend();

  return reloadCalls;
}

// --- 1) Idle background: a genuine pull-down-to-reload still works -------
{
  const calls = runGesture(makeTarget(false));
  assert.equal(calls, 1, 'a downward drag starting on idle background must still trigger pull-to-refresh');
}

// --- 2) Excluded elements (graph, modals, panel, tab bar, controls) must
//        NOT trigger a reload, since a drag there is normal navigation ---
{
  const calls = runGesture(makeTarget(true));
  assert.equal(calls, 0, 'a downward drag starting on an excluded element (graph/modal/panel/tab bar/control) must not reload the page');
}

// --- 3) The exclusion selector itself must actually cover the elements
//        that make up in-app navigation, not just assert the wiring works ---
{
  const selectorMatch = src.match(/const PULL_REFRESH_EXCLUDE_SELECTOR =\s*\n?\s*'([^']+)'/);
  assert.ok(selectorMatch, 'PULL_REFRESH_EXCLUDE_SELECTOR must be defined');
  const selector = selectorMatch[1];
  for (const required of ['svg', '.modal', '#node-side-panel', '#mobile-tab-bar', 'button', 'a', 'input', 'textarea']) {
    assert.ok(selector.includes(required), `PULL_REFRESH_EXCLUDE_SELECTOR must exclude ${required}`);
  }
}

console.log('✅ test-mobile-pull-to-refresh-scope passed');
