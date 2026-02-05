/**
 * Migration Helper - Temporary Compatibility Layer
 * 
 * Provides backward-compatible wrappers during Phase 2 migration.
 * This file will be removed after full migration is complete.
 * 
 * @module migrationHelper
 */

(() => {
  'use strict';

  const GUARD = '__CH_MIGRATION_HELPER_LOADED__';
  if (window[GUARD]) {
    return;
  }
  window[GUARD] = true;

  /**
   * Get auth user with automatic fallback
   * Use this during migration to gradually replace auth.getUser() calls
   */
  async function getAuthUserCompat() {
    // Try bootstrap first
    if (window.bootstrapSession?.isInitialized) {
      return await window.bootstrapSession.getAuthUser();
    }
    
    // Fallback to direct call (legacy)
    console.warn('⚠️ Using legacy auth.getUser() - migrate to bootstrapSession');
    const { data: { user } } = await window.supabase.auth.getUser();
    return user;
  }

  /**
   * Get community user with automatic fallback
   * Use this during migration to gradually replace community queries
   */
  async function getCommunityUserCompat() {
    // Try bootstrap first
    if (window.bootstrapSession?.isInitialized) {
      return await window.bootstrapSession.getCommunityUser();
    }
    
    // Fallback to direct query (legacy)
    console.warn('⚠️ Using legacy community query - migrate to bootstrapSession');
    const authUser = await getAuthUserCompat();
    if (!authUser) return null;
    
    const { data } = await window.supabase
      .from('community')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle();
    
    return data;
  }

  /**
   * Get session context with automatic fallback
   */
  async function getSessionContextCompat() {
    // Try bootstrap first
    if (window.bootstrapSession?.isInitialized) {
      return await window.bootstrapSession.getSessionContext();
    }
    
    // Fallback to manual fetch (legacy)
    console.warn('⚠️ Using legacy session fetch - migrate to bootstrapSession');
    const authUser = await getAuthUserCompat();
    const communityUser = await getCommunityUserCompat();
    
    return {
      authUser,
      communityUser,
      isAuthenticated: !!authUser,
      hasProfile: !!communityUser
    };
  }

  // Export to window
  window.migrationHelper = {
    getAuthUser: getAuthUserCompat,
    getCommunityUser: getCommunityUserCompat,
    getSessionContext: getSessionContextCompat
  };

  console.log('✅ Migration helper loaded (temporary compatibility layer)');

})();
