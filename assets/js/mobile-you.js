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
      client.from('project_tasks').select('id, project_id, title, description, status, priority, due_date, created_at').in('project_id', ids).in('status', ['open', 'in_progress']).order('created_at', { ascending: true }).limit(50),
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

  function lastUpdate(task) {
    const parsed = window.AssistanceEngine?.parseNotes?.(task?.description);
    const last = parsed?.progress?.[parsed.progress.length - 1];
    return last ? `${last.kind}${last.note ? ` — ${last.note}` : ''}${last.date ? ` (${last.date})` : ''}` : '';
  }

  function renderView(profile, data) {
    const el = host();
    if (!el) return;
    const name = profile.name || profile.full_name || profile.username || 'Member';
    const projects = data.projects.map(project => `<button type="button" class="mobile-you-project" data-project-id="${esc(project.id)}"><strong>${esc(project.title || 'Untitled project')}</strong><span>${esc(project.status || 'active')}</span></button>`).join('');
    const task = nextTask(data.tasks);
    const others = data.tasks.filter(item => item !== task).slice(0, 5);
    const activeAttempt = data.attempts.find(item => ['planned', 'in_progress'].includes(item.outcome_status));
    const completedAttempts = data.attempts.filter(item => ['succeeded', 'not_succeeded'].includes(item.outcome_status)).length;
    const draft = window.MobileTaskAssistance?.latestObjectiveDraft?.();
    const update = task ? lastUpdate(task) : '';
    // One primary move: the most relevant open task opens focused help
    // directly. The profile biography is never presented as an objective.
    const next = task
      ? `<section class="mobile-you-card mobile-you-next" aria-labelledby="mobile-you-next-title"><p class="mobile-you-eyebrow">Pick up where you left off</p><h2 id="mobile-you-next-title">${esc(task.title)}</h2><p class="mobile-you-supporting">${esc(task.project?.title || 'Project task')} · ${task.status === 'in_progress' ? 'In progress' : 'Not started'}</p>${update ? `<p class="mobile-you-update">Last update: ${esc(update)}</p>` : ''}<button type="button" class="mobile-you-primary" data-next-project="${esc(task.project_id)}" data-next-task="${esc(task.id)}">Get help with this</button></section>`
      : activeAttempt
        ? `<section class="mobile-you-card mobile-you-next"><p class="mobile-you-eyebrow">Waiting on a result</p><h2>${esc(activeAttempt.goal || 'A method you started')}</h2><button type="button" class="mobile-you-primary" data-next-project="${esc(activeAttempt.project_id)}" data-next-tab="work">Record what happened</button></section>`
        : '';
    const resume = draft && !task ? `<button type="button" class="mobile-you-resume" data-resume-objective>Resume: ${esc(draft.objective)} <span>(draft on this device)</span></button>` : '';
    el.innerHTML = `<header class="mobile-you-header"><div class="mobile-you-avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</div><div><p class="mobile-you-eyebrow">Home</p><h1 id="mobile-you-title">${esc(name)}</h1></div></header>
      ${next}
      <section class="mobile-you-card mobile-you-goal" aria-labelledby="mobile-you-goal-title"><h2 id="mobile-you-goal-title">${task ? 'Something else to accomplish?' : 'What do you want to accomplish?'}</h2><p class="mobile-you-muted">Describe it in your own words. Buildspace prepares something you can use right away — no project needed first.</p><div id="mobile-you-goal-discovery"></div>${resume}</section>
      ${others.length ? `<details class="mobile-you-secondary"><summary>Your other open tasks (${others.length})</summary><div class="mobile-you-secondary-body">${others.map(item => `<button type="button" class="mobile-you-project" data-next-project="${esc(item.project_id)}" data-next-task="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.project?.title || 'Project')}</span></button>`).join('')}</div></details>` : ''}
      <details class="mobile-you-secondary"><summary>Your projects (${data.projects.length})</summary><div class="mobile-you-secondary-body">${projects || '<p class="mobile-you-muted">Projects you join or create will appear here.</p>'}${completedAttempts ? `<p class="mobile-you-muted">${completedAttempts} method result${completedAttempts === 1 ? '' : 's'} recorded.</p>` : ''}</div></details>
      <details class="mobile-you-secondary"><summary>Account</summary><div class="mobile-you-secondary-body mobile-you-actions"><button type="button" class="mobile-you-secondary" data-profile-action="open">Edit profile</button><button type="button" class="mobile-you-secondary" data-profile-action="settings">Settings</button><button type="button" class="mobile-you-logout" data-profile-action="logout">Log out</button></div></details>`;
    el.querySelectorAll('[data-profile-action="open"]').forEach(btn => btn.addEventListener('click', () => window.openProfileModal?.()));
    el.querySelector('[data-profile-action="settings"]')?.addEventListener('click', () => window.SettingsModal?.open?.());
    el.querySelector('[data-profile-action="logout"]')?.addEventListener('click', () => window.doLogout?.());
    el.querySelector('[data-resume-objective]')?.addEventListener('click', () => window.MobileTaskAssistance?.openObjective?.(draft.objective));
    el.querySelectorAll('[data-next-project]').forEach(button => button.addEventListener('click', (event) => {
      const target = event.currentTarget;
      if (target.dataset.nextTask && window.viewProjectTask) window.viewProjectTask(target.dataset.nextProject, target.dataset.nextTask);
      else window.viewProjectDetails?.(target.dataset.nextProject, target.dataset.nextTab);
    }));
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
  // Returning from focused assistance reflects what was saved there.
  window.addEventListener('mobile-assistance-closed', () => {
    if (document.body.classList.contains('mobile-surface-you')) render();
  });
  if (document.body.classList.contains('mobile-surface-you')) render();
})();
