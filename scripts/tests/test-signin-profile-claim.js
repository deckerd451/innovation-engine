#!/usr/bin/env node
// Sign-in finds the member's profile without reading members' emails
// (auth.js fetchUserProfile and claimOlderProfile, run as they are against a
// recording stand-in for Supabase; synthetic profiles only).
//
// The stand-in's claim function behaves as the deployed one does (production
// definition, fingerprint aa77d10868ae792a041ec395a0e894f6, 2026-10-28),
// which differs from the repository's sql/claim_community_profile_by_email.sql:
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
//   - Duplicates: the server links one; the website hides the others
//     (unclaimed only), and says it consolidated them.
//   - The claim returns a profile another account linked first: not used;
//     the unclaimed-only fallback runs instead.
//   - The claim unavailable or refusing: the fallback links one, so nobody
//     gets a second profile.
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

const norm = (v) => String(v || '').trim().toLowerCase();
// PostgreSQL ILIKE: "%" and "_" are wildcards unless escaped with "\".
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ilike(value, pattern) {
  const re = pattern.replace(/\\(.)|([%_])|([^\\%_]+)/gs, (m, esc, wild, lit) =>
    (esc !== undefined ? reEsc(esc) : wild ? (wild === '%' ? '.*' : '.') : reEsc(lit)));
  return new RegExp(`^${re}$`, 'is').test(String(value ?? ''));
}
// The deployed function's choice among unclaimed matches.
const claimOrder = (a, b) => (b.profile_completed === true) - (a.profile_completed === true)
  || (b.onboarding_completed === true) - (a.onboarding_completed === true)
  || String(a.created_at).localeCompare(String(b.created_at));

