(function (global) {
  'use strict';

  const ACTIVE_STATUSES = Object.freeze(['active', 'in-progress', 'open', 'recruiting']);

  function isActive(project) {
    return ACTIVE_STATUSES.includes(project?.status);
  }

  function acceptedProjectIds(memberships) {
    return new Set((memberships || [])
      .filter(membership => membership.role !== 'pending' && membership.left_at == null)
      .map(membership => membership.project_id));
  }

  function activeProjectsForUser(projects, memberships, communityId) {
    const memberIds = acceptedProjectIds(memberships);
    return (projects || []).filter(project =>
      isActive(project) &&
      (project.creator_id === communityId || memberIds.has(project.id))
    );
  }

  global.ProjectSemantics = Object.freeze({
    ACTIVE_STATUSES,
    isActive,
    acceptedProjectIds,
    activeProjectsForUser,
  });
})(window);
