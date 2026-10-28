#!/usr/bin/env node
// When sign-in can't load the member's profile (an error, or its 10-second
// limit while the load -- and a returning member's claim -- is still
// running), auth.js sends profile-new. The dashboard used to create a
// profile in response, which could leave a returning member on a new, empty
// profile with their older one never claimed. Now it waits for or retries
// sign-in's own load (window.retrySignedInProfile: claim first, create only
// when there's nothing to claim), a few times, and never creates a profile
// itself. Synthetic rows only.
//
// Runs auth.js's profile load (loadUserProfileOnce, fetchUserProfile,
// retrySignedInProfile) and dashboardPane.js's recovery block together in
// one window, with dashboardPane's profile-new listener as wired in init(),
// against the stand-in database (fixtures/claim-stand-in.js) with the claim
// function as deployed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stand } = require('./fixtures/claim-stand-in');

const root = path.resolve(__dirname, '../..');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const authCode = auth.slice(auth.indexOf('  const OWN_COLUMNS'), auth.indexOf('  // -----------------------------\n  // Boot logic'));
assert.ok(authCode.includes('function retrySignedInProfile()'), 'the retry is in the profile-load slice');
const pane = fs.readFileSync(path.join(root, 'assets/js/dashboardPane.js'), 'utf8');
const recoveryCode = pane.slice(pane.indexOf('  const PROFILE_RETRY_DELAYS_MS'), pane.indexOf('  // NOTE: dispatchProfileLoadedIfNeeded removed'));
assert.ok(recoveryCode.includes('function recoverSignedInProfile(onGiveUp)'), 'the recovery block is in this slice');

