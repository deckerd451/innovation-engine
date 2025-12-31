// connections.js - Complete connection management system (MERGED & OPTIMIZED)
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

export async function initConnections(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();
  
  if (typeof window !== 'undefined') {
    window.sendConnectionRequest = sendConnectionRequest;
  }
  
  console.log('%c✓ Connections module initialized', 'color: #0f0');
  return { currentUserId, currentUserCommunityId };
}

export async function refreshCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      currentUserId = null;
      currentUserCommunityId = null;
      return null;
    }
    currentUserId = session.user.id;
    const { data: profile } = await supabase.from('community').select('id').eq('user_id', currentUserId).single();
    currentUserCommunityId = profile?.id || null;
    return { currentUserId, currentUserCommunityId };
  } catch (err) {
    console.warn('Could not refresh user:', err);
    return null;
  }
}

export function getCurrentUserCommunityId() {
  return currentUserCommunityId;
}

// ========================
// CONNECTION REQUESTS (Improved)
// ========================

export async function sendConnectionRequest(recipientCommunityId, targetUserName = 'User', connectionType = 'generic') {
  try {
    if (!currentUserCommunityId) {
      showToast('Please create your profile first', 'error');
      return { success: false };
    }

    showToast(`Sending connection request to ${targetUserName}...`, 'info');

    if (recipientCommunityId === currentUserCommunityId) {
      showToast("You can't connect with yourself", 'info');
      return { success: false };
    }

    const existing = await getConnectionBetween(currentUserCommunityId, recipientCommunityId);
    if (existing) {
      if (existing.status === 'pending') {
        showToast('Connection request already pending', 'info');
        updateConnectionUI(recipientCommunityId);
        return { success: false };
      } else if (existing.status === 'accepted') {
        showToast('You are already connected!', 'info');
        return { success: false };
      } else if (existing.status === 'declined') {
        const { error: updateError } = await supabase
          .from('connections')
          .update({ status: 'pending', created_at: new Date().toISOString() })
          .eq('id', existing.id);
        
        if (updateError) throw updateError;
        handleRequestSuccess(recipientCommunityId, targetUserName, connectionType);
        return { success: true };
      }
    }

    const { error } = await supabase
      .from('connections')
      .insert({
        from_user_id: currentUserCommunityId,
        to_user_id: recipientCommunityId,
        status: 'pending',
        type: connectionType
      });

    if (error) {
      if (error.code === '23505') { 
        showToast('Connection request already exists', 'info');
        updateConnectionUI(recipientCommunityId);
      } else {
        showToast(`Failed: ${error.message}`, 'error');
      }
      return { success: false };
    }

    await updateConnectionCount(currentUserCommunityId);
    handleRequestSuccess(recipientCommunityId, targetUserName, connectionType);
    return { success: true };

  } catch (err) {
    console.error('Connection Request Error:', err);
    showToast('Failed to send request', 'error');
    return { success: false };
  }
}

function handleRequestSuccess(recipientId, name, type) {
  showToast(`✓ Request sent to ${name}!`, 'success');
  updateConnectionUI(recipientId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('connectionRequestSent', {
      detail: { recipientCommunityId: recipientId, targetUserName: name, connectionType: type }
    }));
  }
}

function updateConnectionUI(targetId) {
  if (typeof document === 'undefined') return;
  const buttons = document.querySelectorAll(`[onclick*="${targetId}"], [data-user-id="${targetId}"]`);
  buttons.forEach(btn => {
    if (btn.textContent.includes('Connect') || btn.classList.contains('connect-btn')) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-check"></i> Request Sent';
      btn.style.opacity = '0.6';
    }
  });
}

// ========================
// FETCHING & UTILITIES (Preserved from original)
// ========================

export async function getConnectionBetween(userId1, userId2) {
  if (!userId1 || !userId2) return null;
  const { data, error } = await supabase.from('connections').select('*').or(`and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`).limit(1).single();
  if (error && error.code !== 'PGRST116') return null;
  return data;
}

export async function getAllConnectionsForSynapse() {
  const { data } = await supabase.from('connections').select('id, from_user_id, to_user_id, status, type, created_at');
  return data || [];
}

export async function getAcceptedConnections() {
  if (!currentUserCommunityId) return [];
  const { data: connections } = await supabase.from('connections').select('*').or(`from_user_id.eq.${currentUserCommunityId},to_user_id.eq.${currentUserCommunityId}`).eq('status', 'accepted');
  if (!connections?.length) return [];
  const otherIds = connections.map(c => c.from_user_id === currentUserCommunityId ? c.to_user_id : c.from_user_id);
  const { data: users } = await supabase.from('community').select('*').in('id', otherIds);
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  return connections.map(c => ({ ...c, community: userMap[c.from_user_id === currentUserCommunityId ? c.to_user_id : c.from_user_id] }));
}

export async function getConnectionStatus(targetId) {
  if (!currentUserCommunityId || !targetId) return { status: 'none', canConnect: false };
  if (targetId === currentUserCommunityId) return { status: 'self', canConnect: false };
  const conn = await getConnectionBetween(currentUserCommunityId, targetId);
  if (!conn) return { status: 'none', canConnect: true };
  return { status: conn.status, connectionId: conn.id, canConnect: conn.status === 'declined', isSender: conn.from_user_id === currentUserCommunityId };
}

export async function canSeeEmail(targetId) {
  if (targetId === currentUserCommunityId) return true;
  const conn = await getConnectionBetween(currentUserCommunityId, targetId);
  return conn?.status === 'accepted';
}

async function updateConnectionCount(id) {
  const { data } = await supabase.from('connections').select('id').or(`from_user_id.eq.${id},to_user_id.eq.${id}`).eq('status', 'accepted');
  await supabase.from('community').update({ connection_count: data?.length || 0 }).eq('id', id);
}

export function formatTimeAgo(dateString) {
  if (!dateString) return 'unknown';
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(dateString).toLocaleDateString();
}

// Full export list for drop-in compatibility
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,
  sendConnectionRequest,
  getConnectionBetween,
  getAcceptedConnections,
  getAllConnectionsForSynapse,
  getConnectionStatus,
  canSeeEmail,
  formatTimeAgo
};
