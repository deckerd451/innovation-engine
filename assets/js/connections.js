// connections.js - Complete connection management system
// Handles: send requests, accept/reject, fetch connections, privacy controls

let supabase = null;
let currentUserId = null;
let currentUserCommunityId = null;

// Initialize the module
export async function initConnections(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();
  console.log('%c✓ Connections module initialized', 'color: #0f0');
  return { currentUserId, currentUserCommunityId };
}

// Refresh current user info
export async function refreshCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      currentUserId = null;
      currentUserCommunityId = null;
      return null;
    }

    currentUserId = session.user.id;

    // Get community profile ID
    const { data: profile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', currentUserId)
      .single();

    currentUserCommunityId = profile?.id || null;
    return { currentUserId, currentUserCommunityId };
  } catch (err) {
    console.warn('Could not refresh user:', err);
    return null;
  }
}

// Get current user's community ID
export function getCurrentUserCommunityId() {
  return currentUserCommunityId;
}

// ========================
// CONNECTION REQUESTS
// ========================

// Send a connection request
export async function sendConnectionRequest(recipientCommunityId, connectionType = 'generic') {
  if (!currentUserCommunityId) {
    throw new Error('You must create a profile before connecting with others.');
  }

  if (recipientCommunityId === currentUserCommunityId) {
    throw new Error("You can't connect with yourself.");
  }

  // Validate connection type against allowed values
  const allowedTypes = ['generic', 'friend', 'mentor', 'collaborator', 'follower'];
  if (!allowedTypes.includes(connectionType)) {
    connectionType = 'generic'; // Default to generic if invalid
  }

  // Check if connection already exists
  const existing = await getConnectionBetween(currentUserCommunityId, recipientCommunityId);
  if (existing) {
    if (existing.status === 'pending') {
      throw new Error('Connection request already pending.');
    } else if (existing.status === 'accepted') {
      throw new Error('You are already connected.');
    } else if (existing.status === 'declined') {
      // Allow re-requesting after decline - update existing record
      const { error } = await supabase
        .from('connections')
        .update({ status: 'pending', created_at: new Date().toISOString() })
        .eq('id', existing.id);
      
      if (error) throw error;
      return { success: true, message: 'Connection request sent!' };
    }
  }

  // Create new connection request
  const { error } = await supabase
    .from('connections')
    .insert({
      from_user_id: currentUserCommunityId,
      to_user_id: recipientCommunityId,
      status: 'pending',
      type: connectionType  // Now uses valid type (default: 'generic')
    });

  if (error) throw error;

  // Update connection counts
  await updateConnectionCount(currentUserCommunityId);
  
  return { success: true, message: 'Connection request sent!' };
}

// Accept a connection request
export async function acceptConnectionRequest(connectionId) {
  const { error } = await supabase
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId)
    .eq('to_user_id', currentUserCommunityId); // Ensure user can only accept requests TO them

  if (error) throw error;

  // Get the connection to update both users' counts
  const { data: conn } = await supabase
    .from('connections')
    .select('from_user_id, to_user_id')
    .eq('id', connectionId)
    .single();

  if (conn) {
    await updateConnectionCount(conn.from_user_id);
    await updateConnectionCount(conn.to_user_id);
  }

  return { success: true, message: 'Connection accepted!' };
}

// Decline a connection request
export async function declineConnectionRequest(connectionId) {
  const { error } = await supabase
    .from('connections')
    .update({ status: 'declined' })
    .eq('id', connectionId)
    .eq('to_user_id', currentUserCommunityId);

  if (error) throw error;
  return { success: true, message: 'Connection declined.' };
}

// Cancel a sent connection request
export async function cancelConnectionRequest(connectionId) {
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId)
    .eq('from_user_id', currentUserCommunityId);

  if (error) throw error;
  return { success: true, message: 'Request cancelled.' };
}

// Remove an accepted connection
export async function removeConnection(connectionId) {
  // User can remove if they're either party
  const { data: conn } = await supabase
    .from('connections')
    .select('from_user_id, to_user_id')
    .eq('id', connectionId)
    .single();

  if (!conn) throw new Error('Connection not found.');

  const isParty = conn.from_user_id === currentUserCommunityId || 
                  conn.to_user_id === currentUserCommunityId;
  
  if (!isParty) throw new Error('Not authorized to remove this connection.');

  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId);

  if (error) throw error;

  // Update both users' counts
  await updateConnectionCount(conn.from_user_id);
  await updateConnectionCount(conn.to_user_id);

  return { success: true, message: 'Connection removed.' };
}

// ========================
// FETCH CONNECTIONS
// ========================

// Get connection between two users
export async function getConnectionBetween(userId1, userId2) {
  const { data } = await supabase
    .from('connections')
    .select('*')
    .or(`and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`)
    .single();

  return data;
}

