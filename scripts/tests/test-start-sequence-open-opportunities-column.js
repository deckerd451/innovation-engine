#!/usr/bin/env node
'use strict';

// Regression: the 'opportunities' block of get_start_sequence_data counted open
// opportunities with
//   WHERE status = 'open' AND (expires_at IS NULL OR expires_at > NOW())
// but the production opportunities table has no expires_at column. Postgres
// raised "column \"expires_at\" does not exist" and aborted the entire RPC, so
// every Network Reflection panel that hangs off get_start_sequence_data failed
// with a database error.
//
// The fix drops the expires_at predicate from the open_opportunities count and
// filters on status = 'open' alone -- the same rule the rest of the app uses
// (see _loadReflectionOpportunityCount in assets/js/start-daily-digest.js).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/sql/functions/get_start_sequence_data.sql'),
  'utf8'
);
// Absence checks target executable SQL, not the comment that explains the bug.
const executableSql = sql.replace(/--[^\n]*/g, '');

// Isolate the open_opportunities count sub-select.
const block = executableSql.match(
  /'open_opportunities',\s*json_build_object\([\s\S]*?'items',\s*'\[\]'::json\s*\)/
);
assert.ok(block, 'the open_opportunities block must still be present in the RPC');
const openOpportunities = block[0];

// --- 1. the count still filters to open opportunities --------------------
assert.match(openOpportunities, /FROM opportunities\s+WHERE status = 'open'/,
  'open opportunities are still counted by status');

// --- 2. no reference to the non-existent expires_at column --------------
assert.doesNotMatch(openOpportunities, /expires_at/,
  'the opportunities table has no expires_at column -- referencing it aborts the RPC');

// --- 3. unrelated blocks are untouched ---------------------------------
// theme_circles genuinely has expires_at, so its predicate must stay.
assert.match(executableSql, /FROM theme_circles\s+WHERE status = 'active'\s+AND \(expires_at IS NULL OR expires_at > NOW\(\)\)/,
  'the active_themes count against theme_circles must be preserved');
assert.match(sql, /'skill_matched_projects', json_build_object/,
  'the skill_matched_projects block must be preserved');
assert.match(sql, /'complementary_connections', json_build_object/,
  'the complementary_connections block must be preserved');

console.log('get_start_sequence_data open_opportunities column fix: all checks passed');
