#!/usr/bin/env node

// Regression coverage for the counting/identity defect found in a
// correctness review of the newly-shipped Ecosystem Analytics, fixed in
// supabase/sql/migrations/20260819b_admin_analytics_identity_fix.sql (see
// that file's header for the full evidence trail). Two independent defect
// classes, both demonstrated directly against this codebase's own history
// and code, not hypothetical:
//
//  1. Duplicate community rows for one real person (commit 35c2b871) were
//     counted as separate members, and a duplicate row with no connections
//     of its own counted as "isolated" even when the person's real
//     connections are attached to their other row.
//  2. `connections` has no unique constraint on the unordered
//     (from_user_id, to_user_id) pair, and a check-then-insert race in
//     sendConnectionRequest() can produce two accepted rows for one
//     relationship (commit 35c2b871's own comment confirms this has been
//     observed in this codebase's actual data). The original RPC counted
//     connection ROWS, and community.connection_count (the trigger column
//     it also implicitly agreed with via isolated/key-connector logic)
//     independently double-counts the same way -- both were unreliable.
//
// This repo has no live Supabase connection available in this environment
// (see test-admin-analytics-rpc-security.js), so this is a structural
// verification of the fixed SQL text: it must compute every identity- and
// relationship-sensitive metric from a canonical-identity mapping and a
// deduped unique-pair list, and must no longer rely on
// community.connection_count (the column shown to have independently
// inflated in the same way, e.g. assets/js/node-panel.js's own-profile
// "N connections" badge).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(root, 'supabase/sql/migrations/20260819b_admin_analytics_identity_fix.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const bodyMatch = sql.match(/get_admin_network_analytics[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
assert.ok(bodyMatch, 'get_admin_network_analytics function body must be present and parseable');
const body = bodyMatch[1];

// --- Canonical identity: coalesce(user_id, id), matching the id-OR-user_id
//     rule already established and tested for Explore/PWK in 35c2b871 ---
assert.match(body, /coalesce\(user_id::text, id::text\) AS canonical_id/,
  'community rows must be mapped to a canonical identity via coalesce(user_id, id)');
assert.match(body, /PARTITION BY coalesce\(user_id::text, id::text\)/,
  'the representative-row selection must partition by the same canonical identity');

