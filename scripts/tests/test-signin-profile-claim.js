#!/usr/bin/env node
// Sign-in finds the member's profile without reading anyone's email
// (auth.js fetchUserProfile and claimOlderProfile, run as they are against a
// recording stand-in for Supabase; synthetic profiles only).
//
// Members can't read community.email (docs/SECURITY_MEMBER_EMAIL_PRIVACY.md),
// so the server-side claim is the only way to find an older profile: there is
// no client-side email lookup to fall back on. The stand-in's claim function
// (fixtures/claim-stand-in.js) runs as the version deployed today
// ("production", which can return a profile it didn't link) and as the
// version 20261029_member_email_privacy_prepare.sql installs ("fixed").
//
//   - A returning member: one lookup by account, named columns.
//   - An older profile: claimed on the server, used only once it is linked
//     to this account.
//   - Duplicates: the server links one; the others are left exactly as they
//     are (they may have projects or connections; cleanup is a later task).
//   - The claim returns a profile another account linked first ("production"):
//     the load fails without writing anything, so it is retried (claim
//     included) instead of creating a profile; "fixed" returns none.
//   - The claim fails: the load fails, nothing is written or created.
//   - Nothing to claim: no profile (sign-in then creates one).
//   - Another account's profile with the same email is never returned or
//     written.
//   - No query ever selects, filters or sorts on email.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const code = auth.slice(auth.indexOf('  const OWN_COLUMNS'), auth.indexOf('  async function loadUserProfileOnce'));
assert.ok(code.includes('async function fetchUserProfile(user)'), 'the profile lookup is in this slice');

const columnsWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/profile-columns.js'), 'utf8'), { window: columnsWindow });
const OWN = columnsWindow.BuildspaceProfileColumns.own;

const { stand } = require('./fixtures/claim-stand-in');

async function signIn(rows, user, options) {
  const { client, queries } = stand(rows, options);
  client.user = user;
  const notices = [];
  const window = { supabase: client, BuildspaceProfileColumns: columnsWindow.BuildspaceProfileColumns, showNotification(m) { notices.push(m); } };
  const context = {
    window, console: { log() {}, warn() {}, error() {} }, setTimeout: (fn) => fn(), Promise, Error,
    log() {}, warn() {}, err() {},
    withTimeout: (p) => p,
  };
  vm.runInNewContext(`let claimPromise = null;\n${code}\nthis.fetchUserProfile = fetchUserProfile;`, context);
  let profile;
  let error = null;
  try {
    profile = await context.fetchUserProfile(user);
  } catch (e) {
    error = e;
  }
  checkNoEmail(queries);
  return { profile, error, queries, rows, notices };
}

// No query selects, filters or sorts on email; profile reads name the
// own-profile columns.
function checkNoEmail(queries) {
  for (const q of queries.filter((x) => x.table)) {
    assert.ok(!q.filters.some(([, c]) => c === 'email'), 'no query filters on email');
    assert.doesNotMatch(String(q.select), /email|\*/, 'no query selects email');
    if (q.table === 'community' && q.mode === 'select') assert.equal(q.select, OWN, 'profile reads use the own-profile columns');
  }
}
const writes = (queries) => queries.filter((q) => q.mode === 'update' || q.mode === 'insert');

const me = { id: 'auth-me', email: '  Member@Example.test ' };
const profile = (id, extra) => ({ id, user_id: null, email: 'member@example.test', name: id, created_at: '2026-01-01', ...extra });

