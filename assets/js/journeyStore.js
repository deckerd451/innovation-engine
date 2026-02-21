/**
 * ================================================================
 * JOURNEY STORE — Private Behavioral Journey (localStorage)
 * ================================================================
 * Tracks the user's local interaction history so the Intelligence
 * Engine can detect patterns, repeated interest signals, and
 * behavior shifts without any server-side writes.
 *
 * Storage: localStorage only.
 * Privacy: All data stays on-device. No PII beyond nodeId references.
 * Versioning: JOURNEY_VERSION bump clears stale data automatically.
 *
 * Public API:
 *   recordInteraction({ nodeId, nodeType, interactionType, ts? })
 *   saveNode({ nodeId, nodeType, ts? })
 *   dismissNode({ nodeId, nodeType, ts? })
 *   getJourneySnapshot({ days? })
 *   getLastReportAt()
 *   setLastReportAt(ts)
 *   clearJourney()          — for dev/reset
 * ================================================================
 */

const JOURNEY_VERSION = 1;
const LS_INTERACTIONS  = `ch_journey_v${JOURNEY_VERSION}_interactions`;
const LS_SAVES         = `ch_journey_v${JOURNEY_VERSION}_saves`;
const LS_DISMISSALS    = `ch_journey_v${JOURNEY_VERSION}_dismissals`;
const LS_LAST_REPORT   = `ch_journey_v${JOURNEY_VERSION}_last_report_at`;

// Max entries kept in localStorage to prevent unbounded growth
const MAX_INTERACTIONS = 2000;
const MAX_SAVES        = 500;
const MAX_DISMISSALS   = 500;

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function _readArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _writeArray(key, arr, maxLen = MAX_INTERACTIONS) {
  try {
    // Trim to max, keeping newest (end of array)
    const trimmed = arr.length > maxLen ? arr.slice(arr.length - maxLen) : arr;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    // localStorage quota exceeded — drop oldest third and retry
    try {
      const half = Math.floor(arr.length / 3);
      localStorage.setItem(key, JSON.stringify(arr.slice(half)));
    } catch {
      // If still failing, give up silently
    }
  }
}

function _nowIso() {
  return new Date().toISOString();
}

