// Home: participation first for established members, discovery first otherwise.
// The finder remains mounted while other sections update; all existing permissions,
// safe profile rendering, suggestion dismissal and project navigation are preserved.
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
  const state = { memberId: null, mine: null, attention: null, personId: null, unread: null };

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

  // The member's own projects (created, or joined and accepted), however
  // old, and the people they are connected to (accepted connections, as
  // Network lists them).
  async function loadMine(memberId) {
    const client = window.supabase;
    if (!client || !memberId) return { projects: [], connections: [] };
    const columns = 'id, title, status, creator_id, description, created_at';
    const [createdResult, membershipsResult, linksResult] = await Promise.all([
      client.from('projects').select(columns).eq('creator_id', memberId),
      client.from('project_members').select('project_id, role').eq('user_id', memberId),
      client.from('connections').select('from_user_id, to_user_id').or(`from_user_id.eq.${memberId},to_user_id.eq.${memberId}`).eq('status', 'accepted'),
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
    // Archived projects are not ones to continue; Explore leaves them out too.
    const projects = [...created.map(project => ({ ...project, started: true })), ...joined]
      .filter(project => project.status !== 'archived')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    // Connections are a convenience here; if they can't be read, Home still
    // shows the projects and Network still has them.
    let connections = [];
    const peerIds = linksResult.error ? [] : [...new Set((linksResult.data || [])
      .map(row => (String(row.from_user_id) === String(memberId) ? row.to_user_id : row.from_user_id))
      .filter(id => id && String(id) !== String(memberId)))];
    if (peerIds.length) {
      const people = await client.from('community').select('id, name').in('id', peerIds);
      connections = people.error ? [] : (people.data || []).map(person => ({ id: person.id, name: person.name || 'Member' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return { projects, connections };
  }

  // ---------------------------------------------------------------- sections

  function setSection(name, html) {
    const el = part(name);
    if (!el) return;
    el.hidden = !html;
    el.innerHTML = html || '';
  }

  // Adapt to actual participation, not a guessed first-visit timestamp.
  // Move existing nodes so draft text, results and handlers survive the change.
  function arrangeHome() {
    if (!host) return;
    if (typingInHome()) { calmly(arrangeHome); return; }
    const participating = state.mine && state.mine !== 'error' &&
      (state.mine.projects.length > 0 || state.mine.connections.length > 0);
    const view = host.querySelector('.home-view');
    view.dataset.homeMode = participating ? 'participating' : 'discover';
    const order = participating
      ? ['attention', 'mine', 'goal', 'picked', 'happening', 'profile']
      : ['goal', 'attention', 'picked', 'mine', 'happening', 'profile'];
    const grid = view.querySelector('.home-grid');
    order.forEach((name, index) => {
      const section = part(name);
      if (section && grid.children[index] !== section) grid.insertBefore(section, grid.children[index] || null);
    });
    const title = part('goal')?.querySelector('h2');
    if (title) title.textContent = 'Search the community';
    const description = part('goal')?.querySelector('.home-muted');
    if (description) description.textContent = 'People, projects, skills, organizations, and opportunities.';
  }

  function paintAttention() {
    const rows = (digest().inboundAttention?.(state.attention || {}) || []).filter(row => row.key !== 'unread_messages');
    const unread = state.unread ?? Number(state.attention?.immediate_actions?.unread_messages?.count || 0);
    if (unread > 0) rows.splice(0, 0, { key: 'unread_messages', count: unread, message: n => `${n} unread message${n === 1 ? '' : 's'}`, action: 'Open Inbox', handler: 'openMessaging' });
    const attentionRow = row => `<li class="home-row"><span>${esc(row.message(row.count))}</span><button type="button" class="home-action" data-attention="${esc(row.handler)}">${esc(row.action)}</button></li>`;
    setSection('attention', rows.length ? `<h2 class="home-heading" id="home-attention-title">Needs your attention</h2>
      <ul class="home-rows">${rows.slice(0, 1).map(attentionRow).join('')}</ul>${rows.length > 1 ? `<details class="home-more-list"><summary>More to respond to (${rows.length - 1})</summary><ul class="home-rows">${rows.slice(1).map(attentionRow).join('')}</ul></details>` : ''}` : '');
    part('attention')?.querySelectorAll('[data-attention]').forEach(button => button.addEventListener('click', (event) => {
      const handler = event.currentTarget.dataset.attention;
      if (handler === 'openMessaging') window.AppNav?.go?.('inbox');
      else window.EnhancedStartUI?.handleAction?.(handler, event);
    }));
    paintPicked();
    paintHappening();
    arrangeHome();
  }

  // The terms themselves, from the same shapes.
  function listedTerms(value) {
    if (Array.isArray(value)) return value.flatMap(listedTerms);
    const text = String(value ?? '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.flatMap(listedTerms);
    } catch (_) { /* a plain or comma-separated string */ }
    return text.split(',').map(term => term.trim()).filter(Boolean);
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

  // Pilot: reuse the existing next-step slot, never add a second card.
  // Explicit opt-in is session-local; no new tracking or persistence.
  function preferParticipation(enabled, hasInvitation, hasPerson) {
    return enabled === true && hasInvitation ? 'join' : hasPerson ? 'meet' : hasInvitation ? 'join' : null;
  }

  // One next step: inbound attention, otherwise one person or reasoned invitation.
  function paintPicked() {
    const meet = part('meet'), join = part('join'), picked = part('picked');
    if (!picked) return;
    const hasMeet = !!meet?.innerHTML;
    const hasInvitation = !!join?.innerHTML;
    const selected = preferParticipation(window.HPEParticipationPilot === true, hasInvitation, hasMeet);
    if (meet) meet.hidden = selected !== 'meet';
    if (join) join.hidden = selected !== 'join';
    picked.hidden = part('attention')?.hidden === false || !selected;
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
    });
    paintPicked();
  }

  // Invitations only: never a project the member already created or joined.
  // External inventory is supplied by a reviewed publisher, never by inferred matches.
  function externalPick(rows, dismissed, now = Date.now(), topics = []) {
    if (!Array.isArray(rows)) return null;
    const wanted = new Set((Array.isArray(topics) ? topics : []).filter(t => typeof t === 'string').map(t => t.trim().toLowerCase()).filter(Boolean));
    let best = null, bestScore = -1;
    for (const row of rows) {
      if (!row || row.status !== 'published' || typeof row.title !== 'string' || !row.title.trim() ||
          typeof row.organization !== 'string' || !row.organization.trim() || typeof row.sourceUrl !== 'string') continue;
      const reviewed = Date.parse(row.reviewedAt), expires = Date.parse(row.deadline);
      if (!Number.isFinite(reviewed) || reviewed > now || now - reviewed > 7 * 86400000 ||
          !Number.isFinite(expires) || expires <= now) continue;
      let url;
      try { url = new URL(row.sourceUrl); } catch (_) { continue; }
      if (url.protocol !== 'https:' || url.username || url.password || dismissed.has(url.href)) continue;
      const matched = [...new Set((Array.isArray(row.topics) ? row.topics : []).filter(t => typeof t === 'string').map(t => t.trim().toLowerCase()).filter(t => wanted.has(t)))];
      if (matched.length > bestScore) { bestScore = matched.length; best = { title: row.title, organization: row.organization, url: url.href }; }
    }
    return best;
  }

  const externalDismissed = new Set();
  let externalMember = null;
  let externalInventory = [];
  let externalLoadedAt = 0;
  let externalLoading = false;
  let externalGeneration = 0;

  async function refreshExternalInventory() {
    if (window.HPEParticipationPilot !== true || !state.memberId || externalLoading ||
        Date.now() - externalLoadedAt < 300000) return;
    externalLoading = true;
    const generation = externalGeneration;
    try {
      const response = await fetch('/data/hpe-published-opportunities.json', { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error('Inventory unavailable');
      const data = await response.json();
      if (generation !== externalGeneration) return;
      externalInventory = data?.schemaVersion === 1 && Array.isArray(data.opportunities) ? data.opportunities : [];
    } catch (_) {
      if (generation !== externalGeneration) return;
      externalInventory = [];
    } finally {
      if (generation === externalGeneration) {
        externalLoading = false;
        externalLoadedAt = Date.now();
        if (host) calmly(paintSuggestions);
      }
    }
  }


  function paintJoin() {
    const ownProjectIds = state.mine && state.mine !== 'error' ? state.mine.projects.map(project => project.id) : [];
    const suggestions = digest().homeSuggestions?.({ ownProjectIds }) || { joinIn: [] };
    const items = (suggestions.joinIn || []).slice(0, 1);
    const member = profile()?.id;
    if (externalMember !== member) { externalDismissed.clear(); externalMember = member; }
    const external = member && window.HPEParticipationPilot === true && suggestions.status !== 'loading' && !items.length
      ? externalPick(externalInventory, externalDismissed, Date.now(), listedTerms(profile()?.interests)) : null;
    if (external) {
      setSection('join', `<ul class="home-picks"><li class="home-pick"><span class="home-kind">External opportunity</span><strong>${esc(external.title)}</strong><p class="home-muted">${esc(external.organization)} · Check availability with provider</p><div class="home-pick-actions"><a class="home-action" href="${esc(external.url)}" target="_blank" rel="noopener noreferrer">Visit provider (new tab)</a><button type="button" class="home-dismiss" data-external-skip>Not now</button></div></li></ul>`);
      part('join')?.querySelector('[data-external-skip]')?.addEventListener('click', () => {
        externalDismissed.add(external.url);
        paintJoin();
        paintHappening();
      });
      paintPicked();
      return;
    }
    const kind = (type) => ({ project: 'Project you could join', opportunity: 'Opportunity' }[type] || '');
    setSection('join', items.length ? `<ul class="home-picks">${items.map((item, index) => {
      const reasons = String(item.reason || '').split(' · ').filter(Boolean);
      const closes = item.type === 'opportunity' && item.until ? `<li class="home-chip-date">Closes ${esc(shortDate(item.until))}</li>` : '';
      return `<li class="home-pick"><span class="home-kind">${esc(kind(item.type))}</span><strong>${esc(item.name)}</strong>
        <ul class="home-reasons" aria-label="Why this fits">${reasons.map(text => `<li>${esc(text)}</li>`).join('')}${closes}</ul>
        <div class="home-pick-actions"><button type="button" class="home-action" data-join="${index}">View details</button><button type="button" class="home-dismiss" data-skip="${index}">Not now</button></div></li>`;
    }).join('')}</ul>` : '');
    const el = part('join');
    el?.querySelectorAll('[data-join]').forEach(button => button.addEventListener('click', () => open(items[Number(button.dataset.join)])));
    el?.querySelectorAll('[data-skip]').forEach(button => button.addEventListener('click', () => {
      digest().setAsideSuggestion?.(items[Number(button.dataset.skip)]?.id);
      paintJoin();
      paintHappening();
    }));
    paintPicked();
  }

  // Happening in the community: what is open to everyone, from the brief's
  // non-personalized summary. A short preview; Explore has the rest.
  function paintHappening() {
    const ownProjectIds = state.mine && state.mine !== 'error' ? state.mine.projects.map(project => project.id) : [];
    const suggestions = digest().homeSuggestions?.({ ownProjectIds }) || {};
    const community = suggestions.community;
    if (suggestions.status !== 'ready' || !community) { setSection('happening', ''); return; }
    const pickedIds = new Set(part('picked')?.hidden === false && part('join')?.hidden === false ? (suggestions.joinIn || []).slice(0, 1).map(item => String(item.entityId)) : []);
    const projects = community.projects.filter(item => !pickedIds.has(String(item.id))).slice(0, 2);
    const opportunities = community.opportunities.filter(item => !pickedIds.has(String(item.id))).slice(0, 3 - projects.length);
    // Skills open a way to people when Home has no one to introduce.
    const skills = []; // Skill browsing belongs in Explore, not another Home list.
    const empty = !projects.length && !opportunities.length && !skills.length;
    if (empty) { setSection('happening', ''); return; }
    // A newcomer (nothing picked for them, no projects yet) starts here.
    const newcomer = part('picked')?.hidden !== false && !!state.mine && state.mine !== 'error' && !state.mine.projects.length;
    // Each one is a short invitation, the whole card one tap: what it is,
    // what it says about itself, what it needs or who runs it, and which of
    // that the member lists. Only what the rows hold; a sparse one is just
    // its kind and title.
    const mine = new Set(listedTerms(profile()?.skills).map(term => term.toLowerCase()));
    const youList = (needs) => {
      const hits = (needs || []).filter(need => mine.has(String(need).toLowerCase()));
      return hits.length ? `You list ${hits.join(', ')}` : '';
    };
    const card = (attrs, kind, title, about, meta, match) => `<li><button type="button" class="home-invite" ${attrs}>
      <span class="home-invite-kind">${esc(kind)}</span>
      <strong class="home-invite-title">${esc(title)}</strong>
      ${about ? `<span class="home-invite-about">${esc(about)}</span>` : ''}
      ${meta ? `<span class="home-invite-meta">${esc(meta)}</span>` : ''}
      ${match ? `<span class="home-invite-match">${esc(match)}</span>` : ''}
      <span class="home-invite-action">View details <span aria-hidden="true">→</span></span>
    </button></li>`;
    const projectCard = (project, index) => card(`data-project="${index}"`,
      ['Project', project.people > 1 ? `${project.people} people` : ''].filter(Boolean).join(' · '),
      project.title, project.about, project.needs.length ? `Needs ${project.needs.join(', ')}` : '', youList(project.needs));
    const opportunityCard = (opp, index) => card(`data-opportunity="${index}"`,
      ['Opportunity', opp.kind ? opp.kind.charAt(0).toUpperCase() + opp.kind.slice(1) : ''].filter(Boolean).join(' · '),
      opp.title, opp.about, [opp.organization, opp.deadline ? `Closes ${shortDate(opp.deadline)}` : ''].filter(Boolean).join(' · '), youList(opp.needs));
    setSection('happening', `${newcomer
      ? '<h2 class="home-heading" id="home-happening-title" tabindex="-1">Ways to get involved</h2><p class="home-sub">Projects and opportunities you can take part in. Nothing to set up first.</p>'
      : '<h2 class="home-heading" id="home-happening-title" tabindex="-1">Ways to get involved</h2><p class="home-sub">Projects and opportunities you can take part in.</p>'}
      ${empty ? '<p class="home-muted">No open invitations to show right now. You can still find people and projects above.</p>' : ''}
      ${projects.length ? `<h3 class="home-subheading">Projects looking for people</h3><ul class="home-invites">${projects.map(projectCard).join('')}</ul>` : ''}
      ${opportunities.length ? `<h3 class="home-subheading">Open opportunities</h3><ul class="home-invites">${opportunities.map(opportunityCard).join('')}</ul>` : ''}
      ${skills.length ? `<h3 class="home-subheading">Find people by what they do</h3><ul class="home-topics">${skills.map((skill, index) => `<li><button type="button" class="home-topic" data-skill="${index}">${esc(skill.label)}</button></li>`).join('')}</ul>
        <button type="button" class="home-action" data-home-action="topics">See all skills</button>` : ''}`);
    const el = part('happening');
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
  }

  // Two current project rows, with the rest available on demand. All existing
  // project access remains; no activity or task status is invented.
  function paintMine() {
    const mine = state.mine;
    arrangeHome();
    if (mine === 'error') {
      setSection('mine', '<h2 class="home-heading home-label" id="home-mine-title">Your projects</h2><p class="home-muted">Your projects couldn’t be loaded.</p><button type="button" class="home-link" data-home-action="retry">Try again</button>');
      part('mine')?.querySelector('[data-home-action="retry"]')?.addEventListener('click', () => refreshMine());
      return;
    }
    if (!mine) { setSection('mine', ''); return; }
    const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    const row = (attrs, lead, title, meta) => `<li><button type="button" class="home-mine-row" ${attrs}>${lead}<span class="home-mine-text"><strong>${esc(title)}</strong>${meta ? `<span>${esc(meta)}</span>` : ''}</span>${chevron}</button></li>`;
    const shown = mine.projects.slice(0, 2);
    const more = mine.projects.slice(2);
    const projectRow = project => row(`data-project-id="${esc(project.id)}"`, `<span class="home-mine-icon" aria-hidden="true">${esc(String(project.title || '?').trim().charAt(0).toUpperCase() || '?')}</span>`,
      project.title || 'Untitled project', '');
    const projects = mine.projects.length
      ? shown.map(projectRow).join('')
      : row('data-mine="find-projects"', '<span class="home-mine-icon" aria-hidden="true">+</span>', 'Find a project to join', 'Browse projects in Explore');
    setSection('mine', `<h2 class="home-heading" id="home-mine-title">Continue your projects${mine.projects.length ? ` (${mine.projects.length})` : ''}</h2>
      <ul class="home-mine-list">${projects}</ul>
      ${more.length ? `<details class="home-more-list"><summary><span>View all ${mine.projects.length} projects</span><span class="home-more-cta" aria-hidden="true">⌄</span></summary><ul class="home-mine-list">${more.map(projectRow).join('')}</ul></details>` : ''}`);
    const el = part('mine');
    el?.querySelector('[data-mine="people"]')?.addEventListener('click', () => window.AppNav?.openNetwork?.());
    el?.querySelector('[data-mine="find-people"]')?.addEventListener('click', () => exploreTab('people'));
    el?.querySelector('[data-mine="find-projects"]')?.addEventListener('click', () => exploreTab('projects'));
    el?.querySelectorAll('[data-project-id]').forEach(button => button.addEventListener('click', () => window.viewProjectDetails?.(button.dataset.projectId)));
  }

  // ---------------------------------------------------------------- an idea
  // "Have an idea?": the idea's distinctive words (task assistance's list of
  // generic words, assistance-interventions.js, is left out) matched against what
  // members list and what projects describe. Simple word matching, shown as
  // such, never a ranking or recommendation. Explore's rules apply: no one
  // hidden from discovery, never the member; anyone not connected is "First
  // L." and matched only on the first three skills their limited profile
  // shows; interests and full names only for connections (and admins).
  const DONE_PROJECT = new Set(['archived', 'completed', 'cancelled', 'canceled', 'deleted']);
  // Plurals fold to the singular ("maps" → "map"), but a short word keeps its
  // s, so a skill like GIS still matches.
  const ideaWord = (word) => {
    const w = String(word || '').toLowerCase().replace(/'s$/, '');
    return w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
  };
  const wordsOf = (text) => (String(text || '').toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || []).map(ideaWord);

  function ideaTerms(text) {
    const generic = window.AssistanceEngine?.isGenericWord || (() => false);
    return [...new Set(wordsOf(text).filter(word => word.length >= 2 && !['of','in','on','to','by','at','as','an','or','be','is','it','we','me','my','do','so','if','no','up','us'].includes(word) && !/^\d+$/.test(word) && !generic(word) && !generic(`${word}s`)))];
  }

  function limitedName(raw) {
    const parts = String(raw || 'Community member').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts[0] || 'Community member';
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }

  function matchIdea({ idea, me, myAuth, connected = new Set(), isAdmin = false, people = [], projects = [], organizations = [], opportunities = [] }) {
    const terms = ideaTerms(idea);
    if (!terms.length) return { terms, people: [], projects: [], skills: [], organizations: [], opportunities: [] };
    const hits = (entries) => entries.filter(entry => terms.some(term => wordsOf(entry).includes(term)));
    const seen = new Set();
    const matchedPeople = [];
    for (const person of people) {
      if (!person?.id || person.is_hidden === true) continue;
      if ((me && String(person.id) === String(me)) || (myAuth && String(person.user_id) === String(myAuth))) continue;
      const identity = String(person.user_id ?? person.id);
      if (seen.has(identity)) continue;
      const full = isAdmin || connected.has(String(person.id));
      const skills = listedTerms(person.skills);
      const skillHits = hits(full ? skills : skills.slice(0, 3));
      const interestHits = full ? hits(listedTerms(person.interests)) : [];
      const nameHit = hits([full ? person.name : limitedName(person.name)]).length > 0;
      if (!skillHits.length && !interestHits.length && !nameHit) continue;
      seen.add(identity);
      matchedPeople.push({
        id: person.id,
        name: full ? String(person.name || 'Community member').trim() : limitedName(person.name),
        connected: connected.has(String(person.id)),
        reason: [nameHit ? 'Name matches' : '', skillHits.length ? `Lists ${skillHits.join(', ')}` : '', interestHits.length ? `Interested in ${interestHits.join(', ')}` : ''].filter(Boolean).join(' · '),
        strength: skillHits.length + interestHits.length,
      });
    }
    const matchedProjects = [];
    for (const project of projects) {
      if (!project?.id || !project.title || DONE_PROJECT.has(String(project.status || '').toLowerCase())) continue;
      const needHits = hits(listedTerms(project.required_skills));
      const about = new Set(wordsOf(`${project.title} ${project.description || ''}`));
      const aboutHits = terms.filter(term => about.has(term));
      if (!needHits.length && aboutHits.length < Math.min(2, terms.length)) continue;
      matchedProjects.push({
        id: project.id,
        title: project.title,
        reason: needHits.length ? `Needs ${needHits.join(', ')}` : `Mentions ${aboutHits.join(', ')}`,
        strength: needHits.length + aboutHits.length,
      });
    }
    const order = (key) => (a, b) => b.strength - a.strength || String(a[key]).localeCompare(String(b[key]));
    const skills = [...new Set(people.filter(p => p.id && !p.is_hidden && String(p.id) !== String(me) && (!myAuth || String(p.user_id) !== String(myAuth))).flatMap(p => listedTerms(p.skills).slice(0, isAdmin || connected.has(String(p.id)) ? undefined : 3)))].filter(skill => hits([skill]).length).sort().slice(0, 3);
    const matchRows = (rows, name) => rows.filter(row => hits([row[name], row.description || '']).length).slice(0, 3);
    return { terms, people: matchedPeople.sort(order('name')).slice(0, 5), projects: matchedProjects.sort(order('title')).slice(0, 3), skills,
      organizations: matchRows(organizations, 'name'),
      opportunities: matchRows(opportunities.filter(o => o.status === 'open' && o.is_public === true && (!o.application_deadline || new Date(o.application_deadline).getTime() > Date.now())), 'title') };

  }

  async function findForIdea(idea) {
    const client = window.supabase;
    const me = profile();
    if (!client || !me?.id) throw new Error('Not signed in');
    const [peopleResult, projectsResult, linksResult, orgResult, oppResult] = await Promise.all([
      client.from('community').select('id, user_id, name, skills, interests').or('is_hidden.is.null,is_hidden.eq.false').limit(1000),
      client.from('projects').select('id, title, description, required_skills, status, creator_id').limit(500),
      client.from('connections').select('from_user_id, to_user_id').or(`from_user_id.eq.${me.id},to_user_id.eq.${me.id}`).eq('status', 'accepted'),
      client.from('organizations').select('id, name, description').limit(500),
      client.from('opportunities').select('id, title, description, status, is_public, application_deadline').eq('status','open').eq('is_public',true).or(`application_deadline.is.null,application_deadline.gt.${new Date().toISOString()}`).limit(500),
    ]);
    if (peopleResult.error || projectsResult.error || orgResult.error || oppResult.error) throw (peopleResult.error || projectsResult.error || orgResult.error || oppResult.error);
    const connected = new Set((linksResult.data || []).map(row => String(String(row.from_user_id) === String(me.id) ? row.to_user_id : row.from_user_id)));
    return matchIdea({
      idea, me: me.id, myAuth: me.user_id, connected,
      isAdmin: typeof window.isAdminUser === 'function' && window.isAdminUser(),
      people: peopleResult.data || [], projects: projectsResult.data || [], organizations: orgResult.data || [], opportunities: oppResult.data || [],
    });
  }

  function paintIdeaResults(idea, result, learning = false) {
    const slot = part('goal')?.querySelector('.home-idea-results');
    if (!slot) return;
    const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';
    const row = (attrs, lead, title, meta) => `<li><button type="button" class="home-mine-row" ${attrs}>${lead}<span class="home-mine-text"><strong>${esc(title)}</strong>${meta ? `<span>${esc(meta)}</span>` : ''}</span>${chevron}</button></li>`;
    const explore = '<div class="home-idea-more"><button type="button" class="home-link" data-idea-explore="people">Explore the community</button></div>';
    if (result === 'error') {
      slot.innerHTML = '<p class="home-muted">That search couldn’t be done right now. Try again in a moment.</p>';
    } else if (!result.terms.length) {
      slot.innerHTML = `<p class="home-muted">Add a word or two about what it involves, like a skill or a topic, so it can be matched.</p>`;
    } else if (!result.people.length && !result.projects.length && !result.skills.length && !result.organizations.length && !result.opportunities.length) {
      slot.innerHTML = `<p class="home-muted">No matches for “${esc(idea)}”. Try a name, skill, or keyword.</p>${explore}`;
    } else {
      slot.innerHTML = `<p class="home-muted">Matches for “${esc(idea)}”</p>${learning ? '<p class="home-muted">These are topic matches. Ask whether beginners are welcome or learning support is available.</p>' : ''}
        ${result.people.length ? `<h3 class="home-subheading">People</h3><ul class="home-mine-list">${result.people.map(person => row(`data-idea-person="${esc(person.id)}" data-name="${esc(person.name)}"`, `<span class="home-mine-icon home-idea-face" aria-hidden="true">${esc(initial(person.name))}</span>`, person.name, [person.reason, person.connected ? 'Connected' : ''].filter(Boolean).join(' · '))).join('')}</ul>` : ''}
        ${result.projects.length ? `<h3 class="home-subheading">Projects</h3><ul class="home-mine-list">${result.projects.map(project => row(`data-idea-project="${esc(project.id)}"`, `<span class="home-mine-icon" aria-hidden="true">${esc(initial(project.title))}</span>`, project.title, project.reason)).join('')}</ul>` : ''}`;
    }
    if (result && result !== 'error') {
      for (const [heading, rows, attr, name] of [
        ['Skills', (result.skills || []).map(name=>({id:name,name})), 'skill', 'name'],
        ['Organizations', result.organizations || [], 'organization', 'name'],
        ['Opportunities', result.opportunities || [], 'opportunity', 'title'],
      ]) {
        if (!rows.length) continue;
        slot.insertAdjacentHTML('beforeend', `<h3 class="home-subheading">${heading}</h3><ul class="home-mine-list">${rows.map(item=>row(`data-search-kind="${attr}" data-search-id="${esc(item.id)}"`, '', item[name], '')).join('')}</ul>`);
      }
    }
    slot.querySelectorAll('[data-search-kind]').forEach(button=>button.addEventListener('click',()=> {
      if(button.dataset.searchKind==='skill') openSkill(button.dataset.searchId);
      else open({type:button.dataset.searchKind,entityId:button.dataset.searchId});
    }));
    slot.querySelectorAll('[data-idea-person]').forEach(button => button.addEventListener('click', () => window.openNodePanel?.({ id: button.dataset.ideaPerson, type: 'person', name: button.dataset.name })));
    slot.querySelectorAll('[data-idea-project]').forEach(button => button.addEventListener('click', () => open({type:'project',entityId:button.dataset.ideaProject})));
    slot.querySelectorAll('[data-idea-explore]').forEach(button => button.addEventListener('click', () => exploreTab(button.dataset.ideaExplore)));
    slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Built once per Home: typing here survives every other update.
  // Explicit learning intent uses the existing search, not a new profile field.
  // No inferred aspirations, persistence, or new telemetry.
  function learningQuery(text) {
    const match = String(text || '').trim().match(/^(?:i want to learn|i would like to learn|help me learn|learn)\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  function mountGoal() {
    const el = part('goal');
    if (!el || el.dataset.mounted === 'true') return;
    el.dataset.mounted = 'true';
    el.innerHTML = `<h2 class="home-heading home-label" id="home-idea-title">Search the community</h2>
      <p class="home-muted">People, projects, skills, organizations, and opportunities.</p>
      <form class="home-idea-form" aria-labelledby="home-idea-title">
        <label class="home-sr" for="home-idea-input">Search the community</label>
        <input id="home-idea-input" name="idea" required maxlength="280" autocomplete="off" enterkeyhint="search" placeholder="Name, skill, or keyword…">
        <button type="submit">Search</button>
      </form>
      <p class="home-idea-example">Try: <button type="button" class="home-link" data-idea-example="I'm looking for help with community building">Community building</button></p>
      <div class="home-idea-results" aria-live="polite"></div>`;
    // The example fills the field to edit or send; it never searches by itself.
    el.querySelector('[data-idea-example]').addEventListener('click', (event) => {
      const input = el.querySelector('#home-idea-input');
      input.value = event.currentTarget.dataset.ideaExample;
      input.focus();
    });
    let searchRequest = 0;
    el.querySelector('#home-idea-input').addEventListener('input', () => {
      searchRequest += 1;
      el.querySelector('.home-idea-results').innerHTML = '';
    });
    el.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector('input');
      const idea = input.value.trim();
      if (!idea) return;
      const search = ++searchRequest;
      const memberId = state.memberId;
      input.blur();
      const slot = el.querySelector('.home-idea-results');
      slot.innerHTML = '<p class="home-muted" role="status">Looking…</p>';
      let result;
      const learning = window.HPEParticipationPilot === true ? learningQuery(idea) : null;
      try { result = await findForIdea(learning || idea); } catch (error) { console.warn('[Home] idea search unavailable:', error?.message || error); result = 'error'; }
      if (search === searchRequest && el.isConnected && part('goal') === el && state.memberId === memberId && input.value.trim() === idea) paintIdeaResults(idea, result, !!learning);
    });
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
    if (!typingInHome()) { paint(); return; }
    const armed = waiting.size > 0;
    waiting.add(paint);
    if (armed) return;
    const target = host;
    function later() {
      window.setTimeout(() => {
        if (typingInHome()) return;
        target.removeEventListener('focusout', later, true);
        target.removeEventListener('blur', later, true);
        const paints = [...waiting];
        waiting.clear();
        if (host !== target) return;
        paints.forEach(fn => fn());
      }, 0);
    }
    target.addEventListener('focusout', later, true);
    target.addEventListener('blur', later, true);
  }

  function paintSuggestions() {
    if (!host) return;
    paintMeet();
    paintJoin();
    paintHappening();
  }

  // ---------------------------------------------------------------- frame

  function build(target, desktop) {
    const name = displayName(profile());
    const avatar = window.profilePhotoUrl?.(profile());
    target.innerHTML = `<div class="home-view" data-layout="${desktop ? 'desktop' : 'phone'}">
      ${desktop ? '' : `<header class="home-header"><div class="home-avatar" aria-hidden="true">${avatar ? `<img src="${esc(avatar)}" alt="">` : esc((name || 'M').slice(0, 1).toUpperCase())}</div><h1 id="mobile-you-title"><span class="home-hello">Welcome,</span><span class="home-name">${esc(name || 'community member')}</span></h1></header>`}
      <div class="home-grid">
        <section class="home-section home-idea" data-home="goal" aria-labelledby="home-idea-title"></section>
          <section class="home-section home-attention" data-home="attention" aria-labelledby="home-attention-title" hidden></section>
          <section class="home-section home-picked" data-home="picked" aria-labelledby="home-picked-title" hidden>
            <h2 class="home-heading" id="home-picked-title" tabindex="-1">Your next step</h2>
            <div class="home-part" data-home="meet" hidden></div>
            <div class="home-part" data-home="join" hidden></div>
          </section>
        <section class="home-section home-mine" data-home="mine" aria-labelledby="home-mine-title" hidden></section>
        <section class="home-section home-happening" data-home="happening" aria-labelledby="home-happening-title" hidden></section>
        <section class="home-section home-profile" data-home="profile" aria-labelledby="home-curious-title" hidden></section>
      </div>
    </div>`;
  }

  async function refreshMine() {
    const token = ++request;
    const memberId = state.memberId;
    try {
      const mine = await loadMine(memberId);
      if (token !== request || memberId !== state.memberId) return;
      state.mine = mine;
    } catch (error) {
      if (token !== request || memberId !== state.memberId) return;
      console.warn('[Home] projects unavailable:', error?.message || error);
      state.mine = 'error';
    }
    calmly(paintMine);
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
    externalGeneration += 1;
    externalInventory = [];
    externalLoadedAt = 0;
    externalLoading = false;
    externalDismissed.clear();
    externalMember = null;
    if (host) host.innerHTML = '';
    host = null;
    state.memberId = null;
    state.mine = null;
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
    const avatarNode = target.querySelector('.home-avatar');
    if (avatarNode) {
      const photo = window.profilePhotoUrl?.(p);
      avatarNode.innerHTML = photo ? `<img src="${esc(photo)}" alt="">` : esc((displayName(p) || 'M').slice(0, 1).toUpperCase());
    }
    paintProfilePrompt();
    paintAttention();
    paintMine();
    paintSuggestions();
    refreshMine();
    refreshAttention();
    refreshExternalInventory();
  }

  // "Write your own objective" (focused assistance) opens goal help here.
  function focusGoal() {
    document.getElementById('home-idea-input')?.focus();
  }

  // chooseNextTask: the rule a project's own overview uses for its next step
  // (node-panel.js); Home itself no longer picks a task.
  window.HomeView = { show, clear, focusGoal, chooseNextTask };
  window.HomeViewTesting = { taskScore, chooseNextTask, loadMine, wantsCuriosityPrompt, matchIdea, preferParticipation, learningQuery, externalPick };

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
    refreshMine();
  }));
})();
