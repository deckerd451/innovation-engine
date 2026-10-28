#!/usr/bin/env node
// A returning member recovers their older profile even when another part of
// the page asks bootstrapSession for the profile before sign-in's claim has
// finished (synthetic rows only).
//
// bootstrapSession.getCommunityUser() runs as soon as a module needs the
// member's profile. It used to create a profile when none was linked yet;
// if that ran before auth.js claimed the member's older profile, sign-in
// then found the new, empty profile by account and never claimed the older
// one. Now bootstrapSession never creates a profile: it waits for auth.js,
// which claims first and creates a profile only when there is nothing to
// claim.
//
// Runs the real bootstrapSession.js and auth.js's profile load
// (loadUserProfileOnce, fetchUserProfile) together in one window, against
// the stand-in database (fixtures/claim-stand-in.js) with the claim function
// as deployed, and holds the claim back until bootstrapSession has asked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stand } = require('./fixtures/claim-stand-in');

const root = path.resolve(__dirname, '../..');
const bootstrapSource = fs.readFileSync(process.env.BOOTSTRAP_SESSION_FILE || path.join(root, 'assets/js/bootstrapSession.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const authCode = auth.slice(auth.indexOf('  const OWN_COLUMNS'), auth.indexOf('  // -----------------------------\n  // Boot logic'));
assert.ok(authCode.includes('async function loadUserProfileOnce(user)'), 'the profile load is in this slice');

const columnsWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/profile-columns.js'), 'utf8'), { window: columnsWindow });

function page(rows, user, options) {
  const { client, queries } = stand(rows, options);
  client.user = user;
  const window = new EventTarget();
  Object.assign(window, {
    supabase: client,
    BuildspaceProfileColumns: columnsWindow.BuildspaceProfileColumns,
    location: { hostname: 'buildspace.test' },
    showNotification() {},
    currentUserProfile: null,
  });
  const store = new Map();
  const sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const quiet = { log() {}, warn() {}, error() {}, debug() {} };
  const context = vm.createContext({
    window, sessionStorage, console: quiet, setTimeout, clearTimeout, Promise, CustomEvent, EventTarget,
  });
  vm.runInContext(bootstrapSource, context);
  vm.runInContext(`
    const log = () => {}, warn = () => {}, err = () => {};
    const withTimeout = (p) => p;
    const showProfileLoading = () => {}, hideProfileLoading = () => {};
    const emitProfileLoaded = (user, profile) => window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { user, profile } }));
    const emitProfileNew = (user) => window.dispatchEvent(new CustomEvent("profile-new", { detail: { user } }));
    let claimPromise = null;
    let profileLoadPromise = null;
    let profileLoadInFlight = null;
    ${authCode}
    this.loadUserProfileOnce = loadUserProfileOnce;
  `, context);
  return { window, context, queries };
}

const inserts = (queries) => queries.filter((q) => q.mode === 'insert');
const me = { id: 'auth-me', email: 'member@example.test' };
const profile = (id, extra) => ({ id, user_id: null, email: 'member@example.test', name: id, created_at: '2026-01-01', profile_completed: true, onboarding_completed: true, ...extra });
// A gate the stand-in's claim waits on, so the test decides the order.
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  // 1. bootstrapSession asks first; sign-in's claim finishes later. Both end
  // up with the member's older profile, and no profile is created.
  {
    const rows = [profile('older')];
    const claim = gate();
    const { window, context, queries } = page(rows, me, { claimGate: claim.promise });
    const early = window.bootstrapSession.getCommunityUser();
    await tick();
    const signIn = context.loadUserProfileOnce(me);
    await tick();
    assert.equal(inserts(queries).length, 0, 'nothing is created while the claim is pending');
    claim.open();
    const [fromBootstrap, fromSignIn] = await Promise.all([early, signIn]);
    assert.equal(fromSignIn.id, 'older', 'sign-in claims the older profile');
    assert.equal(fromBootstrap.id, 'older', 'bootstrapSession gets the same profile');
    assert.equal(rows.length, 1, 'no second profile');
    assert.equal(rows[0].user_id, 'auth-me');
    assert.equal(inserts(queries).length, 0);
  }
  // 2. bootstrapSession asks before sign-in has even started its load.
  {
    const rows = [profile('older')];
    const { window, context, queries } = page(rows, me);
    const early = window.bootstrapSession.getCommunityUser();
    for (let i = 0; i < 5; i += 1) await tick();
    assert.equal(inserts(queries).length, 0, 'nothing is created before sign-in runs');
    const fromSignIn = await context.loadUserProfileOnce(me);
    assert.equal((await early).id, 'older');
    assert.equal(fromSignIn.id, 'older');
    assert.equal(rows.length, 1);
  }
  // 3. A genuinely new member: sign-in creates the one profile, and
  // bootstrapSession gets it.
  {
    const rows = [profile('someone', { email: 'other@example.test' })];
    const { window, context, queries } = page(rows, me);
    const early = window.bootstrapSession.getCommunityUser();
    await tick();
    const created = await context.loadUserProfileOnce(me);
    assert.equal(inserts(queries).length, 1, 'exactly one profile is created, by sign-in');
    assert.equal(created.user_id, 'auth-me');
    assert.equal((await early).id, created.id);
  }
  // 4. Sign-in's time limit passes while the claim is still running
  // (profile-new "timeout"): bootstrapSession keeps waiting, creates
  // nothing, and gets the older profile when the load finishes.
  {
    const rows = [profile('older')];
    const claim = gate();
    const { window, context, queries } = page(rows, me, { claimGate: claim.promise });
    const early = window.bootstrapSession.getCommunityUser();
    const signIn = context.loadUserProfileOnce(me);
    await tick();
    window.dispatchEvent(new CustomEvent('profile-new', { detail: { user: me, reason: 'timeout' } }));
    await tick();
    assert.equal(inserts(queries).length, 0);
    claim.open();
    assert.equal((await signIn).id, 'older');
    assert.equal((await early).id, 'older', 'bootstrapSession waited through profile-new');
    assert.equal(rows.length, 1);
  }
  // 5. Another account's profile-loaded is ignored; sign-out ends the wait.
  {
    const rows = [];
    const { window, queries } = page(rows, me);
    const early = window.bootstrapSession.getCommunityUser();
    await tick();
    window.dispatchEvent(new CustomEvent('profile-loaded', { detail: { profile: { id: 'theirs', user_id: 'auth-other' } } }));
    await tick();
    window.dispatchEvent(new CustomEvent('user-logged-out'));
    assert.equal(await early, null, 'another account\'s profile is never returned');
    assert.equal(inserts(queries).length, 0);
  }
  // 6. Already linked: read directly, no waiting.
  {
    const rows = [profile('mine', { user_id: 'auth-me' })];
    const { window, queries } = page(rows, me);
    assert.equal((await window.bootstrapSession.getCommunityUser()).id, 'mine');
    assert.equal(queries.filter((q) => q.rpc).length, 0);
  }

  // bootstrapSession never inserts a profile.
  assert.doesNotMatch(bootstrapSource, /\.insert\(/, 'bootstrapSession creates no profiles');
  console.log('Profile bootstrap order: a returning member recovers their older profile even when bootstrapSession asks before the claim finishes; only sign-in creates profiles');
})().catch((error) => { console.error(error); process.exit(1); });
