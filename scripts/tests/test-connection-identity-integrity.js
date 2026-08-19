#!/usr/bin/env node

// Regression coverage for the bounded connection-identity repair in
// supabase/sql/migrations/20260819c_connection_identity_integrity.sql (see
// that file's header for the full audit trail). This repo has no live
// Supabase connection available in this environment (consistent with
// test-admin-analytics-rpc-security.js / test-admin-analytics-identity-
// integrity.js), so two complementary strategies are used:
//
//  (a) The migration's deterministic cleanup ranking (created_at ASC, id
//      ASC, with status handled as a separate upgrade step) is a pure,
//      portable algorithm -- it's
//      mirrored here in JS and exercised directly against concrete
//      scenarios (points 1, 2, 6, 7, 8, 9 below). `rankConnections()`
//      below must be kept in sync with the SQL's ORDER BY clause; a
//      structural check confirms the SQL still expresses the same rule.
//  (b) Everything else is verified structurally against the actual SQL
//      and the actual (intentionally UNCHANGED) consumer source files.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/sql/migrations/20260819c_connection_identity_integrity.sql'),
  'utf8'
);

// ---------------------------------------------------------------------------
// (a) JS mirror of the SQL's per-pair ranking rule
// ---------------------------------------------------------------------------
const RANK = { accepted: 2, pending: 1 };

