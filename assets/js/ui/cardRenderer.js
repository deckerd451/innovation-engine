// /assets/js/ui/cardRenderer.js
import { el, qs } from './dom.js';
import { appState, showNotification } from '../globals.js';
import { getMyProfile, upsertProfile } from '../api/profiles.js';
import { fetchConnections } from '../api/connections.js';

// Public entry — called by pages/dashboard.js
export function renderCards(mountEl) {
  mountEl.replaceChildren(buildShell());
  routeTo('profile'); // default tab
  wireTabClicks(mountEl);
}

function buildShell() {
  return el('div', { id: 'dex-cards', class: 'dex-cards' },
    el('div', { class: 'dex-tabs' },
      tabButton('profile', 'Profile'),
      tabButton('community', 'Community'),
      tabButton('connections', 'Connections')
    ),
    el('section', { id: 'dex-panel', class: 'dex-panel' }, 'Loading…')
  );
}

function tabButton(id, label) {
  return el('button', { class: 'dex-tab', 'data-tab': id }, label);
}

function wireTabClicks(root) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.dex-tab');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    routeTo(tab);
  });
}

async function routeTo(tab) {
  const panel = qs('#dex-panel');
  setActiveTab(tab);

  try {
    if (tab === 'profile') {
      panel.replaceChildren(await renderProfilePanel());
    } else if (tab === 'community') {
      panel.replaceChildren(await renderCommunityPanel());
    } else if (tab === 'connections') {
      panel.replaceChildren(await renderConnectionsPanel());
    } else {
      panel.textContent = 'Unknown section.';
    }
  } catch (err) {
    console.error('[DEX] panel render error:', err);
    panel.textContent = 'There was a problem loading this section.';
  }
}

function setActiveTab(tab) {
  document.querySelectorAll('.dex-tab').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-tab') === tab)
  );
}

/* ===================== Profile ===================== */

async function renderProfilePanel() {
  const user = appState.session?.user;
  if (!user) return el('div', {}, 'Please log in to edit your profile.');

  const prof = await getMyProfile(user.id) ?? {};
  const form = el('form', { id: 'dex-profile-form', class: 'dex-form' },
    el('h3', {}, 'Your Profile'),
    labeled('Name', el('input', { name: 'name', required: true, value: prof.name ?? '' })),
    labeled('Role', el('input', { name: 'role', value: prof.role ?? '' })),
    labeled('Interests (comma-separated)', el('input', { name: 'interests', value: arrayToCSV(prof.interests) })),
    el('div', { class: 'dex-actions' },
      el('button', { type: 'submit' }, 'Save')
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await upsertProfile({
        id: user.id,
        name: (fd.get('name') || '').toString().trim(),
        role: (fd.get('role') || '').toString().trim(),
        interests: csvToArray(fd.get('interests')),
      });
      showNotification?.('Profile saved');
    } catch (err) {
      console.error(err);
      showNotification?.('Error saving profile');
    }
  });

  return el('div', {}, form);
}

/* ===================== Community =====================
   Simple read-only view of recent community members.
   You can replace this with your richer Innovation Engine UI later.
====================================================== */

async function renderCommunityPanel() {
  // Minimal: show the 50 most recent community rows
  const rows = await fetchRecentCommunity(50);

  const list = el('div', { class: 'dex-list' },
    el('div', { class: 'dex-list-head' },
      el('div', {}, 'Name'),
      el('div', {}, 'Role'),
      el('div', {}, 'Interests')
    ),
    ...rows.map(r => el('div', { class: 'dex-row' },
      el('div', {}, r.name ?? '—'),
      el('div', {}, r.role ?? '—'),
      el('div', {}, arrayToCSV(r.interests) || '—')
    ))
  );

  return el('div', {},
    el('h3', {}, 'Community'),
    list
  );
}

async function fetchRecentCommunity(limit = 50) {
  // Lazy-load via supabase client directly to avoid adding another api file
  const { supabaseClient } = await import('../supabaseClient.js');
  const { data, error } = await supabaseClient
    .from('community')
    .select('id,name,role,interests,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/* ===================== Connections ===================== */

async function renderConnectionsPanel() {
  const user = appState.session?.user;
  if (!user) return el('div', {}, 'Log in to see your connections.');

  const conns = await fetchConnections();
  const mine = conns.filter(c =>
    c.source_id === user.id || c.target_id === user.id
  );

  if (!mine.length) {
    return el('div', {},
      el('h3', {}, 'Connections'),
      el('p', {}, 'No connections yet. Start by exploring the Community tab.')
    );
  }

  const list = el('div', { class: 'dex-list' },
    el('div', { class: 'dex-list-head' },
      el('div', {}, 'Source'),
      el('div', {}, 'Target'),
      el('div', {}, 'Label')
    ),
    ...mine.map(c => el('div', { class: 'dex-row' },
      el('div', {}, shortId(c.source_id)),
      el('div', {}, shortId(c.target_id)),
      el('div', {}, c.label ?? '—')
    ))
  );

  return el('div', {},
    el('h3', {}, 'Your Connections'),
    list
  );
}

/* ===================== Helpers ===================== */

function labeled(text, inputEl) {
  return el('label', { class: 'dex-label' }, el('span', { class: 'dex-label-text' }, text), inputEl);
}

function csvToArray(v) {
  return (v || '')
    .toString()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function arrayToCSV(a) {
  return Array.isArray(a) ? a.join(', ') : (a ?? '');
}

function shortId(id) {
  return (id || '').toString().slice(0, 8);
}
