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
// Supabase storage object URL. All other URLs are returned unchanged.
// =============================================================

import { supabase } from "./supabaseClient.js";

// Bucket where all user avatars are stored (matches avatar-upload.js / profile.js).
const AVATAR_BUCKET = "hacksbucket";

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
 * values like null-ish numbers or accidentally slash-prefixed paths are
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
 * Apply a Supabase image transform to a full public storage object URL.
 * The Supabase project URL is resolved at call time from the shared client,
 * so no URL is hardcoded here.
 * Returns the original URL unchanged for non-Supabase URLs (e.g. OAuth avatars).
 *
 * @param {string|null} url
 * @param {number} width
 * @param {number} height
 * @returns {string|null}
 */
function withTransform(url, width, height) {
  if (!url) return url;
  const supabaseUrl = getSupabaseUrl();
  if (supabaseUrl) {
    const objectPrefix = `${supabaseUrl}/storage/v1/object/public/`;
    if (url.startsWith(objectPrefix)) {
      const path = url.slice(objectPrefix.length);
      return `${supabaseUrl}/storage/v1/render/image/public/${path}?width=${width}&height=${height}&resize=cover`;
    }
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
