// A small PostgREST stand-in for the sign-in tests (synthetic rows only):
// the rows, every query (columns and filters), inserts, and the claim
// function:
//   production  as deployed (production definition, fingerprint
//               aa77d10868ae792a041ec395a0e894f6, 2026-10-28): returns the
//               caller's linked profile; otherwise picks one unclaimed
//               profile with the email (completed, then onboarded, then
//               oldest), links it only if still unclaimed, and returns its
//               id either way; null when nothing matches
//   fixed       as replaced by 20261029_member_email_privacy_prepare.sql:
//               the same, but returns only a profile it linked (null when
//               another account linked the pick first)
//   repository  sql/claim_community_profile_by_email.sql: refuses duplicates
//               and already-linked callers
//   missing     unavailable
// `raceTo` links the picked profile to another account between the
// function's pick and its update; `linkFirst` links a profile to the caller
// just before the call (after sign-in's own lookup by account); `claimGate`
// is a promise the claim waits for, to order it against other code;
// `failEmailLookups`, `failInserts` and `failClaims` make that many email
// lookups, inserts or claims fail (a database error or timeout).
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

function stand(rows, { claim = 'production', raceTo = null, linkFirst = null, claimGate = null, failEmailLookups = 0, failInserts = 0, failClaims = 0 } = {}) {
  const queries = [];
  const failures = { emailLookups: failEmailLookups, inserts: failInserts, claims: failClaims };
  let inserted = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: client.user }, error: null }) },
    rpc: async (name) => {
      queries.push({ rpc: name });
      if (name !== 'claim_community_profile_by_email') throw new Error(`unexpected rpc ${name}`);
      if (claimGate) await claimGate;
      const me = client.user;
      if (linkFirst) rows.find((r) => r.id === linkFirst).user_id = me.id;
      if (claim === 'missing') return { data: null, error: { message: 'Could not find the function public.claim_community_profile_by_email' } };
      if (failures.claims > 0) {
        failures.claims -= 1;
        return { data: null, error: { message: 'canceling statement due to statement timeout' } };
      }
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
      if (raceTo) { picked.user_id = raceTo; raceTo = null; } // once
      if (!picked.user_id) picked.user_id = me.id; // UPDATE ... WHERE user_id IS NULL
      if (claim === 'fixed') return { data: picked.user_id === me.id ? picked.id : null, error: null };
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
            const byEmail = q.mode === 'select' && q.filters.some(([, c]) => c === 'email');
            if (byEmail && failures.emailLookups > 0) {
              failures.emailLookups -= 1;
              return resolve({ data: null, error: { message: 'canceling statement due to statement timeout' } });
            }
            if (q.mode === 'insert' && failures.inserts > 0) {
              failures.inserts -= 1;
              return resolve({ data: null, error: { message: 'connection reset' } });
            }
            let hit;
            if (q.mode === 'insert') {
              hit = [].concat(q.payload).map((p) => ({ id: `new-${++inserted}`, ...p }));
              rows.push(...hit);
            } else {
              hit = rows.filter((r) => q.filters.every(([op, c, v]) =>
                op === 'eq' ? r[c] === v : op === 'in' ? v.includes(r[c]) : op === 'is' ? (r[c] ?? null) === v : ilike(r[c], v)));
            }
            if (q.order) hit = [...hit].sort((a, b) => String(a[q.order[0]]).localeCompare(String(b[q.order[0]])) * (q.order[1] ? 1 : -1));
            if (q.mode === 'update') hit.forEach((r) => Object.assign(r, q.payload));
            if (q.limit) hit = hit.slice(0, q.limit);
            if (q.single === 'one' && hit.length === 0) return resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
            const data = q.single ? (hit[0] || null) : hit;
            resolve({ data: q.select === null && q.mode !== 'select' ? null : data, error: null });
          } catch (e) { reject(e); }
        },
      };
      return api;
    },
  };
  return { client, queries };
}

module.exports = { stand, norm, ilike, claimOrder };
