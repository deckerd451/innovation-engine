// Home: discovery first, the same sections at every width, shown in the
// phone and tablet Home screen (#mobile-you-content, mobile-you.js) or the
// desktop dashboard (#cd-home). It composes what already exists -- what
// others are waiting on the member for, the Daily Brief's suggestions and
// community summary (start-daily-digest.js), Explore's tabs and search, the
// member's tasks, goal assistance -- and has no data of its own.
//
//   Welcome                   the member's name; "Discover what we could do together."
//   Waiting on you            inbound only, and only when something needs a reply
//   Search and lenses         hand off to Explore's own search and tabs
//   Picked for you            one person to meet, then a project and an
//                             opportunity, each with its reason; omitted
//                             when nothing qualifies
//   Happening in the community  open to everyone: themes, projects looking
//                             for people, open opportunities, and (when no
//                             one is introduced) skills to find people by
//   What are you curious about?  only when nothing is listed; optional
//   Your work                 quiet: the next task, the rest one tap away
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

  // Skills and interests arrive as an array, a JSON array string or a
  // comma-separated string; blank entries are not listed terms.
  function listed(value) {
    if (Array.isArray(value)) return value.some(listed);
    const text = String(value ?? '').trim();
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.some(listed);
    } catch (_) { /* comma-separated */ }
    return text.split(',').some(term => term.trim());
  }

  // An invitation, not a setup step: shown only to members who have listed
  // no interests and no skills (what it asks for, and what people and
  // projects are matched on). A bio or photo is never required, and it sits
  // below what there is to discover, so it never stands in the way.
  const wantsCuriosityPrompt = (p) => !!p && !listed(p.interests) && !listed(p.skills);

  // "Not now" on the invitation lasts for the day, on this device.
  const promptKey = (p) => `ie:home-curious-later:${p?.id}:${new Date().toISOString().slice(0, 10)}`;
  function promptSetAside(p) {
    try { return localStorage.getItem(promptKey(p)) === '1'; } catch (_) { return false; }
  }

  function paintProfilePrompt() {
    const p = profile();
    setSection('profile', wantsCuriosityPrompt(p) && !promptSetAside(p) ? `<div><h2 class="home-heading" id="home-curious-title">What are you curious about?</h2>
      <p>Add a few interests and Home will suggest people and projects for you. It’s optional, and you can skip it.</p></div>
      <div class="home-pick-actions"><button type="button" class="home-action" data-home-action="edit-profile">Share your interests</button><button type="button" class="home-dismiss" data-home-action="later">Not now</button></div>` : '');
    const el = part('profile');
    el?.querySelector('[data-home-action="edit-profile"]')?.addEventListener('click', () => window.openProfileEditor?.());
    el?.querySelector('[data-home-action="later"]')?.addEventListener('click', () => {
      try { localStorage.setItem(promptKey(p), '1'); } catch (_) { /* optional */ }
      setSection('profile', '');
    });
  }

  // ------------------------------------------------- discovery and Explore

  // Explore's own tabs and search, so Home never becomes a second Explore.
  function exploreTab(resource) {
    window.AppNav?.go?.('explore');
    document.querySelector(`#udc-resource-tabs .udc-resource-tab[data-resource="${resource}"]`)?.click();
  }

  function searchExplore(query) {
    window.AppNav?.go?.('explore');
    const input = document.getElementById('global-search');
    if (!input) return;
    input.value = query;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function openSkill(label) {
    exploreTab('themes');
    window.openNodePanel?.({ id: `skill:${label}`, type: 'skill', name: label, skillName: label, isSkillLens: true });
  }

  function open(item) {
    const opened = digest().selectReflectionEntity?.(item.type, item.entityId, item.name);
    if (!opened) window.openNodePanel?.({ id: item.entityId, type: item.type, name: item.name });
  }

  const shortDate = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  };

  // Picked for you: one person to meet, then up to two ways to join in, each
  // with its reason. Shown only when there is something real to show.
  function paintPicked() {
    const suggestions = digest().homeSuggestions?.() || { status: 'unavailable' };
    const shown = ['meet', 'join'].some(name => part(name)?.hidden === false);
    const el = part('picked');
    if (el) el.hidden = !shown;
    // No one to meet: a way to find people instead of an empty card.
    const route = part('people-route');
    if (route) route.hidden = !(shown && suggestions.status === 'ready' && part('meet')?.hidden !== false);
  }

  function paintMeet() {
    const suggestions = digest().homeSuggestions?.() || { status: 'unavailable', person: null };
    const el = part('meet');
    if (!el) return;
    if (suggestions.status === 'loading') {
      state.personId = null;
      setSection('meet', '<p class="home-muted" role="status">Looking for people who share your interests…</p>');
      paintPicked();
      return;
    }
    const person = suggestions.person;
    if (!person) { state.personId = null; setSection('meet', ''); paintPicked(); return; }
    // The card keeps its own state (a request sent); redraw it only for
    // someone new.
    if (state.personId === person.id && el.querySelector('.network-reflection-concierge')) { paintPicked(); return; }
    state.personId = person.id;
    setSection('meet', '<div class="home-meet-card"></div>');
    digest().renderIntroduction?.(el.querySelector('.home-meet-card'), person, () => {
      state.personId = null;
      setSection('meet', '');
      paintPicked();
      paintHappening();
      paintQuiet();
    });
    paintPicked();
  }

  // Invitations only: never a project the member already created or joined.
  function paintJoin() {
    const ownProjectIds = state.work && state.work !== 'error' ? state.work.projects.map(project => project.id) : [];
    const suggestions = digest().homeSuggestions?.({ ownProjectIds }) || { joinIn: [] };
    const items = suggestions.joinIn || [];
    const kind = (type) => ({ project: 'Project you could join', opportunity: 'Opportunity' }[type] || '');
    setSection('join', items.length ? `<ul class="home-picks">${items.map((item, index) => {
      const reasons = String(item.reason || '').split(' · ').filter(Boolean);
      const closes = item.type === 'opportunity' && item.until ? `<li class="home-chip-date">Closes ${esc(shortDate(item.until))}</li>` : '';
      return `<li class="home-pick"><span class="home-kind">${esc(kind(item.type))}</span><strong>${esc(item.name)}</strong>
        <ul class="home-reasons" aria-label="Why this fits">${reasons.map(text => `<li>${esc(text)}</li>`).join('')}${closes}</ul>
        <div class="home-pick-actions"><button type="button" class="home-action" data-join="${index}">Take a look</button><button type="button" class="home-dismiss" data-skip="${index}">Not now</button></div></li>`;
    }).join('')}</ul>` : '');
    const el = part('join');
    el?.querySelectorAll('[data-join]').forEach(button => button.addEventListener('click', () => open(items[Number(button.dataset.join)])));
    el?.querySelectorAll('[data-skip]').forEach(button => button.addEventListener('click', () => {
      digest().setAsideSuggestion?.(items[Number(button.dataset.skip)]?.id);
      paintJoin();
      paintHappening();
      paintQuiet();
    }));
    paintPicked();
  }

  // Happening in the community: what is open to everyone, from the brief's
  // non-personalized summary. A short preview; Explore has the rest.
  function paintHappening() {
    const ownProjectIds = state.work && state.work !== 'error' ? state.work.projects.map(project => project.id) : [];
    const suggestions = digest().homeSuggestions?.({ ownProjectIds }) || {};
    const community = suggestions.community;
    if (suggestions.status !== 'ready' || !community) { setSection('happening', ''); return; }
    const themes = community.themes.slice(0, 3);
    const projects = community.projects.slice(0, 2);
    const opportunities = community.opportunities.slice(0, 2);
    // Skills open a way to people when Home has no one to introduce.
    const skills = part('meet')?.hidden !== false ? community.skills.slice(0, 6) : [];
    const empty = !themes.length && !projects.length && !opportunities.length && !skills.length;
    if (empty && quietNow()) { setSection('happening', ''); return; }
    const row = (attrs, title, meta) => `<li><button type="button" class="home-open-row" ${attrs}><span><strong>${esc(title)}</strong>${meta ? `<span>${esc(meta)}</span>` : ''}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></li>`;
    setSection('happening', `<h2 class="home-heading" id="home-happening-title" tabindex="-1">Happening in the community</h2>
      <p class="home-sub">Open to everyone.</p>
      ${empty ? '<p class="home-muted">Nothing new is open in the community right now.</p>' : ''}
      ${themes.length ? `<h3 class="home-subheading">Themes people are exploring</h3><ul class="home-themes">${themes.map((theme, index) => `<li><button type="button" class="home-theme" data-theme="${index}"><strong>${esc(theme.title)}</strong>${theme.participantCount ? `<span>${theme.participantCount} ${theme.participantCount === 1 ? 'person' : 'people'}</span>` : ''}</button></li>`).join('')}</ul>` : ''}
      ${projects.length ? `<h3 class="home-subheading">Projects looking for people</h3><ul class="home-open-list">${projects.map((project, index) => row(`data-project="${index}"`, project.title, project.needs.length ? `Needs ${project.needs.join(', ')}` : '')).join('')}</ul>` : ''}
      ${opportunities.length ? `<h3 class="home-subheading">Open opportunities</h3><ul class="home-open-list">${opportunities.map((opp, index) => row(`data-opportunity="${index}"`, opp.title, [opp.organization, opp.deadline ? `Closes ${shortDate(opp.deadline)}` : 'No deadline'].filter(Boolean).join(' · '))).join('')}</ul>` : ''}
      ${skills.length ? `<h3 class="home-subheading">Find people by what they do</h3><ul class="home-topics">${skills.map((skill, index) => `<li><button type="button" class="home-topic" data-skill="${index}">${esc(skill.label)}</button></li>`).join('')}</ul>
        <button type="button" class="home-action" data-home-action="topics">Explore these topics</button>` : ''}
      <p class="home-explore"><button type="button" class="home-link" data-home-action="explore">See everything in Explore</button></p>`);
    const el = part('happening');
    el?.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => {
      const theme = themes[Number(button.dataset.theme)];
      open({ type: 'theme', entityId: theme.id, name: theme.title });
    }));
    el?.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
      const project = projects[Number(button.dataset.project)];
      open({ type: 'project', entityId: project.id, name: project.title });
    }));
    el?.querySelectorAll('[data-opportunity]').forEach(button => button.addEventListener('click', () => {
      const opp = opportunities[Number(button.dataset.opportunity)];
      open({ type: 'opportunity', entityId: opp.id, name: opp.title });
    }));
    el?.querySelectorAll('[data-skill]').forEach(button => button.addEventListener('click', () => openSkill(skills[Number(button.dataset.skill)].label)));
    el?.querySelector('[data-home-action="topics"]')?.addEventListener('click', () => exploreTab('themes'));
    el?.querySelector('[data-home-action="explore"]')?.addEventListener('click', () => window.AppNav?.go?.('explore'));
  }

  // Your work: quiet and below discovery. The next task in one line, the
  // rest one tap away.
  function paintWork() {
    const work = state.work;
    if (work === 'error') {
      setSection('work', '<h2 class="home-heading home-label">Your work</h2><p class="home-muted">Your tasks couldn’t be loaded.</p><button type="button" class="home-link" data-home-action="retry">Try again</button>');
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
      ? `<div class="home-next"><div><strong class="home-title">Next: ${esc(task.title)}</strong><p class="home-muted">${esc(task.project?.title || 'Project task')} · ${task.status === 'in_progress' ? 'In progress' : 'Not started'}</p>${update ? `<p class="home-update">Last update: ${esc(update)}</p>` : ''}</div><button type="button" class="home-primary" data-next-project="${esc(task.project_id)}" data-next-task="${esc(task.id)}">Continue</button></div>`
      : attempt
        ? `<div class="home-next"><div><strong class="home-title">${esc(attempt.goal || 'A method you started')}</strong><p class="home-muted">Waiting on a result</p></div><button type="button" class="home-primary" data-next-project="${esc(attempt.project_id)}" data-next-tab="work">Record what happened</button></div>`
        : '';
    const counts = [
      work.projects.length ? `${work.projects.length} project${work.projects.length === 1 ? '' : 's'}` : '',
      others.length ? `${others.length} more open task${others.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · ');
    const projectList = work.projects.map(project => `<button type="button" class="home-project" data-project-id="${esc(project.id)}"><strong>${esc(project.title || 'Untitled project')}</strong><span>${esc(project.status || 'active')}</span></button>`).join('');
    setSection('work', `<h2 class="home-heading home-label">Your work</h2>${next}
      ${counts ? `<details class="home-more-list"><summary>${esc(counts)}</summary><div>
        ${others.length ? `<h3 class="home-subheading">Your other open tasks</h3>${others.map(item => `<button type="button" class="home-project" data-next-project="${esc(item.project_id)}" data-next-task="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.project?.title || 'Project')}</span></button>`).join('')}` : ''}
        ${work.projects.length ? `<h3 class="home-subheading">Your projects</h3>${projectList}${results ? `<p class="home-muted">${results} method result${results === 1 ? '' : 's'} recorded.</p>` : ''}` : ''}
      </div></details>` : ''}`);
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

  // Nothing waiting, no one to meet, nothing to join, nothing open in the
  // community and no work: say so plainly and offer one small step.
  function quietNow() {
    const status = digest().homeSuggestions?.().status || 'unavailable';
    const community = digest().homeSuggestions?.().community;
    const communityEmpty = !community || !['themes', 'projects', 'opportunities', 'skills'].some(key => community[key]?.length);
    return status !== 'loading' && !!state.work && communityEmpty
      && ['attention', 'meet', 'join', 'work'].every(name => part(name)?.hidden !== false);
  }

  function paintQuiet() {
    setSection('quiet', quietNow() ? `<h2 class="home-heading">It’s quiet around you right now</h2>
      <p class="home-muted">Tell people what you’re looking for or how you can help, and suggestions will follow.</p>
      <button type="button" class="home-primary" data-home-action="share">Share what you’re looking for</button>
      <p class="home-explore"><button type="button" class="home-link" data-home-action="explore">See everything in Explore</button></p>` : '');
    const el = part('quiet');
    el?.querySelector('[data-home-action="share"]')?.addEventListener('click', () => window.openProfileModal?.());
    el?.querySelector('[data-home-action="explore"]')?.addEventListener('click', () => window.AppNav?.go?.('explore'));
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
    paintHappening();
    paintQuiet();
  }

  // ---------------------------------------------------------------- frame

  const LENSES = [['foryou', 'For you'], ['people', 'People'], ['projects', 'Projects'], ['themes', 'Themes'], ['opportunities', 'Opportunities']];

  function build(target, desktop) {
    const p = profile();
    const name = displayName(p);
    target.innerHTML = `<div class="home-view" data-layout="${desktop ? 'desktop' : 'phone'}">
      ${desktop
        ? '<p class="home-tagline">Discover what we could do together.</p>'
        : `<header class="home-header"><div class="home-avatar" aria-hidden="true">${esc((name || 'M').slice(0, 1).toUpperCase())}</div><div><h1 id="mobile-you-title">${esc(name ? `Welcome, ${name}` : 'Welcome')}</h1><p>Discover what we could do together.</p></div></header>`}
      <section class="home-section home-attention" data-home="attention" aria-labelledby="home-attention-title" hidden></section>
      <form class="home-search" role="search" data-home-search>
        <label class="home-sr" for="home-search-input">Search people, skills, ideas</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="home-search-input" type="search" placeholder="Search people, skills, ideas…" autocomplete="off" enterkeyhint="search">
        <button type="submit" class="home-search-go" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </form>
      <nav class="home-lenses" aria-label="Explore by">
        ${LENSES.map(([key, label]) => `<button type="button" class="home-lens" data-lens="${key}"${key === 'foryou' ? ' aria-current="true"' : ''}>${label}</button>`).join('')}
      </nav>
      <div class="home-grid">
        <div class="home-main">
          <section class="home-section home-picked" data-home="picked" aria-labelledby="home-picked-title" hidden>
            <h2 class="home-heading" id="home-picked-title" tabindex="-1">Picked for you</h2>
            <p class="home-sub">From what you listed and the people you know.</p>
            <div class="home-part" data-home="meet" hidden></div>
            <div class="home-part" data-home="join" hidden></div>
            <p class="home-part home-people-route" data-home="people-route" hidden><button type="button" class="home-link" data-home-action="people">Find people in Explore</button></p>
          </section>
          <section class="home-section home-happening" data-home="happening" aria-labelledby="home-happening-title" hidden></section>
          <section class="home-section home-profile" data-home="profile" aria-labelledby="home-curious-title" hidden></section>
          <section class="home-section home-quiet" data-home="quiet" aria-label="Getting started" hidden></section>
        </div>
        <div class="home-side">
          <section class="home-section home-work" data-home="work" aria-label="Your work" hidden></section>
          <details class="home-section home-goal" data-home="goal"></details>
        </div>
      </div>
    </div>`;
    target.querySelector('[data-home-search]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector('input');
      const query = input.value.trim();
      input.blur();
      if (query) searchExplore(query);
      else window.AppNav?.go?.('explore');
    });
    target.querySelectorAll('[data-lens]').forEach(button => button.addEventListener('click', () => {
      const lens = button.dataset.lens;
      if (lens !== 'foryou') { exploreTab(lens); return; }
      // For you is this page: go to what was picked (or what is open).
      const heading = part('picked')?.hidden === false ? part('picked').querySelector('h2') : part('happening')?.querySelector('h2');
      heading?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      heading?.focus?.({ preventScroll: true });
    }));
    target.querySelector('[data-home-action="people"]')?.addEventListener('click', () => exploreTab('people'));
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
    calmly(paintHappening);
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
  window.HomeViewTesting = { taskScore, chooseNextTask, loadWork, wantsCuriosityPrompt, LENSES };

  window.addEventListener('daily-brief-updated', () => { if (host) calmly(paintSuggestions); });
  window.addEventListener('total-unread-messages-updated', (event) => {
    state.unread = Math.max(0, parseInt(event.detail?.count, 10) || 0);
    if (host) calmly(paintAttention);
  });
  // The profile can arrive after Home was entered (desktop's first load):
  // show it then, not only once it is already on the page.
  window.addEventListener('profile-loaded', () => { if (document.body.dataset.destination === 'home') show(); });
  window.addEventListener('user-logged-out', clear);
  // What was done in focused assistance or a project shows on return.
  ['mobile-assistance-closed', 'project-task-updated', 'capability-outcome-recorded'].forEach(type => window.addEventListener(type, () => {
    if (!showing()) return;
    refreshWork();
    paintResume();
  }));
})();
