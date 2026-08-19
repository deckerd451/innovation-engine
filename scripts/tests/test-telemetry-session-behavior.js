#!/usr/bin/env node

// Regression coverage for assets/js/telemetry.js -- the client-side half of
// the retention/engagement instrumentation pass (server-side half covered
// by test-retention-analytics-sql.js). This file has no external imports
// (no supabase client import, unlike avatar-utils.js), so it is loaded via
// a real dynamic import with a minimal fake `window`/`localStorage`/
// `supabase` rather than a VM-sandbox transform.
//
// Covers PHASE 13 items 1, 2, 3, 4, 5, 6:
//   1. authenticated session creation
//   2. 30-minute session reuse / new-session boundary
//   3. anonymous users are not tracked
//   4. telemetry failure does not break the original product action
//   5. event identity uses canonical IDs (auth user_id), never name/email
//   6. duplicate renders do not generate duplicate meaningful events

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');

// --- Minimal window/localStorage/supabase stubs -----------------------

const localStorageStore = new Map();
global.localStorage = {
  getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
  setItem: (k, v) => localStorageStore.set(k, String(v)),
  removeItem: (k) => localStorageStore.delete(k),
};

// Node >=18 provides global EventTarget/Event/CustomEvent -- use the real
// thing so telemetry.js's own addEventListener/dispatchEvent calls behave
// exactly as they would in a browser.
global.window = new EventTarget();
global.window.log = undefined;
global.window.__DEBUG_TELEMETRY__ = false;

const calls = []; // every supabase call telemetry.js makes, for assertions -- reset between assertions below
let _nextRowId = 0; // independent of calls.length (which gets reset for per-step counting)
let insertBehavior = () => ({ data: { id: `row-${_nextRowId++}` }, error: null });

