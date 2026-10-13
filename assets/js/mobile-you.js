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
    if (!client || !profile?.id) return { projects: [], tasks: [], attempts: [] };
    const [projectsResult, membershipsResult] = await Promise.all([
      client.from('projects').select('id, title, status, creator_id, description, created_at').order('created_at', { ascending: false }).limit(50),
      client.from('project_members').select('project_id, role').eq('user_id', profile.id),
    ]);
    if (projectsResult.error || membershipsResult.error) throw (projectsResult.error || membershipsResult.error);
    const accepted = new Set((membershipsResult.data || []).filter(row => row.role !== 'pending').map(row => row.project_id));
    const projects = (projectsResult.data || []).filter(project => project.creator_id === profile.id || accepted.has(project.id));
    const ids = projects.map(project => project.id);
    if (!ids.length) return { projects, tasks: [], attempts: [] };
    const [tasksResult, attemptsResult] = await Promise.all([
      client.from('project_tasks').select('id, project_id, title, status, priority, due_date, created_at').in('project_id', ids).in('status', ['open', 'in_progress']).order('created_at', { ascending: true }).limit(50),
      client.from('capability_attempts').select('id, project_id, goal, outcome_status, verification_status, created_at').eq('member_id', profile.id).order('created_at', { ascending: false }).limit(20),
    ]);
    const projectMap = new Map(projects.map(project => [project.id, project]));
    const tasks = tasksResult.error ? [] : (tasksResult.data || []).map(task => ({ ...task, project: projectMap.get(task.project_id) }));
    const attempts = attemptsResult.error ? [] : (attemptsResult.data || []).map(attempt => ({ ...attempt, project: projectMap.get(attempt.project_id) }));
    return { projects, tasks, attempts };
  }

  function nextTask(tasks) {
    const chooser = window.MobileTodayContinuityTesting?.chooseNextTask;
    return chooser ? chooser(tasks) : (tasks || [])[0] || null;
  }

  function mountGoalSearch() {
    const target = document.getElementById('mobile-you-goal-discovery');
    if (!target || target.dataset.goalMounted === 'true') return;
    if (!window.MobileGoalDiscovery?.mount) {
      window.setTimeout(mountGoalSearch, 250);
      return;
    }
    target.dataset.compact = 'true';
    target.dataset.goalMounted = 'true';
    window.MobileGoalDiscovery.mount(target);
  }

  function renderView(profile, data) {
    const el = host();
    if (!el) return;
    const name = profile.name || profile.full_name || profile.username || 'Member';
    const projects = data.projects.map(project => `<button type="button" class="mobile-you-project" data-project-id="${esc(project.id)}"><strong>${esc(project.title || 'Untitled project')}</strong><span>${esc(project.status || 'active')}</span></button>`).join('');
    const task = nextTask(data.tasks);
    const activeAttempt = data.attempts.find(item => ['planned', 'in_progress'].includes(item.outcome_status));
    const activeProject = task?.project || activeAttempt?.project || data.projects.find(project => ['active', 'in_progress', 'open'].includes(String(project.status || '').toLowerCase()));
    const focus = activeProject?.title || profile.intent || '';
    const completedAttempts = data.attempts.filter(item => ['succeeded', 'not_succeeded'].includes(item.outcome_status)).length;
    const taskAction = task ? `<button type="button" class="mobile-you-primary" data-next-project="${esc(task.project_id)}" data-next-tab="tasks">${task.status === 'in_progress' ? 'Continue' : 'Start'}: ${esc(task.title)}</button><p class="mobile-you-supporting">${esc(task.project?.title || 'Project task')}</p>` : activeAttempt ? `<button type="button" class="mobile-you-primary" data-next-project="${esc(activeAttempt.project_id)}" data-next-tab="capabilities">Record what happened</button><p class="mobile-you-supporting">${esc(activeAttempt.goal || 'Active method attempt')}</p>` : '<p class="mobile-you-muted">No open work yet. Describe a goal below to find a useful path forward.</p>';
    const workSummary = focus ? `<p>${esc(focus)}</p>` : '<p class="mobile-you-muted">Nothing active yet.</p>';
    el.innerHTML = `<header class="mobile-you-header"><div class="mobile-you-avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</div><div><p class="mobile-you-eyebrow">My Space</p><h1 id="mobile-you-title">${esc(name)}</h1></div></header>
      <section class="mobile-you-card mobile-you-focus"><div class="mobile-you-section-heading"><h2>What are you working on?</h2><button type="button" class="mobile-you-inline-action" data-profile-action="open">Change</button></div>${workSummary}</section>
      <section class="mobile-you-card mobile-you-next"><h2>Your next step</h2>${taskAction}</section>
      <section class="mobile-you-card mobile-you-goal"><div class="mobile-you-section-heading"><h2>What do you want to accomplish next?</h2></div><div id="mobile-you-goal-discovery"></div></section>
      <details class="mobile-you-secondary"><summary>Community help</summary><div class="mobile-you-secondary-body"><p class="mobile-you-muted">Find people, projects, methods, and opportunities related to your goal.</p><button type="button" class="mobile-you-secondary" data-go-to-discover>Explore community</button></div></details>
      <details class="mobile-you-secondary"><summary>Your progress</summary><div class="mobile-you-secondary-body"><p class="mobile-you-muted">${completedAttempts ? `${completedAttempts} completed method${completedAttempts === 1 ? '' : 's'}` : 'Outcomes you record will appear here.'}${data.tasks.length ? ` · ${data.tasks.length} open task${data.tasks.length === 1 ? '' : 's'}` : ''}</p></div></details>
      <details class="mobile-you-secondary"><summary>Your projects (${data.projects.length})</summary><div class="mobile-you-secondary-body">${projects || '<p class="mobile-you-muted">Projects you join or create will appear here.</p>'}</div></details>
      <details class="mobile-you-secondary"><summary>Account</summary><div class="mobile-you-secondary-body mobile-you-actions"><button type="button" class="mobile-you-secondary" data-profile-action="settings">Settings</button><button type="button" class="mobile-you-logout" data-profile-action="logout">Log out</button></div></details>`;
    el.querySelectorAll('[data-profile-action="open"]').forEach(btn => btn.addEventListener('click', () => window.openProfileModal?.()));
    el.querySelector('[data-profile-action="settings"]')?.addEventListener('click', () => window.SettingsModal?.open?.());
    el.querySelector('[data-profile-action="logout"]')?.addEventListener('click', () => window.doLogout?.());
    el.querySelector('[data-go-to-discover]')?.addEventListener('click', () => document.querySelector('.mob-tab[data-tab="discover"]')?.click());
    el.querySelector('[data-next-project]')?.addEventListener('click', (event) => {
      window.viewProjectDetails?.(event.currentTarget.dataset.nextProject, event.currentTarget.dataset.nextTab);
    });
    el.querySelectorAll('[data-project-id]').forEach(btn => btn.addEventListener('click', () => window.viewProjectDetails?.(btn.dataset.projectId)));
    mountGoalSearch();
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
    if (document.body.classList.contains('mobile-surface-you')) render();
  });
  window.addEventListener('user-logged-out', () => { hide(); signedOut(); });
  if (document.body.classList.contains('mobile-surface-you')) render();
})();
