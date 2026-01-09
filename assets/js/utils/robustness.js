/**
 * Robustness Utilities for Innovation Engine
 *
 * This module provides:
 * - Safe Supabase wrapper to prevent race conditions
 * - Explicit identity mapping helpers (auth vs social IDs)
 * - Other safety utilities
 */

// ============================================================================
// SAFE SUPABASE WRAPPER
// ============================================================================

/**
 * Get Supabase client safely - prevents race conditions when supabase isn't ready
 * @returns {object|null} Supabase client or null if not ready
 */
export function getSB() {
  return window.supabase || window.importedSupabase || null;
}

/**
 * Check if Supabase is ready
 * @returns {boolean} True if Supabase client is available
 */
export function isSupabaseReady() {
  return !!getSB();
}

/**
 * Wait for Supabase to be ready with timeout
 * @param {number} timeoutMs - Maximum wait time in milliseconds (default: 5000)
 * @returns {Promise<object>} Resolves with Supabase client or rejects on timeout
 */
export async function waitForSupabase(timeoutMs = 5000) {
  const start = Date.now();

  while (!isSupabaseReady()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timeout waiting for Supabase client");
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return getSB();
}

/**
 * Execute a function only when Supabase is ready
 * @param {Function} fn - Function to execute (receives supabase as first arg)
 * @param {object} options - Options { timeout, fallback }
 * @returns {Promise<any>} Result of function or fallback value
 */
export async function whenSupabaseReady(fn, options = {}) {
  const { timeout = 5000, fallback = null } = options;

  try {
    const sb = await waitForSupabase(timeout);
    return await fn(sb);
  } catch (error) {
    console.warn("Supabase not ready:", error);
    return fallback;
  }
}

// ============================================================================
// IDENTITY MAPPING HELPERS
// ============================================================================

/**
 * Identity mapping in Innovation Engine:
 *
 * - community.id = social identity (used in connections, conversations participants)
 * - auth.users.id = authentication identity (stored as community.user_id)
 * - messages.sender_id = auth.users.id
 * - connections.*_user_id = community.id
 * - conversations.participant_*_id = community.id
 */

/**
 * Get community ID (social identity) from a profile object
 * @param {object} profile - Profile object from community table
 * @returns {string|null} Community ID (social identity)
 */
export function getCommunityId(profile) {
  return profile?.id || null;
}

/**
 * Get auth ID (authentication identity) from a user or profile object
 * @param {object} userOrProfile - User from auth.users or profile from community
 * @returns {string|null} Auth user ID
 */
export function getAuthId(userOrProfile) {
  // If it's an auth user, it has 'id' directly
  // If it's a community profile, it has 'user_id'
  return userOrProfile?.id || userOrProfile?.user_id || null;
}

/**
 * Get community profile ID from auth user ID
 * @param {string} authUserId - Auth user ID
 * @param {object} supabase - Supabase client (optional, uses global if not provided)
 * @returns {Promise<string|null>} Community ID or null
 */
export async function authIdToCommunityId(authUserId, supabase = null) {
  if (!authUserId) return null;

  const sb = supabase || getSB();
  if (!sb) {
    console.warn("Supabase not ready for authIdToCommunityId");
    return null;
  }

  try {
    const { data, error } = await sb
      .from("community")
      .select("id")
      .eq("user_id", authUserId)
      .maybeSingle?.() || await sb
        .from("community")
        .select("id")
        .eq("user_id", authUserId)
        .single()
        .catch(e => ({ data: null, error: e }));

    if (error || !data) {
      console.warn("Failed to resolve auth ID to community ID:", error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Error in authIdToCommunityId:", error);
    return null;
  }
}

/**
 * Get auth user ID from community profile ID
 * @param {string} communityId - Community profile ID
 * @param {object} supabase - Supabase client (optional, uses global if not provided)
 * @returns {Promise<string|null>} Auth user ID or null
 */
export async function communityIdToAuthId(communityId, supabase = null) {
  if (!communityId) return null;

  const sb = supabase || getSB();
  if (!sb) {
    console.warn("Supabase not ready for communityIdToAuthId");
    return null;
  }

  try {
    const { data, error } = await sb
      .from("community")
      .select("user_id")
      .eq("id", communityId)
      .maybeSingle?.() || await sb
        .from("community")
        .select("user_id")
        .eq("id", communityId)
        .single()
        .catch(e => ({ data: null, error: e }));

    if (error || !data) {
      console.warn("Failed to resolve community ID to auth ID:", error);
      return null;
    }

    return data.user_id;
  } catch (error) {
    console.error("Error in communityIdToAuthId:", error);
    return null;
  }
}

/**
 * Get current user's community ID from session
 * @param {object} supabase - Supabase client (optional, uses global if not provided)
 * @returns {Promise<string|null>} Community ID or null
 */
export async function getCurrentCommunityId(supabase = null) {
  const sb = supabase || getSB();
  if (!sb) {
    console.warn("Supabase not ready for getCurrentCommunityId");
    return null;
  }

  try {
    const { data: { session }, error: sessErr } = await sb.auth.getSession();
    if (sessErr || !session?.user?.id) {
      return null;
    }

    return await authIdToCommunityId(session.user.id, sb);
  } catch (error) {
    console.error("Error in getCurrentCommunityId:", error);
    return null;
  }
}

/**
 * Validate that an ID is being used correctly
 * @param {string} id - The ID to validate
 * @param {string} context - Context for validation ("auth", "community", "message_sender", "connection", "conversation")
 * @returns {object} { valid: boolean, message: string }
 */
export function validateIdUsage(id, context) {
  if (!id) {
    return { valid: false, message: "ID is null or undefined" };
  }

  // UUID format check (basic)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return { valid: false, message: "ID is not a valid UUID format" };
  }

  // Context-specific guidance
  const guidance = {
    auth: "Use auth.users.id from session.user.id",
    community: "Use community.id from profile",
    message_sender: "Use auth.users.id (community.user_id) for messages.sender_id",
    connection: "Use community.id for connections.*_user_id",
    conversation: "Use community.id for conversations.participant_*_id"
  };

  return {
    valid: true,
    message: `Valid UUID. ${guidance[context] || "Context: " + context}`
  };
}

// ============================================================================
// DOM SAFETY UTILITIES
// ============================================================================

/**
 * Safe element getter by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Safe query selector
 * @param {string} selector - CSS selector
 * @param {HTMLElement} root - Root element (default: document)
 * @returns {HTMLElement|null} Element or null
 */
export function $$(selector, root = document) {
  return root?.querySelector(selector) || null;
}

/**
 * Safe event binding - only binds if element exists
 * @param {HTMLElement} el - Element to bind to
 * @param {string} evt - Event name
 * @param {Function} fn - Event handler
 * @param {object} opts - Event options
 * @returns {boolean} True if bound successfully
 */
export function on(el, evt, fn, opts) {
  if (el && typeof el.addEventListener === 'function') {
    el.addEventListener(evt, fn, opts);
    return true;
  }
  return false;
}

/**
 * Safe one-time event binding
 * @param {HTMLElement} el - Element to bind to
 * @param {string} evt - Event name
 * @param {Function} fn - Event handler
 * @returns {boolean} True if bound successfully
 */
export function once(el, evt, fn) {
  return on(el, evt, fn, { once: true });
}

/**
 * Bind element with guard to prevent duplicate bindings
 * @param {HTMLElement} el - Element to bind
 * @param {string} key - Unique key for this binding
 * @param {Function} fn - Function to execute (receives element)
 * @returns {boolean} True if binding was applied (not duplicate)
 */
export function bindOnce(el, key, fn) {
  if (!el || el.dataset[key]) return false;
  el.dataset[key] = "1";
  fn(el);
  return true;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Supabase utilities
  getSB,
  isSupabaseReady,
  waitForSupabase,
  whenSupabaseReady,

  // Identity mapping
  getCommunityId,
  getAuthId,
  authIdToCommunityId,
  communityIdToAuthId,
  getCurrentCommunityId,
  validateIdUsage,

  // DOM utilities
  $,
  $$,
  on,
  once,
  bindOnce
};