function makeFakeSupabase() {
  function fromTable(table) {
    return {
      insert(payload) {
        const record = { table, op: 'insert', payload };
        calls.push(record);
        const result = insertBehavior(table, payload);
        const thenable = {
          select() {
            return { single: () => Promise.resolve(result) };
          },
          then(onFulfilled, onRejected) {
            return Promise.resolve(result).then(onFulfilled, onRejected);
          },
          catch(onRejected) {
            return Promise.resolve(result).catch(onRejected);
          },
        };
        return thenable;
      },
      update(payload) {
        calls.push({ table, op: 'update', payload });
        return {
          eq(col, val) {
            calls.push({ table, op: 'update.eq', col, val });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
  }
  return { from: fromTable };
}

global.window.supabase = makeFakeSupabase();

(async () => {
  const telemetry = await import(pathToFileURL(path.join(root, 'assets/js/telemetry.js')).href);
  assert.equal(typeof telemetry.logEvent, 'function', 'telemetry.js must export logEvent');

  // --- 3: anonymous users are not tracked ---------------------------
  calls.length = 0;
  await telemetry.logEvent('person_viewed', { entityType: 'person', entityId: 'someone', dedupeKey: 'someone' });
  assert.equal(calls.length, 0, 'logEvent must be a total no-op with no authenticated user (no anonymous tracking)');
  console.log('✅ 3: anonymous users are not tracked');

  // --- 1: authenticated session creation ----------------------------
  const AUTH_USER_ID = '11111111-1111-1111-1111-111111111111';
  const COMMUNITY_ID = '22222222-2222-2222-2222-222222222222';

  calls.length = 0;
  window.dispatchEvent(new CustomEvent('profile-loaded', {
    detail: { user: { id: AUTH_USER_ID, email: 'person@example.com' }, profile: { id: COMMUNITY_ID, name: 'Ada Lovelace' } },
  }));
  // profile-loaded triggers session creation asynchronously (fire-and-forget) -- give it a tick.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  const sessionInserts = calls.filter(c => c.table === 'product_sessions' && c.op === 'insert');
  assert.equal(sessionInserts.length, 1, 'a new authenticated visit must create exactly one product_sessions row');
  assert.equal(sessionInserts[0].payload.user_id, AUTH_USER_ID, 'the session must be keyed by the auth user id');

  const sessionStartedEvents = calls.filter(c => c.table === 'product_events' && c.payload.event_type === 'session_started');
  assert.equal(sessionStartedEvents.length, 1, 'exactly one session_started event must be logged for a new session');
  console.log('✅ 1: authenticated session creation');

  // --- 5: event identity uses canonical IDs, never name/email --------
  calls.length = 0;
  await telemetry.logEvent('person_viewed', { entityType: 'person', entityId: COMMUNITY_ID, dedupeKey: 'p-identity-check' });
  const viewEvent = calls.find(c => c.table === 'product_events' && c.payload.event_type === 'person_viewed');
  assert.ok(viewEvent, 'person_viewed must be logged');
  assert.equal(viewEvent.payload.user_id, AUTH_USER_ID);
  assert.equal(viewEvent.payload.community_id, COMMUNITY_ID);
  const payloadKeys = Object.keys(viewEvent.payload);
  assert.ok(!payloadKeys.includes('name') && !payloadKeys.includes('email'),
    'event payloads must never carry name/email -- only canonical ids');
  console.log('✅ 5: event identity uses canonical IDs, never name/email');

  // --- 6: duplicate renders do not generate duplicate meaningful events
  calls.length = 0;
  await telemetry.logEvent('opportunity_viewed', { entityType: 'opportunity', entityId: 'opp-1', dedupeKey: 'opp-1' });
  await telemetry.logEvent('opportunity_viewed', { entityType: 'opportunity', entityId: 'opp-1', dedupeKey: 'opp-1' });
  await telemetry.logEvent('opportunity_viewed', { entityType: 'opportunity', entityId: 'opp-1', dedupeKey: 'opp-1' });
  const oppViews = calls.filter(c => c.table === 'product_events' && c.payload.event_type === 'opportunity_viewed');
  assert.equal(oppViews.length, 1, 'rerendering the same panel for the same entity must not duplicate the view event');

  // A different entity must still log its own event (dedupe is per-key, not global).
  await telemetry.logEvent('opportunity_viewed', { entityType: 'opportunity', entityId: 'opp-2', dedupeKey: 'opp-2' });
  const oppViewsAfter = calls.filter(c => c.table === 'product_events' && c.payload.event_type === 'opportunity_viewed');
  assert.equal(oppViewsAfter.length, 2, 'a different entity id must log its own event, not be suppressed by an unrelated dedupe key');
  console.log('✅ 6: duplicate renders do not generate duplicate meaningful events');

  // --- 2: 30-minute session reuse / new-session boundary --------------
  calls.length = 0;
  await telemetry.logEvent('person_viewed', { entityType: 'person', entityId: 'reuse-check', dedupeKey: 'reuse-check' });
  let reuseSessionInserts = calls.filter(c => c.table === 'product_sessions' && c.op === 'insert');
  assert.equal(reuseSessionInserts.length, 0, 'activity within the 30-minute window must reuse the existing session, not create a new one');

  // Age the cached session past the 30-minute boundary.
  const cacheKey = 'ie_product_session_v1';
  const cached = JSON.parse(localStorage.getItem(cacheKey));
  assert.ok(cached?.sessionId, 'a session must already be cached from the earlier profile-loaded dispatch');
  cached.lastActivityAt = Date.now() - 31 * 60 * 1000; // 31 minutes ago
  localStorage.setItem(cacheKey, JSON.stringify(cached));

  calls.length = 0;
  await telemetry.logEvent('person_viewed', { entityType: 'person', entityId: 'boundary-check', dedupeKey: 'boundary-check' });
  const newSessionInserts = calls.filter(c => c.table === 'product_sessions' && c.op === 'insert');
  assert.equal(newSessionInserts.length, 1, 'activity after >30 minutes of inactivity must create a new session');
  const newCached = JSON.parse(localStorage.getItem(cacheKey));
  assert.notEqual(newCached.sessionId, cached.sessionId, 'the new session must have a different id than the stale one');
  console.log('✅ 2: 30-minute session reuse / new-session boundary');

  // --- 4: telemetry failure does not break the original product action
  calls.length = 0;
  insertBehavior = () => ({ data: null, error: new Error('simulated DB outage') });
  let threw = false;
  try {
    await telemetry.logEvent('message_sent', { entityType: 'conversation', entityId: 'convo-1' });
  } catch (_) {
    threw = true;
  }
  assert.equal(threw, false, 'logEvent must never throw, even when every underlying insert fails');
  console.log('✅ 4: telemetry failure does not break the calling action');

  console.log('✅ test-telemetry-session-behavior passed');
})().catch(err => {
  console.error('❌ test-telemetry-session-behavior failed:', err);
  process.exit(1);
});
