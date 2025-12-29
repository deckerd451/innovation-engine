// connections.js - Complete connection management system
// Handles: send requests, accept/reject, fetch connections, privacy controls

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `connection-toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#00e0ff'};
    color: #fff;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideInRight 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 300px;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add toast animations to page
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ========================
// MODULE STATE
// ========================
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
  try {
    if (!currentUserCommunityId) {
      showToast('Please create your profile first', 'error');
      throw new Error('You must create a profile before connecting with others.');
    }

    if (!recipientCommunityId) {
      showToast('Invalid recipient', 'error');
      throw new Error('Invalid recipient.');
    }

    if (recipientCommunityId === currentUserCommunityId) {
      showToast("You can't connect with yourself", 'info');
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
        showToast('Connection request already pending', 'info');
        throw new Error('Connection request already pending.');
      } else if (existing.status === 'accepted') {
        showToast('You are already connected!', 'info');
        throw new Error('You are already connected.');
      } else if (existing.status === 'declined') {
        // Allow re-requesting after decline - update existing record
        const { error } = await supabase
          .from('connections')
          .update({ status: 'pending', created_at: new Date().toISOString() })
          .eq('id', existing.id);
        
        if (error) {
          showToast('Failed to send connection request', 'error');
          throw error;
        }
        showToast('✓ Connection request sent!', 'success');
        
        // Dispatch event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('connectionRequestSent', {
            detail: { recipientCommunityId, connectionType }
          }));
        }
        
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
        type: connectionType
      });

    if (error) {
      showToast(`Failed to send request: ${error.message}`, 'error');
      throw error;
    }

    // Update connection counts
    await updateConnectionCount(currentUserCommunityId);
    
    // Success notification
    showToast('✓ Connection request sent!', 'success');
    
    // Dispatch event for UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('connectionRequestSent', {
        detail: { recipientCommunityId, connectionType }
      }));
    }
    
    return { success: true, message: 'Connection request sent!' };
  } catch (error) {
    console.error('sendConnectionRequest error:', error);
    throw error;
  }
}

// Accept a connection request
export async function acceptConnectionRequest(connectionId) {
  try {
    if (!connectionId || !currentUserCommunityId) {
      showToast('Invalid request', 'error');
      throw new Error('Invalid request.');
    }

    const { error } = await supabase
      .from('connections')
      .update({ status: 'accepted' })
      .eq('id', connectionId)
      .eq('to_user_id', currentUserCommunityId); // Ensure user can only accept requests TO them

    if (error) {
      showToast('Failed to accept connection', 'error');
      throw error;
    }

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

    showToast('✓ Connection accepted!', 'success');
    
    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('connectionAccepted', {
        detail: { connectionId }
      }));
    }

    return { success: true, message: 'Connection accepted!' };
  } catch (error) {
    console.error('acceptConnectionRequest error:', error);
    throw error;
  }
}

// Decline a connection request
export async function declineConnectionRequest(connectionId) {
  try {
    if (!connectionId || !currentUserCommunityId) {
      showToast('Invalid request', 'error');
      throw new Error('Invalid request.');
    }

    const { error } = await supabase
      .from('connections')
      .update({ status: 'declined' })
      .eq('id', connectionId)
      .eq('to_user_id', currentUserCommunityId);

    if (error) {
      showToast('Failed to decline connection', 'error');
      throw error;
    }
    
    showToast('Connection declined', 'info');
    
    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('connectionDeclined', {
        detail: { connectionId }
      }));
    }
    
    return { success: true, message: 'Connection declined.' };
  } catch (error) {
    console.error('declineConnectionRequest error:', error);
    throw error;
  }
}

// Cancel a sent connection request
export async function cancelConnectionRequest(connectionId) {
  if (!connectionId || !currentUserCommunityId) {
    throw new Error('Invalid request.');
  }

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
  if (!connectionId || !currentUserCommunityId) {
    throw new Error('Invalid request.');
  }

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
  // Guard against null/undefined IDs
  if (!userId1 || !userId2) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .or(`and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`)
      .limit(1)
      .single();

    if (error) {
      // If no rows found, that's okay - return null
      if (error.code === 'PGRST116') {
        return null;
      }
      console.warn('getConnectionBetween error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.warn('getConnectionBetween exception:', err);
    return null;
  }
}

// Get all connections for a user
export async function getUserConnections(communityId, status = null) {
  // Guard against null/undefined ID
  if (!communityId) {
    return [];
  }

  try {
    let query = supabase
      .from('connections')
      .select('*')
      .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('getUserConnections error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('getUserConnections exception:', err);
    return [];
  }
}

// Get pending requests received by current user
export async function getPendingRequestsReceived() {
  if (!currentUserCommunityId) {
    console.log('getPendingRequestsReceived: No currentUserCommunityId, returning empty');
    return [];
  }

  try {
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
  } catch (err) {
    console.warn('getPendingRequestsReceived exception:', err);
    return await getPendingRequestsReceivedFallback();
  }
}

// Fallback if join doesn't work
async function getPendingRequestsReceivedFallback() {
  if (!currentUserCommunityId) return [];

  try {
    const { data: connections, error } = await supabase
      .from('connections')
      .select('id, from_user_id, created_at')
      .eq('to_user_id', currentUserCommunityId)
      .eq('status', 'pending');

    if (error || !connections?.length) return [];

    // Fetch user details separately
    const userIds = connections.map(c => c.from_user_id).filter(Boolean);
    if (userIds.length === 0) return [];

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
  } catch (err) {
    console.warn('getPendingRequestsReceivedFallback exception:', err);
    return [];
  }
}

// Get pending requests sent by current user
export async function getPendingRequestsSent() {
  if (!currentUserCommunityId) {
    console.log('getPendingRequestsSent: No currentUserCommunityId, returning empty');
    return [];
  }

  try {
    const { data: connections, error } = await supabase
      .from('connections')
      .select('id, to_user_id, created_at')
      .eq('from_user_id', currentUserCommunityId)
      .eq('status', 'pending');

    if (error || !connections?.length) return [];

    const userIds = connections.map(c => c.to_user_id).filter(Boolean);
    if (userIds.length === 0) return [];

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
  } catch (err) {
    console.warn('getPendingRequestsSent exception:', err);
    return [];
  }
}

// Get accepted connections for current user
export async function getAcceptedConnections() {
  if (!currentUserCommunityId) {
    console.log('getAcceptedConnections: No currentUserCommunityId, returning empty');
    return [];
  }

  try {
    const { data: connections, error } = await supabase
      .from('connections')
      .select('id, from_user_id, to_user_id, created_at')
      .or(`from_user_id.eq.${currentUserCommunityId},to_user_id.eq.${currentUserCommunityId}`)
      .eq('status', 'accepted');

    if (error || !connections?.length) return [];

    // Get the other user's ID for each connection
    const otherUserIds = connections.map(c => 
      c.from_user_id === currentUserCommunityId ? c.to_user_id : c.from_user_id
    ).filter(Boolean);

    if (otherUserIds.length === 0) return [];

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
  } catch (err) {
    console.warn('getAcceptedConnections exception:', err);
    return [];
  }
}

// Get all connections for synapse visualization
export async function getAllConnectionsForSynapse() {
  try {
    const { data, error } = await supabase
      .from('connections')
      .select('id, from_user_id, to_user_id, status, type, created_at');

    if (error) {
      console.warn('Error fetching connections for synapse:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('getAllConnectionsForSynapse exception:', err);
    return [];
  }
}

// ========================
// PRIVACY HELPERS
// ========================

// Check if current user can see another user's email
export async function canSeeEmail(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) return false;
  if (targetCommunityId === currentUserCommunityId) return true;

  const connection = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  return connection?.status === 'accepted';
}

// Get connection status with another user
export async function getConnectionStatus(targetCommunityId) {
  if (!currentUserCommunityId) return { status: 'none', canConnect: false };
  if (!targetCommunityId) return { status: 'none', canConnect: false };
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
  if (!communityId) return;

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
  
  if (!communityIds || communityIds.length === 0) return counts;
  
  communityIds.forEach(id => counts[id] = 0);

  try {
    const { data, error } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .eq('status', 'accepted');

    if (error) {
      console.warn('getConnectionCounts error:', error);
      return counts;
    }

    (data || []).forEach(conn => {
      if (communityIds.includes(conn.from_user_id)) {
        counts[conn.from_user_id]++;
      }
      if (communityIds.includes(conn.to_user_id)) {
        counts[conn.to_user_id]++;
      }
    });

    return counts;
  } catch (err) {
    console.warn('getConnectionCounts exception:', err);
    return counts;
  }
}

// Format time ago
export function formatTimeAgo(dateString) {
  if (!dateString) return 'unknown';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  } catch (err) {
    return 'unknown';
  }
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
