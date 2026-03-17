/**
 * ================================================================
 * EVENT INTELLIGENCE — Shared Event-Derived Signal Access
 * ================================================================
 * Central module for reading iOS-generated event interaction data
 * from the shared Supabase tables (presence_sessions, interaction_edges,
 * beacons) and exposing it as intelligence-grade signals.
 *
 * This module does NOT write to any table. It is read-only.
 * It uses the existing singleton Supabase client (window.supabase).
 *
 * Public API:
 *   fetchEventInteractions({ lookbackHours?, limit? })
 *   fetchActiveBeaconPresence({ onlyActive? })
 *   resolveBeaconLabel(beaconId)
 *   getEventMetForUser(communityId, { lookbackHours? })
 *   formatProximityDuration(overlapSeconds)
 *   buildExplainabilityText(edge, beaconLabel)
 *   invalidateCache()
 * ================================================================
 */

const EVENT_INTEL_VERSION = 1;

// Cache TTLs
const INTERACTION_CACHE_TTL = 60_000;   // 1 minute
const PRESENCE_CACHE_TTL    = 30_000;   // 30 seconds
const BEACON_CACHE_TTL      = 300_000;  // 5 minutes

// Internal caches
let _interactionCache = { data: null, fetchedAt: 0 };
let _presenceCache    = { data: null, fetchedAt: 0 };
let _beaconCache      = new Map(); // beaconId -> { label, fetchedAt }

// ================================================================
// FETCH: Event-derived interaction edges
// ================================================================

/**
 * Fetch suggested BLE proximity edges from interaction_edges.
 * These are iOS-generated records where type='ble_proximity' and status='suggested'.
 *
 * @param {Object} opts
 * @param {number} opts.lookbackHours - How far back to look (default 72)
 * @param {number} opts.limit - Max rows (default 200)
 * @returns {Promise<Array>} interaction edge rows
 */
export async function fetchEventInteractions({ lookbackHours = 72, limit = 200 } = {}) {
  const now = Date.now();
  if (_interactionCache.data && (now - _interactionCache.fetchedAt) < INTERACTION_CACHE_TTL) {
    return _interactionCache.data;
  }

  const supabase = window.supabase;
  if (!supabase) {
    console.warn('[EventIntel] No supabase client');
    return [];
  }

  try {
    const cutoff = new Date(now - lookbackHours * 3600_000).toISOString();

    const { data, error } = await supabase
      .from('interaction_edges')
      .select('id, from_user_id, to_user_id, created_at, status, type, beacon_id, overlap_seconds, confidence, meta')
      .eq('type', 'ble_proximity')
      .eq('status', 'suggested')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[EventIntel] interaction_edges query error:', error.message);
      return _interactionCache.data || [];
    }

    _interactionCache = { data: data || [], fetchedAt: now };
    return _interactionCache.data;
  } catch (err) {
    console.warn('[EventIntel] interaction_edges fetch threw:', err.message);
    return _interactionCache.data || [];
  }
}

// ================================================================
// FETCH: Active beacon presence sessions
// ================================================================

/**
 * Fetch beacon-scoped presence sessions.
 * Returns users currently (or recently) present at event beacons.
 *
 * @param {Object} opts
 * @param {boolean} opts.onlyActive - Only return non-expired sessions (default true)
 * @returns {Promise<Array>} presence session rows
 */
export async function fetchActiveBeaconPresence({ onlyActive = true } = {}) {
  const now = Date.now();
  if (_presenceCache.data && (now - _presenceCache.fetchedAt) < PRESENCE_CACHE_TTL) {
    return _presenceCache.data;
  }

  const supabase = window.supabase;
  if (!supabase) return [];

  try {
    let query = supabase
      .from('presence_sessions')
      .select('id, user_id, context_type, context_id, energy, expires_at, is_active, last_seen, created_at')
      .eq('context_type', 'beacon');

    if (onlyActive) {
      query = query.gt('expires_at', new Date().toISOString());
    }

    const { data, error } = await query.limit(300);

    if (error) {
      console.warn('[EventIntel] presence_sessions query error:', error.message);
      return _presenceCache.data || [];
    }

    _presenceCache = { data: data || [], fetchedAt: now };
    return _presenceCache.data;
  } catch (err) {
    console.warn('[EventIntel] presence_sessions fetch threw:', err.message);
    return _presenceCache.data || [];
  }
}