function _cutoffTs(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// ----------------------------------------------------------------
// recordInteraction
// ----------------------------------------------------------------

/**
 * Record any interaction (view, hover, click, inspect, etc.).
 * @param {Object} opts
 * @param {string} opts.nodeId          — stable entity id
 * @param {string} opts.nodeType        — "project"|"opportunity"|"theme"|"person"|"org"|etc.
 * @param {string} opts.interactionType — "view"|"inspect"|"hover"|"apply"|"share"|etc.
 * @param {string} [opts.ts]            — ISO timestamp (defaults to now)
 */
export function recordInteraction({ nodeId, nodeType, interactionType, ts } = {}) {
  if (!nodeId || !nodeType || !interactionType) return;
  const interactions = _readArray(LS_INTERACTIONS);
  interactions.push({
    nodeId: String(nodeId),
    nodeType: String(nodeType),
    interactionType: String(interactionType),
    ts: ts || _nowIso(),
  });
  _writeArray(LS_INTERACTIONS, interactions, MAX_INTERACTIONS);
}

// ----------------------------------------------------------------
// saveNode
// ----------------------------------------------------------------

/**
 * Mark a node as explicitly saved/bookmarked by the user.
 * @param {Object} opts
 * @param {string} opts.nodeId
 * @param {string} opts.nodeType
 * @param {string} [opts.ts]
 */
export function saveNode({ nodeId, nodeType, ts } = {}) {
  if (!nodeId || !nodeType) return;
  const saves = _readArray(LS_SAVES);
  // De-duplicate: update ts if already saved
  const existing = saves.findIndex(s => s.nodeId === String(nodeId) && s.nodeType === String(nodeType));
  const entry = { nodeId: String(nodeId), nodeType: String(nodeType), ts: ts || _nowIso() };
  if (existing >= 0) {
    saves[existing] = entry;
  } else {
    saves.push(entry);
  }
  _writeArray(LS_SAVES, saves, MAX_SAVES);
}

// ----------------------------------------------------------------
// dismissNode
// ----------------------------------------------------------------

/**
 * Mark a node as explicitly dismissed by the user.
 * @param {Object} opts
 * @param {string} opts.nodeId
 * @param {string} opts.nodeType
 * @param {string} [opts.ts]
 */
export function dismissNode({ nodeId, nodeType, ts } = {}) {
  if (!nodeId || !nodeType) return;
  const dismissals = _readArray(LS_DISMISSALS);
  dismissals.push({
    nodeId: String(nodeId),
    nodeType: String(nodeType),
    ts: ts || _nowIso(),
  });
  _writeArray(LS_DISMISSALS, dismissals, MAX_DISMISSALS);
}

// ----------------------------------------------------------------
// getJourneySnapshot
// ----------------------------------------------------------------

/**
 * Returns a summary of recent journey data useful to the engine.
 * @param {Object} opts
 * @param {number} [opts.days=14]  — look-back window
 * @returns {JourneySnapshot}
 */
export function getJourneySnapshot({ days = 14 } = {}) {
  const cutoff = _cutoffTs(days);
  const prevCutoff = _cutoffTs(days * 2);   // for shift comparison

  const interactions = _readArray(LS_INTERACTIONS);
  const saves        = _readArray(LS_SAVES);
  const dismissals   = _readArray(LS_DISMISSALS);

  // Filter to window
  const recent = interactions.filter(i => i.ts >= cutoff);
  const prev   = interactions.filter(i => i.ts >= prevCutoff && i.ts < cutoff);

  // --- Node view counts (recent window) ---
  const nodeViewCounts = {};   // nodeId -> count
  const nodeTypeCounts = {};   // nodeType -> count
  const themeIds       = new Set();

  for (const i of recent) {
    nodeViewCounts[i.nodeId] = (nodeViewCounts[i.nodeId] || 0) + 1;
    nodeTypeCounts[i.nodeType] = (nodeTypeCounts[i.nodeType] || 0) + 1;
    if (i.nodeType === 'theme') themeIds.add(i.nodeId);
  }

  // --- Repeated nodes (viewed 2+ times in window) ---
  const repeatedNodes = Object.entries(nodeViewCounts)
    .filter(([, c]) => c >= 2)
    .map(([nodeId, count]) => {
      const lastEntry = [...recent].reverse().find(i => i.nodeId === nodeId);
      return { nodeId, count, nodeType: lastEntry?.nodeType || 'unknown' };
    })
    .sort((a, b) => b.count - a.count);

  // --- Most-visited node types ---
  const topNodeTypes = Object.entries(nodeTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([nodeType, count]) => ({ nodeType, count }));

  // --- Shift detection: compare recent vs prior window ---
  const prevNodeTypeCounts = {};
  for (const i of prev) {
    prevNodeTypeCounts[i.nodeType] = (prevNodeTypeCounts[i.nodeType] || 0) + 1;
  }
  const shifts = [];
  for (const [nodeType, recentCount] of Object.entries(nodeTypeCounts)) {
    const priorCount = prevNodeTypeCounts[nodeType] || 0;
    if (recentCount > priorCount * 1.5 && recentCount >= 3) {
      shifts.push({ nodeType, recentCount, priorCount, direction: 'up' });
    } else if (priorCount > recentCount * 1.5 && priorCount >= 3) {
      shifts.push({ nodeType, recentCount, priorCount, direction: 'down' });
    }
  }

  // --- Saved nodes ---
  const savedRecent = saves.filter(s => s.ts >= cutoff);
  const savedIds    = new Set(saves.map(s => s.nodeId));

  // --- Dismissed node ids ---
  const dismissedIds = new Set(dismissals.map(d => d.nodeId));

  // --- Theme engagement ---
  const visitedThemeIds = [...themeIds];

  return {
    windowDays: days,
    totalInteractions: recent.length,
    nodeViewCounts,       // { [nodeId]: count }
    topNodeTypes,         // [{ nodeType, count }]
    repeatedNodes,        // [{ nodeId, count, nodeType }]
    visitedThemeIds,      // string[]
    savedIds,             // Set<string>
    dismissedIds,         // Set<string>
    savedRecent,          // [{nodeId, nodeType, ts}]
    shifts,               // [{ nodeType, recentCount, priorCount, direction }]
    hasHistory: recent.length > 0,
  };
}

// ----------------------------------------------------------------
// Last report tracking
// ----------------------------------------------------------------

/**
 * Get ISO timestamp of the last brief that was generated.
 * @returns {string|null}
 */
export function getLastReportAt() {
  try {
    return localStorage.getItem(LS_LAST_REPORT) || null;
  } catch {
    return null;
  }
}

/**
 * Set the timestamp of the last generated brief.
 * @param {string} ts — ISO timestamp
 */
export function setLastReportAt(ts) {
  try {
    localStorage.setItem(LS_LAST_REPORT, ts || new Date().toISOString());
  } catch {
    // Ignore quota errors
  }
}

// ----------------------------------------------------------------
// Dev helpers
// ----------------------------------------------------------------

/**
 * Wipe all journey data. For dev/reset purposes only.
 */
export function clearJourney() {
  try {
    localStorage.removeItem(LS_INTERACTIONS);
    localStorage.removeItem(LS_SAVES);
    localStorage.removeItem(LS_DISMISSALS);
    localStorage.removeItem(LS_LAST_REPORT);
  } catch {
    // Ignore
  }
}

// ----------------------------------------------------------------
// Expose minimal debug helper on window (non-module contexts)
// ----------------------------------------------------------------
window.__journeyStore = {
  recordInteraction,
  saveNode,
  dismissNode,
  getJourneySnapshot,
  getLastReportAt,
  setLastReportAt,
  clearJourney,
};
