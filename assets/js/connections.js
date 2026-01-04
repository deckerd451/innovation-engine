// connections.js - Complete connection management system
// FINAL VERSION: Fixed 406 PostgREST error and export mapping

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

export async function sendConnectionRequest(recipientId, targetName = 'User', type = 'generic') {
  try {
    if (!currentUserCommunityId) {
      showToast('Profile not found', 'error');
      return { success: false };
    }

    showToast(`Connecting with ${targetName}...`, 'info');

    const existing = await getConnectionBetween(currentUserCommunityId, recipientId);
    if (existing && (existing.status === 'pending' || existing.status === 'accepted')) {
      showToast(`Request already ${existing.status}`, 'info');
      return { success: false };
    }

    const { error } = await supabase.from('connections').insert({
      from_user_id: currentUserCommunityId,
      to_user_id: recipientId,
      status: 'pending',
      type: type
    });

    if (error) {
      if (error.code === '23505') showToast('Already exists', 'info');
      else showToast(error.message, 'error');
      return { success: false };
    }

    showToast(`✓ Request sent to ${targetName}!`, 'success');
    updateConnectionUI(recipientId);

    // Award XP and update quest progress
    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.SEND_CONNECTION, `Sent connection to ${targetName}`);
      await window.DailyEngagement.updateQuestProgress('send_connection', 1);
    }

    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

export async function acceptConnectionRequest(id) {
  const { error } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', id);

  if (!error) {
    showToast('Accepted!', 'success');

    // Award XP for accepting connection
    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.ACCEPT_CONNECTION, 'Accepted connection request');
    }
  }

  return { success: !error };
}

export async function declineConnectionRequest(id) {
  const { error } = await supabase.from('connections').update({ status: 'declined' }).eq('id', id);
  return { success: !error };
}

/**
 * Get connection between two users - handles duplicates gracefully
 * Returns the most recent connection if duplicates exist
 */
export async function getConnectionBetween(id1, id2) {
  if (!id1 || !id2) return null;

  const filter = `and(from_user_id.eq.${id1},to_user_id.eq.${id2}),and(from_user_id.eq.${id2},to_user_id.eq.${id1})`;

  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .or(filter)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Supabase Query Error:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

export async function getConnectionStatus(targetId) {
  if (!currentUserCommunityId || !targetId) return { status: 'none' };
  const conn = await getConnectionBetween(currentUserCommunityId, targetId);
  return conn ? { status: conn.status, id: conn.id } : { status: 'none', canConnect: true };
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
    btn.innerHTML = '✓ Sent';
  });
}

export function formatTimeAgo(d) { return d ? new Date(d).toLocaleDateString() : '---'; }

// Critical: Ensure all functions are both named exports AND in the default export
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  getConnectionBetween,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,
  formatTimeAgo
};
