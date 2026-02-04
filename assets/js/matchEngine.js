// /assets/js/matchEngine.js
// Read-only connection suggestions (no writes yet)

import { supabaseClient as supabase } from './supabaseClient.js';
import { appState, showNotification } from './globals.js';

/* ---------- tiny helpers ---------- */
const norm = a => (Array.isArray(a) ? a : []).map(s => String(s).toLowerCase().trim());
const jaccard = (A, B) => {
  const a = new Set(norm(A)), b = new Set(norm(B));
  const inter = [...a].filter(x => b.has(x)).length;
  const uni = new Set([...a, ...b]).size || 1;
  return inter / uni;
};
const complementarity = (mine, theirs) => {
  const a = new Set(norm(mine)), b = new Set(norm(theirs));
  const uniqueA = [...a].filter(x => !b.has(x)).length;
  const uniqueB = [...b].filter(x => !a.has(x)).length;
  const denom = uniqueA + uniqueB || 1;
  return Math.min(uniqueA, uniqueB) / denom;
};

async function currentUserId() {
  // Prefer existing session if you store it in appState
  const idFromState = appState?.session?.user?.id;
  if (idFromState) return idFromState;

  // Fallback to Supabase
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

/* ---------- core API ---------- */
export async function fetchSuggestions({ limit = 8 } = {}) {
  const uid = await currentUserId();
  if (!uid) return { me: null, list: [], reason: 'not_logged_in' };

  // Get my profile vector
  const { data: me, error: meErr } = await supabase
    .from('community')
    .select('id, name, role, skills, interests')
    .eq('id', uid)
    .maybeSingle();

  if (meErr || !me) return { me: null, list: [], reason: 'no_profile' };

  // Get others
  const { data: others, error: othersErr } = await supabase
    .from('community')
    .select('id, name, role, skills, interests')
    .neq('id', uid)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .limit(500);

  if (othersErr) return { me, list: [], reason: 'fetch_error' };

  const list = (others || [])
    .map(o => {
      const s1 = jaccard(me.interests, o.interests);        // shared interests
      const s2 = complementarity(me.skills, o.skills);      // complementary skills
      const score = 0.6 * s1 + 0.4 * s2;
      return { ...o, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { me, list, reason: null };
}

/* ---------- minimal UI mount ---------- */
export async function mountSuggestions(target) {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) return;

  container.innerHTML = `
    <section id="dex-suggestions" style="max-width:920px;margin:0 auto;">
      <h2 style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; font-size:1.2rem; margin:0 0 .5rem;">
        People you should meet
      </h2>
      <div id="dex-suggestions-list" style="display:grid; gap:.75rem;"></div>
      <div id="dex-suggestions-empty" style="display:none; opacity:.8;"></div>
    </section>
  `;

  const listEl  = container.querySelector('#dex-suggestions-list');
  const emptyEl = container.querySelector('#dex-suggestions-empty');

  // Fetch
  const { me, list, reason } = await fetchSuggestions({ limit: 8 });

  if (reason === 'not_logged_in') {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'Sign in to see personalized suggestions.';
    return;
  }
  if (reason === 'no_profile') {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'Complete your profile to get suggestions.';
    return;
  }
  if (!list.length) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'No suggestions yet—try adding interests and skills.';
    return;
  }

  // Render
  listEl.innerHTML = '';
  list.forEach(p => {
    const el = document.createElement('div');
    el.style.cssText = `
      border:1px solid rgba(0,0,0,.12);
      border-radius:12px;
      padding:.75rem .9rem;
      background: var(--card-bg, rgba(0,0,0,.03));
      display:flex; gap:.75rem; align-items:flex-start; justify-content:space-between;
    `;
    el.innerHTML = `
      <div style="min-width:0;">
        <div style="font-weight:600;">${p.name || 'Unnamed'}</div>
        <div style="opacity:.8; font-size:.9rem; margin:.15rem 0;">${p.role || ''}</div>
        <div style="font-size:.85rem; opacity:.9;">
          <strong>Interests:</strong> ${(norm(p.interests).slice(0,6).join(', ') || '—')}
        </div>
        <div style="font-size:.85rem; opacity:.9;">
          <strong>Skills:</strong> ${(norm(p.skills).slice(0,6).join(', ') || '—')}
        </div>
      </div>
      <div>
        <button data-id="${p.id}" style="
          border:1px solid rgba(0,0,0,.25);
          border-radius:10px; padding:.45rem .7rem; background:white; cursor:pointer;
        ">Introduce</button>
      </div>
    `;
    listEl.appendChild(el);
  });

  // For now, the Introduce button just notifies (writes come in Step 3)
  listEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const targetId = btn.getAttribute('data-id');
    showNotification('Intro draft coming in Step 3 (AI or simple message).');
    console.log('[Dex] Introduce clicked:', { from: 'me', to: targetId });
  });
}

/* ---------- convenience: auto-mount under #app ---------- */
export function attachSuggestionsUI() {
  // Prefer an existing element with id="dex-suggestions-host"; else use #app
  let host = document.getElementById('dex-suggestions-host') || document.getElementById('app');
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
  }
  mountSuggestions(host);
}
