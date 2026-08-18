// ================================================================
// OPPORTUNITY PEOPLE RESOLVER
// ================================================================
// Canonical, read-only mapping from one opportunity to people already present
// in the people-only graph. It uses existing relationship records and profile
// terms; it does not rank candidates or create opportunity graph nodes.

export function normalizeTerms(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(normalizeTerms);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeTerms(parsed);
    } catch (_) { /* comma-delimited profile fields are expected */ }
    return trimmed.split(',').map(term => term.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export function extractPersonTerms(node) {
  const raw = node?._raw || node || {};
  return new Set([
    ...normalizeTerms(raw.skills),
    ...normalizeTerms(raw.interests),
    ...normalizeTerms(raw.themes),
  ]);
}

function _queryError(result, label) {
  if (result?.error) throw new Error(result.error.message || `${label} query failed`);
  return result?.data || [];
}

function _addReason(reasonsByPerson, graphPersonIds, personId, reason) {
  if (!personId || !graphPersonIds.has(String(personId))) return;
  const id = String(personId);
  if (!reasonsByPerson.has(id)) reasonsByPerson.set(id, new Map());
  const reasons = reasonsByPerson.get(id);
  if (!reasons.has(reason.code)) reasons.set(reason.code, reason);
}

/**
 * Resolve people relevant to one opportunity using existing deterministic data.
 * Throws when the opportunity or a required relationship query fails. A valid
 * opportunity with no matches returns an empty Set and Map.
 */
export async function resolveOpportunityPeople(opportunityId, { supabase = window.supabase } = {}) {
  if (!supabase || !opportunityId) throw new Error('Opportunity context is unavailable');

  const store = window.graphDataStore;
  if (!store || typeof store.getAllNodes !== 'function') {
    throw new Error('People graph data is unavailable');
  }

  const graphPeople = store.getAllNodes().filter(node => node.type === 'person');
  const graphPersonIds = new Set(graphPeople.map(node => String(node.id)));

  const opportunityResult = await supabase
    .from('opportunities')
    // Opportunity deployments do not all carry every optional association
    // column (notably project_id/theme_id). Selecting one absent column makes
    // PostgREST reject the entire row before the valid zero-match lens can be
    // established. Fetch the record as deployed, then feature-detect optional
    // relationships below.
    .select('*')
    .eq('id', opportunityId)
    .single();
  if (opportunityResult.error || !opportunityResult.data) {
    throw new Error(opportunityResult.error?.message || 'Opportunity not found');
  }

  const opportunity = opportunityResult.data;
  const relationshipQueries = [];
  const queryKinds = [];

  if (opportunity.organization_id) {
    queryKinds.push('organization');
    relationshipQueries.push(supabase
      .from('organization_members')
      .select('community_id')
      .eq('organization_id', opportunity.organization_id));
  }
  if (opportunity.project_id) {
    queryKinds.push('project');
    relationshipQueries.push(supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', opportunity.project_id));
  }
  if (opportunity.theme_id) {
    queryKinds.push('themeParticipants', 'theme');
    relationshipQueries.push(
      supabase.from('theme_participants').select('community_id').eq('theme_id', opportunity.theme_id),
      supabase.from('theme_circles').select('id, title').eq('id', opportunity.theme_id).single(),
    );
  }

  const relationshipResults = await Promise.all(relationshipQueries);
  const resolved = new Map();
  relationshipResults.forEach((result, index) => {
    resolved.set(queryKinds[index], _queryError(result, queryKinds[index]));
  });

  const reasonsByPerson = new Map();
  _addReason(reasonsByPerson, graphPersonIds, opportunity.posted_by, {
    code: 'poster', label: 'Direct opportunity poster', detail: '',
  });

  (resolved.get('organization') || []).forEach(member => {
    _addReason(reasonsByPerson, graphPersonIds, member.community_id, {
      code: 'organization_member', label: 'Posting organization member', detail: '',
    });
  });

  (resolved.get('project') || []).forEach(member => {
    _addReason(reasonsByPerson, graphPersonIds, member.user_id, {
      code: 'project_member', label: 'Associated project member', detail: '',
    });
  });

  (resolved.get('themeParticipants') || []).forEach(participant => {
    _addReason(reasonsByPerson, graphPersonIds, participant.community_id, {
      code: 'theme_match', label: 'Associated theme participant', detail: '',
    });
  });

  const requiredSkills = normalizeTerms(opportunity.skills);
  const requiredSkillSet = new Set(requiredSkills);
  const themeRecord = resolved.get('theme');
  const themeTitle = Array.isArray(themeRecord) ? themeRecord[0]?.title : themeRecord?.title;
  const themeNeedle = normalizeTerms(themeTitle)[0] || '';

  graphPeople.forEach(person => {
    const terms = extractPersonTerms(person);
    const matches = [...requiredSkillSet].filter(skill => terms.has(skill));
    if (matches.length > 0) {
      _addReason(reasonsByPerson, graphPersonIds, person.id, {
        code: 'skill_match',
        label: 'Required skill match',
        detail: matches.join(', '),
      });
    }
    if (themeNeedle && [...terms].some(term => term.includes(themeNeedle))) {
      _addReason(reasonsByPerson, graphPersonIds, person.id, {
        code: 'theme_match',
        label: 'Theme match',
        detail: themeTitle || '',
      });
    }
  });

  const normalizedReasons = new Map(
    [...reasonsByPerson].map(([personId, reasons]) => [personId, [...reasons.values()]])
  );

  return {
    opportunity,
    personIds: new Set(normalizedReasons.keys()),
    reasonsByPerson: normalizedReasons,
  };
}
