// =============================================================
// CharlestonHacks Innovation Engine — Avatar URL Utilities
// Reduces Supabase bandwidth by requesting appropriately sized
// images for each rendering context.
//
// Usage:
//   import { getGraphAvatarUrl, getCardAvatarUrl, getProfileAvatarUrl } from './avatar-utils.js';
//
//   getGraphAvatarUrl(user)    → 64×64  — network graph nodes only
//   getCardAvatarUrl(user)     → 128×128 — attendee cards / lists
//   getProfileAvatarUrl(user)  → original — profile detail / modal
//
// Supabase image transforms are used when the URL is a Supabase
// storage object URL. All other URLs are returned unchanged.
// =============================================================

const SUPABASE_URL = "https://mqbsjlgnsirqsmfnreqd.supabase.co";
const STORAGE_OBJECT_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/`;
const STORAGE_RENDER_PREFIX = `${SUPABASE_URL}/storage/v1/render/image/public/`;

/**
 * Apply a Supabase image transform to a storage URL.
 * Returns the original URL unchanged for non-Supabase URLs.
 * @param {string|null} url
 * @param {number} width
 * @param {number} height
 * @returns {string|null}
 */
function withTransform(url, width, height) {
  if (!url) return url;
  if (url.startsWith(STORAGE_OBJECT_PREFIX)) {
    const path = url.slice(STORAGE_OBJECT_PREFIX.length);
    return `${STORAGE_RENDER_PREFIX}${path}?width=${width}&height=${height}&resize=cover`;
  }
  // Not a Supabase storage URL — return as-is (e.g. OAuth provider avatars)
  return url;
}

/**
 * Resolve the raw image URL from a user/node object.
 * Checks common field names in priority order.
 * @param {object|null} user
 * @returns {string|null}
 */
function resolveBaseUrl(user) {
  if (!user) return null;
  return user.image_url || user.imageUrl || user.avatar_url || null;
}

/**
 * Graph avatar — 64×64px
 * Use ONLY for network graph nodes to minimise bandwidth during
 * real-time graph rendering.
 * @param {object} user
 * @returns {string|null}
 */
export function getGraphAvatarUrl(user) {
  return withTransform(resolveBaseUrl(user), 64, 64);
}

/**
 * Card avatar — 128×128px
 * Use for attendee cards, discovery lists, messaging threads, etc.
 * @param {object} user
 * @returns {string|null}
 */
export function getCardAvatarUrl(user) {
  return withTransform(resolveBaseUrl(user), 128, 128);
}

/**
 * Profile avatar — original full image
 * Use only in the dedicated profile page or full-screen modal.
 * @param {object} user
 * @returns {string|null}
 */
export function getProfileAvatarUrl(user) {
  return resolveBaseUrl(user);
}
