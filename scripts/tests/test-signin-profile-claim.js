#!/usr/bin/env node
// Sign-in finds the member's profile without reading members' emails
// (auth.js fetchUserProfile and claimOlderProfile, run as they are against a
// recording stand-in for Supabase; synthetic profiles only).
//
// The stand-in's claim function (fixtures/claim-stand-in.js) behaves as the
// deployed one does (production definition, fingerprint
// aa77d10868ae792a041ec395a0e894f6, 2026-10-28), which differs from the
// repository's sql/claim_community_profile_by_email.sql:
//   - it returns the caller's already-linked profile;
//   - otherwise it picks one unclaimed profile with the email (completed,
//     then onboarded, then oldest) and leaves any others as they were;
//   - it links that profile only if it is still unclaimed, but returns its
//     id either way, even if another account linked it first;
//   - it returns null when nothing matches.
// The repository version (which refuses duplicates) and an unavailable
// function are also run, for the fallback.
//
//   - A returning member: one lookup by account, named columns.
//   - An older profile: claimed on the server, used only once it is linked
//     to this account.
//   - Duplicates: the server links one; the others are left exactly as they
//     are (they may have projects or connections; cleanup is a later task).
//   - The claim returns a profile another account linked first: not used;
//     the unclaimed-only fallback runs instead.
//   - The claim unavailable or refusing: the fallback links one (in the
//     server's order) and leaves the rest, so nobody gets a second profile.
//   - Nothing to claim: no profile (sign-in then creates one).
//   - Another account's profile with the same email is never returned,
//     linked, hidden or written.
//   - "_" and "%" in an address match only themselves.
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
    window, console: { log() {}, warn() {}, error() {} }, setTimeout: (fn) => fn(), Promise,
    log() {}, warn() {}, err() {},
    withTimeout: (p) => p,
  };
  vm.runInNewContext(`let claimPromise = null;\n${code}\nthis.fetchUserProfile = fetchUserProfile;`, context);
  const profile = await context.fetchUserProfile(user);
  return { profile, queries, rows, notices };
}

// Profile reads name the own-profile columns. Email appears only as a
// filter in the marked fallback lookup, never in a select.
const byEmail = (queries, mode) => queries.filter((q) => q.table === 'community' && q.mode === mode && q.filters.some(([, c]) => c === 'email'));
function checkColumns(queries) {
  for (const q of queries.filter((x) => x.table === 'community')) {
    if (q.select !== null && q.mode === 'select') assert.equal(q.select, OWN, 'profile reads use the own-profile columns');
    assert.doesNotMatch(String(q.select), /email|\*/);
  }
}
// Sign-in writes at most one profile: the one it links to this account.
// Nothing is written by email, and leftover duplicates are not changed.
function checkWrites(queries, linkedId) {
  assert.deepEqual(byEmail(queries, 'update'), [], 'no writes by email');
  const updates = queries.filter((q) => q.table === 'community' && q.mode === 'update');
  for (const q of updates) {
    assert.deepEqual(Object.keys(q.payload).sort(), ['updated_at', 'user_id'], 'only links, never hides');
    assert.ok(q.filters.some(([op, c, v]) => op === 'eq' && c === 'id' && v === linkedId), 'only the profile being linked');
    assert.ok(q.filters.some(([op, c, v]) => op === 'is' && c === 'user_id' && v === null), 'and only while unclaimed');
  }
  assert.ok(updates.length <= 1);
  assert.equal(queries.filter((q) => q.mode === 'insert').length, 0, 'fetchUserProfile itself creates nothing');
}
const writesTo = (queries, id) => queries.filter((q) => q.table === 'community' && q.mode === 'update'
  && q.filters.some(([op, c, v]) => c === 'id' && (op === 'eq' ? v === id : v.includes(id))));

const me = { id: 'auth-me', email: '  Member@Example.test ' };
const profile = (id, extra) => ({ id, user_id: null, email: 'member@example.test', name: id, created_at: '2026-01-01', ...extra });

