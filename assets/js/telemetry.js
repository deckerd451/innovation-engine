// ================================================================
// PRODUCT TELEMETRY (retention/engagement instrumentation)
// ================================================================
// Minimal first-party session + event logging so Admin Analytics can
// answer "are users coming back, and what's associated with it" --
// nothing else. Writes to public.product_sessions / public.product_events
// (see supabase/sql/migrations/20260820_retention_instrumentation.sql).
//
// Hard rules this file exists to enforce for every caller:
//   - No anonymous tracking: logEvent() is a no-op until a real auth user
//     is known.
//   - No content/URLs/device fingerprints are ever sent -- only
//     event_type + a narrow (entity_type, entity_id) pointer.
//   - Telemetry NEVER throws into the caller and NEVER blocks the calling
//     action -- every Supabase call here is fire-and-forget with its own
//     catch. A failed insert is invisible to the user; nothing else in the
//     app depends on it succeeding.
//   - Not a heartbeat: this does not write on every mousemove/scroll/graph
//     interaction. A new DB row is written once per new session, once per
//     meaningful product action, and (throttled, at most every 5 minutes)
//     to extend an existing session's activity window.

const SESSION_STORAGE_KEY = 'ie_product_session_v1';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity -> new session
const ACTIVITY_EXTEND_THROTTLE_MS = 5 * 60 * 1000; // at most one DB write per 5 min to extend a session

let _supabase = null;
let _userId = null; // auth.users.id -- the canonical identity for all telemetry
let _communityId = null; // public.community.id, for joins only
let _sessionId = null;
let _lastActivityWriteAt = 0;
let _sessionPromise = null;

// De-dupes view-type events within the current page load only (a fresh
// page load is a legitimate new "view"; a rerender of the same panel for
// the same entity within the same load is not).
const _loggedThisPageLoad = new Set();

function _debugWarn(...args) {
  try {
    if (window.log?.isDebugMode?.() || window.__DEBUG_TELEMETRY__) {
      console.warn('[telemetry]', ...args);
    }
  } catch (_) {
    // even the debug check must never throw
  }
}

function _readCachedSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId || !parsed?.userId || !parsed?.lastActivityAt) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function _writeCachedSession(sessionId, userId, lastActivityAt) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ sessionId, userId, lastActivityAt }));
  } catch (_) {
    // localStorage unavailable (private mode, quota, etc.) -- session just
    // won't be resumed across page loads; still fine, worst case is an
    // extra session_started next load.
  }
}

/**
 * Ensure a session exists for the current user, creating one if the last
 * known activity is stale (>30min) or none is cached. Idempotent to call
 * repeatedly; concurrent calls share one in-flight creation.
 * @returns {Promise<string|null>} session id, or null if not trackable right now
 */
async function _ensureSession() {
  if (!_supabase || !_userId) return null;
  if (_sessionPromise) return _sessionPromise;

  const now = Date.now();
  const cached = _readCachedSession();

  if (cached && cached.userId === _userId && (now - cached.lastActivityAt) < SESSION_TIMEOUT_MS) {
    _sessionId = cached.sessionId;
    if (now - _lastActivityWriteAt > ACTIVITY_EXTEND_THROTTLE_MS) {
      _lastActivityWriteAt = now;
      _writeCachedSession(_sessionId, _userId, now);
      _supabase
        .from('product_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', _sessionId)
        .then(
          () => {},
          (err) => _debugWarn('session extend failed', err)
        );
    } else {
      _writeCachedSession(_sessionId, _userId, now);
    }
    return _sessionId;
  }

  _sessionPromise = (async () => {
    try {
      const { data, error } = await _supabase
        .from('product_sessions')
        .insert({ user_id: _userId, community_id: _communityId })
        .select('id')
        .single();

      if (error) throw error;

      _sessionId = data.id;
      _lastActivityWriteAt = Date.now();
      _writeCachedSession(_sessionId, _userId, _lastActivityWriteAt);
      _logRaw('session_started', {});
      return _sessionId;
    } catch (err) {
      _debugWarn('session create failed', err);
      return null;
    } finally {
      _sessionPromise = null;
    }
  })();

  return _sessionPromise;
}

async function _logRaw(eventType, { entityType = null, entityId = null } = {}) {
  if (!_supabase || !_userId) return;
  try {
    const { error } = await _supabase.from('product_events').insert({
      user_id: _userId,
      community_id: _communityId,
      session_id: _sessionId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
    });
    if (error) throw error;
  } catch (err) {
    _debugWarn('event insert failed', eventType, err);
  }
}

/**
 * Log a meaningful product action. Safe to call from anywhere -- never
 * throws, never awaited by callers for correctness (fire-and-forget).
 *
 * @param {string} eventType - one of the fixed event_type values enforced
 *   by the DB CHECK constraint (see the migration).
 * @param {object} [options]
 * @param {string} [options.entityType] - e.g. 'person' | 'opportunity'
 * @param {string} [options.entityId] - the id of that entity
 * @param {string} [options.dedupeKey] - when set, this exact
 *   (eventType, dedupeKey) pair is only logged once per page load --
 *   use for view-type events that can rerender (person_viewed,
 *   opportunity_viewed, reflection_viewed).
 */
export async function logEvent(eventType, options = {}) {
  try {
    if (!_userId) return; // no anonymous tracking, ever

    if (options.dedupeKey) {
      const key = `${eventType}:${options.dedupeKey}`;
      if (_loggedThisPageLoad.has(key)) return;
      _loggedThisPageLoad.add(key);
    }

    await _ensureSession();
    await _logRaw(eventType, options);
  } catch (err) {
    // Belt-and-suspenders: logEvent must be unconditionally safe to call
    // from any product code path.
    _debugWarn('logEvent failed', eventType, err);
  }
}

function _init(user, profile) {
  _supabase = window.supabase;
  _userId = user?.id || null;
  _communityId = profile?.id || null;
  if (!_supabase || !_userId) return;
  _ensureSession();
}

window.addEventListener('profile-loaded', (e) => {
  _init(e.detail?.user || window.currentAuthUser, e.detail?.profile || window.currentUserProfile);
});

// This module is injected post-AUTH_READY (see index.html's AUTH_MODULES
// loader), which can race with auth.js's profile-loaded dispatch -- the
// event may have already fired before this listener was registered. Use
// whatever's already on window in that case (same pattern as
// admin-analytics.js).
if (window.currentAuthUser && window.currentUserProfile) {
  _init(window.currentAuthUser, window.currentUserProfile);
}

window.addEventListener('user-logged-out', () => {
  _userId = null;
  _communityId = null;
  _sessionId = null;
  _sessionPromise = null;
  _loggedThisPageLoad.clear();
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (_) {}
});

// Global for non-module callers (messaging.js, start-daily-digest.js, and
// any inline handler) -- module callers may also `import { logEvent }`.
window.Telemetry = { logEvent };

console.log('%c📈 Telemetry ready', 'color:#888');
