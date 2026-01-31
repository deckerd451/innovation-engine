// ================================================================
// DAILY SUGGESTIONS - SUPABASE QUERIES
// ================================================================
// All database read operations for the suggestions engine
// Respects RLS policies, uses community.id for joins
// ================================================================

/**
 * Get current user's community profile
 */
export async function getCurrentUserProfile() {
  if (!window.supabase || !window.currentUserProfile) {
    throw new Error('Supabase or profile not available');
  }
  
  return window.currentUserProfile;
}

/**
 * Get user's accepted connections
 */
export async function getUserConnections(communityId) {
  const { data, error } = await window.supabase
    .from('connections')
    .select('from_user_id, to_user_id')
    .eq('status', 'accepted')
    .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`);
  
  if (error) throw error;
  
  // Extract connected user IDs
  const connectedIds = new Set();
  data?.forEach(conn => {
    if (conn.from_user_id !== communityId) connectedIds.add(conn.from_user_id);
    if (conn.to_user_id !== communityId) connectedIds.add(conn.to_user_id);
  });
  
  return Array.from(connectedIds);
}

/**
 * Get user's pending connection requests (sent or received)
 */
export async function getPendingConnectionRequests(communityId) {
  const { data, error } = await window.supabase
    .from('connections')
    .select('from_user_id, to_user_id')
    .eq('status', 'pending')
    .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`);
  
  if (error) throw error;
  
  const pendingIds = new Set();
  data?.forEach(conn => {
    if (conn.from_user_id !== communityId) pendingIds.add(conn.from_user_id);
    if (conn.to_user_id !== communityId) pendingIds.add(conn.to_user_id);
  });
  
  return Array.from(pendingIds);
}

/**
 * Get user's project memberships
 */
export async function getUserProjectMemberships(communityId) {
  const { data, error } = await window.supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', communityId)
    .is('left_at', null);
  
  if (error) throw error;
  return data?.map(m => m.project_id) || [];
}

/**
 * Get user's pending project requests
 */
export async function getUserProjectRequests(communityId) {
  const { data, error } = await window.supabase
    .from('project_requests')
    .select('project_id')
    .eq('user_id', communityId)
    .in('status', ['pending', 'accepted']);
  
  if (error) throw error;
  return data?.map(r => r.project_id) || [];
}

/**
 * Get user's theme participations
 */
export async function getUserThemeParticipations(communityId) {
  const { data, error } = await window.supabase
    .from('theme_participants')
    .select('theme_id')
    .eq('community_id', communityId);
  
  if (error) throw error;
  return data?.map(p => p.theme_id) || [];
}

/**
 * Get user's organization memberships
 */
export async function getUserOrganizationMemberships(communityId) {
  const { data, error } = await window.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('community_id', communityId);
  
  if (error) throw error;
  return data?.map(m => m.organization_id) || [];
}

/**
 * Get candidate people (excluding current user, connections, pending requests)
 */
export async function getCandidatePeople(communityId, excludeIds) {
  const { data, error } = await window.supabase
    .from('community')
    .select('id, name, bio, interests, skills, last_activity_date, updated_at, connection_count')
    .neq('id', communityId)
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .order('last_activity_date', { ascending: false, nullsFirst: false })
    .limit(50);
  
  if (error) throw error;
  return data || [];
}

/**
 * Get candidate projects (excluding user's projects and requests)
 */
export async function getCandidateProjects(communityId, excludeIds) {
  const { data, error } = await window.supabase
    .from('projects')
    .select(`
      id, 
      title, 
      description, 
      tags, 
      required_skills, 
      theme_id,
      creator_id,
      status,
      updated_at,
      created_at
    `)
    .eq('status', 'in-progress')
    .neq('creator_id', communityId)
    .not('id', 'in', excludeIds.length > 0 ? `(${excludeIds.join(',')})` : '()')
    .order('updated_at', { ascending: false })
    .limit(50);
  
  if (error) throw error;
  return data || [];
}

/**
 * Get candidate themes (excluding user's participations)
 */
export async function getCandidateThemes(excludeIds) {
  const { data, error } = await window.supabase
    .from('theme_circles')
    .select('id, title, description, tags, activity_score, last_activity_at, created_at')
    .eq('status', 'active')
    .not('id', 'in', excludeIds.length > 0 ? `(${excludeIds.join(',')})` : '()')
    .order('activity_score', { ascending: false, nullsFirst: false })
    .limit(30);
  
  if (error) throw error;
  return data || [];
}

/**
 * Get candidate organizations (excluding user's memberships)
 */
export async function getCandidateOrganizations(excludeIds) {
  const { data, error } = await window.supabase
    .from('organizations')
    .select('id, name, description, industry, follower_count, opportunity_count, updated_at, created_at')
    .not('id', 'in', excludeIds.length > 0 ? `(${excludeIds.join(',')})` : '()')
    .order('updated_at', { ascending: false })
    .limit(30);
  
  if (error) throw error;
  return data || [];
}

/**
 * Get theme participants for a theme
 */
export async function getThemeParticipants(themeId) {
  const { data, error } = await window.supabase
    .from('theme_participants')
    .select('community_id')
    .eq('theme_id', themeId);
  
  if (error) throw error;
  return data?.map(p => p.community_id) || [];
}

/**
 * Get project members for a project
 */
export async function getProjectMembers(projectId) {
  const { data, error } = await window.supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .is('left_at', null);
  
  if (error) throw error;
  return data?.map(m => m.user_id) || [];
}

/**
 * Get mutual connections between two users
 */
export async function getMutualConnections(userId1, userId2, allConnections) {
  // Get connections for user1
  const user1Connections = allConnections
    .filter(c => c.from_user_id === userId1 || c.to_user_id === userId1)
    .map(c => c.from_user_id === userId1 ? c.to_user_id : c.from_user_id);
  
  // Get connections for user2
  const user2Connections = allConnections
    .filter(c => c.from_user_id === userId2 || c.to_user_id === userId2)
    .map(c => c.from_user_id === userId2 ? c.to_user_id : c.from_user_id);
  
  // Find intersection
  const mutual = user1Connections.filter(id => user2Connections.includes(id));
  return mutual.length;
}

/**
 * Get all connections (for mutual connection calculations)
 */
export async function getAllConnections() {
  const { data, error } = await window.supabase
    .from('connections')
    .select('from_user_id, to_user_id')
    .eq('status', 'accepted');
  
  if (error) throw error;
  return data || [];
}

/**
 * Get projects owned/created by user (for recruit suggestions)
 */
export async function getUserOwnedProjects(communityId) {
  const { data, error } = await window.supabase
    .from('projects')
    .select('id')
    .eq('creator_id', communityId)
    .in('status', ['planning', 'in-progress']);
  
  if (error) throw error;
  return data?.map(p => p.id) || [];
}
