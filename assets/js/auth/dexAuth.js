// /assets/js/auth/dexAuth.js
import { supabaseClient as supabase } from '../supabaseClient.js';
import { appState, showNotification } from '../globals.js';

export async function initAuth() {
  // Handle magic link flow (#type=magiclink & tokens in hash)
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('type') === 'magiclink' && h.get('access_token') && h.get('refresh_token')) {
    try {
      const { error } = await supabase.auth.setSession({
        access_token: h.get('access_token'),
        refresh_token: h.get('refresh_token')
      });
      if (error) throw error;
      history.replaceState({}, '', location.pathname + location.search);
      showNotification?.('Logged in.');
    } catch (e) {
      console.error('[DEX] setSession failed:', e);
      showNotification?.('Login failed.');
    }
  }

  // Seed appState
  const { data: { session } } = await supabase.auth.getSession();
  appState.session = session ?? null;

  // Button wiring
  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: location.href }
    });
    if (error) showNotification?.('Login error.');
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showNotification?.('Logged out.');
  });

  // React to auth changes
  supabase.auth.onAuthStateChange((_evt, sess) => {
    appState.session = sess ?? null;
    document.dispatchEvent(new CustomEvent('dex:auth-changed', { detail: !!sess }));
    reflectAuthUI();
  });

  reflectAuthUI();
}

function reflectAuthUI() {
  const loggedIn = !!(appState.session && appState.session.user);
  document.getElementById('loginBtn')?.toggleAttribute('hidden', loggedIn);
  document.getElementById('logoutBtn')?.toggleAttribute('hidden', !loggedIn);
  const badge = document.getElementById('userBadge');
  badge.textContent = loggedIn
    ? (appState.session.user.user_metadata?.user_name ?? appState.session.user.email ?? 'Signed in')
    : '';
}
