/**
 * ================================================================
 * EXPLAINABILITY — Opaque-by-Default Explanation Payloads
 * ================================================================
 * Stores compact "why" payloads for every ReportItem generated
 * by the Intelligence Engine.
 *
 * Design principle: results are opaque by default. A "?" UI
 * trigger will later call getWhy(why_key) to surface the payload.
 *
 * Storage:
 *   - In-memory Map (fast, cleared on page reload)
 *   - localStorage persistence for the most recent N payloads
 *     so explanations survive soft navigation/refresh cycles
 *
 * Payload shape:
 *   {
 *     why_key:   string,          — stable id (hash of content)
 *     label:     string,          — human-readable tag (e.g. "combo")
 *     factors:   string[],        — ranked contributing factors
 *     keywords:  string[],        — matched terms
 *     paths:     string[],        — graph paths (user->conn->member->project)
 *     signals:   Object,          — system-wide signal values used
 *     scores:    Object,          — sub-scores (alignment, momentum, etc.)
 *     generated_at: string,       — ISO timestamp
 *   }
 *
 * Public API:
 *   registerWhy(payload)  -> why_key
 *   getWhy(why_key)       -> payload | null
 *   clearExplainability() -> void  (dev/reset)
 * ================================================================
 */

const EXPLAIN_VERSION  = 1;
const LS_KEY           = `ch_explainability_v${EXPLAIN_VERSION}`;
const MAX_PERSIST      = 200;   // max payloads kept in localStorage

// ----------------------------------------------------------------
// In-memory store
// ----------------------------------------------------------------
const _store = new Map();   // why_key -> payload

// ----------------------------------------------------------------
// Stable string hash (djb2 variant, browser-safe)
// ----------------------------------------------------------------

function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h >>>= 0;   // keep 32-bit unsigned
  }
  return h.toString(36);   // compact alphanumeric
}

function _generateKey(payload) {
  // Build a deterministic representation from the most stable fields
  const repr = [
    payload.label || '',
    ...(payload.factors  || []).slice(0, 3),
    ...(payload.keywords || []).slice(0, 3),
  ].join('|');
  const base = _hash(repr);
  // Add a short timestamp component to guarantee uniqueness within a session
  const tsSuffix = Date.now().toString(36).slice(-4);
  return `why_${base}_${tsSuffix}`;
}

// ----------------------------------------------------------------
// localStorage persistence helpers
// ----------------------------------------------------------------

function _loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      if (p && p.why_key) _store.set(p.why_key, p);
    }
  } catch {
    // Stale or corrupted data — ignore and start fresh
  }
}

function _saveToStorage() {
  try {
    // Keep only the most recent MAX_PERSIST entries (sorted by generated_at)
    const all = [..._store.values()]
      .filter(p => p.generated_at)
      .sort((a, b) => (b.generated_at > a.generated_at ? 1 : -1))
      .slice(0, MAX_PERSIST);
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // Quota exceeded — skip persistence silently
  }
}

// Load existing payloads on module init
_loadFromStorage();

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Register a new explanation payload.
 *
 * @param {Object} payload
 * @param {string}   [payload.label]        — short category label
 * @param {string[]} [payload.factors]      — ranked explanatory factors
 * @param {string[]} [payload.keywords]     — matched keywords
 * @param {string[]} [payload.paths]        — graph path strings
 * @param {Object}   [payload.signals]      — system-wide signals used
 * @param {Object}   [payload.scores]       — sub-scores
 * @returns {string} why_key
 */
export function registerWhy(payload = {}) {
  const why_key = _generateKey(payload);
  const full = {
    ...payload,
    why_key,
    generated_at: new Date().toISOString(),
  };
  _store.set(why_key, full);
  // Debounce storage writes to avoid hammering localStorage
  if (!_store._saveScheduled) {
    _store._saveScheduled = true;
    setTimeout(() => {
      _saveToStorage();
      _store._saveScheduled = false;
    }, 500);
  }
  return why_key;
}

/**
 * Retrieve a previously registered explanation payload.
 *
 * @param {string} why_key
 * @returns {Object|null}
 */
export function getWhy(why_key) {
  if (!why_key) return null;
  return _store.get(why_key) || null;
}

/**
 * Clear all stored explanations (in-memory + localStorage).
 * For dev/reset use only.
 */
export function clearExplainability() {
  _store.clear();
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ----------------------------------------------------------------
// Expose minimal window API for non-module contexts
// ----------------------------------------------------------------
window.__explainability = { registerWhy, getWhy, clearExplainability };
