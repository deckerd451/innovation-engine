// =============================================================
// CharlestonHacks Innovation Engine — Avatar URL Utilities
// Reduces Supabase bandwidth by requesting appropriately sized
// images for each rendering context.
//
// Usage:
//   import { getGraphAvatarUrl, getCardAvatarUrl, getProfileAvatarUrl } from './avatar-utils.js';
//
//   getGraphAvatarUrl(user)    → 64×64   — network graph nodes only
//   getCardAvatarUrl(user)     → 128×128 — attendee cards / lists
//   getProfileAvatarUrl(user)  → original — profile detail / modal
//
// Supabase image transforms are used when the URL resolves to a
// Supabase storage URL (object or render). All other URLs are unchanged.
// =============================================================

import { supabase } from "./supabaseClient.js";

// Bucket where all user avatars are stored (matches avatar-upload.js / profile.js).
const AVATAR_BUCKET = "hacksbucket";

// ---------------------------------------------------------------------------
// In-memory URL cache — keyed by "storagePath::width×height" or "rawUrl::width×height"
// Ensures the same deterministic URL string is returned for identical inputs,
// preventing cache-busting and redundant Supabase egress.
// ---------------------------------------------------------------------------
const _urlCache = new Map();

// Debug mode — enable with ?debugAvatarCache=1 or localStorage ie_debug_avatar_cache
const _AVATAR_CACHE_DEBUG =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).get("debugAvatarCache") === "1" ||
    localStorage.getItem("ie_debug_avatar_cache") === "true");

function _cacheKey(user, suffix) {
  // Build a stable key from the user's identity-relevant fields
  const id =
    user.id || user.user_id || user.avatar_storage_path || user.image_url || user.imageUrl || user.avatar_url || "";
  return `${id}::${suffix}`;
}

function _cachedGet(user, suffix, resolver) {
  const key = _cacheKey(user, suffix);
  if (_urlCache.has(key)) {
    if (_AVATAR_CACHE_DEBUG) console.log(`[AVATAR CACHE] HIT  key=${key}`);
    return _urlCache.get(key);
  }
  const url = resolver();
  _urlCache.set(key, url);
  if (_AVATAR_CACHE_DEBUG) console.log(`[AVATAR CACHE] MISS key=${key} url=${url}`);
  return url;
}

/**
 * Invalidate cached URLs for a specific user (call after avatar upload/removal).
 * @param {object} user — must contain at least one identifying field (id, user_id, etc.)
 */