(async () => {
  // 1. Returning member.
  {
    const { profile: p, queries } = await signIn([profile('linked', { user_id: 'auth-me' })], me);
    assert.equal(p.id, 'linked');
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].filters, [['eq', 'user_id', 'auth-me']]);
  }
  for (const claim of ['production', 'fixed']) {
    // 2. One older unclaimed profile: claimed on the server and loaded only
    // as this account's.
    {
      const { profile: p, queries, rows, notices } = await signIn([profile('older'), profile('someone', { email: 'other@example.test' })], me, { claim });
      assert.equal(p.id, 'older', claim);
      assert.equal(rows[0].user_id, 'auth-me', 'the claim function linked it');
      assert.equal(rows[1].user_id, null);
      const load = queries.find((q) => q.table === 'community' && q.filters.some(([, c, v]) => c === 'id' && v === 'older'));
      assert.deepEqual(load.filters, [['eq', 'id', 'older'], ['eq', 'user_id', 'auth-me']], 'the claimed profile is loaded only if it is this account\'s');
      assert.deepEqual(writes(queries), [], 'the website writes nothing');
      assert.deepEqual(notices, ['Welcome back! Your existing profile has been linked to your account.']);
    }
    // 3. Duplicates: the server links the completed one; the rest, and
    // another account's profile with the email, are left exactly as they are.
    {
      const rows = [
        profile('first'),
        profile('done', { created_at: '2026-02-01', profile_completed: true }),
        profile('onboarded', { created_at: '2026-03-01', onboarding_completed: true }),
        profile('theirs', { user_id: 'auth-other', created_at: '2025-01-01', profile_completed: true }),
      ];
      const others = JSON.stringify([rows[0], rows[2], rows[3]]);
      const { profile: p, queries, notices } = await signIn(rows, me, { claim });
      assert.equal(p.id, 'done', 'the completed profile is kept');
      assert.equal(JSON.stringify([rows[0], rows[2], rows[3]]), others, 'the other profiles are not changed');
      assert.deepEqual(writes(queries), []);
      assert.doesNotMatch(notices.join(' '), /consolidated/);
    }
    // 4. Linked to this account meanwhile (another tab): returned and used.
    {
      const rows = [profile('mine')];
      const { profile: p } = await signIn(rows, me, { claim, linkFirst: 'mine' });
      assert.equal(p.id, 'mine');
    }
    // 5. Nothing to claim, or only another account's profile: no profile
    // (sign-in then creates one), nothing changed.
    {
      const rows = [profile('theirs', { user_id: 'auth-other' })];
      const before = JSON.stringify(rows);
      const { profile: p, error, queries } = await signIn(rows, me, { claim });
      assert.equal(error, null);
      assert.equal(p, null);
      assert.equal(JSON.stringify(rows), before);
      assert.deepEqual(writes(queries), []);
    }
  }
  // 6. Another account linked the picked profile first. The deployed
  // function still returns its id: the load fails (and is retried) rather
  // than use it or create a profile. The fixed function returns none.
  {
    const rows = [profile('picked', { profile_completed: true }), profile('spare', { created_at: '2026-02-01' })];
    const { profile: p, error, queries } = await signIn(rows, me, { raceTo: 'auth-other' });
    assert.match(String(error?.message), /not linked to this account/);
    assert.equal(p, undefined);
    assert.equal(rows[0].user_id, 'auth-other', 'another account\'s profile stays theirs');
    assert.equal(rows[1].user_id, null, 'the spare is left for the retry\'s claim');
    assert.deepEqual(writes(queries), []);
  }
  {
    const rows = [profile('picked')];
    const { profile: p, error } = await signIn(rows, me, { claim: 'fixed', raceTo: 'auth-other' });
    assert.equal(error, null);
    assert.equal(p, null, 'the fixed function returns no profile it didn\'t link');
    assert.equal(rows[0].user_id, 'auth-other');
  }
  // 7. The claim fails (unavailable, a timeout, or the repository version
  // refusing duplicates): the load fails, so nothing is created, and no
  // email lookup is attempted.
  for (const options of [{ claim: 'missing' }, { failClaims: 1 }, { claim: 'repository' }]) {
    const rows = [profile('a'), profile('b', { created_at: '2026-02-01' })];
    const before = JSON.stringify(rows);
    const { profile: p, error, queries } = await signIn(rows, me, options);
    assert.match(String(error?.message), /Profile claim failed/, JSON.stringify(options));
    assert.equal(p, undefined);
    assert.equal(JSON.stringify(rows), before, 'nothing changed');
    assert.deepEqual(writes(queries), []);
  }

  // The website never filters on email and has no fallback lookup.
  assert.doesNotMatch(auth, /\.(ilike|eq|like)\(\s*["']email["']/, 'auth.js never filters on email');
  // A new profile is still created with the session email (write only).
  assert.match(auth, /const newProfile = \{\s*user_id: user\.id,\s*email: user\.email,/);
  assert.match(auth, /\.insert\(\[newProfile\]\)\s*\.select\(OWN_COLUMNS\(\)\)/);
  console.log('Sign-in profile claim: returning, older, duplicate, raced, failed-claim and new-member cases pass with the deployed and the fixed claim, without any email query');
})().catch((error) => { console.error(error); process.exit(1); });
