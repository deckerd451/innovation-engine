// /assets/js/data.js
import { supabaseClient as supabase } from './supabaseClient.js';

function safeRows(result) {
  const { data, error } = result || {};
  if (error) { console.error('[data] Supabase error:', error); return []; }
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// Get full community (paginate simply by asking for a large page)
export async function getCommunity() {
  const res = await supabase.from('community').select('*').limit(1000);
  return safeRows(res);
}

export async function searchByName(q) {
  if (!q) return [];
  const res = await supabase.from('community').select('*').ilike('name', `%${q}%`);
  return safeRows(res);
}

export async function searchBySkills(skills = []) {
  const terms = skills.map(s => s.toLowerCase().trim()).filter(Boolean);
  if (!terms.length) return [];
  // Fallback approach: ilike on serialized array or string column
  const res = await supabase.from('community').select('*').ilike('skills::text', `%${terms.join('%')}%`);
  return safeRows(res);
}

export async function getConnections() {
  const res = await supabase.from('connections').select('*').limit(2000);
  return safeRows(res);
}

export default { getCommunity, searchByName, searchBySkills, getConnections };
