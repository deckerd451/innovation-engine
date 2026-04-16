/**
 * Bootstrap Session - Single Source of Truth
 * 
 * This module provides the ONLY entry point for auth and community user data.
 * All other modules MUST use these functions instead of querying directly.
 * 
 * Rules:
 * - Caches results in-memory and sessionStorage
 * - Dedupes concurrent calls (promise caching)
 * - Runs ensureCommunityUser() exactly once per session
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
  
  // Session tracking
  let ensureCommunityUserRan = false;
  
  // SessionStorage keys
  const STORAGE_KEYS = {
    AUTH_USER: 'ch_auth_user_cache',
    COMMUNITY_USER: 'ch_community_user_cache',
    ENSURE_RAN: 'ch_ensure_community_ran'
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
    
    // Check if ensureCommunityUser already ran this session
    ensureCommunityUserRan = sessionStorage.getItem(STORAGE_KEYS.ENSURE_RAN) === 'true';
    
    console.log('✅ Bootstrap session initialized', {
      ensureAlreadyRan: ensureCommunityUserRan
    });
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
          .select('*')
          .eq('user_id', authUser.id)
          .maybeSingle();

        if (error) {
          console.error('❌ Failed to get community user:', error);
          communityUserCache = null;
          return null;
        }

        // If no community user exists, ensure it's created (once per session)
        if (!data) {
          console.log('👤 No community user found, ensuring creation...');
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

        console.log('✅ Community user loaded:', data.name || data.email);
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
  // ENSURE COMMUNITY USER (Runs Once Per Session)
  // ============================================================================

  /**
   * Ensure community user exists (creates if missing)
   * This runs AT MOST ONCE per tab session
   * 
   * @returns {Promise<object|null>} Created/existing community user
   */
  async function ensureCommunityUser() {
    // Guard: only run once per session
    if (ensureCommunityUserRan) {
      console.log('⏭️ ensureCommunityUser already ran this session, skipping');
      return communityUserCache;
    }

    ensureCommunityUserRan = true;
    sessionStorage.setItem(STORAGE_KEYS.ENSURE_RAN, 'true');

    try {
      const authUser = await getAuthUser();
      if (!authUser) {
        console.warn('⚠️ No auth user, cannot ensure community user');
        return null;
      }

      if (!supabase) {
        throw new Error('Supabase not initialized');
      }

      console.log('🔨 Ensuring community user exists for:', authUser.email);

      // Check if user already exists (by user_id, NOT email)
      const { data: existing, error: checkError } = await supabase
        .from('community')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (checkError) {
        console.error('❌ Error checking for existing user:', checkError);
        return null;
      }

      if (existing) {
        console.log('✅ Community user already exists');
        return existing;
      }

      // Create new community user
      const { data: created, error: createError } = await supabase
        .from('community')
        .insert({
          user_id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
          avatar_url: authUser.user_metadata?.avatar_url || null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating community user:', createError);
        return null;
      }

      console.log('✅ Community user created:', created.name);
      return created;

    } catch (error) {
      console.error('❌ Error in ensureCommunityUser:', error);
      return null;
    }
  }

  // ============================================================================
  // SESSION CONTEXT (Combined Data)
  // ============================================================================

  /**
   * Race a promise against a timeout.
   * @param {Promise} promise
   * @param {number} ms - Timeout in milliseconds
   * @param {string} label - Label for timeout error message
   */
  function withTimeout(promise, ms, label) {
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      )
    );
    return Promise.race([promise, timeout]);
  }

  /**
   * Get complete session context
   * @returns {Promise<object>} { authUser, communityUser }
   */
  async function getSessionContext() {
    const [authUser, communityUser] = await withTimeout(
      Promise.all([getAuthUser(), getCommunityUser()]),
      10000,
      'getSessionContext'
    );

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
    ensureCommunityUserRan = false;

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
    },
    get ensureRan() {
      return ensureCommunityUserRan;
    }
  };

  console.log('✅ Bootstrap session module loaded');

})();
