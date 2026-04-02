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
//   const rel = getProjectRelationshipState(project, communityUserId, membership);
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
   * @param {Object} project            – project row (must include creator_id)
   * @param {string|null} communityUserId – the logged-in user's community.id
   * @param {Object|null} membership     – the user's project_members row, or null
   * @returns {{ state: 'viewer'|'member'|'creator', membership: Object|null, isCreator: boolean, hasPendingRequest: boolean }}
   */
  function getProjectRelationshipState(project, communityUserId, membership) {
    const result = {
      state: 'viewer',
      membership: membership || null,
      isCreator: false,
      hasPendingRequest: false,
    };

    if (!project || !communityUserId) {
      return result;
    }

    // creator_id must be compared to communityUserId
    const isCreatorById = project.creator_id === communityUserId;
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
   * @param {string} communityUserId – community.id (NOT auth user ID)
   * @returns {Promise<Object|null>}
   */
  async function fetchProjectMembership(supabaseClient, projectId, communityUserId) {
    if (!supabaseClient || !projectId || !communityUserId) return null;

    try {
      const { data, error } = await supabaseClient
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', communityUserId) // project_members.user_id stores community.id
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
   * @param {Object} project          – must include creator_id
   * @param {string} communityUserId  – community.id
   * @returns {Promise<{ state: string, membership: Object|null, isCreator: boolean, hasPendingRequest: boolean }>}
   */
  async function resolveProjectRelationship(supabaseClient, project, communityUserId) {
    const membership = await fetchProjectMembership(supabaseClient, project?.id, communityUserId);
    const rel = getProjectRelationshipState(project, communityUserId, membership);

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