// --- total_members / active_members / new_members_30d counted over
//     canonical identities (the deduped `members` CTE), not raw community rows ---
assert.match(body, /members AS \(\s*-- One row per canonical identity[\s\S]*?SELECT \* FROM canon WHERE rn = 1/,
  'exactly one representative row per canonical identity must be selected (rn = 1)');
assert.match(body, /\(SELECT count\(\*\) FROM members\) AS total_members/,
  'total_members must count deduped members, not raw community rows');
assert.match(body, /\(SELECT count\(\*\) FROM members\s+WHERE last_seen_at IS NOT NULL/,
  'active_members must be counted over deduped members');
assert.match(body, /\(SELECT count\(\*\) FROM members WHERE created_at >= now\(\) - interval '30 days'\) AS new_members_30d/,
  'new_members_30d must be counted over deduped members');

// --- Relationships deduped to one row per unordered pair, self-pairs excluded ---
assert.match(body, /least\(ca\.canonical_id, cb\.canonical_id\) AS peer_a,\s*\n\s*greatest\(ca\.canonical_id, cb\.canonical_id\) AS peer_b/,
  'accepted relationships must be normalized to an unordered (least, greatest) canonical pair');
assert.match(body, /GROUP BY least\(ca\.canonical_id, cb\.canonical_id\), greatest\(ca\.canonical_id, cb\.canonical_id\)/,
  'pairs must be deduped via GROUP BY on the unordered pair -- this is what collapses reciprocal duplicate rows');
assert.match(body, /ca\.canonical_id <> cb\.canonical_id/,
  'self-pairs (two rows of the same person connected to each other) must be excluded');

// --- Degree, and everything derived from it, computed from the deduped
//     pair list -- NOT from community.connection_count ---
assert.match(body, /degree AS \(/, 'a degree CTE derived from the deduped pairs must exist');
assert.match(body, /FROM \(\s*SELECT peer_a AS canonical_id FROM pairs\s*UNION ALL\s*SELECT peer_b AS canonical_id FROM pairs\s*\) x\s*GROUP BY canonical_id/,
  'degree must be counted from the deduped pairs CTE, one row per side per unique pair');
// The output JSON still names a field "connection_count" (key_connectors'
// AS connection_count, matched by admin-analytics.js's renderer) and the
// file's own comments discuss the column being removed -- strip comments
// and only flag `connection_count` where it is READ (not the `AS` alias
// target), i.e. it must never again appear as a source column reference.
const bodyNoComments = body.replace(/--[^\n]*/g, '');
const readsConnectionCount = [...bodyNoComments.matchAll(/connection_count/g)]
  .some(m => !/AS\s+connection_count\s*$/.test(bodyNoComments.slice(Math.max(0, m.index - 20), m.index + 'connection_count'.length)));
assert.equal(readsConnectionCount, false,
  'the RPC must no longer READ community.connection_count anywhere (only the JSON output alias "AS connection_count" may remain) -- the column independently inflates the same way as raw connection-row counts, so every metric must be re-derived from the deduped pairs/degree CTEs instead');

assert.match(body, /\(SELECT count\(\*\) FROM pairs\) AS total_connections/,
  'total_connections must count deduped unique pairs, not raw connections rows');
assert.match(body, /\(SELECT count\(\*\) FROM pairs WHERE formed_at >= now\(\) - interval '30 days'\) AS new_connections_30d/,
  'new_connections_30d must be counted over deduped pairs');
assert.match(body, /LEFT JOIN degree d ON d\.canonical_id = m\.canonical_id\s*\n\s*WHERE coalesce\(d\.n, 0\) = 0\) AS isolated_count/,
  'isolated_count must be members with zero degree in the deduped pair list');
assert.match(body, /JOIN degree d ON d\.canonical_id = m\.canonical_id\s*\n\s*WHERE d\.n > 0\s*\n\s*ORDER BY d\.n DESC/,
  'key_connectors must be ranked by deduped degree, not community.connection_count');

// --- top_skills counted once per canonical identity ---
assert.match(body, /FROM members m, unnest\(string_to_array\(m\.skills, ','\)\) AS skill/,
  'top_skills must iterate deduped members, not raw community rows (a duplicate row would otherwise double-count its skills)');

// --- network_density_pct derived from the same deduped totals, divide-by-zero safe ---
assert.match(body, /WHEN totals\.total_members > 1[\s\S]*?totals\.total_connections \/ \(\(totals\.total_members \* \(totals\.total_members - 1\)\) \/ 2\.0\)/,
  'network_density_pct must be computed from the deduped total_members/total_connections, guarded against divide-by-zero at 0 or 1 members');

// --- The fail-closed authorization contract from the original migration
//     must still hold in the fixed function (identity fix must not regress
//     the security fix shipped in 20260819_admin_analytics_privacy.sql) ---
assert.match(sql, /SECURITY DEFINER/, 'the function must remain SECURITY DEFINER');
assert.match(body, /user_role\s*=\s*'Admin'/, 'the admin gate must remain in place');
assert.match(body, /RAISE EXCEPTION[\s\S]*not_authorized/i, 'the RPC must still fail closed for non-admins');
const authIdx = body.indexOf('RAISE EXCEPTION');
const firstCteIdx = body.indexOf('WITH canon AS');
assert.ok(authIdx > -1 && firstCteIdx > -1 && authIdx < firstCteIdx,
  'the fail-closed check must still run before any metric computation');
assert.doesNotMatch(body, /messages/i, 'the fix must not introduce a reference to the messages table');
// `SELECT * FROM canon` (building the `members` CTE from the already-narrow
// canon CTE) is fine -- neither is ever returned to the client. Only a raw
// `SELECT * FROM public.<table>` would leak full table rows.
assert.doesNotMatch(body, /select\s+\*\s+from\s+public\./i,
  'the fix must not introduce a raw SELECT * against an actual table');

console.log('✅ test-admin-analytics-identity-integrity passed');