export function invalidateAvatarCache(user) {
  if (!user) return;
  const prefix =
    user.id || user.user_id || user.avatar_storage_path || user.image_url || user.imageUrl || user.avatar_url || "";
  if (!prefix) return;
  for (const key of _urlCache.keys()) {
    if (key.startsWith(`${prefix}::`)) _urlCache.delete(key);
  }
  if (_AVATAR_CACHE_DEBUG) console.log(`[AVATAR CACHE] INVALIDATED prefix=${prefix}`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the Supabase project base URL, derived from the shared client
 * instance at call time rather than hardcoded.
 * Falls back to window.supabase for scripts that load the client differently.
 * @returns {string|null}
 */
function getSupabaseUrl() {
  const client = supabase || window.supabase;
  const url = client?.supabaseUrl;
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * Convert an avatar_storage_path value into a full public storage object URL.
 *
 * Handles two formats:
 *   bare path:             "avatars/uid/avatar.jpg"
 *   bucket-prefixed path:  "hacksbucket/avatars/uid/avatar.jpg"
 *
 * Input is coerced to a string and leading slashes are stripped so that
 * null-ish non-string values and accidentally slash-prefixed paths are
 * handled safely.
 *
 * @param {*} storagePath
 * @returns {string|null}
 */
function storagePathToPublicUrl(storagePath) {
  if (!storagePath) return null;
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return null;

  // Coerce to string, trim whitespace, strip any leading slashes
  let cleanPath = String(storagePath).trim().replace(/^\/+/, "");
  if (!cleanPath) return null;

  // Strip leading bucket name prefix if the path was stored with it
  const bucketPrefix = `${AVATAR_BUCKET}/`;
  if (cleanPath.startsWith(bucketPrefix)) {
    cleanPath = cleanPath.slice(bucketPrefix.length);
  }

  return `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${cleanPath}`;
}

/**
 * Apply a Supabase image transform, producing a clean render URL for the
 * requested dimensions.
 *
 * Handles both Supabase storage URL forms:
 *   /storage/v1/object/public/...       — plain public object URL
 *   /storage/v1/render/image/public/... — already-transformed render URL
 *
 * In either case any existing query string is discarded and replaced with
 * the requested transform parameters, so a second "?" is never appended.
 *
 * Non-Supabase URLs (e.g. OAuth provider avatars) are returned unchanged.
 *
 * @param {string|null} url
 * @param {number} width
 * @param {number} height
 * @returns {string|null}
 */
function withTransform(url, width, height) {
  if (!url) return url;
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return url;

  const objectPrefix = `${supabaseUrl}/storage/v1/object/public/`;
  const renderPrefix = `${supabaseUrl}/storage/v1/render/image/public/`;

  let storagePath = null;

  if (url.startsWith(objectPrefix)) {
    // Slice off the prefix, then discard any existing query string
    storagePath = url.slice(objectPrefix.length).split("?")[0];
  } else if (url.startsWith(renderPrefix)) {
    // Already a render URL — strip the existing transform params and rebuild
    storagePath = url.slice(renderPrefix.length).split("?")[0];
  }

  if (storagePath) {
    return `${supabaseUrl}/storage/v1/render/image/public/${storagePath}?width=${width}&height=${height}&resize=cover`;
  }

  // Not a Supabase storage URL — return as-is
  return url;
}

/**
 * Resolve the raw full-size image URL from a user/node object.
 *
 * Priority order:
 *   1. avatar_storage_path — authoritative storage location; freshly converted
 *                            to a public URL, so it is never stale. image_url is
 *                            kept only for backward compatibility and may lag
 *                            behind when storage paths change.
 *   2. image_url           — backward-compat field written alongside storage path
 *   3. imageUrl            — normalised in-memory field used by graph stores
 *                            (these objects do not carry avatar_storage_path)
 *   4. avatar_url          — OAuth provider fallback (auth.users.user_metadata)
 *
 * @param {object|null} user
 * @returns {string|null}
 */
function resolveBaseUrl(user) {
  if (!user) return null;
  if (user.avatar_storage_path) return storagePathToPublicUrl(user.avatar_storage_path);
  if (user.image_url) return user.image_url;
  if (user.imageUrl) return user.imageUrl;
  if (user.avatar_url) return user.avatar_url;
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Graph avatar — 64×64px
 * Use ONLY for network graph nodes to minimise bandwidth during
 * real-time graph rendering.
 * @param {object} user
 * @returns {string|null}
 */
export function getGraphAvatarUrl(user) {
  if (!user) return null;
  return _cachedGet(user, "64x64", () => withTransform(resolveBaseUrl(user), 64, 64));
}

/**
 * Card avatar — 128×128px
 * Use for attendee cards, discovery lists, messaging threads, etc.
 * @param {object} user
 * @returns {string|null}
 */
export function getCardAvatarUrl(user) {
  if (!user) return null;
  return _cachedGet(user, "128x128", () => withTransform(resolveBaseUrl(user), 128, 128));
}

/**
 * Profile avatar — original full image
 * Use only in the dedicated profile page or full-screen modal.
 * @param {object} user
 * @returns {string|null}
 */
export function getProfileAvatarUrl(user) {
  if (!user) return null;
  return _cachedGet(user, "original", () => resolveBaseUrl(user));
}