// dashboardPane wires profile-new to the recovery, and never creates a
// profile itself.
assert.match(pane, /window\.addEventListener\("profile-new", \(e\) => \{[\s\S]{0,200}if \(e\?\.detail\?\.user\) \{\s*state\.authUser = e\.detail\.user;\s*recoverSignedInProfile\(/,
  'profile-new is answered by waiting for or retrying sign-in');
assert.doesNotMatch(pane, /from\(["']community["']\)\s*\.insert\(|ensureCommunityProfile/, 'dashboardPane creates no profiles');
assert.match(pane, /window\.addEventListener\("profile-loaded", async \(e\) => \{[\s\S]{0,200}resetProfileRecovery\(\);/);

const columnsWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/profile-columns.js'), 'utf8'), { window: columnsWindow });

function page(rows, user, options) {
  const { client, queries } = stand(rows, options);
  client.user = user;
  const window = new EventTarget();
  Object.assign(window, {
    supabase: client,
    BuildspaceProfileColumns: columnsWindow.BuildspaceProfileColumns,
    showNotification() {},
    currentAuthUser: user,
    currentUserProfile: null,
  });
  const events = [];
  for (const type of ['profile-loaded', 'profile-new']) {
    window.addEventListener(type, (e) => events.push({ type, reason: e.detail?.reason, id: e.detail?.profile?.id }));
  }
  const gaveUp = [];
  const quiet = { log() {}, warn() {}, error() {}, debug() {} };
  // The dashboard's retry delays (2s, 5s) are shortened for the test.
  const fastTimeout = (fn, ms) => setTimeout(fn, Math.min(ms, 5));
  const context = vm.createContext({ window, console: quiet, setTimeout: fastTimeout, clearTimeout, Promise, CustomEvent, gaveUp });
  vm.runInContext(`
    const log = () => {}, warn = () => {}, err = () => {};
    const withTimeout = (p) => p;
    const showProfileLoading = () => {}, hideProfileLoading = () => {};
    const emitProfileLoaded = (user, profile) => window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { user, profile } }));
    const emitProfileNew = (user, reason) => window.dispatchEvent(new CustomEvent("profile-new", { detail: { user, reason } }));
    let claimPromise = null;
    let profileLoadPromise = null;
    let profileLoadInFlight = null;
    ${authCode}
    this.loadUserProfileOnce = loadUserProfileOnce;
    this.emitProfileNew = emitProfileNew;
  `, context);
  // dashboardPane: the recovery block and its listeners, as in init().
  vm.runInContext(`
    const state = { authUser: null };
    ${recoveryCode}
    window.addEventListener("profile-new", (e) => {
      if (e?.detail?.user) {
        state.authUser = e.detail.user;
        recoverSignedInProfile(() => gaveUp.push(true));
      }
    });
    window.addEventListener("profile-loaded", (e) => { if (e?.detail?.profile) resetProfileRecovery(); });
  `, context);
  return { window, context, queries, events, gaveUp };
}

const inserts = (queries) => queries.filter((q) => q.mode === 'insert');
const claims = (queries) => queries.filter((q) => q.rpc).length;
const me = { id: 'auth-me', email: 'member@example.test' };
const profile = (id, extra) => ({ id, user_id: null, email: 'member@example.test', name: id, created_at: '2026-01-01', profile_completed: true, onboarding_completed: true, ...extra });
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}
const settle = async (ms = 60) => { await new Promise((resolve) => setTimeout(resolve, ms)); };

(async () => {
  // 1. Time limit: sign-in's load (and the claim) is still running when
  // auth.js gives up waiting and sends profile-new "timeout". Nothing is
  // created; when the claim finishes, the member has their older profile.
  {
    const rows = [profile('older')];
    const claim = gate();
    const { context, queries, events, gaveUp } = page(rows, me, { claimGate: claim.promise });
    const load = context.loadUserProfileOnce(me);
    context.emitProfileNew(me, 'timeout'); // as bootstrapForUser does at 10s
    await settle();
    assert.equal(inserts(queries).length, 0, 'nothing is created while the claim is pending');
    claim.open();
    assert.equal((await load).id, 'older');
    await settle();
    assert.equal(rows.length, 1, 'no second profile');
    assert.equal(rows[0].user_id, 'auth-me', 'the older profile is claimed');
    assert.equal(inserts(queries).length, 0);
    assert.equal(claims(queries), 1, 'the running load was waited for, not restarted');
    assert.deepEqual(events.filter((e) => e.type === 'profile-loaded').map((e) => e.id), ['older']);
    assert.deepEqual(gaveUp, []);
  }
  // 2. Error: the claim is unavailable and the fallback lookup fails once,
  // so the load ends with profile-new "error". The dashboard retries sign-in,
  // which links the older profile; nothing is created.
  {
    const rows = [profile('older')];
    const { context, queries, events, gaveUp } = page(rows, me, { claim: 'missing', failEmailLookups: 1 });
    assert.equal(await context.loadUserProfileOnce(me), null);
    await settle();
    assert.deepEqual(events[0], { type: 'profile-new', reason: 'error', id: undefined });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, 'auth-me', 'the retry linked the older profile');
    assert.equal(inserts(queries).length, 0, 'nothing is created');
    assert.deepEqual(events.filter((e) => e.type === 'profile-loaded').map((e) => e.id), ['older']);
    assert.deepEqual(gaveUp, []);
  }
  // 3. A new member whose profile couldn't be saved ("create-failed"): the
  // retry runs sign-in again, which creates exactly one profile, flagged for
  // onboarding.
  {
    const rows = [profile('someone', { email: 'other@example.test' })];
    const { context, queries, events, gaveUp } = page(rows, me, { failInserts: 1 });
    assert.equal(await context.loadUserProfileOnce(me), null);
    await settle();
    assert.deepEqual(events[0], { type: 'profile-new', reason: 'create-failed', id: undefined });
    const mine = rows.filter((r) => r.user_id === 'auth-me');
    assert.equal(mine.length, 1, 'exactly one profile, created by sign-in');
    assert.equal(mine[0].onboarding_completed, false);
    assert.equal(context.window.currentUserProfile._needsOnboarding, true, 'new-member onboarding still starts');
    assert.equal(inserts(queries).length, 2, 'the failed save and the retry, both by sign-in');
    assert.deepEqual(events.filter((e) => e.type === 'profile-loaded').map((e) => e.id), [mine[0].id]);
    assert.deepEqual(gaveUp, []);
  }
  // 4. Still failing (a returning member's lookups keep timing out): a few
  // tries, then the dashboard gives up -- once -- without creating anything,
  // and later profile-new events don't start more loads.
  {
    const rows = [profile('older')];
    const { context, queries, gaveUp } = page(rows, me, { claim: 'missing', failEmailLookups: 100 });
    await context.loadUserProfileOnce(me);
    await settle(200);
    assert.equal(gaveUp.length, 1, 'gives up once');
    const loads = claims(queries);
    assert.equal(loads, 4, 'sign-in\'s load plus three tries');
    context.emitProfileNew(me, 'error');
    await settle();
    assert.equal(claims(queries), loads, 'no further loads');
    assert.equal(inserts(queries).length, 0, 'nothing is created');
    assert.equal(rows[0].user_id, null, 'the older profile is left for the next sign-in');
  }
  console.log('Profile recovery: after a sign-in error or time limit the dashboard waits for or retries sign-in (claim first) and never creates a profile; new members are still created once, by sign-in');
})().catch((error) => { console.error(error); process.exit(1); });