// A small PostgREST stand-in: the rows, every query (columns and filters),
// and the claim function:
//   production  as deployed (the default)
//   repository  sql/claim_community_profile_by_email.sql: refuses duplicates
//   missing     unavailable
// `raceTo` links the picked profile to another account between the
// function's pick and its update; `linkFirst` links a profile to the caller
// just before the call (after sign-in's own lookup by account).
function stand(rows, { claim = 'production', raceTo = null, linkFirst = null } = {}) {
  const queries = [];
  const client = {
    rpc: async (name) => {
      queries.push({ rpc: name });
      if (name !== 'claim_community_profile_by_email') throw new Error(`unexpected rpc ${name}`);
      if (claim === 'missing') return { data: null, error: { message: 'Could not find the function public.claim_community_profile_by_email' } };
      const me = client.user;
      if (linkFirst) rows.find((r) => r.id === linkFirst).user_id = me.id;
      const linked = rows.find((r) => r.user_id === me.id);
      const matches = rows.filter((r) => norm(r.email) === norm(me.email) && !r.user_id);
      if (claim === 'repository') {
        if (linked) return { data: null, error: { message: 'Auth user already linked to a community profile' } };
        if (matches.length === 0) return { data: null, error: null };
        if (matches.length > 1) return { data: null, error: { message: `Multiple orphaned community profiles found for email: ${norm(me.email)}` } };
        matches[0].user_id = me.id;
        return { data: matches[0].id, error: null };
      }
      if (linked) return { data: linked.id, error: null };
      if (matches.length === 0) return { data: null, error: null };
      const picked = [...matches].sort(claimOrder)[0];
      if (raceTo) picked.user_id = raceTo;
      if (!picked.user_id) picked.user_id = me.id; // UPDATE ... WHERE user_id IS NULL
      return { data: picked.id, error: null }; // returned whether or not it was linked
    },
    from(table) {
      const q = { table, select: null, filters: [], mode: 'select', payload: null, order: null, limit: null, single: false };
      queries.push(q);
      const api = {
        select(cols) { q.select = cols; return api; },
        eq(c, v) { q.filters.push(['eq', c, v]); return api; },
        ilike(c, v) { q.filters.push(['ilike', c, v]); return api; },
        in(c, v) { q.filters.push(['in', c, v]); return api; },
        is(c, v) { q.filters.push(['is', c, v]); return api; },
        order(c, o) { q.order = [c, o?.ascending !== false]; return api; },
        limit(n) { q.limit = n; return api; },
        single() { q.single = 'one'; return api; },
        maybeSingle() { q.single = 'maybe'; return api; },
        update(p) { q.mode = 'update'; q.payload = p; return api; },
        insert(p) { q.mode = 'insert'; q.payload = p; return api; },
        then(resolve, reject) {
          try {
            let hit = rows.filter((r) => q.filters.every(([op, c, v]) =>
              op === 'eq' ? r[c] === v : op === 'in' ? v.includes(r[c]) : op === 'is' ? (r[c] ?? null) === v : ilike(r[c], v)));
            if (q.order) hit = [...hit].sort((a, b) => String(a[q.order[0]]).localeCompare(String(b[q.order[0]])) * (q.order[1] ? 1 : -1));
            if (q.mode === 'update') hit.forEach((r) => Object.assign(r, q.payload));
            if (q.limit) hit = hit.slice(0, q.limit);
            if (q.single === 'one' && hit.length === 0) return resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
            const data = q.single ? (hit[0] || null) : hit;
            resolve({ data: q.select === null && q.mode === 'update' ? null : data, error: null });
          } catch (e) { reject(e); }
        },
      };
      return api;
    },
  };
  return { client, queries };
}

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
// filter in the marked duplicate handling, never in a select.
const byEmail = (queries, mode) => queries.filter((q) => q.table === 'community' && q.mode === mode && q.filters.some(([, c]) => c === 'email'));
function checkColumns(queries) {
  for (const q of queries.filter((x) => x.table === 'community')) {
    if (q.select !== null && q.mode === 'select') assert.equal(q.select, OWN, 'profile reads use the own-profile columns');
    assert.doesNotMatch(String(q.select), /email|\*/);
  }
}
// Every write by email touches unclaimed profiles only.
function checkEmailWrites(queries) {
  for (const q of byEmail(queries, 'update')) {
    assert.ok(q.filters.some(([op, c, v]) => op === 'is' && c === 'user_id' && v === null), 'email-filtered writes touch unclaimed profiles only');
    assert.equal(q.select, 'id', 'and return only ids');
  }
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
    assert.match(notices[0], /linked to your account/);
    checkColumns(queries);
    checkEmailWrites(queries);
  }
  // 3. Duplicates: the server links the completed one and leaves the rest;
  // the website hides the rest (unclaimed only) and says so. Another
  // account's profile with the email is untouched.
  {
    const rows = [
      profile('first'),
      profile('done', { created_at: '2026-02-01', profile_completed: true }),
      profile('onboarded', { created_at: '2026-03-01', onboarding_completed: true }),
      profile('theirs', { user_id: 'auth-other', created_at: '2025-01-01', profile_completed: true }),
    ];
    const theirs = JSON.stringify(rows[3]);
    const { profile: p, queries, notices } = await signIn(rows, me);
    assert.equal(p.id, 'done', 'the completed profile is kept');
    assert.equal(rows[1].user_id, 'auth-me');
    assert.equal(rows[0].is_hidden, true, 'the other duplicates are hidden, not deleted');
    assert.equal(rows[2].is_hidden, true);
    assert.equal(rows[0].user_id, null);
    assert.equal(JSON.stringify(rows[3]), theirs, 'another account\'s profile is not hidden or changed');
    assert.deepEqual(byEmail(queries, 'select'), [], 'no email lookup');
    const cleanup = byEmail(queries, 'update');
    assert.equal(cleanup.length, 1, 'one cleanup, by email, of unclaimed profiles');
    assert.deepEqual(cleanup[0].filters, [['ilike', 'email', 'member@example.test'], ['is', 'user_id', null]]);
    assert.match(notices[0], /consolidated your duplicate profiles/);
    checkColumns(queries);
    checkEmailWrites(queries);
  }
  // The server's order: onboarded before oldest when none is completed.
  {
    const rows = [profile('oldest'), profile('onboarded', { created_at: '2026-02-01', onboarding_completed: true })];
    const { profile: p } = await signIn(rows, me);
    assert.equal(p.id, 'onboarded');
    assert.equal(rows[0].is_hidden, true);
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
  // duplicates: the fallback links one (in the server's order) and hides the
  // rest, so no second profile is created.
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
      const { profile: p, queries } = await signIn(rows, me, { claim });
      assert.equal(p.id, 'done', `${claim}: completed first, as the server orders them`);
      assert.equal(rows[0].is_hidden, true);
      assert.equal(rows[1].is_hidden, true);
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
    assert.equal(rows[2].is_hidden, true, 'the other unclaimed duplicate is hidden');
    assert.equal(JSON.stringify(rows[0]), theirs, 'another account\'s profile is not linked, hidden or changed');
    assert.deepEqual(writesTo(queries, 'theirs'), [], 'and nothing is written to it');
    checkEmailWrites(queries);
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
  // Every fallback write is limited to unclaimed rows, so a profile claimed
  // by another account in the meantime can't be taken or hidden either.
  {
    const rows = [profile('a'), profile('b', { created_at: '2026-02-01' })];
    const { queries } = await signIn(rows, me, { claim: 'repository' });
    const updates = queries.filter((q) => q.table === 'community' && q.mode === 'update');
    assert.ok(updates.length >= 2);
    for (const q of updates) assert.ok(q.filters.some(([op, c, v]) => op === 'is' && c === 'user_id' && v === null), 'fallback writes touch unclaimed rows only');
  }

  // A new profile is still created with the session email (write only).
  assert.match(auth, /const newProfile = \{\s*user_id: user\.id,\s*email: user\.email,/);
  assert.match(auth, /\.insert\(\[newProfile\]\)\s*\.select\(OWN_COLUMNS\(\)\)/);
  console.log('Sign-in profile claim: returning, older, duplicate, raced, unavailable/refusing-claim and new-member cases pass against the deployed claim behaviour, without reading members\' email');
})().catch((error) => { console.error(error); process.exit(1); });
