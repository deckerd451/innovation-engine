#!/usr/bin/env node
// Sign-in finds the member's profile without reading members' emails
// (auth.js fetchUserProfile and claimOlderProfile, run as they are against a
// recording stand-in for Supabase; synthetic profiles only).
//   - A returning member: one lookup by account, named columns.
//   - An older profile (no account yet) with their email: the server-side
//     claim function links it; the website never filters by email.
//   - Several unclaimed profiles sharing the email: the claim function
//     refuses, and the existing consolidation (one email lookup, marked for
//     a later server-side replacement) links one and hides the rest.
//   - The claim function unavailable: the same fallback, so nobody gets a
//     second profile.
//   - Nothing to claim: no profile (sign-in then creates one, with the
//     session email).
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

// A small PostgREST stand-in: the rows, every query (columns and filters),
// and the claim function as the repository defines it
// (sql/claim_community_profile_by_email.sql), or broken.
function stand(rows, { claim = 'repo' } = {}) {
  const queries = [];
  const norm = (v) => String(v || '').trim().toLowerCase();
  const client = {
    rpc: async (name) => {
      queries.push({ rpc: name });
      if (name !== 'claim_community_profile_by_email') throw new Error(`unexpected rpc ${name}`);
      if (claim === 'missing') return { data: null, error: { message: 'Could not find the function public.claim_community_profile_by_email' } };
      const me = client.user;
      if (rows.some((r) => r.user_id === me.id)) return { data: null, error: { message: 'Auth user already linked to a community profile' } };
      const matches = rows.filter((r) => norm(r.email) === norm(me.email) && !r.user_id);
      if (matches.length === 0) return { data: null, error: null };
      if (matches.length > 1) return { data: null, error: { message: `Multiple orphaned community profiles found for email: ${norm(me.email)}` } };
      matches[0].user_id = me.id;
      return { data: matches[0].id, error: null };
    },
    from(table) {
      const q = { table, select: null, filters: [], mode: 'select', payload: null, order: null, limit: null, single: false };
      queries.push(q);
      const api = {
        select(cols) { q.select = cols; return api; },
        eq(c, v) { q.filters.push(['eq', c, v]); return api; },
        ilike(c, v) { q.filters.push(['ilike', c, v]); return api; },
        in(c, v) { q.filters.push(['in', c, v]); return api; },
        order(c, o) { q.order = [c, o?.ascending !== false]; return api; },
        limit(n) { q.limit = n; return api; },
        single() { q.single = true; return api; },
        maybeSingle() { q.single = true; return api; },
        update(p) { q.mode = 'update'; q.payload = p; return api; },
        insert(p) { q.mode = 'insert'; q.payload = p; return api; },
        then(resolve, reject) {
          try {
            let hit = rows.filter((r) => q.filters.every(([op, c, v]) =>
              op === 'eq' ? r[c] === v : op === 'in' ? v.includes(r[c]) : norm(r[c]) === norm(v)));
            if (q.order) hit = [...hit].sort((a, b) => String(a[q.order[0]]).localeCompare(String(b[q.order[0]])) * (q.order[1] ? 1 : -1));
            if (q.mode === 'update') hit.forEach((r) => Object.assign(r, q.payload));
            if (q.limit) hit = hit.slice(0, q.limit);
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
  const window = { supabase: client, BuildspaceProfileColumns: columnsWindow.BuildspaceProfileColumns, showNotification() {} };
  const context = {
    window, console: { log() {}, warn() {}, error() {} }, setTimeout: (fn) => fn(), Promise,
    log() {}, warn() {}, err() {},
    withTimeout: (p) => p,
  };
  vm.runInNewContext(`let claimPromise = null;\n${code}\nthis.fetchUserProfile = fetchUserProfile;`, context);
  const profile = await context.fetchUserProfile(user);
  return { profile, queries, rows };
}

// Every profile read names the own-profile columns; email appears only in
// the marked fallback (an ilike on email), never in a select.
function emailReads(queries) {
  return queries.filter((q) => q.table === 'community' && q.filters.some(([, c]) => c === 'email'));
}
function checkColumns(queries) {
  for (const q of queries.filter((x) => x.table === 'community')) {
    if (q.select !== null) assert.equal(q.select, OWN, 'profile reads use the own-profile columns');
    assert.doesNotMatch(String(q.select), /email|\*/);
  }
}

const me = { id: 'auth-me', email: '  Member@Example.test ' };
const profile = (id, extra) => ({ id, user_id: null, email: 'member@example.test', name: id, created_at: '2026-01-01', ...extra });

(async () => {
  // 1. Returning member.
  {
    const { profile: p, queries } = await signIn([profile('linked', { user_id: 'auth-me' })], me);
    assert.equal(p.id, 'linked');
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].filters, [['eq', 'user_id', 'auth-me']]);
    checkColumns(queries);
  }
  // 2. One older unclaimed profile: claimed on the server.
  {
    const { profile: p, queries, rows } = await signIn([profile('older'), profile('someone', { email: 'other@example.test' })], me);
    assert.equal(p.id, 'older');
    assert.equal(rows[0].user_id, 'auth-me', 'the claim function linked it');
    assert.deepEqual(emailReads(queries), [], 'no email lookup');
    assert.ok(queries.some((q) => q.rpc === 'claim_community_profile_by_email'));
    checkColumns(queries);
  }
  // 3. Two unclaimed profiles share the email (one completed): the claim
  // function refuses; the fallback links the completed one, hides the other.
  {
    const rows = [profile('first'), profile('done', { created_at: '2026-02-01', profile_completed: true })];
    const { profile: p, queries } = await signIn(rows, me);
    assert.equal(p.id, 'done', 'the completed profile is kept');
    assert.equal(rows[1].user_id, 'auth-me');
    assert.equal(rows[0].is_hidden, true, 'the other duplicate is hidden, not deleted');
    const lookups = emailReads(queries);
    assert.equal(lookups.length, 1, 'one email lookup, the marked fallback');
    assert.deepEqual(lookups[0].filters, [['ilike', 'email', 'member@example.test']]);
    checkColumns(queries);
  }
  // 4. The claim function unavailable: the fallback still links the one
  // older profile, so no second profile is created.
  {
    const rows = [profile('older')];
    const { profile: p } = await signIn(rows, me, { claim: 'missing' });
    assert.equal(p.id, 'older');
    assert.equal(rows[0].user_id, 'auth-me');
  }
  // 5. Nothing to claim (a profile with this email belongs to another
  // account): no profile, so sign-in creates a new one; the other account's
  // profile is neither returned nor changed.
  {
    const rows = [profile('theirs', { user_id: 'auth-other' })];
    const { profile: p, queries } = await signIn(rows, me);
    assert.equal(p, null);
    assert.equal(rows[0].user_id, 'auth-other');
    assert.deepEqual(emailReads(queries), []);
  }
  // A new profile is still created with the session email (write only).
  assert.match(auth, /const newProfile = \{\s*user_id: user\.id,\s*email: user\.email,/);
  assert.match(auth, /\.insert\(\[newProfile\]\)\s*\.select\(OWN_COLUMNS\(\)\)/);
  console.log('Sign-in profile claim: returning, older, duplicate, unavailable-claim and new-member cases pass without reading members\' email');
})().catch((error) => { console.error(error); process.exit(1); });
