// Experimental planner. Callers supply permission-filtered facts; the planner
// neither discovers private records nor makes commitments.
(function (root) {
  'use strict';
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const terms = value => new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean));

  function compose(input, { enabled = false, now = Date.now() } = {}) {
    if (enabled !== true || !input || !Number.isFinite(now)) return null;
    const objective = input.objective;
    if (objective?.shared !== true || !clean(objective.id) || !clean(objective.description)) return null;
    if (objective.kind !== 'project' && objective.kind !== 'organization') return null;

    const needs = (Array.isArray(input.needs) ? input.needs : []).filter(need =>
      need?.shared === true && need.objectiveId === objective.id && clean(need.description));
    const gaps = [...terms([...(Array.isArray(objective.capabilityGaps) ? objective.capabilityGaps : []),
      ...needs.flatMap(need => Array.isArray(need.capabilities) ? need.capabilities : [])])].sort();
    if (!gaps.length || gaps.length > 12) return null;

    const aspirational = new Set(gaps);
    const byId = new Map();
    const seen = new Set();
    for (const person of (Array.isArray(input.participants) ? input.participants : []).slice(0, 50)) {
      if (person?.shared !== true || !clean(person.id)) continue;
      if (seen.has(person.id)) { byId.delete(person.id); continue; }
      seen.add(person.id);
      const capabilities = terms(person.capabilities);
      const aspirations = [...terms(person.aspirations)].filter(skill => aspirational.has(skill));
      const covers = gaps.filter(skill => capabilities.has(skill));
      if (covers.length || aspirations.length) byId.set(person.id, { id: person.id, covers, aspirations });
    }

    // Prefer coverage and smaller teams. Aspirations affect the explanation,
    // never eligibility or a score about the person.
    const team = [];
    const remaining = new Set(gaps);
    const options = [...byId.values()];
    while (team.length < 4 && remaining.size) {
      const ranked = options.map(person => ({
        person, added: person.covers.filter(skill => remaining.has(skill))
      })).filter(entry => entry.added.length)
        .sort((a, b) => b.added.length - a.added.length || a.person.id.localeCompare(b.person.id));
      if (!ranked.length) break;
      const { person, added } = ranked[0];
      team.push({ id: person.id, capabilities: added, aspirations: person.aspirations });
      for (const skill of added) remaining.delete(skill);
    }
    if (!team.length) return null;

    const provided = new Set(team.flatMap(person => person.capabilities));
    if (team.length < 4) {
      const learner = options.filter(person => !team.some(member => member.id === person.id) &&
        person.aspirations.some(skill => provided.has(skill)))
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (learner) team.push({ id: learner.id, capabilities: [], aspirations: learner.aspirations.filter(skill => provided.has(skill)) });
    }
    const requiredResources = terms([...(Array.isArray(objective.resources) ? objective.resources : []),
      ...needs.flatMap(need => Array.isArray(need.resources) ? need.resources : [])]);
    const verifiedResources = [];
    for (const resource of (Array.isArray(input.resources) ? input.resources : []).slice(0, 100)) {
      const checked = Date.parse(resource?.verifiedAt);
      const expiry = Date.parse(resource?.availableUntil);
      if (resource?.shared !== true || resource.available !== true || !clean(resource.id) ||
          !clean(resource.evidenceRef) || !(checked <= now && expiry > now) ||
          !requiredResources.has(resource.kind)) continue;
      requiredResources.delete(resource.kind);
      verifiedResources.push({ id: resource.id, kind: resource.kind, evidenceRef: resource.evidenceRef });
    }

    const missing = { capabilities: [...remaining], resources: [...requiredResources].sort() };
    const blocked = missing.capabilities.length > 0 || missing.resources.length > 0;
    const firstAction = blocked
      ? { action: 'Verify one missing prerequisite', item: missing.capabilities[0] || missing.resources[0] }
      : { action: 'Ask the prospective participants to review and agree on one small trial', item: objective.description };
    return {
      status: 'proposal', objective: { id: objective.id, kind: objective.kind, description: objective.description },
      sharedNeeds: needs.map(need => need.description), team, verifiedResources, missing,
      feasibility: blocked ? 'prerequisites_missing' : 'ready_to_discuss',
      explanation: 'The proposed team covers ' + (gaps.length - remaining.size) + ' of ' + gaps.length +
        ' explicitly listed capability gaps. Availability and commitments still need confirmation.',
      firstAction
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { compose };
  else if (root.HPOECompositionalPilot === true) root.HPOECompose = Object.freeze({ compose });
})(globalThis);
