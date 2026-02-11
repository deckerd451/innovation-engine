// /assets/js/skills.js
import { getCommunity } from './data.js';
import { appState } from './globals.js';

function normalizeList(list) {
  return Array.from(new Set(list.map(s => s.toLowerCase().trim()).filter(Boolean))).sort();
}

function extractSkills(row) {
  if (Array.isArray(row.skills)) return row.skills.map(s => String(s));
  if (typeof row.skills === 'string') {
    return row.skills.split(',').map(s => s.replace(/\(.+\)$/, '').trim());
  }
  return [];
}

/**
 * Fetch skills from the community table and update appState.dynamicSkills.
 */
export async function fetchSkills() {
  const people = await getCommunity();
  const all = [];
  for (const p of people) all.push(...extractSkills(p));
  appState.dynamicSkills = normalizeList(all);
  return appState.dynamicSkills;
}

export default { fetchSkills };
