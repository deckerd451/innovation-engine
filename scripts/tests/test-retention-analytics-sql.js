#!/usr/bin/env node

// Structural verification of supabase/sql/migrations/20260820_retention_instrumentation.sql
// (server-side half of the retention/engagement instrumentation pass;
// client-side half covered by test-telemetry-session-behavior.js). This
// repo has no live Supabase connection available in this environment
// (consistent with the admin-analytics/connection-identity SQL tests), so
// this verifies the migration's actual SQL text rather than executing it.
//
// Covers PHASE 13 items 7-18:
//   7. users cannot read other users' raw telemetry
//   8. admin aggregate RPC fails closed for non-admin
//   9. admin aggregate RPC exposes no raw event histories
//   10-12. D1 / D7 / D30 definitions
//   13. insufficient-history returns unavailable/null, not zero
//   14-15. activation calculation excludes passive viewing
//   16-17. action -> 7-day-return cohort calculation includes sample size
//   18. small cohorts do not produce misleading "return signal" claims
// (19-20 -- existing Admin Analytics/connection/Reflection behavior
// unchanged -- are covered by re-running the existing regression suites,
// not by new assertions here.)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(root, 'supabase/sql/migrations/20260820_retention_instrumentation.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const bodyMatch = sql.match(/get_admin_retention_analytics[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
assert.ok(bodyMatch, 'get_admin_retention_analytics function body must be present and parseable');
const body = bodyMatch[1];
const bodyNoComments = body.replace(/--[^\n]*/g, '');

// ---------------------------------------------------------------------------
// No content/device/text columns -- this is measurement infrastructure, not
// surveillance (see the migration header and telemetry.js).
// ---------------------------------------------------------------------------
const tablesBlockRaw = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.product_sessions'), sql.indexOf('STEP 3: admin retention'));
// Strip -- line comments AND COMMENT ON TABLE ... IS '...' string literals
// (both legitimately describe "no content/device data" in prose).
const tablesBlock = tablesBlockRaw
  .replace(/--[^\n]*/g, '')
  .replace(/COMMENT ON TABLE[\s\S]*?;/g, '');
