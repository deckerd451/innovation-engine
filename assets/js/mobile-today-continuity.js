// Today continuity reads the existing project_tasks and capability_attempts
// records. It does not create a second task list or execution model.
(function () {
  'use strict';
  if (window.MobileTodayContinuity) return;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  let loading = false;

  async function load(profileId) {
    if (!profileId || !window.supabase || loading) return;
    loading = true;
    try {
      const [projectsResult, membershipsResult] = await Promise.all([
        window.supabase.from('projects').select('id, title, creator_id').order('created_at', { ascending: false }),
        window.supabase.from('project_members').select('project_id, role').eq('user_id', profileId),
      ]);
      if (projectsResult.error || membershipsResult.error) return;
      const accepted = new Set((membershipsResult.data || []).filter(row => row.role !== 'pending').map(row => row.project_id));
      const projects = (projectsResult.data || []).filter(project => project.creator_id === profileId || accepted.has(project.id));
      const ids = projects.map(project => project.id);
      if (!ids.length) return render(null, null, []);
      const projectMap = new Map(projects.map(project => [project.id, project]));
      const [tasksResult, attemptsResult] = await Promise.all([
        window.supabase.from('project_tasks').select('id, project_id, title, status, priority, due_date, created_at').in('project_id', ids).in('status', ['open', 'in_progress']).order('created_at', { ascending: true }).limit(50),
        window.supabase.from('capability_attempts').select('id, project_id, goal, outcome_status, created_at').eq('member_id', profileId).in('outcome_status', ['planned', 'in_progress']).order('created_at', { ascending: false }).limit(20),
      ]);
      render((tasksResult.data || []).map(task => ({ ...task, project: projectMap.get(task.project_id) })), (attemptsResult.data || []).map(attempt => ({ ...attempt, project: projectMap.get(attempt.project_id) })), projects);
    } finally { loading = false; }
  }

  function render(tasks, attempts) {
    const focus = document.getElementById('cd-focus');
    if (!focus || !document.querySelector('.mob-tab[data-tab="home"].active')) return;
    let card = document.getElementById('cd-mobile-continuity');
    if (!card) { card = document.createElement('section'); card.id = 'cd-mobile-continuity'; card.className = 'cd-mobile-continuity'; focus.appendChild(card); }
    if (!tasks && !attempts) { card.innerHTML = ''; return; }
    const task = tasks?.slice().sort((a, b) => (a.status === 'in_progress' ? -1 : 1) - (b.status === 'in_progress' ? -1 : 1))[0];
    const attempt = attempts?.[0];
    card.innerHTML = `${task ? `<div class="cd-continuity-label">Continue your work</div><h3>${escape(task.title)}</h3><p>${escape(task.project?.title || 'Project task')} · ${task.status === 'in_progress' ? 'In progress' : 'Ready to start'}</p><button type="button" data-continuity-project="${escape(task.project_id)}" data-continuity-tab="tasks">Open task</button>` : '<div class="cd-continuity-empty">No open project tasks yet.</div>'}${attempt ? `<div class="cd-continuity-reminder"><strong>Report one result</strong><span>${escape(attempt.goal || 'Your capability attempt is still in progress')}</span><button type="button" data-continuity-project="${escape(attempt.project_id)}" data-continuity-tab="capabilities">Record outcome</button></div>` : ''}`;
    card.querySelectorAll('[data-continuity-project]').forEach(button => button.addEventListener('click', () => {
      window.viewProjectDetails?.(button.dataset.continuityProject);
      setTimeout(() => document.querySelector(`#project-detail-overlay [data-tab="${button.dataset.continuityTab}"]`)?.click(), 250);
    }));
  }

  function refresh() { if (document.querySelector('.mob-tab[data-tab="home"].active')) load(window.currentUserProfile?.id); }
  window.MobileTodayContinuity = { load, refresh };
  window.addEventListener('profile-loaded', refresh);
  window.addEventListener('mobile-today-entered', refresh);
  window.addEventListener('project-task-updated', refresh);
  window.addEventListener('capability-outcome-recorded', refresh);
})();
