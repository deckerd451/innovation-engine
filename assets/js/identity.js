// ================================================================
// IDENTITY — Single source of truth for user identity
// ================================================================
//
// This module resolves the auth-ID vs community-ID ambiguity that has
// caused bugs across messaging, notifications, and project ownership.
//
// RULES:
//   authUserId     → authentication, session, RLS, Supabase auth
//   communityUserId → messaging sender_id, connections, projects
//                     creator_id, graph, presence, notifications user_id
//
// Usage:
//   const authId = Identity.getAuthUserId();
//   const communityId = Identity.getCommunityUserId();
//
// Both return synchronously from cached state. If the user is not
// logged in, they return null.
// ================================================================

(function () {
  'use strict';

  const GUARD = '__IDENTITY_MODULE_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  /**
   * Get the Supabase auth user ID (auth.users.id / auth.uid()).
   * Use for: authentication checks, RLS policies, session management.
   * Do NOT use for: sender_id, creator_id, or any community-table FK.
   */
  function getAuthUserId() {
    return (
      window.bootstrapSession?.authUser?.id ||
      window.bootstrapSession?.hasCachedAuth && null || // trigger getter but don't use
      null
    );
  }

  // Synchronous fast-path: try cached auth user from bootstrapSession
  // Falls back to async if needed
  function _tryAuthSync() {
    // bootstrapSession caches authUser after first getAuthUser() call
    // Access the internal cache via the session object on window
    try {
      const session = window.supabase?.auth?.session?.();
      if (session?.user?.id) return session.user.id;
    } catch (_) {}
    return null;
  }

  /**
   * Get the community profile ID (community.id).
   * Use for: sender_id, creator_id, project_members.user_id,
   *          connections, graph nodes, presence, notifications.user_id.
   * Do NOT use for: Supabase auth or RLS identity.
   */
  function getCommunityUserId() {
    return (
      window.currentUserProfile?.id ||
      window.bootstrapSession?.communityUser?.id ||
      window.communityUser?.id ||
      null
    );
  }

  /**
   * Async version — resolves both IDs from bootstrapSession if not yet cached.
   * Call this during module init when you need guaranteed values.
   */
  async function resolve() {
    let authId = getAuthUserId();
    let communityId = getCommunityUserId();

    if (!authId && window.bootstrapSession?.getAuthUser) {
      const user = await window.bootstrapSession.getAuthUser();
      authId = user?.id || null;
    }

    if (!communityId && window.bootstrapSession?.getCommunityUser) {
      const profile = await window.bootstrapSession.getCommunityUser();
      communityId = profile?.id || null;
    }

    return { authUserId: authId, communityUserId: communityId };
  }

  /**
   * Debug helper — logs both IDs with a context label.
   * Call from any module to verify correct identity usage.
   */
  function audit(context) {
    const authId = getAuthUserId();
    const communityId = getCommunityUserId();
    console.debug('[Identity Audit]', {
      authUserId: authId,
      communityUserId: communityId,
      match: authId === communityId ? '⚠️ SAME (suspicious)' : '✅ different',
      context: context || 'unknown',
    });
    return { authUserId: authId, communityUserId: communityId };
  }

  // ---- Expose globally ----
  window.Identity = {
    getAuthUserId,
    getCommunityUserId,
    resolve,
    audit,
  };

  console.log('✅ Identity module loaded');
})();
