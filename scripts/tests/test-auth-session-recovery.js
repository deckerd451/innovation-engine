#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../auth.js'), 'utf8');

function harness({ expired = false, refreshFails = false, pending = false } = {}) {
  const user = { id: 'user-1', email: 'test@example.com' };
  const session = { user };
  const events = [], timers = [], elements = new Map();
  let callback, refreshed = false, claims = 0, refreshes = 0, resolveUser;
  const deferred = new Promise(resolve => { resolveUser = resolve; });
  const element = () => ({ style: {}, dataset: {}, textContent: '',
    classList: { values: new Set(['hidden']), add(v) { this.values.add(v); }, remove(v) { this.values.delete(v); } },
    addEventListener() {} });
  const document = { body: { style: {} }, getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  } };
  const window = { location: { href: 'https://example.com/index.html' },
    addEventListener() {}, dispatchEvent(e) { events.push(e.type); },
    supabase: { auth: {
      onAuthStateChange(fn) { callback = fn; return { data: {} }; },
      async getSession() { return { data: { session } }; },
      async getUser() {
        if (pending) return deferred;
        return expired && !refreshed ? { error: { status: 401, message: 'JWT expired' } } : { data: { user } };
      },
      async refreshSession() {
        refreshes++;
        if (refreshFails) return { error: new Error('Refresh token expired') };
        refreshed = true;
        return { data: { session } };
      },
    }, async rpc() { claims++; return {}; } },
  };
  vm.runInNewContext(source, { window, document, URL,
    console: { log() {}, warn() {}, error() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
  });
  window.setupLoginDOM();
  window.initLoginSystem();
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { window, events, timers, elements, flush, user,
    emit(event) { return callback(event, ['SIGNED_OUT', 'INITIAL_SESSION'].includes(event) ? null : session); },
    resolve() { resolveUser({ data: { user } }); },
    get claims() { return claims; }, get refreshes() { return refreshes; },
  };
}

(async () => {
  for (const refreshFails of [false, true]) {
    const h = harness({ expired: true, refreshFails });
    await h.flush();
    h.emit('INITIAL_SESSION');
    assert.equal(h.emit('SIGNED_IN'), undefined, 'auth callback must be synchronous');
    assert.equal(h.claims, 0, 'no database requests inside callback');
    h.timers.find(t => t.ms === 0).fn();
    await h.flush();
    assert.equal(h.refreshes, 1);
    assert.equal(h.claims, refreshFails ? 0 : 1);
    assert.equal(h.events.includes('authenticated-user'), !refreshFails);
    if (refreshFails) {
      assert.equal(h.elements.get('login-section').classList.values.has('hidden'), false);
      assert.match(h.elements.get('authError').textContent, /sign in again/);
    } else {
      h.emit('SIGNED_OUT');
      assert.equal(h.window.currentAuthUser, null);
      assert.equal(h.elements.get('login-section').classList.values.has('hidden'), false);
      assert.ok(h.events.includes('user-logged-out'));
    }
  }
  for (const cancel of ['signout', 'timeout']) {
    const h = harness({ pending: true });
    await h.flush();
    h.emit('SIGNED_IN');
    h.timers.find(t => t.ms === 0).fn();
    await h.flush();
    if (cancel === 'signout') h.emit('SIGNED_OUT');
    else h.timers.find(t => t.ms === 10000).fn();
    await h.flush();
    h.resolve();
    await h.flush();
    assert.equal(h.claims, 0, 'late validation must not restart the app');
    assert.equal(h.events.includes('authenticated-user'), false);
  }
  console.log('Auth session recovery tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
