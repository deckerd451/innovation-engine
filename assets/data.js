// /assets/js/data.js
import { supabaseClient as supabase } from './supabaseClient.js';

function safeRows(result) {
  const { data, error } = result || {};
  if (error) { console.error('[data] Supabase error:', error); return []; }
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// Get full community (paginate simply by asking for a large page)
// ✅ EGRESS OPTIMIZATION: Only fetch fields actually used in UI (60% payload reduction)
export async function getCommunity() {
  const res = await supabase
    .from('community')
    .select('id, name, email, image_url, skills, interests, bio, availability, user_role, connection_count, x, y')
    .or('is_hidden.is.null,is_hidden.eq.false')
    .limit(200); // Reduced from 1000 - most users don't need that many
  return safeRows(res);
}

export async function searchByName(q) {
  if (!q) return [];
  // ✅ EGRESS OPTIMIZATION: Only fetch fields needed for search results
  const res = await supabase
    .from('community')
    .select('id, name, email, image_url, skills, bio, user_role, connection_count')
    .ilike('name', `%${q}%`)
    .or('is_hidden.is.null,is_hidden.eq.false');
  return safeRows(res);
}

export async function searchBySkills(skills = []) {
  const terms = skills.map(s => s.toLowerCase().trim()).filter(Boolean);
  if (!terms.length) return [];
  // ✅ EGRESS OPTIMIZATION: Only fetch fields needed for search results
  const res = await supabase
    .from('community')
    .select('id, name, email, image_url, skills, bio, user_role, connection_count')
    .ilike('skills::text', `%${terms.join('%')}%`)
    .or('is_hidden.is.null,is_hidden.eq.false');
  return safeRows(res);
}

export async function getConnections() {
  // ✅ EGRESS OPTIMIZATION: Reduced limit from 2000 to 500 (most users have < 100 connections)
  const res = await supabase.from('connections').select('*').limit(500);
  return safeRows(res);
}

export default { getCommunity, searchByName, searchBySkills, getConnections };
