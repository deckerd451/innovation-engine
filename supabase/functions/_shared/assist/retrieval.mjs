// Permissioned context retrieval for the intelligence service.
//
// Every query runs through a Supabase client carrying the member's own JWT,
// so row-level security decides what exists. The checks here only narrow
// further (defence in depth) and minimise what is later sent to a model:
// people are pseudonymised (P1…) and only their listed skills that relate to
// the objective leave this module; names stay server-side for the response.

import { cleanText, distinctiveTerms } from './contract.mjs';

const NOTES_START = '── Buildspace working notes ──';
const NOTES_END = '── end of working notes ──';

// The task description carries a machine-readable `state:` line; it is noise
// for a model and can be large, so only the human-readable notes are kept.
export function readableDescription(description) {
  return String(description || '').split('\n')
    .filter(line => !line.startsWith('state: ') && line !== NOTES_START && line !== NOTES_END)
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function memberForUser(db, userId) {
  const { data, error } = await db.from('community').select('id').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export async function loadTaskContext(db, memberId, { projectId, taskId }) {
  const [taskResult, projectResult] = await Promise.all([
    db.from('project_tasks').select('id,project_id,title,description,status,due_date').eq('id', taskId).eq('project_id', projectId).maybeSingle(),
    db.from('projects').select('id,title,description,status,creator_id').eq('id', projectId).maybeSingle(),
  ]);
  const task = taskResult.data;
  const project = projectResult.data;
  if (taskResult.error || projectResult.error || !task || !project || task.project_id !== project.id) return null;
  const { data: siblings } = await db.from('project_tasks').select('id,title,status').eq('project_id', projectId).order('created_at', { ascending: true }).limit(25);
  return {
    project: { title: cleanText(project.title, 120), description: cleanText(project.description, 600) },
    task: { title: cleanText(task.title, 200), description: cleanText(readableDescription(task.description), 1500), status: task.status, dueDate: task.due_date || null },
    otherTasks: (siblings || []).filter(row => row.id !== task.id).slice(0, 15).map(row => ({ title: cleanText(row.title, 120), status: row.status })),
  };
}

function evidenceFor(pkg, stat) {
  const demonstration = Boolean(pkg.constraints && pkg.constraints.demonstration) || /^DEMONSTRATION CONTENT/.test(pkg.summary || '');
  if (demonstration) return { evidence: 'demonstration', label: 'Demonstration example · untested' };
  if (Number(stat?.verified_successes || 0) >= 2) return { evidence: 'verified', label: 'Verified by members' };
  if (Number(stat?.completed_attempts || 0) > 0) return { evidence: 'member_reported', label: `Results reported by members (${stat.successful_attempts}/${stat.completed_attempts} successful, not verified)` };
  return { evidence: 'untested', label: 'Untested · no results yet' };
}

/**
 * Shared methods and accepted connections that relate to the objective.
 * Returns { methods: [{ref,id,title,goal,summary,steps,evidence,label}], people: [{ref,id,name,matchedSkills}] }.
 */
export async function loadCommunity(db, memberId, contextText, { maxMethods = 4, maxPeople = 6 } = {}) {
  const terms = new Set(distinctiveTerms(contextText));
  const overlap = text => distinctiveTerms(text).filter(term => terms.has(term));

  const methods = [];
  const { data: packages, error } = await db.from('capability_packages')
    .select('id,creator_id,title,goal,summary,steps,constraints,permission_mode,evidence_status,updated_at')
    .or(`permission_mode.eq.community,creator_id.eq.${memberId}`)
    .order('updated_at', { ascending: false }).limit(60);
  if (!error) {
    const candidates = (packages || [])
      .filter(pkg => pkg.permission_mode === 'community' || pkg.creator_id === memberId)
      .map(pkg => ({ pkg, shared: overlap(`${pkg.title} ${pkg.goal} ${pkg.summary || ''}`) }))
      // Two distinctive shared terms, not one: a single common word such as
      // "hackathon" is broad overlap, not relevance. The model then decides
      // whether a candidate actually changes the help, and must say how.
      .filter(item => item.shared.length >= 2)
      .sort((a, b) => b.shared.length - a.shared.length)
      .slice(0, maxMethods);
    let stats = new Map();
    if (candidates.length) {
      const { data: rows } = await db.rpc('get_capability_attempt_stats', { capability_ids: candidates.map(item => item.pkg.id) });
      stats = new Map((rows || []).map(row => [row.capability_id, row]));
    }
    candidates.forEach(({ pkg, shared }, index) => {
      const { evidence, label } = evidenceFor(pkg, stats.get(pkg.id));
      methods.push({
        ref: `M${index + 1}`, kind: 'method', id: pkg.id, sharedTerms: shared,
        title: cleanText(pkg.title, 100), goal: cleanText(pkg.goal, 280),
        summary: cleanText(String(pkg.summary || '').replace(/^DEMONSTRATION CONTENT\s*[—-]\s*/, ''), 400),
        steps: (Array.isArray(pkg.steps) ? pkg.steps : []).slice(0, 8).map(step => cleanText(typeof step === 'string' ? step : step?.title || step?.text, 160)).filter(Boolean),
        evidence, label, own: pkg.creator_id === memberId,
      });
    });
  }

  const people = [];
  const { data: links, error: linkError } = await db.from('connections').select('from_user_id,to_user_id,status')
    .or(`from_user_id.eq.${memberId},to_user_id.eq.${memberId}`).eq('status', 'accepted');
  if (!linkError) {
    const ids = [...new Set((links || []).filter(row => row.status === 'accepted' && (row.from_user_id === memberId || row.to_user_id === memberId))
      .map(row => (row.from_user_id === memberId ? row.to_user_id : row.from_user_id)).filter(id => id && id !== memberId))];
    if (ids.length) {
      const { data: profiles } = await db.from('community').select('id,name,skills').in('id', ids.slice(0, 200));
      (profiles || []).filter(person => ids.includes(person.id))
        .map(person => ({ person, matched: (Array.isArray(person.skills) ? person.skills : []).map(skill => cleanText(skill, 40)).filter(skill => skill && overlap(skill).length) }))
        .filter(item => item.matched.length)
        .slice(0, maxPeople)
        .forEach(({ person, matched }, index) => people.push({ ref: `P${index + 1}`, kind: 'person', id: person.id, name: cleanText(person.name, 80) || 'Community member', matchedSkills: matched.slice(0, 6) }));
    }
  }
  return { methods, people };
}

// What leaves the server for a model: no ids, no names, no creator identity.
export function communityForModel({ methods, people }) {
  return {
    methods: methods.map(m => ({ ref: m.ref, title: m.title, goal: m.goal, summary: m.summary, steps: m.steps, evidence: m.evidence })),
    connections: people.map(p => ({ ref: p.ref, listedSkills: p.matchedSkills })),
  };
}

export function refTable({ methods, people }) {
  const refs = {};
  methods.forEach(m => { refs[m.ref] = { kind: 'method', id: m.id, title: m.title, evidence: m.evidence, label: m.label }; });
  people.forEach(p => { refs[p.ref] = { kind: 'person', id: p.id, name: p.name, matchedSkills: p.matchedSkills }; });
  return refs;
}
