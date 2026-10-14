#!/usr/bin/env node

// Static contract regression for the RSVP/live-presence boundary. This keeps
// the cross-repository lifecycle explicit without creating production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ieRoot = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(ieRoot, 'supabase/sql/nearify_event_presence.sql'), 'utf8');
const migration = fs.readFileSync(path.join(ieRoot, 'supabase/sql/migrations/20260920_nearify_live_presence_boundary.sql'), 'utf8');
const recommendations = fs.readFileSync(path.join(ieRoot, 'supabase/sql/nearify_event_recommendations.sql'), 'utf8');
const mobile = fs.readFileSync(path.join(ieRoot, 'assets/js/nearify-mobile-context.js'), 'utf8');

assert.match(schema, /is_live\s+BOOLEAN\s+NOT NULL DEFAULT false/);
assert.match(schema, /set_nearify_event_live_presence/);
assert.match(schema, /c\.user_id = auth\.uid\(\) AND nep\.status = 'joined' AND nep\.is_live = true/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false/);
assert.doesNotMatch(migration, /UPDATE\s+public\.nearify_event_presence\s+SET\s+is_live\s*=\s*true/i);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /A left event cannot become live without rejoining/);
assert.match(recommendations, /nearify_event_id = p_nearify_event_id[\s\S]{0,120}is_live = true/);
assert.match(mobile, /\.eq\('is_live', true\)/);

// The iOS side lives in nearify-ios, a separate private repository. The
// committed contract excerpt is always checked, so clean checkouts (and CI)
// run deterministically. The real app is checked too whenever it is
// available: NEARIFY_IOS_ROOT if set (and then it must exist), otherwise a
// ../nearify-ios sibling checkout.
function assertNearifyContract(nearifyRoot) {
  const eventJoin = fs.readFileSync(path.join(nearifyRoot, 'Beacon/Services/EventJoinService.swift'), 'utf8');
  const bridge = fs.readFileSync(path.join(nearifyRoot, 'Beacon/Services/InnovationEngineBridgeService.swift'), 'utf8');
  assert.match(eventJoin, /setEventLivePresence[\s\S]{0,500}isLive: false/);
  assert.match(eventJoin, /setEventLivePresence[\s\S]{0,500}isLive: true/);
  assert.match(bridge, /rpc\("set_nearify_event_live_presence"/);
}

assertNearifyContract(path.join(__dirname, 'fixtures/nearify-ios'));

const explicitNearifyRoot = process.env.NEARIFY_IOS_ROOT;
const nearifyRoot = explicitNearifyRoot ? path.resolve(explicitNearifyRoot) : path.resolve(ieRoot, '../nearify-ios');
if (explicitNearifyRoot && !fs.existsSync(nearifyRoot)) {
  throw new Error(`NEARIFY_IOS_ROOT does not exist: ${nearifyRoot}`);
}
if (fs.existsSync(nearifyRoot)) {
  assertNearifyContract(nearifyRoot);
  console.log(`✅ test-nearify-live-presence-boundary passed (contract excerpt and nearify-ios at ${nearifyRoot})`);
} else {
  console.log('✅ test-nearify-live-presence-boundary passed (contract excerpt only; set NEARIFY_IOS_ROOT to also check the real app)');
}
