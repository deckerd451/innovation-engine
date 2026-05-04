// ================================================================
// NEARIFY → INNOVATION ENGINE: Ingestion Client
// ================================================================
// Lightweight client for sending event interactions from Nearify
// (web or iOS) to the Innovation Engine backend.
//
// Identity contract:
//   - Accepts auth IDs or community IDs (backend resolves)
//   - interaction_edges and connections use community.id
//
// Usage:
//   import { sendInteraction, sendQRConfirmedConnection } from './nearify-ingestion-client.js';
//
//   // QR-confirmed (creates durable connection)
//   await sendQRConfirmedConnection({
//     eventId: '...',
//     fromCommunityId: '...',
//     toCommunityId: '...',
//   });
//
//   // BLE proximity (suggested edge only)
//   await sendInteraction({
//     eventId: '...',
//     fromCommunityId: '...',
//     toCommunityId: '...',
//     signalType: 'ble_proximity',
//     confidence: 35,
//     meta: { overlap_seconds: 180 },
//   });
// ================================================================

const LOG_PREFIX = '📡 [NEARIFY-INGEST]';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Detect source platform
 */
function getSourcePlatform() {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'nearify-ios';
  }
  return 'nearify-web';
}

/**
 * Sleep helper for retries
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send an interaction to the Innovation Engine ingestion endpoint.
 *
 * @param {Object} params
 * @param {string} params.eventId - Event UUID (required)
 * @param {string} [params.fromAuthUserId] - Auth user ID of initiator
 * @param {string} [params.toAuthUserId] - Auth user ID of target
 * @param {string} [params.fromCommunityId] - Community ID of initiator
 * @param {string} [params.toCommunityId] - Community ID of target
 * @param {string} [params.signalType='proximity'] - Signal type
 * @param {number} [params.confidence=50] - Confidence 0-100
 * @param {string} [params.occurredAt] - ISO timestamp
 * @param {Object} [params.meta={}] - Additional metadata
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function sendInteraction({
  eventId,
  fromAuthUserId = null,
  toAuthUserId = null,
  fromCommunityId = null,
  toCommunityId = null,
  fromNearifyId = null,
  toNearifyId = null,
  signalType = 'proximity',
  confidence = 50,
  occurredAt = null,
  meta = {},
} = {}) {
  if (!eventId) {
    console.error(LOG_PREFIX, 'Missing eventId');
    return { success: false, error: 'eventId is required' };
  }

  if (!fromCommunityId && !fromAuthUserId && !fromNearifyId) {
    console.error(LOG_PREFIX, 'Must provide fromCommunityId, fromAuthUserId, or fromNearifyId');
    return { success: false, error: 'from_user identity required' };
  }

  if (!toCommunityId && !toAuthUserId && !toNearifyId) {
    console.error(LOG_PREFIX, 'Must provide toCommunityId, toAuthUserId, or toNearifyId');
    return { success: false, error: 'to_user identity required' };
  }

  const supabase = window.supabase;
  if (!supabase) {
    console.error(LOG_PREFIX, 'Supabase client not available');
    return { success: false, error: 'Supabase not initialized' };
  }

  // Build enriched meta
  const enrichedMeta = {
    ...meta,
    source: getSourcePlatform(),
    source_version: '1.0.0',
    signal_type: signalType,
    qr_confirmed: signalType === 'qr_confirmed',
  };

  const payload = {
    p_event_id: eventId,
    p_from_auth_user_id: fromAuthUserId || null,
    p_to_auth_user_id: toAuthUserId || null,
    p_from_community_id: fromCommunityId || null,
    p_to_community_id: toCommunityId || null,
    p_from_nearify_id: fromNearifyId || null,
    p_to_nearify_id: toNearifyId || null,
    p_signal_type: signalType,
    p_confidence: confidence,
    p_occurred_at: occurredAt || new Date().toISOString(),
    p_meta: enrichedMeta,
  };

  // Retry loop
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(LOG_PREFIX, `Sending interaction (attempt ${attempt}/${MAX_RETRIES}):`, signalType);

      const { data, error } = await supabase.rpc('ingest_nearify_interaction', payload);

      if (error) {
        console.warn(LOG_PREFIX, `RPC error (attempt ${attempt}):`, error.message || error);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, error: error.message || 'RPC failed' };
      }

      // RPC returns JSONB — parse if needed
      const result = typeof data === 'string' ? JSON.parse(data) : data;

      if (result?.success) {
        console.log(LOG_PREFIX, '✅ Interaction ingested:', {
          edgeId: result.edge_id,
          edgeCreated: result.edge_created,
          connectionPromoted: result.connection_promoted,
        });
      } else {
        console.warn(LOG_PREFIX, '⚠️ Ingestion returned failure:', result?.error);
      }

      return { success: !!result?.success, data: result };

    } catch (ex) {
      console.warn(LOG_PREFIX, `Exception (attempt ${attempt}):`, ex);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      return { success: false, error: ex.message || 'Network error' };
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Convenience: Send a QR-confirmed interaction (promotes to durable connection).
 *
 * @param {Object} params
 * @param {string} params.eventId - Event UUID
 * @param {string} [params.fromCommunityId] - Initiator community ID
 * @param {string} [params.toCommunityId] - Target community ID
 * @param {string} [params.fromAuthUserId] - Initiator auth ID (fallback)
 * @param {string} [params.toAuthUserId] - Target auth ID (fallback)
 * @param {Object} [params.meta] - Extra metadata
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function sendQRConfirmedConnection({
  eventId,
  fromCommunityId = null,
  toCommunityId = null,
  fromAuthUserId = null,
  toAuthUserId = null,
  fromNearifyId = null,
  toNearifyId = null,
  meta = {},
} = {}) {
  console.log(LOG_PREFIX, '🔗 Sending QR-confirmed connection…');

  return sendInteraction({
    eventId,
    fromCommunityId,
    toCommunityId,
    fromAuthUserId,
    toAuthUserId,
    fromNearifyId,
    toNearifyId,
    signalType: 'qr_confirmed',
    confidence: 100,
    meta: { ...meta, qr_confirmed: true },
  });
}

/**
 * Convenience: Send a BLE proximity interaction (suggested edge only).
 *
 * @param {Object} params
 * @param {string} params.eventId - Event UUID
 * @param {string} [params.fromCommunityId] - Initiator community ID
 * @param {string} [params.toCommunityId] - Target community ID
 * @param {number} [params.overlapSeconds] - BLE overlap duration
 * @param {number} [params.confidence] - Confidence 0-100
 * @param {Object} [params.meta] - Extra metadata
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function sendBLEProximity({
  eventId,
  fromCommunityId = null,
  toCommunityId = null,
  fromNearifyId = null,
  toNearifyId = null,
  overlapSeconds = 0,
  confidence = 30,
  meta = {},
} = {}) {
  return sendInteraction({
    eventId,
    fromCommunityId,
    toCommunityId,
    fromNearifyId,
    toNearifyId,
    signalType: 'ble_proximity',
    confidence,
    meta: { ...meta, overlap_seconds: overlapSeconds },
  });
}

// Expose globally for non-module callers (Nearify iOS WebView, etc.)
// fromNearifyId / toNearifyId are the primary identity params when
// Nearify user IDs differ from Innovation Engine community IDs.
if (typeof window !== 'undefined') {
  window.NearifyIngestion = {
    sendInteraction,
    sendQRConfirmedConnection,
    sendBLEProximity,
  };
}

export default {
  sendInteraction,
  sendQRConfirmedConnection,
  sendBLEProximity,
};
