#!/usr/bin/env node

// Structural verification of supabase/sql/migrations/20260819_admin_analytics_privacy.sql,
// the RPC that replaced admin-analytics.js's previous behaviour of downloading
// full connections/messages/activity_log tables to the browser.
//
// This repo has no live Supabase connection available in this environment, so
// "non-admin cannot access privileged analytics" and "aggregate RPC does not
// expose raw messages" are verified statically against the migration's SQL
// text rather than by executing it. A live-DB integration test (apply the
// migration to a test project, call the RPC as a non-admin and an admin) is
// recommended as a follow-up once Supabase access is available in CI.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(root, 'supabase/sql/migrations/20260819_admin_analytics_privacy.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

// Isolate just the function body (between the CREATE FUNCTION's `AS $$` and
// its closing `$$;`) so checks below can't be fooled by this file's own
// explanatory comments mentioning "messages" or "select *".
const bodyMatch = sql.match(/get_admin_network_analytics[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
assert.ok(bodyMatch, 'get_admin_network_analytics function body must be present and parseable');
const body = bodyMatch[1];

// --- Fails closed: only user_role = 'Admin' may proceed ---
assert.match(body, /user_role\s*=\s*'Admin'/,
  'RPC must gate on community.user_role = \'Admin\'');
assert.match(body, /RAISE EXCEPTION[\s\S]*not_authorized/i,
  'RPC must raise (fail closed) when the caller is not an admin, not return partial/empty data');
assert.match(body, /IF v_is_admin IS NOT TRUE THEN/,
  'the admin check must run before any metric is computed');

// The authorization check must appear before the first metric SELECT (not
// just before the DECLARE block, which merely names the variables), so a
// non-admin can never reach the data-gathering statements.
const authIdx = body.indexOf('RAISE EXCEPTION');
const firstMetricIdx = body.indexOf('SELECT count(*) INTO v_total_members');
assert.ok(authIdx > -1 && firstMetricIdx > -1 && authIdx < firstMetricIdx,
  'the fail-closed check must precede metric computation in source order');

// --- Narrow SECURITY DEFINER, not broad RLS bypass ---
assert.match(sql, /SECURITY DEFINER/, 'the function must be SECURITY DEFINER');
assert.match(sql, /SET search_path = public/,
  'SECURITY DEFINER functions must pin search_path to avoid hijacking');
assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_admin_network_analytics\(integer\) FROM PUBLIC/,
  'execute must be revoked from PUBLIC (narrow grant, not broad access)');
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_admin_network_analytics\(integer\) TO authenticated/,
  'execute must be granted only to authenticated, and only via this one function');

// --- Never exposes raw message content or raw rows ---
assert.doesNotMatch(body, /messages/i,
  'the aggregate RPC must never reference the messages table -- raw message content must never be needed to compute metrics');
assert.doesNotMatch(body, /select\s+\*/i,
  'the RPC must never SELECT * -- every result must be a computed aggregate (count/json_agg of a narrow column list), not raw rows');

// The two row-returning aggregates (isolated sample, key connectors) must
// each select an explicit, narrow column list -- not push a full community
// row (which would include email, etc.) into the JSON response.
const isolatedSelect = body.match(/SELECT id, name, skills\s+FROM public\.community/);
const connectorsSelect = body.match(/SELECT id, name, connection_count\s+FROM public\.community/);
assert.ok(isolatedSelect, 'isolated-members sample must select an explicit narrow column list (id, name, skills)');
assert.ok(connectorsSelect, 'key-connectors list must select an explicit narrow column list (id, name, connection_count)');
assert.doesNotMatch(body, /\bemail\b/i, 'no email column should ever be returned by this aggregate RPC');

// --- photo_visible column exists and defaults to visible (opt-out, not opt-in) ---
assert.match(sql, /ADD COLUMN IF NOT EXISTS photo_visible boolean NOT NULL DEFAULT true/,
  'photo_visible must exist, be NOT NULL, and default true so no photo silently disappears without an explicit admin/member action');

console.log('✅ test-admin-analytics-rpc-security passed');