// Get all connections for a user
export async function getUserConnections(communityId, status = null) {
  let query = supabase
    .from('connections')
    .select('*')
    .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Get pending requests received by current user
export async function getPendingRequestsReceived() {
  if (!currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from('connections')
    .select(`
      id,
      from_user_id,
      created_at,
      community!connections_from_user_id_fkey (
        id,
        name,
        image_url,
        skills,
        bio,
        availability
      )
    `)
    .eq('to_user_id', currentUserCommunityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching pending requests:', error);
    // Fallback query without join
    return await getPendingRequestsReceivedFallback();
  }

  return data || [];
}

// Fallback if join doesn't work
async function getPendingRequestsReceivedFallback() {
  if (!currentUserCommunityId) return [];

  const { data: connections } = await supabase
    .from('connections')
    .select('id, from_user_id, created_at')
    .eq('to_user_id', currentUserCommunityId)
    .eq('status', 'pending');

  if (!connections?.length) return [];

  // Fetch user details separately
  const userIds = connections.map(c => c.from_user_id);
  const { data: users } = await supabase
    .from('community')
    .select('id, name, image_url, skills, bio, availability')
    .in('id', userIds);

  const userMap = {};
  (users || []).forEach(u => userMap[u.id] = u);

  return connections.map(c => ({
    ...c,
    community: userMap[c.from_user_id] || null
  }));
}

// Get pending requests sent by current user
export async function getPendingRequestsSent() {
  if (!currentUserCommunityId) return [];

  const { data: connections } = await supabase
    .from('connections')
    .select('id, to_user_id, created_at')
    .eq('from_user_id', currentUserCommunityId)
    .eq('status', 'pending');

  if (!connections?.length) return [];

  const userIds = connections.map(c => c.to_user_id);
  const { data: users } = await supabase
    .from('community')
    .select('id, name, image_url')
    .in('id', userIds);

  const userMap = {};
  (users || []).forEach(u => userMap[u.id] = u);

  return connections.map(c => ({
    ...c,
    community: userMap[c.to_user_id] || null
  }));
}

// Get accepted connections for current user
export async function getAcceptedConnections() {
  if (!currentUserCommunityId) return [];

  const { data: connections } = await supabase
    .from('connections')
    .select('id, from_user_id, to_user_id, created_at')
    .or(`from_user_id.eq.${currentUserCommunityId},to_user_id.eq.${currentUserCommunityId}`)
    .eq('status', 'accepted');

  if (!connections?.length) return [];

  // Get the other user's ID for each connection
  const otherUserIds = connections.map(c => 
    c.from_user_id === currentUserCommunityId ? c.to_user_id : c.from_user_id
  );

  const { data: users } = await supabase
    .from('community')
    .select('id, name, image_url, email, skills, bio, availability')
    .in('id', otherUserIds);

  const userMap = {};
  (users || []).forEach(u => userMap[u.id] = u);

  return connections.map(c => {
    const otherId = c.from_user_id === currentUserCommunityId ? c.to_user_id : c.from_user_id;
    return {
      ...c,
      otherUserId: otherId,
      community: userMap[otherId] || null
    };
  });
}

// Get all connections for synapse visualization
export async function getAllConnectionsForSynapse() {
  const { data, error } = await supabase
    .from('connections')
    .select('id, from_user_id, to_user_id, status, type, created_at');

  if (error) {
    console.warn('Error fetching connections for synapse:', error);
    return [];
  }

  return data || [];
}

// ========================
// PRIVACY HELPERS
// ========================

// Check if current user can see another user's email
export async function canSeeEmail(targetCommunityId) {
  if (!currentUserCommunityId) return false;
  if (targetCommunityId === currentUserCommunityId) return true;

  const connection = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  return connection?.status === 'accepted';
}

// Get connection status with another user
export async function getConnectionStatus(targetCommunityId) {
  if (!currentUserCommunityId) return { status: 'none', canConnect: false };
  if (targetCommunityId === currentUserCommunityId) return { status: 'self', canConnect: false };

  const connection = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  
  if (!connection) {
    return { status: 'none', canConnect: true };
  }

  const isSender = connection.from_user_id === currentUserCommunityId;

  return {
    status: connection.status,
    connectionId: connection.id,
    canConnect: connection.status === 'declined',
    isSender,
    isReceiver: !isSender
  };
}

// ========================
// UTILITY FUNCTIONS
// ========================

// Update connection count for a user
async function updateConnectionCount(communityId) {
  try {
    const { data } = await supabase
      .from('connections')
      .select('id')
      .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`)
      .eq('status', 'accepted');

    const count = data?.length || 0;

    await supabase
      .from('community')
      .update({ connection_count: count })
      .eq('id', communityId);
  } catch (err) {
    console.warn('Could not update connection count:', err);
  }
}

// Get connection counts for multiple users (for leaderboard)
export async function getConnectionCounts(communityIds) {
  const counts = {};
  communityIds.forEach(id => counts[id] = 0);

  const { data } = await supabase
    .from('connections')
    .select('from_user_id, to_user_id')
    .eq('status', 'accepted');

  (data || []).forEach(conn => {
    if (communityIds.includes(conn.from_user_id)) {
      counts[conn.from_user_id]++;
    }
    if (communityIds.includes(conn.to_user_id)) {
      counts[conn.to_user_id]++;
    }
  });

  return counts;
}

// Format time ago
export function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// Export for global access
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  cancelConnectionRequest,
  removeConnection,
  getConnectionBetween,
  getUserConnections,
  getPendingRequestsReceived,
  getPendingRequestsSent,
  getAcceptedConnections,
  getAllConnectionsForSynapse,
  canSeeEmail,
  getConnectionStatus,
  getConnectionCounts,
  formatTimeAgo
};