for (const forbidden of ['content', 'message_text', 'search_text', 'url', 'ip_address', 'ip\\b', 'user_agent', 'device', 'fingerprint', 'browser']) {
  assert.doesNotMatch(tablesBlock, new RegExp(forbidden, 'i'),
    `product_sessions/product_events must never define a "${forbidden}"-like column`);
}
assert.match(sql, /CONSTRAINT product_events_event_type_check CHECK \(event_type IN \(/,
  'event_type must be constrained to a fixed, small taxonomy');
const eventTypeMatch = sql.match(/CONSTRAINT product_events_event_type_check CHECK \(event_type IN \(([\s\S]*?)\)\)/);
assert.ok(eventTypeMatch, 'event_type CHECK list must be present');
const eventTypes = eventTypeMatch[1].match(/'([a-z_]+)'/g).map(s => s.replace(/'/g, ''));
assert.deepEqual(
  eventTypes.sort(),
  ['connection_accepted', 'connection_requested', 'message_sent', 'opportunity_viewed', 'person_viewed', 'reflection_viewed', 'session_started'].sort(),
  'the event taxonomy must be exactly the seven meaningful actions -- no generic button_clicked/tab_opened/graph_clicked/search_typed/modal_opened, no opportunity_applied or project_joined (left out, see migration header)'
);

console.log('✅ product_sessions/product_events carry no content/device columns and a fixed 7-event taxonomy');

// ---------------------------------------------------------------------------
// 7: users cannot read other users' raw telemetry (own-row-only RLS)
// ---------------------------------------------------------------------------
assert.match(sql, /CREATE POLICY "insert own sessions" ON public\.product_sessions\s*\n\s*FOR INSERT TO authenticated\s*\n\s*WITH CHECK \(user_id = auth\.uid\(\)\)/,
  'sessions INSERT must be restricted to the caller\'s own auth uid');
assert.match(sql, /CREATE POLICY "select own sessions" ON public\.product_sessions\s*\n\s*FOR SELECT TO authenticated\s*\n\s*USING \(user_id = auth\.uid\(\)\)/,
  'sessions SELECT must be restricted to the caller\'s own auth uid');
assert.match(sql, /CREATE POLICY "insert own events" ON public\.product_events\s*\n\s*FOR INSERT TO authenticated\s*\n\s*WITH CHECK \(user_id = auth\.uid\(\)\)/,
  'events INSERT must be restricted to the caller\'s own auth uid');
assert.match(sql, /CREATE POLICY "select own events" ON public\.product_events\s*\n\s*FOR SELECT TO authenticated\s*\n\s*USING \(user_id = auth\.uid\(\)\)/,
  'events SELECT must be restricted to the caller\'s own auth uid');

// No admin-bypass / broad-visibility policy on either table -- the RPC is
// the only path aggregates take to reach an admin.
assert.doesNotMatch(sql, /USING \(true\)/, 'no policy on these tables may grant open/broad visibility');
assert.doesNotMatch(sql, /user_role\s*=\s*'Admin'[\s\S]{0,80}ON public\.product_(sessions|events)/,
  'no admin-bypass RLS policy may exist on product_sessions/product_events -- admin access is only through the aggregate RPC');
console.log('✅ 7: RLS restricts sessions/events to the caller\'s own rows, no admin bypass');

// ---------------------------------------------------------------------------
// 8: admin aggregate RPC fails closed for non-admin
// ---------------------------------------------------------------------------
assert.match(sql, /SECURITY DEFINER/, 'the retention RPC must be SECURITY DEFINER');
assert.match(sql, /SET search_path = public/, 'SECURITY DEFINER functions must pin search_path');
assert.match(body, /user_role\s*=\s*'Admin'/, 'the RPC must gate on community.user_role = \'Admin\'');
assert.match(body, /RAISE EXCEPTION[\s\S]*not_authorized/i, 'the RPC must fail closed (raise), not return partial/empty data, for a non-admin');
const authIdx = body.indexOf('RAISE EXCEPTION');
const firstCteIdx = body.indexOf('WITH first_session');
assert.ok(authIdx > -1 && firstCteIdx > -1 && authIdx < firstCteIdx,
  'the admin check must run before any metric computation');
assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_admin_retention_analytics\(integer\) FROM PUBLIC/,
  'execute must be revoked from PUBLIC');
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_admin_retention_analytics\(integer\) TO authenticated/,
  'execute must be granted only to authenticated, gated internally by the admin check');
console.log('✅ 8: admin RPC fails closed (SECURITY DEFINER, admin-role gate before any computation, narrow grant)');

// ---------------------------------------------------------------------------
// 9: no raw event/session histories, user identities, emails, or message
// data are ever exposed by the RPC
// ---------------------------------------------------------------------------
assert.doesNotMatch(bodyNoComments, /select\s+\*/i, 'the RPC must never SELECT * -- only computed aggregates');
// action_signals legitimately uses json_agg(row_to_json(t)) -- but only
// over its own small computed action_cohorts subquery (action name + four
// integer counts + two percentages), never over the raw tables directly.
assert.doesNotMatch(bodyNoComments, /json_agg\(row_to_json\(t\)\)\s*\n\s*FROM public\.(product_events|product_sessions)/,
  'json_agg(row_to_json(...)) must never be applied directly to the raw product_events/product_sessions tables');
assert.match(bodyNoComments, /FROM \(\s*\n\s*SELECT\s*\n\s*action,/,
  'the one json_agg(row_to_json(...)) in this RPC must be over the computed per-action cohort subquery, not a raw table');
assert.doesNotMatch(bodyNoComments, /\bemail\b|\bname\b/i,
  'the RPC must never reference community.email/name -- it returns aggregate numbers only, no identities');
assert.doesNotMatch(bodyNoComments, /entity_id|entity_type/i,
  'the RPC must never return per-event entity pointers -- only counts derived from them');
console.log('✅ 9: RPC returns aggregates only -- no raw rows, identities, or entity-level data');

// ---------------------------------------------------------------------------
// 10-12: D1 / D7 / D30 definitions, encoded in the SQL itself
// ---------------------------------------------------------------------------
assert.match(body, /d1_cohort AS \(\s*\n\s*SELECT fs\.user_id, fs\.first_started_at\s*\n\s*FROM first_session fs\s*\n\s*WHERE fs\.first_started_at::date <= \(current_date - 2\)/,
  'D1 cohort must require the first session to be at least 2 full days in the past (so day D+1 has fully elapsed)');
assert.match(body, /s\.started_at::date = \(c\.first_started_at::date \+ 1\)/,
  'D1 retained must check for a session on the exact calendar day after the first session');

assert.match(body, /d7_cohort AS \(\s*\n\s*SELECT fs\.user_id, fs\.first_started_at\s*\n\s*FROM first_session fs\s*\n\s*WHERE fs\.first_started_at <= now\(\) - interval '8 days'/,
  'D7 cohort must require the first session to be at least 8 days in the past (full 1-7 day window elapsed)');
assert.match(body, /d7_retained AS \([\s\S]*?s\.started_at > c\.first_started_at\s*\n\s*AND s\.started_at <= c\.first_started_at \+ interval '7 days'/,
  'D7 must be a rolling "returned within 7 days" window, not exact-day D+7');
assert.match(sql, /'d7_retention', json_build_object\(\s*\n\s*'cohort_n', totals\.d7_cohort_n,\s*\n\s*'retained_n', totals\.d7_retained_n,\s*\n\s*'rate_pct',[\s\S]*?'definition', 'returned at least once within 7 days of first session'/,
  'the D7 definition returned to the client must be unambiguous and match the rolling-window SQL, not silently mix definitions');

assert.match(body, /d30_cohort AS \(\s*\n\s*SELECT fs\.user_id, fs\.first_started_at\s*\n\s*FROM first_session fs\s*\n\s*WHERE fs\.first_started_at <= now\(\) - interval '31 days'/,
  'D30 cohort must require the first session to be at least 31 days in the past');
assert.match(body, /d30_retained AS \([\s\S]*?s\.started_at > c\.first_started_at\s*\n\s*AND s\.started_at <= c\.first_started_at \+ interval '30 days'/,
  'D30 must be the same rolling-window principle as D7, over 30 days');
console.log('✅ 10-12: D1 (exact next-day), D7 and D30 (rolling within-window) definitions verified in SQL');

// ---------------------------------------------------------------------------
// 13: insufficient history -> NULL, never a fabricated 0%
// ---------------------------------------------------------------------------
for (const field of ['d1_cohort_n', 'd7_cohort_n', 'd30_cohort_n']) {
  const re = new RegExp(`CASE WHEN totals\\.${field} > 0\\s*\\n\\s*THEN round\\([\\s\\S]*?\\n\\s*ELSE NULL END`);
  assert.match(sql, re, `${field}'s rate_pct must be NULL (not 0) when the cohort is empty`);
}
assert.match(sql, /'rate_pct', CASE WHEN totals\.total_sessioned_users > 0[\s\S]*?ELSE NULL END/,
  'activation rate_pct must be NULL (not 0) when there are no sessioned users yet');
assert.match(sql, /'instrumentation_since', totals\.instrumentation_since/,
  'the RPC must expose when instrumentation began so the client can distinguish "0%" from "not measurable yet"');
console.log('✅ 13: every rate is NULL (not 0) when its cohort is empty; instrumentation_since is exposed');

// ---------------------------------------------------------------------------
// 14-15: activation excludes passive viewing
// ---------------------------------------------------------------------------
assert.match(body, /activation_events AS \(\s*\n\s*SELECT DISTINCT user_id\s*\n\s*FROM public\.product_events\s*\n\s*WHERE event_type IN \('connection_requested', 'connection_accepted', 'message_sent'\)/,
  'activation must be defined over exactly connection_requested/connection_accepted/message_sent');
assert.doesNotMatch(bodyNoComments.match(/activation_events AS \([\s\S]*?\)/)[0], /person_viewed|opportunity_viewed|reflection_viewed/,
  'activation must never count a view-type event -- viewing alone is explicitly not activation');
console.log('✅ 14-15: activation is defined over real actions only, excluding all *_viewed events');

// ---------------------------------------------------------------------------
// 16-17: action -> 7-day-return cohort calculation includes sample size
// ---------------------------------------------------------------------------
assert.match(body, /action_cohorts AS \(/, 'a per-action return-signal cohort CTE must exist');
assert.match(body, /'connection_requested'::text AS action/);
assert.match(body, /'message_sent'::text,/);
assert.match(bodyNoComments, /SELECT\s*\n\s*action,\s*\n\s*did_n,\s*\n\s*did_retained_n,\s*\n\s*not_n,\s*\n\s*not_retained_n,/,
  'every return-signal row (row_to_json over this SELECT) must expose both cohort sample sizes (did_n/not_n), not just the percentages');
console.log('✅ 16-17: return-signal cohorts computed with explicit sample sizes (did_n/not_n)');

// ---------------------------------------------------------------------------
// 18: small cohorts do not produce misleading "return signal" claims
// ---------------------------------------------------------------------------
assert.match(body, /WHERE did_n >= p_min_cohort AND not_n >= p_min_cohort/,
  'a return-signal row must be suppressed entirely (both sides) unless both cohorts meet the minimum size');
assert.match(sql, /p_min_cohort integer DEFAULT 5/,
  'a conservative default minimum cohort size must be set and easy to find/change');
console.log('✅ 18: return signals below the minimum cohort size on either side are suppressed, not shown misleadingly');

// ---------------------------------------------------------------------------
// 19: this migration must not touch the existing network analytics RPC
// ---------------------------------------------------------------------------
assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.get_admin_network_analytics/,
  'this migration must not redefine get_admin_network_analytics -- retention is a separate, additive RPC');
console.log('✅ 19: existing get_admin_network_analytics is untouched by this migration');

console.log('✅ test-retention-analytics-sql passed');
