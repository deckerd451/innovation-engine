// ================================================================
// NEARIFY ACCOUNT LINKING
// ================================================================
// Handles the OAuth-based account linking flow between Nearify
// and Innovation Engine.
//
// Flow:
//   1. User clicks "Connect Nearify" in IE profile
//   2. IE redirects to nearify.org/connect?redirect_uri=...&state=<csrf>
//   3. Nearify authenticates the user (same GitHub/Google OAuth)
//   4. Nearify redirects back: <IE_URL>?nearify_id=<id>&state=<csrf>
//   5. This module reads the params, verifies state, calls RPC
//   6. Profile shows linked status
//
// Exports (also available on window.NearifyLink):
//   initiateLinkFlow()   — start the OAuth linking redirect
//   getLinkedStatus()    — { linked, nearifyUserId, linkedAt } from Supabase
//   unlinkAccount()      — remove the link
// ================================================================

const NEARIFY_CONNECT_URL = 'https://nearify.org/connect';
const STATE_KEY = 'nearify_link_state';
const CACHE_KEY = 'nearify_link_cache';

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function _randomState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function _getSupabase() {
  return window.supabase || null;
}

// ----------------------------------------------------------------
// Initiate linking flow
// ----------------------------------------------------------------

export function initiateLinkFlow() {
  const state = _randomState();
  sessionStorage.setItem(STATE_KEY, state);

  const redirectUri = window.location.origin + window.location.pathname;
  const url = new URL(NEARIFY_CONNECT_URL);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  window.location.href = url.toString();
}

// ----------------------------------------------------------------
// Handle OAuth callback (call on page load)
// ----------------------------------------------------------------

export async function handleLinkCallback() {
  const params = new URLSearchParams(window.location.search);
  const nearifyId = params.get('nearify_id');
  const returnedState = params.get('state');

  if (!nearifyId) return null;

  // Verify CSRF state
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!expectedState || returnedState !== expectedState) {
    console.error('[NearifyLink] State mismatch — possible CSRF. Aborting link.');
    _cleanCallbackParams();
    return { success: false, error: 'State mismatch' };
  }

  const supabase = _getSupabase();
  if (!supabase) {
    console.error('[NearifyLink] Supabase not ready');
    return { success: false, error: 'Supabase not initialized' };
  }

  console.log('[NearifyLink] Linking nearify_id:', nearifyId);

  const { data, error } = await supabase.rpc('link_nearify_account', {
    p_nearify_user_id: nearifyId,
  });

  _cleanCallbackParams();

  if (error) {
    console.error('[NearifyLink] RPC error:', error.message);
    return { success: false, error: error.message };
  }

  const result = typeof data === 'string' ? JSON.parse(data) : data;

  if (result?.success) {
    // Cache so profile renders immediately on next open
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      linked: true,
      nearifyUserId: nearifyId,
      linkedAt: new Date().toISOString(),
    }));
    console.log('[NearifyLink] ✅ Account linked:', nearifyId);
    window.dispatchEvent(new CustomEvent('nearify-linked', { detail: { nearifyUserId: nearifyId } }));
  }

  return result;
}

// Remove nearify_id + state params from URL without reload
function _cleanCallbackParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('nearify_id');
  url.searchParams.delete('state');
  history.replaceState(null, '', url.toString());
}

// ----------------------------------------------------------------
// Get linked status
// ----------------------------------------------------------------

export async function getLinkedStatus() {
  const supabase = _getSupabase();
  if (!supabase) return { linked: false };

  const { data, error } = await supabase.rpc('get_nearify_link_status');
  if (error) {
    console.warn('[NearifyLink] Status check failed:', error.message);
    return { linked: false };
  }

  const result = typeof data === 'string' ? JSON.parse(data) : data;

  // Sync cache
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

// Returns cached status synchronously — used by profile render
export function getCachedStatus() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : { linked: false };
  } catch {
    return { linked: false };
  }
}

// ----------------------------------------------------------------
// Unlink account
// ----------------------------------------------------------------

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

// ----------------------------------------------------------------
// Global exposure
// ----------------------------------------------------------------

window.NearifyLink = {
  initiateLinkFlow,
  handleLinkCallback,
  getLinkedStatus,
  getCachedStatus,
  unlinkAccount,
};

// Process callback automatically on module load
handleLinkCallback().then(result => {
  if (result?.success) {
    // Reopen profile modal if it was open when the redirect happened
    if (document.getElementById('profile-modal')?.classList.contains('open')) {
      window.openProfileModal?.();
    }
  }
});

export default window.NearifyLink;