(async () => {
  // 1. Returning member: no claim, no email.
  {
    const { profile: p, queries } = await signIn([profile('linked', { user_id: 'auth-me' })], me);
    assert.equal(p.id, 'linked');
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].filters, [['eq', 'user_id', 'auth-me']]);
    checkColumns(queries);
  }
  // 2. One older unclaimed profile: claimed on the server and loaded only as
  // this account's; no email lookup.
  {
    const { profile: p, queries, rows, notices } = await signIn([profile('older'), profile('someone', { email: 'other@example.test' })], me);
    assert.equal(p.id, 'older');
    assert.equal(rows[0].user_id, 'auth-me', 'the claim function linked it');
    assert.equal(rows[1].is_hidden, undefined, 'a profile with another email is untouched');
    const load = queries.find((q) => q.table === 'community' && q.filters.some(([, c, v]) => c === 'id' && v === 'older'));
    assert.deepEqual(load.filters, [['eq', 'id', 'older'], ['eq', 'user_id', 'auth-me']], 'the claimed profile is loaded only if it is this account\'s');
    assert.deepEqual(byEmail(queries, 'select'), [], 'no email lookup');
    assert.deepEqual(notices, ['Welcome back! Your existing profile has been linked to your account.']);
    checkColumns(queries);
    checkWrites(queries);
  }
  // 3. Duplicates: the server links the completed one; the website leaves
  // the rest exactly as they are and doesn't claim to have consolidated
  // anything. Another account's profile with the email is untouched.
  {
    const rows = [
      profile('first'),
      profile('done', { created_at: '2026-02-01', profile_completed: true }),
      profile('onboarded', { created_at: '2026-03-01', onboarding_completed: true }),
      profile('theirs', { user_id: 'auth-other', created_at: '2025-01-01', profile_completed: true }),
    ];
    const others = JSON.stringify([rows[0], rows[2], rows[3]]);
    const { profile: p, queries, notices } = await signIn(rows, me);
    assert.equal(p.id, 'done', 'the completed profile is kept');
    assert.equal(rows[1].user_id, 'auth-me');
    assert.equal(JSON.stringify([rows[0], rows[2], rows[3]]), others, 'the other duplicates and another account\'s profile are not changed');
    assert.deepEqual(byEmail(queries, 'select'), [], 'no email lookup');
    assert.deepEqual(notices, ['Welcome back! Your existing profile has been linked to your account.'], 'no claim of consolidation');
    checkColumns(queries);
    checkWrites(queries);
  }
  // The server's order: onboarded before oldest when none is completed.
  {
    const rows = [profile('oldest'), profile('onboarded', { created_at: '2026-02-01', onboarding_completed: true })];
    const oldest = JSON.stringify(rows[0]);
    const { profile: p } = await signIn(rows, me);
    assert.equal(p.id, 'onboarded');
    assert.equal(JSON.stringify(rows[0]), oldest);
  }
  // 4. The claim returns a profile another account linked first: it is not
  // used; the unclaimed-only fallback links the remaining unclaimed one.
  {
    const rows = [profile('picked', { profile_completed: true }), profile('spare', { created_at: '2026-02-01' })];
    const { profile: p, queries } = await signIn(rows, me, { raceTo: 'auth-other' });
    assert.equal(p.id, 'spare', 'another account\'s profile is not returned');
    assert.equal(rows[0].user_id, 'auth-other', 'and stays theirs');
    assert.equal(rows[0].is_hidden, undefined);
    assert.deepEqual(writesTo(queries, 'picked'), [], 'nothing is written to it');
    assert.equal(rows[1].user_id, 'auth-me');
    assert.equal(byEmail(queries, 'select').length, 1, 'the marked fallback lookup');
    checkColumns(queries);
    checkWrites(queries, 'spare');
  }
  {
    // ...and when it was the only one, no profile (sign-in creates one).
    const rows = [profile('picked')];
    const { profile: p, queries } = await signIn(rows, me, { raceTo: 'auth-other' });
    assert.equal(p, null);
    assert.equal(rows[0].user_id, 'auth-other');
    assert.deepEqual(writesTo(queries, 'picked'), []);
  }
  // 5. The caller's profile was linked after sign-in's lookup by account
  // (another tab): the server returns it, and it is theirs.
  {
    const rows = [profile('mine', { user_id: null })];
    const { profile: p } = await signIn(rows, me, { linkFirst: 'mine' });
    assert.equal(p.id, 'mine');
    assert.equal(rows[0].user_id, 'auth-me');
  }
  // 6. Nothing to claim, or only another account's profile: no profile, and
  // nothing changed.
  {
    const rows = [profile('theirs', { user_id: 'auth-other' })];
    const before = JSON.stringify(rows);
    const { profile: p, queries } = await signIn(rows, me);
    assert.equal(p, null);
    assert.equal(JSON.stringify(rows), before);
    assert.deepEqual(byEmail(queries, 'select'), []);
    assert.deepEqual(byEmail(queries, 'update'), []);
  }
  // 7. "_" in the address matches only "_": the claim links the exact match,
  // and a profile whose address differs there is not hidden.
  {
    const under = { id: 'auth-me', email: 'a_b@example.test' };
    const rows = [profile('exact', { email: 'a_b@example.test' }), profile('lookalike', { email: 'axb@example.test' })];
    const { profile: p } = await signIn(rows, under);
    assert.equal(p.id, 'exact');
    assert.equal(rows[1].is_hidden, undefined, 'a different address is not hidden');
    assert.equal(rows[1].user_id, null);
  }
  {
    // ...nor taken by the fallback.
    const under = { id: 'auth-me', email: 'a_b@example.test' };
    const rows = [profile('lookalike', { email: 'axb@example.test' })];
    const { profile: p, queries } = await signIn(rows, under, { claim: 'missing' });
    assert.equal(p, null);
    assert.equal(rows[0].user_id, null);
    assert.deepEqual(byEmail(queries, 'select')[0].filters, [['ilike', 'email', 'a\\_b@example.test']]);
  }

  // 8. The claim function unavailable, or the repository version refusing
  // duplicates: the fallback links one (in the server's order) and leaves
  // the rest as they are, so no second profile is created.
  for (const claim of ['missing', 'repository']) {
    {
      const rows = [profile('older')];
      const { profile: p } = await signIn(rows, me, { claim });
      assert.equal(p.id, 'older', claim);
      assert.equal(rows[0].user_id, 'auth-me');
    }
    {
      const rows = [profile('first'), profile('onboarded', { created_at: '2026-02-01', onboarding_completed: true }),
        profile('done', { created_at: '2026-03-01', profile_completed: true })];
      const others = JSON.stringify([rows[0], rows[1]]);
      const { profile: p, queries, notices } = await signIn(rows, me, { claim });
      assert.equal(p.id, 'done', `${claim}: completed first, as the server orders them`);
      assert.equal(JSON.stringify([rows[0], rows[1]]), others, 'the other duplicates are not changed');
      assert.deepEqual(notices, ['Welcome back! Your existing profile has been linked to your account.']);
      checkWrites(queries, 'done');
      const lookups = byEmail(queries, 'select');
      assert.equal(lookups.length, 1, 'one email lookup, the marked fallback');
      assert.deepEqual(lookups[0].filters, [['ilike', 'email', 'member@example.test']]);
      checkColumns(queries);
    }
  }

  // 9. The fallback never takes another account's profile. Rows owned by
  // another account share the email; whichever is completed or oldest, it
  // is not returned, linked, hidden or otherwise written.
  {
    // Claim unavailable; the only match belongs to another account.
    const rows = [profile('theirs', { user_id: 'auth-other', profile_completed: true })];
    const before = JSON.stringify(rows);
    const { profile: p, queries } = await signIn(rows, me, { claim: 'missing' });
    assert.equal(p, null, 'another account\'s profile is not returned (sign-in creates a new one)');
    assert.equal(JSON.stringify(rows), before, 'and it is not changed');
    assert.deepEqual(writesTo(queries, 'theirs'), [], 'and nothing is written to it');
  }
  for (const claim of ['production', 'repository']) {
    // Duplicates: the oldest and completed match belongs to another account;
    // two unclaimed ones share the email.
    const rows = [
      profile('theirs', { user_id: 'auth-other', created_at: '2025-01-01', profile_completed: true }),
      profile('old-a', { created_at: '2026-01-01' }),
      profile('old-b', { created_at: '2026-02-01' }),
    ];
    const theirs = JSON.stringify(rows[0]);
    const { profile: p, queries } = await signIn(rows, me, { claim });
    assert.equal(p.id, 'old-a', `${claim}: the oldest unclaimed profile is linked`);
    assert.equal(rows[1].user_id, 'auth-me');
    assert.equal(rows[2].is_hidden, undefined, 'the other unclaimed duplicate is left as it is');
    assert.equal(JSON.stringify(rows[0]), theirs, 'another account\'s profile is not linked, hidden or changed');
    assert.deepEqual(writesTo(queries, 'theirs'), [], 'and nothing is written to it');
    checkWrites(queries, claim === 'production' ? undefined : 'old-a');
  }
  {
    // Claim unavailable; another account's completed profile and one
    // unclaimed profile share the email: the unclaimed one is linked.
    const rows = [profile('theirs', { user_id: 'auth-other', profile_completed: true }), profile('older', { created_at: '2026-03-01' })];
    const theirs = JSON.stringify(rows[0]);
    const { profile: p, queries } = await signIn(rows, me, { claim: 'missing' });
    assert.equal(p.id, 'older');
    assert.equal(rows[1].user_id, 'auth-me');
    assert.equal(JSON.stringify(rows[0]), theirs);
    assert.deepEqual(writesTo(queries, 'theirs'), []);
  }
  // The fallback's one write is limited to an unclaimed row, so a profile
  // claimed by another account in the meantime can't be taken.
  {
    const rows = [profile('a'), profile('b', { created_at: '2026-02-01' })];
    const { queries } = await signIn(rows, me, { claim: 'repository' });
    const updates = queries.filter((q) => q.table === 'community' && q.mode === 'update');
    assert.equal(updates.length, 1);
    checkWrites(queries, 'a');
  }
  // Linked to this account meanwhile (another tab), with the claim
  // unavailable: the fallback returns it and writes nothing.
  {
    const rows = [profile('mine'), profile('spare', { created_at: '2026-02-01', profile_completed: true })];
    const spare = JSON.stringify(rows[1]);
    const { profile: p, queries } = await signIn(rows, me, { claim: 'missing', linkFirst: 'mine' });
    assert.equal(p.id, 'mine');
    assert.equal(JSON.stringify(rows[1]), spare, 'the other profile is not linked or changed');
    assert.equal(queries.filter((q) => q.mode === 'update').length, 0);
  }

  // A new profile is still created with the session email (write only).
  assert.match(auth, /const newProfile = \{\s*user_id: user\.id,\s*email: user\.email,/);
  assert.match(auth, /\.insert\(\[newProfile\]\)\s*\.select\(OWN_COLUMNS\(\)\)/);
  console.log('Sign-in profile claim: returning, older, duplicate, raced, unavailable/refusing-claim and new-member cases pass against the deployed claim behaviour, without reading members\' email or changing leftover duplicates');
})().catch((error) => { console.error(error); process.exit(1); });
