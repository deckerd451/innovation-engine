// ================================================================
// RELATIONSHIP EVIDENCE ADAPTER
// ================================================================
// Normalizes relationship facts already loaded by the person panel and active
// Explorer state. This module is read-only: it performs no queries and assigns
// no relationship score.

import { normalizeTerms } from './opportunity-people-resolver.js';

const PRIORITY = Object.freeze({
  active_context: 10,
  direct_connection: 20,
  pending_connection: 20,
  opportunity_reason: 30,
  shared_project: 40,
  shared_organization: 50,
  mutual_connections: 60,
  shared_skill: 70,
  shared_theme: 71,
  filter_reason: 80,
});

function _reason(code, label, detail = null, category = code) {
  return { code, label, detail: detail || null, category, priority: PRIORITY[category] || 90 };
}

function _names(items, field = 'name', limit = 3) {
  return [...new Set((items || []).map(item => item?.[field]).filter(Boolean))].slice(0, limit);
}

function _sharedTerms(left, right, limit = 3) {
  const rightTerms = new Set(normalizeTerms(right));
  return [...new Set(normalizeTerms(left).filter(term => rightTerms.has(term)))].slice(0, limit);
}

function _displayTerms(terms) {
  return terms.map(term => term.length <= 3
    ? term.toUpperCase()
    : term.replace(/\b\w/g, char => char.toUpperCase())).join(', ');
}

function _contextEvidence(activeContext, personId) {
  if (!activeContext?.type || !activeContext.memberIds?.has(String(personId))) return [];
  const name = activeContext.name || '';

  if (activeContext.type === 'opportunity') {
    const opportunityReasons = activeContext.reasonsByPerson?.get(String(personId)) || [];
    return [
      _reason('current_opportunity_context', 'Current opportunity context', name, 'active_context'),
      ...opportunityReasons.map(reason => _reason(
        `opportunity_${reason.code}`,
        reason.label,
        reason.detail,
        'opportunity_reason',
      )),
    ];
  }

  const contextLabels = {
    project: 'Current project context',
    theme: 'Current theme context',
    organization: 'Current organization context',
  };
  const label = contextLabels[activeContext.type];
  return label ? [_reason(`current_${activeContext.type}_context`, label, name, 'active_context')] : [];
}

function _filterEvidence(filterReason, existingCategories) {
  if (!filterReason?.reason) return [];
  const normalized = filterReason.reason.toLowerCase();
  if (normalized === 'accepted connection' && existingCategories.has('direct_connection')) return [];
  if (normalized === 'shared project' && existingCategories.has('shared_project')) return [];

  const mapping = {
    'accepted connection': ['filter_direct_connection', 'Direct connection'],
    'shared project': ['filter_shared_project', 'Shared project'],
    'project collaborator': ['existing_collaborator', 'Existing project collaborator'],
    'linked to opportunity': ['opportunity_ecosystem', 'Linked to an opportunity'],
    'opportunity-relevant skills': ['opportunity_skill_relevance', 'Opportunity-relevant skills'],
  };
  const mapped = mapping[normalized];
  if (!mapped) return [];
  return [_reason(mapped[0], mapped[1], filterReason.detail, 'filter_reason')];
}

/**
 * Build deterministic, structured evidence for one person.
 * All relational records are supplied by the caller so entry path never
 * changes the evidence logic and the adapter cannot introduce N+1 queries.
 */
export function getRelationshipEvidence({
  currentUserProfile,
  personProfile,
  connectionStatus = 'none',
  connectionDirection = null,
  mutualConnections = [],
  sharedProjects = [],
  sharedOrganizations = [],
  activeContext = null,
  filterReason = null,
} = {}) {
  if (!personProfile?.id || !currentUserProfile?.id || personProfile.id === currentUserProfile.id) {
    return { reasons: [] };
  }

  const reasons = [];
  reasons.push(..._contextEvidence(activeContext, personProfile.id));

  if (connectionStatus === 'accepted') {
    reasons.push(_reason('direct_connection', 'Direct connection', null, 'direct_connection'));
  } else if (connectionStatus === 'pending') {
    const detail = connectionDirection === 'incoming'
      ? 'They sent you a connection request'
      : connectionDirection === 'outgoing' ? 'You sent a connection request' : null;
    reasons.push(_reason('pending_connection', 'Connection request pending', detail, 'pending_connection'));
  }

  const activeContextName = String(activeContext?.name || '').trim().toLowerCase();
  const projectNames = _names(sharedProjects, 'title').filter(name =>
    activeContext?.type !== 'project' || name.trim().toLowerCase() !== activeContextName
  );
  if (projectNames.length) {
    reasons.push(_reason('shared_project', 'Shared project', projectNames.join(', '), 'shared_project'));
  }

  const organizationNames = _names(sharedOrganizations, 'name').filter(name =>
    activeContext?.type !== 'organization' || name.trim().toLowerCase() !== activeContextName
  );
  if (organizationNames.length) {
    reasons.push(_reason('shared_organization', 'Shared organization', organizationNames.join(', '), 'shared_organization'));
  }

  if (mutualConnections.length > 0) {
    reasons.push(_reason(
      'mutual_connections',
      `${mutualConnections.length} mutual connection${mutualConnections.length === 1 ? '' : 's'}`,
      null,
      'mutual_connections',
    ));
  }

  const sharedSkills = _sharedTerms(currentUserProfile.skills, personProfile.skills);
  if (sharedSkills.length) {
    reasons.push(_reason('shared_skill', 'Shared skill', _displayTerms(sharedSkills), 'shared_skill'));
  }

  const myThemes = [...normalizeTerms(currentUserProfile.interests), ...normalizeTerms(currentUserProfile.themes)];
  const theirThemes = [...normalizeTerms(personProfile.interests), ...normalizeTerms(personProfile.themes)];
  const sharedThemes = _sharedTerms(myThemes, theirThemes).filter(theme =>
    activeContext?.type !== 'theme' || theme !== activeContextName
  );
  if (sharedThemes.length) {
    reasons.push(_reason('shared_theme', 'Shared theme or interest', _displayTerms(sharedThemes), 'shared_theme'));
  }

  const categories = new Set(reasons.map(reason => reason.category));
  if (!activeContext?.type) reasons.push(..._filterEvidence(filterReason, categories));

  const seen = new Set();
  const normalized = reasons
    .filter(reason => {
      const key = `${reason.code}|${reason.detail || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
    .map(({ priority, ...reason }) => reason);

  return { reasons: normalized };
}