// ================================================================
// RESOLVE: Beacon label
// ================================================================

/**
 * Resolve a beacon_id to its human-readable label.
 * Uses BeaconRegistry if available, falls back to direct query with cache.
 *
 * @param {string} beaconId - UUID of the beacon
 * @returns {Promise<string|null>} beacon label or null
 */
export async function resolveBeaconLabel(beaconId) {
  if (!beaconId) return null;

  // Try BeaconRegistry first (already loaded in memory)
  if (window.BeaconRegistry) {
    const cached = window.BeaconRegistry.getBeaconById(beaconId);
    if (cached) return cached.label || null;
  }

  // Check local cache
  const now = Date.now();
  const entry = _beaconCache.get(beaconId);
  if (entry && (now - entry.fetchedAt) < BEACON_CACHE_TTL) {
    return entry.label;
  }

  // Direct query
  const supabase = window.supabase;
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('beacons')
      .select('label')
      .eq('id', beaconId)
      .single();

    if (error || !data) {
      _beaconCache.set(beaconId, { label: null, fetchedAt: now });
      return null;
    }

    _beaconCache.set(beaconId, { label: data.label, fetchedAt: now });
    return data.label;
  } catch {
    return null;
  }
}

// ================================================================
// QUERY: People the current user "met" at events
// ================================================================

/**
 * Get event-derived interaction edges involving a specific user.
 * Returns edges where the user is from_user_id or to_user_id,
 * enriched with beacon labels.
 *
 * @param {string} communityId - The user's community.id
 * @param {Object} opts
 * @param {number} opts.lookbackHours - How far back (default 72)
 * @returns {Promise<Array>} enriched edges with { ...edge, otherUserId, beaconLabel }
 */
export async function getEventMetForUser(communityId, { lookbackHours = 72 } = {}) {
  if (!communityId) return [];

  const edges = await fetchEventInteractions({ lookbackHours });

  // Filter to edges involving this user
  const userEdges = edges.filter(
    e => e.from_user_id === communityId || e.to_user_id === communityId
  );

  // Enrich with beacon labels (batch-resolve unique beacon IDs)
  const uniqueBeaconIds = [...new Set(userEdges.map(e => e.beacon_id).filter(Boolean))];
  const labelMap = new Map();
  await Promise.all(
    uniqueBeaconIds.map(async (bid) => {
      const label = await resolveBeaconLabel(bid);
      if (label) labelMap.set(bid, label);
    })
  );

  return userEdges.map(edge => ({
    ...edge,
    otherUserId: edge.from_user_id === communityId ? edge.to_user_id : edge.from_user_id,
    beaconLabel: labelMap.get(edge.beacon_id) || null,
  }));
}

// ================================================================
// HELPERS: Explainability text builders
// ================================================================

/**
 * Format overlap seconds into a human-readable duration string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatProximityDuration(seconds) {
  if (!seconds || seconds <= 0) return 'briefly';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/**
 * Build explainability text fragments for an event-derived edge.
 * Returns an array of human-readable strings suitable for UI display.
 *
 * @param {Object} edge - interaction edge (with optional beaconLabel)
 * @param {string} [beaconLabel] - override beacon label
 * @returns {string[]} explainability lines
 */
export function buildExplainabilityText(edge, beaconLabel) {
  const lines = [];
  const label = beaconLabel || edge.beaconLabel;

  if (label) {
    lines.push(`Met at ${label}`);
  }

  if (edge.overlap_seconds && edge.overlap_seconds > 0) {
    lines.push(`Nearby for ${formatProximityDuration(edge.overlap_seconds)}`);
  }

  if (edge.confidence && edge.confidence >= 0.8) {
    lines.push('High-confidence proximity signal');
  } else if (edge.confidence && edge.confidence >= 0.5) {
    lines.push('Moderate proximity signal');
  }

  lines.push('Suggested follow-up');

  return lines;
}

// ================================================================
// CACHE MANAGEMENT
// ================================================================

/**
 * Invalidate all caches. Call when switching users or on manual refresh.
 */
export function invalidateCache() {
  _interactionCache = { data: null, fetchedAt: 0 };
  _presenceCache    = { data: null, fetchedAt: 0 };
  _beaconCache.clear();
}

console.log(`✅ EventIntelligence v${EVENT_INTEL_VERSION} loaded`);
