// connections.js - Complete connection management system
// FIXED: Restored missing exports and corrected Supabase .or() syntax

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================
function showToast(message, type = 'info') {
  if (typeof document === 'undefined') return;
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
    if (!session?.user) return null;
    currentUserId = session.user.id;
    const { data: profile } = await supabase.from('community').select('id').eq('user_id', currentUserId).single();
    currentUserCommunityId = profile?.id || null;
    return { currentUserId, currentUserCommunityId };
  } catch (err) {
    return null;
  }
}

export function getCurrentUserCommunityId() {
  return currentUserCommunityId;
}

// ========================
// CORE LOGIC
// ========================

export async function sendConnectionRequest(recipientCommunityId, targetUserName = 'User', connectionType = 'generic') {
  try {
    if (!currentUserCommunityId) {
      showToast('Please create your profile first', 'error');
      return { success: false };
    }

    showToast(`Sending request to ${targetUserName}...`, 'info');

    const existing = await getConnectionBetween(currentUserCommunityId, recipientCommunityId);
    if (existing) {
      if (existing.status === 'pending') {
        showToast('Request already pending', 'info');
        return { success: false };
      }
      if (existing.status === 'accepted') {
        showToast('Already connected!', 'info');
        return { success: false };
      }
    }

    const { error } = await supabase.from('connections').insert({
      from_user_id: currentUserCommunityId,
      to_user_id: recipientCommunityId,
      status: 'pending',
      type: connectionType
    });

    if (error) {
      if (error.code === '23505') showToast('Request already exists', 'info');
      else showToast(`Error: ${error.message}`, 'error');
      return { success: false };
    }

    showToast(`✓ Request sent to ${name}!`, 'success');
    updateConnectionUI(recipientCommunityId);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

export async function acceptConnectionRequest(connectionId) {
  const { error } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', connectionId);
  if (error) throw error;
  showToast('Connection accepted!', 'success');
  return { success: true };
}

export async function declineConnectionRequest(connectionId) {
  const { error } = await supabase.from('connections').update({ status: 'declined' }).eq('id', connectionId);
  if (error) throw error;
  showToast('Connection declined', 'info');
  return { success: true };
}

export async function getConnectionBetween(id1, id2) {
  if (!id1 || !id2) return null;
  // FIXED: Corrected spacing and comma placement for PostgREST .or() filter
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .or(`and(from_user_id.eq.${id1},to_user_id.eq.${id2}),and(from_user_id.eq.${id2},to_user_id.eq.${id1})`)
    .maybeSingle();
    
  if (error) console.error('Query Error:', error);
  return data;
}

export async function getConnectionStatus(targetId) {
  if (!currentUserCommunityId || !targetId) return { status: 'none' };
  const conn = await getConnectionBetween(currentUserCommunityId, targetId);
  if (!conn) return { status: 'none', canConnect: true };
  return { status: conn.status, connectionId: conn.id };
}

export async function getAllConnectionsForSynapse() {
  const { data } = await supabase.from('connections').select('*');
  return data || [];
}

export async function canSeeEmail(targetId) {
  if (targetId === currentUserCommunityId) return true;
  const conn = await getConnectionBetween(currentUserCommunityId, targetId);
  return conn?.status === 'accepted';
}

function updateConnectionUI(targetId) {
  const buttons = document.querySelectorAll(`[onclick*="${targetId}"]`);
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-check"></i> Sent';
  });
}

export function formatTimeAgo(d) { return d ? new Date(d).toLocaleDateString() : 'unknown'; }

// ========================
// EXPORTS (CRITICAL FIX)
// ========================
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,
  sendConnectionRequest,
  acceptConnectionRequest, // Restored
  declineConnectionRequest, // Restored
  getConnectionBetween,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,
  formatTimeAgo
};
