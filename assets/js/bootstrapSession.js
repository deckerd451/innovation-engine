/**
 * Bootstrap Session - Single Source of Truth
 * 
 * This module provides the ONLY entry point for auth and community user data.
 * All other modules MUST use these functions instead of querying directly.
 * 
 * Rules:
 * - Caches results in-memory and sessionStorage
 * - Dedupes concurrent calls (promise caching)
 * - Never creates a profile: ensureCommunityUser() waits for auth.js, which
 *   claims an older profile before creating a new one
 * - NO other module should query community by email
 * 
 * @module bootstrapSession
 */

(() => {
  'use strict';

  const GUARD = '__CH_BOOTSTRAP_SESSION_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ bootstrapSession already loaded');
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // STATE
  // ============================================================================

  let supabase = null;
  
  // In-memory cache
  let authUserCache = null;
  let communityUserCache = null;
  
  // Promise cache for deduping concurrent calls
  let authUserPromise = null;
  let communityUserPromise = null;
  
  // SessionStorage keys
  const STORAGE_KEYS = {
    AUTH_USER: 'ch_auth_user_cache',
    COMMUNITY_USER: 'ch_community_user_cache',
    ENSURE_RAN: 'ch_ensure_community_ran' // no longer set; cleared on logout
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize bootstrap session
   * @param {object} supabaseClient - Supabase client instance
   */
  function initialize(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('bootstrapSession.initialize() requires supabase client');
    }
    
    supabase = supabaseClient;

    console.log('✅ Bootstrap session initialized');
  }

  // ============================================================================
  // AUTH USER (Single Source of Truth)
  // ============================================================================

  /**
   * Get authenticated user (cached)
   * This is the ONLY way to get auth user in the app
   * 
   * @returns {Promise<object|null>} Auth user object or null
   */
  async function getAuthUser() {
    // Return in-memory cache if available
    if (authUserCache !== null) {
      return authUserCache;
    }

    // Return existing promise if call is in flight
    if (authUserPromise) {
      return authUserPromise;
    }

    // Try sessionStorage cache first (fast reload)
    try {
      const cached = sessionStorage.getItem(STORAGE_KEYS.AUTH_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Validate cache is recent (< 5 minutes)
        if (parsed.cachedAt && Date.now() - parsed.cachedAt < 5 * 60 * 1000) {
          authUserCache = parsed.user;
          console.log('📦 Auth user loaded from cache');
          return authUserCache;
        }
      }
    } catch (e) {
      console.warn('Failed to load auth user from cache:', e);
    }

    // Fetch from Supabase (dedupe concurrent calls)
    authUserPromise = (async () => {
      try {
        if (!supabase) {
          // Auto-recover: use the globally initialised Supabase client that
          // supabaseClient.js sets up, so modules that call getAuthUser() before
          // bootstrapSession.initialize() is explicitly called still work.
          if (window.supabase) {
            supabase = window.supabase;
          } else {
            throw new Error('Supabase not initialized. Call bootstrapSession.initialize() first.');
          }
        }

        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error('❌ Failed to get auth user:', error);
          authUserCache = null;
          return null;
        }

        authUserCache = user;

        // Cache in sessionStorage
        if (user) {
          try {
            sessionStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify({
              user,
              cachedAt: Date.now()
            }));
          } catch (e) {
            console.warn('Failed to cache auth user:', e);
          }
        }

        console.log('✅ Auth user loaded:', user?.email);
        return user;

      } catch (error) {
        console.error('❌ Error getting auth user:', error);
        authUserCache = null;
        return null;
      } finally {
        authUserPromise = null;
      }
    })();

    return authUserPromise;
  }

  // ============================================================================
  // COMMUNITY USER (Single Source of Truth)
  // ============================================================================

  /**
   * Get community user (cached)
   * This is the ONLY way to get community user in the app
   * 
   * @returns {Promise<object|null>} Community user object or null
   */
  async function getCommunityUser() {
    // Return in-memory cache if available
    if (communityUserCache !== null) {
      return communityUserCache;
    }

    // Return existing promise if call is in flight
    if (communityUserPromise) {
      return communityUserPromise;
    }

    // Try sessionStorage cache first (fast reload)
    try {
      const cached = sessionStorage.getItem(STORAGE_KEYS.COMMUNITY_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Validate cache is recent (< 5 minutes)
        if (parsed.cachedAt && Date.now() - parsed.cachedAt < 5 * 60 * 1000) {
          communityUserCache = parsed.user;
          console.log('📦 Community user loaded from cache');
          return communityUserCache;
        }
      }
    } catch (e) {
      console.warn('Failed to load community user from cache:', e);
    }

    // Fetch from Supabase (dedupe concurrent calls)
    communityUserPromise = (async () => {
      try {
        // Get auth user first
        const authUser = await getAuthUser();
        if (!authUser) {
          console.warn('⚠️ No auth user, cannot get community user');
          communityUserCache = null;
          return null;
        }

        if (!supabase) {
          if (window.supabase) {
            supabase = window.supabase;
          } else {
            throw new Error('Supabase not initialized');
          }
        }

        // Query community by user_id (NOT by email!)
        // This uses the RLS policy and is the ONLY allowed community query
        const { data, error } = await supabase
          .from('community')
          .select(window.BuildspaceProfileColumns.own)
          .eq('user_id', authUser.id)
          .maybeSingle();

        if (error) {
          console.error('❌ Failed to get community user:', error);
          communityUserCache = null;
          return null;
        }

        // No profile linked yet: wait for sign-in to claim or create it
        if (!data) {
          console.log('👤 No community user found, waiting for sign-in to load it...');
          const created = await ensureCommunityUser();
          communityUserCache = created;
          
          // Cache the created user
          if (created) {
            try {
              sessionStorage.setItem(STORAGE_KEYS.COMMUNITY_USER, JSON.stringify({
                user: created,
                cachedAt: Date.now()
              }));
            } catch (e) {
              console.warn('Failed to cache community user:', e);
            }
          }
          
          return created;
        }

        communityUserCache = data;

        // Cache in sessionStorage
        try {
          sessionStorage.setItem(STORAGE_KEYS.COMMUNITY_USER, JSON.stringify({
            user: data,
            cachedAt: Date.now()
          }));
        } catch (e) {
          console.warn('Failed to cache community user:', e);
        }

        console.log('✅ Community user loaded:', data.name || data.id);
        return data;

      } catch (error) {
        console.error('❌ Error getting community user:', error);
        communityUserCache = null;
        return null;
      } finally {
        communityUserPromise = null;
      }
    })();

    return communityUserPromise;
  }

  // ============================================================================
  // ENSURE COMMUNITY USER (waits for sign-in; never creates)
  // ============================================================================

  /**
   * The signed-in member's profile, once auth.js has loaded it.
   *
   * auth.js resolves the profile at sign-in: by account, then by claiming an
   * older profile with the member's email, and only then by creating a new
   * one. Creating a profile here as well could win that race and leave a
   * returning member on a new, empty profile (their older one never
   * claimed), so this only waits for auth.js's answer.
   *
   * @returns {Promise<object|null>} The member's profile, or null if sign-in
   *   found or created none (or it didn't finish in time)
   */
  async function ensureCommunityUser() {
    try {
      const authUser = await getAuthUser();
      if (!authUser) {
        console.warn('⚠️ No auth user, cannot ensure community user');
        return null;
      }
      const profile = await waitForSignedInProfile(authUser.id);
      if (profile) console.log('✅ Community user loaded by sign-in');
      else console.warn('⚠️ Sign-in did not load a community user');
      return profile;
    } catch (error) {
      console.error('❌ Error in ensureCommunityUser:', error);
      return null;
    }
  }

  // Resolves with auth.js's profile for this account (window.currentUserProfile,
  // or the next 'profile-loaded'), or null on 'profile-new' (sign-in found or
  // created none), sign-out, or after timeoutMs.
  function waitForSignedInProfile(authUserId, timeoutMs = 30000) {
    const own = (profile) => (profile && profile.user_id === authUserId ? profile : null);
    if (own(window.currentUserProfile)) return Promise.resolve(window.currentUserProfile);
    return new Promise((resolve) => {
      const finish = (profile) => {
        clearTimeout(timer);
        window.removeEventListener('profile-loaded', onLoaded);
        window.removeEventListener('profile-new', onNone);
        window.removeEventListener('user-logged-out', onNone);
        resolve(profile);
      };
      const onLoaded = (e) => {
        const profile = own(e?.detail?.profile);
        if (profile) finish(profile);
      };
      const onNone = () => finish(null);
      const timer = setTimeout(onNone, timeoutMs);
      window.addEventListener('profile-loaded', onLoaded);
      window.addEventListener('profile-new', onNone);
      window.addEventListener('user-logged-out', onNone);
    });
  }

  // ============================================================================
  // SESSION CONTEXT (Combined Data)
  // ============================================================================

  /**
   * Get complete session context
   * @returns {Promise<object>} { authUser, communityUser }
   */
  async function getSessionContext() {
    const [authUser, communityUser] = await Promise.all([
      getAuthUser(),
      getCommunityUser()
    ]);

    return {
      authUser,
      communityUser,
      isAuthenticated: !!authUser,
      hasProfile: !!communityUser
    };
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Clear all caches (use when user logs out)
   */
  function clearCache() {
    authUserCache = null;
    communityUserCache = null;
    authUserPromise = null;
    communityUserPromise = null;

    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      sessionStorage.removeItem(STORAGE_KEYS.COMMUNITY_USER);
      sessionStorage.removeItem(STORAGE_KEYS.ENSURE_RAN);
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }

    console.log('🧹 Bootstrap session cache cleared');
  }

  /**
   * Invalidate cache and force refresh on next call
   */
  function invalidateCache() {
    authUserCache = null;
    communityUserCache = null;
    
    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      sessionStorage.removeItem(STORAGE_KEYS.COMMUNITY_USER);
    } catch (e) {
      console.warn('Failed to invalidate cache:', e);
    }

    console.log('♻️ Bootstrap session cache invalidated');
  }

  // ============================================================================
  // DEV-ONLY GUARDS
  // ============================================================================

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Intercept direct community queries in dev mode
    const originalFrom = window.supabase?.from;
    if (originalFrom && typeof Proxy !== 'undefined') {
      window.supabase.from = function(table) {
        const query = originalFrom.call(this, table);
        
        if (table === 'community') {
          const originalEq = query.eq;
          query.eq = function(column, value) {
            if (column === 'email') {
              console.error('🚨 BLOCKED: Direct community query by email detected!');
              console.error('Use bootstrapSession.getCommunityUser() instead');
              console.trace('Stack trace:');
              throw new Error('Direct community email query is forbidden. Use bootstrapSession.getCommunityUser()');
            }
            return originalEq.call(this, column, value);
          };
        }
        
        return query;
      };
      
      console.log('🛡️ Dev guard enabled: Direct community email queries will throw errors');
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.bootstrapSession = {
    initialize,
    getAuthUser,
    getCommunityUser,
    getSessionContext,
    ensureCommunityUser,
    clearCache,
    invalidateCache,
    
    // Read-only state for debugging
    get isInitialized() {
      return !!supabase;
    },
    get hasCachedAuth() {
      return authUserCache !== null;
    },
    get hasCachedCommunity() {
      return communityUserCache !== null;
    }
  };

  console.log('✅ Bootstrap session module loaded');

})();