function rankConnections(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!RANK[row.status]) continue; // rejected/canceled are never ranked
    const a = row.from < row.to ? row.from : row.to;
    const b = row.from < row.to ? row.to : row.from;
    const key = `${a}::${b}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const survivors = [];
  const removed = [];
  for (const [, group] of groups) {
    const sorted = [...group].sort((x, y) =>
      x.created_at.localeCompare(y.created_at) ||
      x.id.localeCompare(y.id)
    );
    const best = Math.max(...sorted.map(r => RANK[r.status]));
    const survivor = { ...sorted[0], status: best === 2 ? 'accepted' : 'pending' };
    survivors.push(survivor);
    removed.push(...sorted.slice(1).map(r => r.id));
  }
  return { survivors, removed };
}

function uniquePairCount(rows) {
  const pairs = new Set();
  for (const row of rows) {
    if (row.status !== 'accepted') continue;
    const a = row.from < row.to ? row.from : row.to;
    const b = row.from < row.to ? row.to : row.from;
    pairs.add(`${a}::${b}`);
  }
  return pairs.size;
}

// --- 1 & 2: A->B accepted + B->A accepted collapses to ONE relationship,
//     canonical unique count is 1, not 2 ---
{
  const rows = [
    { id: 'r1', from: 'A', to: 'B', status: 'accepted', created_at: '2026-01-01T00:00:00Z' },
    { id: 'r2', from: 'B', to: 'A', status: 'accepted', created_at: '2026-01-02T00:00:00Z' },
  ];
  const { survivors, removed } = rankConnections(rows);
  assert.equal(survivors.length, 1, 'A<->B reciprocal accepted rows must collapse to exactly one logical relationship');
  assert.equal(survivors[0].id, 'r1', 'the earlier-created row must survive');
  assert.equal(survivors[0].status, 'accepted');
  assert.deepEqual(removed, ['r2'], 'only the later duplicate must be removed');
  assert.equal(uniquePairCount(rows), 1, 'canonical unique accepted-pair count must be 1, not 2');
}

// --- Reciprocal rows with DIFFERENT statuses: the earlier row survives,
//     upgraded to the stronger status found among its duplicates ---
{
  const rows = [
    { id: 'r1', from: 'A', to: 'B', status: 'pending', created_at: '2026-01-01T00:00:00Z' },
    { id: 'r2', from: 'B', to: 'A', status: 'accepted', created_at: '2026-01-02T00:00:00Z' },
  ];
  const { survivors, removed } = rankConnections(rows);
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].id, 'r1', 'the earlier row survives even though a later duplicate was the one accepted');
  assert.equal(survivors[0].status, 'accepted', 'the survivor must be upgraded to the strongest status found among its duplicates');
  assert.deepEqual(removed, ['r2']);
}

// --- 7: Non-duplicate relationships are untouched ---
{
  const rows = [
    { id: 'r1', from: 'A', to: 'B', status: 'accepted', created_at: '2026-01-01T00:00:00Z' },
    { id: 'r2', from: 'C', to: 'D', status: 'pending', created_at: '2026-01-01T00:00:00Z' },
    { id: 'r3', from: 'E', to: 'F', status: 'rejected', created_at: '2026-01-01T00:00:00Z' },
  ];
  const { survivors, removed } = rankConnections(rows);
  assert.equal(survivors.length, 2, 'two distinct active pairs must both survive independently');
  assert.deepEqual(removed, [], 'nothing should be removed when no pair has a duplicate');
  assert.ok(!survivors.some(s => s.id === 'r3'), 'a rejected row is never touched (never enters the ranking at all)');
}

// --- Legitimate history is never collapsed: a rejected row plus a later
//     fresh pending row for the SAME pair (re-request after decline) must
//     both remain -- this is the exact product behavior sendConnectionRequest()
//     explicitly allows, and the SQL's WHERE status IN ('pending','accepted')
//     scope excludes rejected rows from the ranking entirely. ---
{
  const rows = [
    { id: 'r1', from: 'A', to: 'B', status: 'rejected', created_at: '2026-01-01T00:00:00Z' },
    { id: 'r2', from: 'A', to: 'B', status: 'pending', created_at: '2026-02-01T00:00:00Z' },
  ];
  const { survivors, removed } = rankConnections(rows);
  assert.equal(survivors.length, 1, 'only the active row is ranked');
  assert.equal(survivors[0].id, 'r2');
  assert.deepEqual(removed, [], 'the rejected row must never be deleted -- it is legitimate history, not a duplicate');
}

// --- 8: Same display names never affect identity (ranking is keyed purely
//     by from/to ids) ---
{
  const rows = [
    { id: 'r1', from: 'doug-1', to: 'jane-1', status: 'accepted', created_at: '2026-01-01T00:00:00Z', name: 'Doug Hamilton' },
    { id: 'r2', from: 'doug-2', to: 'jane-1', status: 'accepted', created_at: '2026-01-01T00:00:00Z', name: 'Doug Hamilton' },
  ];
  const { survivors, removed } = rankConnections(rows);
  assert.equal(survivors.length, 2, 'two different people who happen to share a display name must never be merged');
  assert.deepEqual(removed, []);
}

// --- 6: Idempotent -- re-running the same ranking against an
//     already-cleaned dataset changes nothing further ---
{
  const rows = [
    { id: 'r1', from: 'A', to: 'B', status: 'accepted', created_at: '2026-01-01T00:00:00Z' },
    { id: 'r2', from: 'C', to: 'D', status: 'pending', created_at: '2026-01-01T00:00:00Z' },
  ];
  const first = rankConnections(rows);
  const second = rankConnections(first.survivors);
  assert.deepEqual(second.removed, [], 'running cleanup on already-deduped data must be a no-op');
  assert.equal(second.survivors.length, first.survivors.length);
}

// --- 3: Self-connections are excluded from the identity model entirely --
//     the DB CHECK constraint (verified structurally below) is the backstop;
//     confirm the ranking helper itself cannot silently "collapse" a
//     self-row into anything (it would appear as its own degenerate pair,
//     which the CHECK constraint prevents from ever being inserted). ---
{
  const rows = [{ id: 'r1', from: 'A', to: 'A', status: 'pending', created_at: '2026-01-01T00:00:00Z' }];
  const { survivors } = rankConnections(rows);
  assert.equal(survivors.length, 1, 'a self-row (if one existed) would rank as its own pair -- the DB CHECK constraint is what actually prevents it from being created at all, verified below');
}

console.log('✅ ranking algorithm behaves correctly (mirrors the SQL cleanup logic)');

// ---------------------------------------------------------------------------
// (b) Structural verification against the actual migration SQL
// ---------------------------------------------------------------------------

// The JS mirror above must match what the SQL actually expresses -- if
// someone changes the ranking rule in SQL without updating this test, this
// keeps the two from silently drifting apart. Status is intentionally NOT
// part of this ORDER BY: the survivor is chosen purely by earliest
// creation, then upgraded to the strongest status found among its
// duplicates as a separate step (best_rank) -- putting status first in the
// ORDER BY would make that upgrade step a no-op (the strongest-status row
// would always already be rn=1) and silently lose the "earliest creation
// metadata" preservation goal.
const rankedOrderBys = [...sql.matchAll(/ORDER BY created_at ASC, id ASC/g)];
assert.equal(rankedOrderBys.length, 2,
  'both ranking CTEs (the status-upgrade UPDATE and the duplicate-removal DELETE) must rank by created_at ASC, id ASC only');
assert.doesNotMatch(sql, /ORDER BY\s*\n?\s*CASE status/,
  'status must not be part of the survivor-selection ORDER BY -- it is applied separately via best_rank so it cannot suppress the earliest-row selection');

// Cleanup runs before the constraint/index (order matters for safety).
const cleanupIdx = sql.indexOf('STEP 2: Deterministically collapse');
const verifyIdx = sql.indexOf('STEP 3: Verify cleanup is complete');
const checkIdx = sql.indexOf('STEP 4: Self-connections must remain invalid');
const indexIdx = sql.indexOf('STEP 5: Database-level uniqueness');
assert.ok(cleanupIdx > -1 && verifyIdx > cleanupIdx && checkIdx > verifyIdx && indexIdx > checkIdx,
  'cleanup, then verification, then the self-connection check, then the uniqueness index must appear in that order');

// SCHEMA SAFETY: a live run of an earlier version of this migration failed
// with `column "updated_at" of relation "connections" does not exist` --
// public.connections has no updated_at column. Guards against silently
// reintroducing that assumption in any executable statement (comments
// describing the correction, e.g. this file's own header, are exempt).
const executableSql = sql
  .split('\n')
  .filter(line => !/^\s*--/.test(line))
  .join('\n');
assert.doesNotMatch(executableSql, /updated_at/,
  'no executable statement may reference connections.updated_at -- it does not exist on the live table (see the CORRECTION note in the migration header)');
// Step 2a's survivor upgrade must set ONLY status -- id, from_user_id/
// to_user_id, created_at, and type are left untouched on the surviving row.
assert.match(sql, /UPDATE public\.connections c\s*\nSET status = CASE r\.best_rank WHEN 2 THEN 'accepted' ELSE 'pending' END\s*\nFROM ranked r/,
  "step 2a's UPDATE must SET only status, nothing else");

// 3: self-connections invalid at the DB level.
assert.match(sql, /CHECK \(from_user_id <> to_user_id\) NOT VALID/,
  'a DB-level CHECK constraint must prevent self-connections');
assert.match(sql, /VALIDATE CONSTRAINT connections_no_self_connection/,
  'the self-connection constraint must be validated, not just added NOT VALID and left unchecked');

// 4: concurrent/reverse creation cannot create two rows -- enforced by a
// partial unique index over exactly the active statuses, keyed on the
// unordered pair.
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_active_pair\s*\n\s*ON public\.connections \(LEAST\(from_user_id, to_user_id\), GREATEST\(from_user_id, to_user_id\)\)\s*\n\s*WHERE status IN \('pending', 'accepted'\)/,
  'a partial unique index on the unordered pair, scoped to pending/accepted, must exist');

// 5 & existing product semantics: the positive match above already proves
// the index carries a `WHERE status IN ('pending', 'accepted')` clause --
// i.e. it is partial, not table-wide -- so rejected/canceled rows remain
// free to coexist (re-request after decline, which sendConnectionRequest()
// explicitly relies on, is never blocked by this constraint).

// 9: connection_count backfill/trigger must match unique accepted pair
// count -- i.e. count DISTINCT peers, not raw rows.
assert.match(sql, /count\(DISTINCT peer\)/,
  'both the trigger and the backfill must count DISTINCT peers, not raw connection rows');
assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /connection_count = \(\s*SELECT COUNT\(\*\)/,
  'the repaired trigger must not reintroduce the old COUNT(*)-based inflation bug');

// Idempotency: every DDL statement uses an idempotent form.
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_connection_count/);
assert.match(sql, /DROP TRIGGER IF EXISTS trigger_update_connection_count/);
assert.match(sql, /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/,
  'the self-connection constraint must check pg_constraint before adding itself (ADD CONSTRAINT has no native IF NOT EXISTS)');

// 15: RLS/privacy contract unchanged -- this migration must not touch
// policies or grants on connections at all.
assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|ALTER POLICY|ENABLE ROW LEVEL SECURITY|GRANT |REVOKE /,
  'this migration must not modify any RLS policy or grant -- it only adds a CHECK constraint, a partial unique index, and repairs the connection_count trigger/backfill');

console.log('✅ migration SQL structure verified');

// ---------------------------------------------------------------------------
// 10, 11, 12, 13: consumer surfaces are correct BY CONSTRUCTION because
// they were intentionally left unchanged -- verify they still read from
// the (now-repaired) canonical sources rather than reintroducing their own
// ad hoc counting.
// ---------------------------------------------------------------------------

const nodePanelSrc = fs.readFileSync(path.join(root, 'assets/js/node-panel.js'), 'utf8');
assert.match(nodePanelSrc, /\$\{profile\.connection_count \|\| 0\} connections/,
  '10: node-panel.js\'s self-profile badge must still read community.connection_count -- correctness now comes from the repaired trigger/backfill, not a JS change');

const startSeqSql = fs.readFileSync(path.join(root, 'supabase/sql/functions/get_start_sequence_data.sql'), 'utf8');
assert.match(startSeqSql, /COALESCE\(c\.connection_count, 0\)/,
  '11: get_start_sequence_data.sql (backing Network Report / "Your Network Status") must still read community.connection_count');

const commandDashboardSrc = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
assert.match(commandDashboardSrc, /_acceptedIds = _enrichedData\.acceptedPeerIds;[\s\S]{0,200}connections = _acceptedIds\.size/,
  '12: command-dashboard.js\'s "Connected" Network Status stat must still use the deduped acceptedPeerIds Set (already correct, independent of this migration)');

const adminAnalyticsSql = fs.readFileSync(
  path.join(root, 'supabase/sql/migrations/20260819b_admin_analytics_identity_fix.sql'), 'utf8'
);
assert.match(adminAnalyticsSql, /least\(ca\.canonical_id, cb\.canonical_id\)/);
assert.match(sql, /least\(from_user_id, to_user_id\)/);
assert.match(adminAnalyticsSql, /status = 'accepted'/);
assert.match(sql, /status IN \('pending', 'accepted'\)/);
// 13: Admin Analytics counts *accepted* pairs only; this migration's active
// state (pending+accepted) is a superset used for identity/uniqueness, not
// a different definition of "connection" -- both use the same unordered-
// pair-of-ids methodology, so the two remain conceptually consistent.

console.log('✅ member-facing and admin-facing consumers verified consistent');

// ---------------------------------------------------------------------------
// 15 (continued) / 3 / 5: the two live "Connect" handlers were NOT modified
// by this repair -- their existing self-connection guard and existing
// 23505 handling (which this migration's new index finally activates) must
// still be present verbatim.
// ---------------------------------------------------------------------------

const connectionsJsSrc = fs.readFileSync(path.join(root, 'assets/js/connections.js'), 'utf8');
assert.match(connectionsJsSrc, /You can't connect to yourself/,
  "connections.js's application-level self-connection guard must remain (defense in depth alongside the new DB constraint)");
assert.match(connectionsJsSrc, /error\.code === "23505"/,
  '4: connections.js sendConnectionRequest() must still gracefully handle a unique-violation instead of a generic fatal error -- this migration activates that existing handling rather than replacing it');

assert.match(nodePanelSrc, /You can't connect to yourself/,
  "node-panel.js's application-level self-connection guard must remain");
assert.match(nodePanelSrc, /error\.code === '23505'/,
  "4: node-panel.js window.sendConnectionFromPanel() must still gracefully handle a unique-violation");

console.log('✅ test-connection-identity-integrity passed');
