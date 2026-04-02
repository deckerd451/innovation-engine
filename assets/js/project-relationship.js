// ================================================================
// PROJECT RELATIONSHIP STATE MODEL
// ================================================================
// Single source of truth for computing a user's relationship to a project.
//
// States:
//   viewer  – user can see the project but has no project_members row
//   member  – user has an active project_members row (role != 'pending')
//   creator – user is the project creator (creator_id match OR role === 'creator')
//
// Usage:
//   const rel = getProjectRelationshipState(project, currentUserId, membership);
//   // rel.state   → 'viewer' | 'member' | 'creator'
//   // rel.membership → null | { role, ... }
//   // rel.isCreator  → boolean
//   // rel.hasPendingRequest → boolean

(function () {
  'use strict';

  const GUARD = '__PROJECT_RELATIONSHIP_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  /**
   * Compute the relationship state between a user and a project.
   *
   * @param {Object} project          – project row (must include creator_id)
   * @param {string|null} currentUserId – the logged-in user's community id
   * @param {Object|null} membership   – the user's project_members row, or null
   * @returns {{ state: 'viewer'|'member'|'creator', membership: Object|null, isCreator: boolean, hasPendingRequest: boolean }}
   */
  function getProjectRelationshipState(project, currentUserId, membership) {
    const result = {
      state: 'viewer',
      membership: membership || null,
      isCreator: false,
      hasPendingRequest: false,
    };

    if (!project || !currentUserId) {
      return result;
    }

    // Creator check: creator_id on the project row, or membership role === 'creator'
    const isCreatorById = project.creator_id === currentUserId;
    const isCreatorByRole = membership && membership.role === 'creator';
    result.isCreator = isCreatorById || !!isCreatorByRole;

    if (result.isCreator) {
      result.state = 'creator';
      return result;
    }

    if (!membership) {
      // No membership row → viewer
      result.state = 'viewer';
      return result;
    }

    if (membership.role === 'pending') {
      // Pending request – still a viewer, but flag the pending state
      result.state = 'viewer';
      result.hasPendingRequest = true;
      return result;
    }

    // Active membership (member, admin, etc.)
    result.state = 'member';
    return result;
  }

  /**
   * Fetch the current user's membership row for a project.
   * Returns null when no membership exists – this is NOT an error.
   *
   * @param {Object} supabaseClient
   * @param {string} projectId
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async function fetchProjectMembership(supabaseClient, projectId, userId) {
    if (!supabaseClient || !projectId || !userId) return null;

    try {
      const { data, error } = await supabaseClient
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        // Only log real database errors, not "no rows" situations
        console.error('[Project Relationship] Error fetching membership:', error);
        return null;
      }

      // null data simply means the user is not a member – perfectly fine
      return data;
    } catch (err) {
      console.error('[Project Relationship] Unexpected error fetching membership:', err);
      return null;
    }
  }

  /**
   * Convenience: fetch membership + compute state in one call.
   *
   * @param {Object} supabaseClient
   * @param {Object} project        – must include creator_id
   * @param {string} currentUserId
   * @returns {Promise<{ state: string, membership: Object|null, isCreator: boolean, hasPendingRequest: boolean }>}
   */
  async function resolveProjectRelationship(supabaseClient, project, currentUserId) {
    const membership = await fetchProjectMembership(supabaseClient, project?.id, currentUserId);
    const rel = getProjectRelationshipState(project, currentUserId, membership);

    // Structured logging
    if (rel.state === 'creator') {
      console.log('[Project Panel] relationship state: creator');
    } else if (rel.state === 'member') {
      console.log(`[Project Panel] relationship state: member role=${rel.membership?.role}`);
    } else if (rel.hasPendingRequest) {
      console.log('[Project Panel] relationship state: viewer (pending request)');
    } else {
      console.log('[Project Panel] relationship state: viewer');
    }

    return rel;
  }

  // ---- Expose globally ----
  window.ProjectRelationship = {
    getProjectRelationshipState,
    fetchProjectMembership,
    resolveProjectRelationship,
  };

  console.log('✅ Project relationship state model loaded');
})();
