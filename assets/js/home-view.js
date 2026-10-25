// Home: one set of sections at every width, shown in the phone and tablet
// Home screen (#mobile-you-content, mobile-you.js) or the desktop dashboard
// (#cd-home). It composes what already exists -- what others are waiting on
// the member for and the Daily Brief's suggestions (start-daily-digest.js),
// the member's tasks, goal assistance -- and has no data of its own.
//
//   Waiting on you            inbound only: replies, requests, offers
//   Someone you might enjoy   one new introduction, with why
//   Ways to join in           up to two projects or opportunities, with why
//   Pick up where you left off  the next task, other tasks, projects
//   Have something in mind?   goal assistance, collapsed
//
// Sections update on their own: an unread count or a new brief never
// rebuilds Home, so open sections, typed text and scroll stay as they are.
(function () {
  'use strict';
  if (window.HomeView) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  const isDesktop = () => window.innerWidth >= 1024;
  const digest = () => window.StartDailyDigest || {};

  let host = null;
  let request = 0;
  // unread: the live count (as the Inbox badge shows it); the report's own
  // count can be minutes old, so it is only used until the first update.
  const state = { memberId: null, work: null, attention: null, personId: null, unread: null };

  const profile = () => window.currentUserProfile || window.CHProfile?.state?.profile || null;
  const displayName = (p) => String(p?.name || p?.full_name || p?.username || '').trim();
  const part = (name) => host?.querySelector(`[data-home="${name}"]`) || null;
  const showing = () => document.body.dataset.destination === 'home' && !!host && document.contains(host);

  // ---------------------------------------------------------------- tasks

  function taskScore(task, now = Date.now()) {
    let score = task.status === 'in_progress' ? 40 : 0;
    const priority = String(task.priority || '').toLowerCase();
    score += priority === 'high' || priority === 'urgent' ? 24 : priority === 'medium' ? 12 : 0;
    if (task.due_date) {
      const due = new Date(task.due_date).getTime();
      if (Number.isFinite(due)) {
        if (due < now) score += 35;
        else if (due - now <= 48 * 60 * 60 * 1000) score += 18;
      }
    }
    // When equally urgent, resume the task that has been waiting longest.
    const created = new Date(task.created_at || 0).getTime();
    return { score, created: Number.isFinite(created) ? created : 0 };
  }

  function chooseNextTask(tasks, now = Date.now()) {
    return (tasks || []).slice().sort((a, b) => {
      const as = taskScore(a, now);
      const bs = taskScore(b, now);
      return bs.score - as.score || as.created - bs.created || String(a.id).localeCompare(String(b.id));
    })[0] || null;
  }

  // The member's own projects (created, or joined and accepted), however old.
  async function loadWork(memberId) {
    const client = window.supabase;
    if (!client || !memberId) return { projects: [], tasks: [], attempts: [] };
    const columns = 'id, title, status, creator_id, description, created_at';
    const [createdResult, membershipsResult] = await Promise.all([
      client.from('projects').select(columns).eq('creator_id', memberId),
      client.from('project_members').select('project_id, role').eq('user_id', memberId),
    ]);
    if (createdResult.error || membershipsResult.error) throw (createdResult.error || membershipsResult.error);
    const created = createdResult.data || [];
    const createdIds = new Set(created.map(project => String(project.id)));
    const joinedIds = [...new Set((membershipsResult.data || [])
      .filter(row => row.role !== 'pending' && !createdIds.has(String(row.project_id)))
      .map(row => row.project_id))];
    let joined = [];
    if (joinedIds.length) {
      const joinedResult = await client.from('projects').select(columns).in('id', joinedIds);
      if (joinedResult.error) throw joinedResult.error;
      joined = joinedResult.data || [];
    }
    const projects = [...created, ...joined].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const ids = projects.map(project => project.id);
    if (!ids.length) return { projects, tasks: [], attempts: [] };
    const [tasksResult, attemptsResult] = await Promise.all([
      client.from('project_tasks').select('id, project_id, title, description, status, priority, due_date, created_at').in('project_id', ids).in('status', ['open', 'in_progress']).order('created_at', { ascending: true }).limit(50),
      client.from('capability_attempts').select('id, project_id, goal, outcome_status, verification_status, created_at').eq('member_id', memberId).order('created_at', { ascending: false }).limit(20),
    ]);
    const projectMap = new Map(projects.map(project => [project.id, project]));
    const tasks = tasksResult.error ? [] : (tasksResult.data || []).map(task => ({ ...task, project: projectMap.get(task.project_id) }));
    const attempts = attemptsResult.error ? [] : (attemptsResult.data || []).map(attempt => ({ ...attempt, project: projectMap.get(attempt.project_id) }));
    return { projects, tasks, attempts };
  }

  function lastUpdate(task) {
    const parsed = window.AssistanceEngine?.parseNotes?.(task?.description);
    const last = parsed?.progress?.[parsed.progress.length - 1];
    return last ? `${last.kind}${last.note ? ` — ${last.note}` : ''}${last.date ? ` (${last.date})` : ''}` : '';
  }

  // ---------------------------------------------------------------- sections

  function setSection(name, html) {
    const el = part(name);
    if (!el) return;
    el.hidden = !html;
    el.innerHTML = html || '';
  }

  function paintAttention() {
    const rows = (digest().inboundAttention?.(state.attention || {}) || []).filter(row => row.key !== 'unread_messages');
    const unread = state.unread ?? Number(state.attention?.immediate_actions?.unread_messages?.count || 0);
    if (unread > 0) rows.splice(0, 0, { key: 'unread_messages', count: unread, message: n => `${n === 1 ? 'Someone is' : `${n} people are`} waiting on your reply`, action: 'Reply', handler: 'openMessaging' });
    setSection('attention', rows.length ? `<h2 class="home-heading" id="home-attention-title">Waiting on you</h2>
      <ul class="home-rows">${rows.map(row => `<li class="home-row"><span>${esc(row.message(row.count))}</span><button type="button" class="home-action" data-attention="${esc(row.handler)}">${esc(row.action)}</button></li>`).join('')}</ul>` : '');
    part('attention')?.querySelectorAll('[data-attention]').forEach(button => button.addEventListener('click', (event) => {
      const handler = event.currentTarget.dataset.attention;
      if (handler === 'openMessaging') window.AppNav?.go?.('inbox');
      else window.EnhancedStartUI?.handleAction?.(handler, event);
    }));
  }

  function paintProfilePrompt() {
    const p = profile();
    const filled = [displayName(p), p?.bio, p?.skills, p?.interests, p?.image_url || p?.avatar_storage_path]
      .filter(value => Array.isArray(value) ? value.length : !!value).length;
    // An invitation, not a setup step: interests are optional.
    setSection('profile', p && filled < 4 ? `<div><h2 class="home-heading" id="home-curious-title">What are you curious about?</h2>
      <p>Share a few interests and Home will point you to people and projects you might enjoy. It’s optional, and you can skip it.</p></div>
      <button type="button" class="home-link" data-home-action="edit-profile">Share your interests</button>` : '');
    part('profile')?.querySelector('[data-home-action="edit-profile"]')?.addEventListener('click', () => window.openProfileEditor?.());
  }

  function paintMeet() {
    const suggestions = digest().homeSuggestions?.() || { status: 'unavailable', person: null };
    const el = part('meet');
    if (!el) return;
    if (suggestions.status === 'loading') {
      state.personId = null;
      setSection('meet', '<h2 class="home-heading">Someone you might enjoy meeting</h2><p class="home-muted" role="status">Looking for people who share your interests…</p>');
      return;
    }
    const person = suggestions.person;
    if (!person) { state.personId = null; setSection('meet', ''); return; }
    // The card keeps its own state (a request sent); redraw it only for
    // someone new.
    if (state.personId === person.id && el.querySelector('.network-reflection-concierge')) return;
    state.personId = person.id;
    setSection('meet', '<h2 class="home-heading" id="home-meet-title">Someone you might enjoy meeting</h2><div class="home-meet-card"></div>');
    digest().renderIntroduction?.(el.querySelector('.home-meet-card'), person, () => {
      state.personId = null;
      setSection('meet', '');
      paintQuiet();
    });
  }

  function open(item) {
    const opened = digest().selectReflectionEntity?.(item.type, item.entityId, item.name);
    if (!opened) window.openNodePanel?.({ id: item.entityId, type: item.type, name: item.name });
  }

  // Invitations only: never a project the member already created or joined.
  function paintJoin() {
    const ownProjectIds = state.work && state.work !== 'error' ? state.work.projects.map(project => project.id) : [];
    const suggestions = digest().homeSuggestions?.({ ownProjectIds }) || { joinIn: [] };
    const items = suggestions.joinIn || [];
    const kind = (type) => ({ project: 'Project', opportunity: 'Opportunity', theme: 'Theme', organization: 'Organization' }[type] || '');
    setSection('join', items.length ? `<h2 class="home-heading">Ways to join in</h2>
      <ul class="home-rows">${items.map((item, index) => `<li class="home-item"><div><span class="home-kind">${esc(kind(item.type))}</span><strong>${esc(item.name)}</strong><p>${esc(item.reason)}</p></div><button type="button" class="home-action" data-join="${index}">Take a look</button></li>`).join('')}</ul>` : '');
    part('join')?.querySelectorAll('[data-join]').forEach(button => button.addEventListener('click', () => open(items[Number(button.dataset.join)])));
  }

  function paintWork() {
    const work = state.work;
    if (work === 'error') {
      setSection('work', '<h2 class="home-heading">Pick up where you left off</h2><p class="home-muted">Your tasks couldn’t be loaded.</p><button type="button" class="home-link" data-home-action="retry">Try again</button>');
      part('work')?.querySelector('[data-home-action="retry"]')?.addEventListener('click', () => refreshWork());
      return;
    }
    if (!work) { setSection('work', ''); return; }
    const task = chooseNextTask(work.tasks);
    const others = work.tasks.filter(item => item !== task).slice(0, 5);
    const attempt = work.attempts.find(item => ['planned', 'in_progress'].includes(item.outcome_status));
    const results = work.attempts.filter(item => ['succeeded', 'not_succeeded'].includes(item.outcome_status)).length;
    const update = task ? lastUpdate(task) : '';
    if (!task && !attempt && !work.projects.length) { setSection('work', ''); return; }
    const next = task
      ? `<div class="home-card home-next"><strong class="home-title">${esc(task.title)}</strong><p class="home-muted">${esc(task.project?.title || 'Project task')} · ${task.status === 'in_progress' ? 'In progress' : 'Not started'}</p>${update ? `<p class="home-update">Last update: ${esc(update)}</p>` : ''}<button type="button" class="home-primary" data-next-project="${esc(task.project_id)}" data-next-task="${esc(task.id)}">Continue</button></div>`
      : attempt
        ? `<div class="home-card home-next"><strong class="home-title">${esc(attempt.goal || 'A method you started')}</strong><p class="home-muted">Waiting on a result</p><button type="button" class="home-primary" data-next-project="${esc(attempt.project_id)}" data-next-tab="work">Record what happened</button></div>`
        : '';
    const projectList = work.projects.map(project => `<button type="button" class="home-project" data-project-id="${esc(project.id)}"><strong>${esc(project.title || 'Untitled project')}</strong><span>${esc(project.status || 'active')}</span></button>`).join('');
    setSection('work', `<h2 class="home-heading">Pick up where you left off</h2>${next}
      ${others.length ? `<details class="home-more-list"><summary>Your other open tasks (${others.length})</summary><div>${others.map(item => `<button type="button" class="home-project" data-next-project="${esc(item.project_id)}" data-next-task="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.project?.title || 'Project')}</span></button>`).join('')}</div></details>` : ''}
      ${work.projects.length ? `<details class="home-more-list"><summary>Your projects (${work.projects.length})</summary><div>${projectList}${results ? `<p class="home-muted">${results} method result${results === 1 ? '' : 's'} recorded.</p>` : ''}</div></details>` : ''}`);
    const el = part('work');
    el?.querySelectorAll('[data-next-project]').forEach(button => button.addEventListener('click', (event) => {
      const target = event.currentTarget;
      if (target.dataset.nextTask && window.viewProjectTask) window.viewProjectTask(target.dataset.nextProject, target.dataset.nextTask);
      else window.viewProjectDetails?.(target.dataset.nextProject, target.dataset.nextTab);
    }));
    el?.querySelectorAll('[data-project-id]').forEach(button => button.addEventListener('click', () => window.viewProjectDetails?.(button.dataset.projectId)));
  }

  // Built once per Home: typing here survives every other update.
  function mountGoal() {
    const el = part('goal');
    if (!el || el.dataset.mounted === 'true') return;
    el.dataset.mounted = 'true';
    el.innerHTML = `<summary>Have something in mind?</summary>
      <div class="home-goal-body"><p class="home-muted">Describe it in your own words. Buildspace prepares something you can use right away — no project needed.</p><div class="home-goal-form"></div><div class="home-goal-resume"></div></div>`;
    const target = el.querySelector('.home-goal-form');
    const mount = () => {
      if (!document.contains(target)) return;
      if (!window.MobileGoalDiscovery?.mount) { window.setTimeout(mount, 250); return; }
      window.MobileGoalDiscovery.mount(target);
    };
    mount();
    paintResume();
  }

  function paintResume() {
    const slot = part('goal')?.querySelector('.home-goal-resume');
    if (!slot) return;
    const draft = window.MobileTaskAssistance?.latestObjectiveDraft?.();
    slot.innerHTML = draft ? `<button type="button" class="home-resume">Resume: ${esc(draft.objective)} <span>(draft on this device)</span></button>` : '';
    slot.querySelector('button')?.addEventListener('click', () => window.MobileTaskAssistance?.openObjective?.(draft.objective));
  }

  // Nothing waiting, no one to meet, nothing to join and no work: say so
  // plainly and offer one small step, instead of an empty page.
  function paintQuiet() {
    const status = digest().homeSuggestions?.().status || 'unavailable';
    const empty = ['attention', 'meet', 'join', 'work'].every(name => part(name)?.hidden !== false);
    setSection('quiet', empty && status !== 'loading' && state.work ? `<h2 class="home-heading">It’s quiet around you right now</h2>
      <p class="home-muted">Tell people what you’re looking for or how you can help, and suggestions will follow.</p>
      <button type="button" class="home-primary" data-home-action="share">Share what you’re looking for</button>` : '');
    part('quiet')?.querySelector('[data-home-action="share"]')?.addEventListener('click', () => window.openProfileModal?.());
  }

  // A section appearing or growing above the field the member is typing in
  // would push it down. Updates that arrive meanwhile (unread counts, the
  // report, tasks, suggestions) wait until they leave the field.
  function typingInHome() {
    const el = document.activeElement;
    return !!host && host.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName || '');
  }
  const waiting = new Set();
  function calmly(paint) {
    if (!typingInHome()) { paint(); paintQuiet(); return; }
    const armed = waiting.size > 0;
    waiting.add(paint);
    if (armed) return;
    const target = host;
    target.addEventListener('focusout', function later() {
      window.setTimeout(() => {
        if (typingInHome()) return;
        target.removeEventListener('focusout', later);
        const paints = [...waiting];
        waiting.clear();
        if (host !== target) return;
        paints.forEach(fn => fn());
        paintQuiet();
      }, 0);
    });
  }

  function paintSuggestions() {
    if (!host) return;
    paintMeet();
    paintJoin();
    paintQuiet();
  }

  // ---------------------------------------------------------------- frame

  function build(target, desktop) {
    const p = profile();
    const name = displayName(p);
    target.innerHTML = `<div class="home-view" data-layout="${desktop ? 'desktop' : 'phone'}">
      ${desktop ? '' : `<header class="home-header"><div class="home-avatar" aria-hidden="true">${esc((name || 'M').slice(0, 1).toUpperCase())}</div><div><h1 id="mobile-you-title">${esc(name ? `Welcome, ${name}` : 'Welcome')}</h1><p>Here’s what’s around you.</p></div></header>`}
      <div class="home-grid">
        <div class="home-main">
          <section class="home-section home-attention" data-home="attention" aria-labelledby="home-attention-title" hidden></section>
          <section class="home-section home-profile" data-home="profile" aria-labelledby="home-curious-title" hidden></section>
          <section class="home-section" data-home="meet" aria-labelledby="home-meet-title" hidden></section>
          <section class="home-section" data-home="join" aria-label="Ways to join in" hidden></section>
          <section class="home-section home-quiet" data-home="quiet" aria-label="Getting started" hidden></section>
        </div>
        <div class="home-side">
          <section class="home-section" data-home="work" aria-label="Pick up where you left off" hidden></section>
          <details class="home-section home-goal" data-home="goal"></details>
        </div>
      </div>
      <p class="home-explore"><button type="button" class="home-link" data-home-action="explore">Browse everyone in Explore</button></p>
    </div>`;
    target.querySelector('[data-home-action="explore"]')?.addEventListener('click', () => window.AppNav?.go?.('explore'));
  }

  async function refreshWork() {
    const token = ++request;
    const memberId = state.memberId;
    try {
      const work = await loadWork(memberId);
      if (token !== request || memberId !== state.memberId) return;
      state.work = work;
    } catch (error) {
      if (token !== request || memberId !== state.memberId) return;
      console.warn('[Home] tasks unavailable:', error?.message || error);
      state.work = 'error';
    }
    calmly(paintWork);
    calmly(paintJoin);
  }

  async function refreshAttention() {
    const memberId = state.memberId;
    try {
      const data = await window.getStartSequenceData?.(false);
      if (memberId !== state.memberId) return;
      state.attention = data || null;
    } catch (_) {
      if (memberId !== state.memberId) return;
      state.attention = null;
    }
    calmly(paintAttention);
  }

  function clear() {
    request += 1;
    if (host) host.innerHTML = '';
    host = null;
    state.memberId = null;
    state.work = null;
    state.attention = null;
    state.personId = null;
    state.unread = null;
    waiting.clear();
  }

  // Shows Home in the element for the current width (and empties the other,
  // so the goal field is never on the page twice).
  function show() {
    const p = profile();
    const desktop = isDesktop();
    const target = document.getElementById(desktop ? 'cd-home' : 'mobile-you-content');
    if (!target || !p?.id) return;
    if (state.memberId && String(state.memberId) !== String(p.id)) clear();
    if (host !== target || !target.querySelector('.home-view')) {
      if (host && host !== target) host.innerHTML = '';
      host = target;
      state.personId = null;
      build(target, desktop);
      mountGoal();
    }
    state.memberId = p.id;
    paintProfilePrompt();
    paintAttention();
    paintWork();
    paintSuggestions();
    refreshWork();
    refreshAttention();
  }

  // "Write your own objective" (focused assistance) opens goal help here.
  function focusGoal() {
    const goal = part('goal');
    if (goal) goal.open = true;
    document.getElementById('mgd-goal-input')?.focus();
  }

  window.HomeView = { show, clear, focusGoal };
  window.HomeViewTesting = { taskScore, chooseNextTask, loadWork };

  window.addEventListener('daily-brief-updated', () => { if (host) calmly(paintSuggestions); });
  window.addEventListener('total-unread-messages-updated', (event) => {
    state.unread = Math.max(0, parseInt(event.detail?.count, 10) || 0);
    if (host) calmly(paintAttention);
  });
  window.addEventListener('profile-loaded', () => { if (showing()) show(); });
  window.addEventListener('user-logged-out', clear);
  // What was done in focused assistance or a project shows on return.
  ['mobile-assistance-closed', 'project-task-updated', 'capability-outcome-recorded'].forEach(type => window.addEventListener(type, () => {
    if (!showing()) return;
    refreshWork();
    paintResume();
  }));
})();
