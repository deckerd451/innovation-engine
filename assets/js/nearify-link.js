// ================================================================
// NEARIFY ACCOUNT LINK — status display
// ================================================================
// Identity linking is initiated from the Nearify app: Nearify opens
// a native OAuth handshake against this project (same Google/GitHub
// providers) and calls link_nearify_account() directly with a real,
// user-scoped Innovation Engine session. This web app never
// initiates or receives that flow — there is no "Connect Nearify"
// redirect here. This module only surfaces the resulting link
// status on the profile, and lets a user unlink from this side too.
//
// Exports (also available on window.NearifyLink):
//   getLinkedStatus()  — { linked, nearifyUserId, linkedAt } from Supabase
//   getCachedStatus()  — synchronous cached read for immediate render
//   unlinkAccount()    — remove the link
// ================================================================

const CACHE_KEY = 'nearify_link_cache';

function _getSupabase() {
  return window.supabase || null;
}

export async function getLinkedStatus() {
  const supabase = _getSupabase();
  if (!supabase) return { linked: false };

  const { data, error } = await supabase.rpc('get_nearify_link_status');
  if (error) {
    console.warn('[NearifyLink] Status check failed:', error.message);
    return { linked: false };
  }

  const result = typeof data === 'string' ? JSON.parse(data) : data;

  if (result?.linked) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      linked: true,
      nearifyUserId: result.nearify_user_id,
      linkedAt: result.linked_at,
    }));
  } else {
    localStorage.removeItem(CACHE_KEY);
  }

  return {
    linked: !!result?.linked,
    nearifyUserId: result?.nearify_user_id || null,
    linkedAt: result?.linked_at || null,
  };
}

// Returns cached status synchronously — used for immediate profile render
export function getCachedStatus() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : { linked: false };
  } catch {
    return { linked: false };
  }
}

export async function unlinkAccount() {
  const supabase = _getSupabase();
  if (!supabase) return { success: false, error: 'Supabase not initialized' };

  const { data, error } = await supabase.rpc('unlink_nearify_account');
  if (error) {
    console.error('[NearifyLink] Unlink error:', error.message);
    return { success: false, error: error.message };
  }

  localStorage.removeItem(CACHE_KEY);
  window.dispatchEvent(new CustomEvent('nearify-unlinked'));

  return { success: true };
}

window.NearifyLink = {
  getLinkedStatus,
  getCachedStatus,
  unlinkAccount,
};

export default window.NearifyLink;
