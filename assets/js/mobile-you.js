// Persistent mobile You destination. It reuses the canonical profile modal
// for editing/settings and the existing project/task records for summaries.
(function () {
  'use strict';
  if (window.MobileYou) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  let request = 0;

  const host = () => document.getElementById('mobile-you-content');
  const screen = () => document.getElementById('mobile-you-screen');

  function hide() {
    const el = screen();
    if (el) el.hidden = true;
    document.body.classList.remove('mobile-you-visible');
  }

  function loading() {
    const el = host();
    if (el) el.innerHTML = '<div class="mobile-you-state" role="status">Loading your space…</div>';
  }

  function signedOut() {
    const el = host();
    if (el) el.innerHTML = '<section class="mobile-you-state"><h1 id="mobile-you-title">You</h1><p>Sign in to see your profile, projects, and contributions.</p></section>';
  }

  function errorState() {
    const el = host();
    if (el) el.innerHTML = '<section class="mobile-you-state"><h1 id="mobile-you-title">You</h1><p>Your profile could not be loaded.</p><button type="button" class="mobile-you-retry">Try again</button></section>';
    el?.querySelector('.mobile-you-retry')?.addEventListener('click', () => render());
  }

  async function loadData(profile) {
    const client = window.supabase;
    if (!client || !profile?.id) return { projects: [], tasks: 0, attempts: 0 };
    const [projectsResult, membershipsResult] = await Promise.all([
      client.from('projects').select('id, title, status, creator_id, description, created_at').order('created_at', { ascending: false }).limit(50),
      client.from('project_members').select('project_id, role').eq('user_id', profile.id),
    ]);
    if (projectsResult.error || membershipsResult.error) throw (projectsResult.error || membershipsResult.error);
    const accepted = new Set((membershipsResult.data || []).filter(row => row.role !== 'pending').map(row => row.project_id));
    const projects = (projectsResult.data || []).filter(project => project.creator_id === profile.id || accepted.has(project.id));
    const ids = projects.map(project => project.id);
    if (!ids.length) return { projects, tasks: 0, attempts: 0 };
    const [tasksResult, attemptsResult] = await Promise.all([
      client.from('project_tasks').select('id', { count: 'exact', head: true }).in('project_id', ids),
      client.from('capability_attempts').select('id', { count: 'exact', head: true }).eq('member_id', profile.id),
    ]);
    return { projects, tasks: tasksResult.error ? 0 : (tasksResult.count || 0), attempts: attemptsResult.error ? 0 : (attemptsResult.count || 0) };
  }

  function renderView(profile, data) {
    const el = host();
    if (!el) return;
    const name = profile.name || profile.full_name || profile.username || 'Member';
    const focus = profile.bio || profile.intent || 'Add a current focus so the community can help you make progress.';
    const projects = data.projects.map(project => `<button type="button" class="mobile-you-project" data-project-id="${esc(project.id)}"><strong>${esc(project.title || 'Untitled project')}</strong><span>${esc(project.status || 'active')}</span></button>`).join('');
    el.innerHTML = `<header class="mobile-you-header"><div class="mobile-you-avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</div><div><p class="mobile-you-eyebrow">Your space</p><h1 id="mobile-you-title">${esc(name)}</h1><p>${esc(profile.email || 'Community member')}</p></div></header>
      <section class="mobile-you-card mobile-you-focus"><h2>Current focus</h2><p>${esc(focus)}</p><div class="mobile-you-actions"><button type="button" class="mobile-you-secondary" data-profile-action="open">Edit profile</button><button type="button" class="mobile-you-secondary" data-profile-action="settings">Settings</button></div></section>
      <section class="mobile-you-card"><div class="mobile-you-section-heading"><h2>Your projects</h2><span>${data.projects.length}</span></div>${projects || '<p class="mobile-you-muted">Projects you join or create will appear here.</p>'}</section>
      <section class="mobile-you-card"><div class="mobile-you-section-heading"><h2>Contributions</h2></div><p class="mobile-you-muted">${data.tasks ? `${data.tasks} task${data.tasks === 1 ? '' : 's'} across your projects` : 'No project tasks yet.'}${data.attempts ? ` · ${data.attempts} method${data.attempts === 1 ? '' : 's'} you tried` : ''}</p></section>
      <button type="button" class="mobile-you-logout" data-profile-action="logout">Log out</button>`;
    el.querySelectorAll('[data-profile-action="open"]').forEach(btn => btn.addEventListener('click', () => window.openProfileModal?.()));
    el.querySelector('[data-profile-action="settings"]')?.addEventListener('click', () => window.SettingsModal?.open?.());
    el.querySelector('[data-profile-action="logout"]')?.addEventListener('click', () => window.doLogout?.());
    el.querySelectorAll('[data-project-id]').forEach(btn => btn.addEventListener('click', () => window.viewProjectDetails?.(btn.dataset.projectId)));
  }

  async function render() {
    const token = ++request;
    const el = screen();
    if (!el) return;
    el.hidden = false;
    document.body.classList.add('mobile-you-visible');
    const profile = window.currentUserProfile || window.CHProfile?.state?.profile;
    if (!profile?.id) { signedOut(); return; }
    loading();
    try {
      const data = await loadData(profile);
      if (token === request) renderView(profile, data);
    } catch (error) {
      console.warn('[MobileYou] load failed:', error);
      if (token === request) errorState();
    }
  }

  window.MobileYou = { show: render, hide, refresh: render };
  window.addEventListener('profile-loaded', () => {
    if (document.querySelector('.mob-tab[data-tab="profile"].active')) render();
  });
  window.addEventListener('user-logged-out', () => { hide(); signedOut(); });
})();
