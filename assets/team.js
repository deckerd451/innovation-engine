// /assets/js/team.js
import { getCommunity } from './data.js';

function parseSkills(row) {
  if (Array.isArray(row.skills)) return row.skills.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  if (typeof row.skills === 'string') {
    return row.skills.split(',').map(s => s.replace(/\(.+\)$/, '').toLowerCase().trim()).filter(Boolean);
  }
  return [];
}

/**
 * Recommend a team from community rows.
 * @param {string[]} requiredSkills - list of skills (e.g., ['aws','python'])
 * @param {number} teamSize - max number of people to select
 * @param {object[]} [people] - optional pre-fetched rows to consider
 */
export async function recommendTeam(requiredSkills = [], teamSize = 3, people) {
  const need = new Set(requiredSkills.map(s => s.toLowerCase().trim()).filter(Boolean));
  if (need.size === 0 || teamSize < 1) return [];

  const rows = Array.isArray(people) ? people : await getCommunity();
  const candidates = rows.map(p => ({ row: p, skills: new Set(parseSkills(p)) }));

  const chosen = [];
  const usedIds = new Set();

  while (chosen.length < teamSize && need.size > 0) {
    let best = null;
    let bestCover = 0;

    for (const c of candidates) {
      const id = c.row.id || c.row.user_id || c.row.email; // best-effort ID
      if (usedIds.has(id)) continue;
      let cover = 0;
      for (const s of need) if (c.skills.has(s)) cover++;
      if (cover > bestCover) { best = c; bestCover = cover; }
    }

    if (!best) break; // no one covers remaining skills

    const id = best.row.id || best.row.user_id || best.row.email;
    usedIds.add(id);
    chosen.push(best.row);
    for (const s of Array.from(need)) if (best.skills.has(s)) need.delete(s);
  }

  // If we still have slots, fill with generalists
  if (chosen.length < teamSize) {
    for (const c of candidates) {
      const id = c.row.id || c.row.user_id || c.row.email;
      if (usedIds.has(id)) continue;
      chosen.push(c.row);
      if (chosen.length >= teamSize) break;
    }
  }

  return chosen;
}

export default { recommendTeam };
