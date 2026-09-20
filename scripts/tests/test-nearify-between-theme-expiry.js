#!/usr/bin/env node

// Offline regression coverage for the Nearify Between Intelligence theme
// lifecycle predicate. The repository does not run SQL against production
// in local tests, so this verifies both the pure truth table and the exact
// source predicate in the source-of-truth SQL and its migration history.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sourceSQL = fs.readFileSync(
  path.join(root, 'supabase/sql/nearify_between_intelligence.sql'),
  'utf8'
);
const migrationSQL = fs.readFileSync(
  path.join(root, 'supabase/sql/migrations/20260920_nearify_between_intelligence_theme_expiry.sql'),
  'utf8'
);
const relationshipSQL = fs.readFileSync(
  path.join(root, 'supabase/sql/nearify_relationship_enrichment.sql'),
  'utf8'
);
const relationshipMigrationSQL = fs.readFileSync(
  path.join(root, 'supabase/sql/migrations/20260920_nearify_relationship_enrichment_theme_expiry.sql'),
  'utf8'
);

const now = new Date('2026-09-20T00:00:00.000Z');

function qualifiesTheme({ status, expires_at }, at = now) {
  return status === 'active' && (expires_at == null || new Date(expires_at) > at);
}

assert.equal(qualifiesTheme({ status: 'active', expires_at: '2026-09-21T00:00:00.000Z' }), true);
assert.equal(qualifiesTheme({ status: 'active', expires_at: null }), true);
assert.equal(qualifiesTheme({ status: 'active', expires_at: '2026-09-19T23:59:59.000Z' }), false);
assert.equal(qualifiesTheme({ status: 'archived', expires_at: '2026-09-21T00:00:00.000Z' }), false);

const predicate = "tc.status = 'active'\n          AND (tc.expires_at IS NULL OR tc.expires_at > now())";
assert.equal(sourceSQL.includes(predicate), true, 'source SQL must require active status and a non-expired/null expiry');
assert.equal(migrationSQL.includes(predicate), true, 'migration must carry the same expiry predicate');
for (const [label, sql] of [
  ['relationship-enrichment source', relationshipSQL],
  ['relationship-enrichment migration', relationshipMigrationSQL],
]) {
  assert.equal(
    /tc\.status = 'active'\s+AND \(tc\.expires_at IS NULL OR tc\.expires_at > now\(\)\)/.test(sql),
    true,
    `${label} must require active status and a non-expired/null expiry`
  );
}

// The change is a read predicate only: identity/authorization/grounding
// gates remain present in the source function.
for (const required of [
  "FROM community_experience_authorizations",
  "cea.status       = 'authorized'",
  'nearify_identity_map nim',
  'nim.nearify_user_id = ANY(v_ids)',
]) {
  assert.equal(sourceSQL.includes(required), true, `authorization/grounding gate missing: ${required}`);
  assert.equal(relationshipSQL.includes(required), true, `relationship authorization/grounding gate missing: ${required}`);
}

console.log('✅ Nearify theme expiry predicates passed');
