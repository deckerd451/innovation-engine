// Focused assistance: the one surface every mobile entry point opens, for an
// existing task (open) or a newly typed objective (openObjective). It asks
// AssistanceEngine for the decision, renders the work product, and reuses
// project_tasks, capability_packages/attempts, connections and community for
// persistence and community help. Row-level security remains the boundary;
// the client only narrows what it asks for and never widens it.
(function () {
  'use strict';
  if (window.MobileTaskAssistance) return;

  const esc = window.escapeHtml || (value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])));
  // Same breakpoint that shows the mobile My Space screen.
  const isMobile = () => window.matchMedia?.('(max-width: 1023px), (pointer: coarse)')?.matches;
  const client = () => window.supabase;
  const engine = () => window.AssistanceEngine;
  const DRAFT_PREFIX = 'buildspace-assist-draft:';
  let current = null;
  let returnFocus = null;

  function readDraft(key) { try { return JSON.parse(window.localStorage.getItem(DRAFT_PREFIX + key) || 'null'); } catch (_) { return null; } }
  function writeDraft(key, value) { try { if (value) window.localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value)); else window.localStorage.removeItem(DRAFT_PREFIX + key); } catch (_) { /* device storage is optional */ } }

  function close() {
    const root = document.getElementById('mobile-task-assistance');
    if (!root) return;
    root.remove();
    document.body.classList.remove('mta-open');
    current = null;
    window.dispatchEvent(new CustomEvent('mobile-assistance-closed'));
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus?.();
    returnFocus = null;
  }

  function note(title, body, action = '') {
    return `<div class="mta-empty"><strong>${esc(title)}</strong>${body ? `<p>${esc(body)}</p>` : ''}${action}</div>`;
  }

  // ---------------------------------------------------------------- data

  // Only the creator or an accepted (non-pending) member may change a task.
  // project_tasks RLS enforces the same rule; this keeps the UI honest.
  function canWorkOn(project, membership, memberId) {
    return Boolean(memberId && project && (project.creator_id === memberId || (membership && membership.user_id === memberId && membership.role && membership.role !== 'pending')));
  }

  async function connectedPeople(memberId) {
    if (!client() || !memberId) return [];
    const { data: links, error } = await client().from('connections').select('from_user_id,to_user_id').or(`from_user_id.eq.${memberId},to_user_id.eq.${memberId}`).eq('status', 'accepted');
    if (error) return [];
    const ids = [...new Set((links || []).map(row => row.from_user_id === memberId ? row.to_user_id : row.from_user_id).filter(id => id && id !== memberId))];
    if (!ids.length) return [];
    const { data: people, error: peopleError } = await client().from('community').select('id,name,skills,interests').in('id', ids);
    return peopleError ? [] : (people || []);
  }

  async function findPeople(terms, memberId) {
    if (!terms?.length) return [];
    return (await connectedPeople(memberId))
      .map(person => ({ person, match: engine().personRelevance(person, terms) }))
      .filter(item => item.match.relevant).slice(0, 3);
  }

  async function memberProjects(memberId) {
    if (!client() || !memberId) return [];
    if (window.MobileGoalDiscovery?.authorizedProjects) return window.MobileGoalDiscovery.authorizedProjects(memberId);
    return [];
  }

  async function findProjects(objective, memberId, currentId) {
    const projects = await memberProjects(memberId);
    return projects.filter(project => project.id !== currentId)
      .map(project => ({ project, match: engine().projectRelevance(project, objective) }))
      .filter(item => item.match.relevant).slice(0, 2);
  }

  async function findMethods(objective) {
    if (!window.CapabilityMemory?.searchGoal) return { methods: [], stats: new Map(), unavailable: true };
    const result = await window.CapabilityMemory.searchGoal(objective);
    if (result?.unavailable) return { methods: [], stats: new Map(), unavailable: true };
    const me = window.currentUserProfile?.id;
    const methods = (result.packages || [])
      .filter(pkg => pkg.permission_mode === 'community' || (me && pkg.creator_id === me))
      .filter(pkg => engine().methodRelevance(pkg, objective).relevant)
      .slice(0, 2);
    return { methods, stats: result.stats || new Map(), unavailable: false };
  }

  // ------------------------------------------------------------- rendering

  function valueOf(values, key, fallback) {
    return values[key] !== undefined ? values[key] : (fallback ?? '');
  }

  function renderBlock(block, values) {
    const E = engine();
    if (block.type === 'fields') {
      return `<fieldset class="ai-block ai-fields"><legend>${esc(block.label)}</legend>${block.items.map(item => {
        const key = `${block.id}.${item.key}`;
        return `<label><span>${esc(item.label)}</span><textarea rows="2" data-ai-key="${esc(key)}"${item.hint ? ` aria-describedby="hint-${esc(key)}"` : ''}>${esc(valueOf(values, key, item.value))}</textarea>${item.hint ? `<small id="hint-${esc(key)}">${esc(item.hint)}</small>` : ''}</label>`;
      }).join('')}</fieldset>`;
    }
    if (block.type === 'checklist') {
      const checked = new Set(values[`${block.id}.checked`] || []);
      const firstOpen = block.computeFirstOpen ? block.items.find(item => !checked.has(item.key)) : null;
      return `<fieldset class="ai-block ai-checklist"><legend>${esc(block.label)}</legend>${block.items.map(item => `<label class="ai-check"><input type="checkbox" data-ai-check="${esc(block.id)}" value="${esc(item.key)}"${checked.has(item.key) ? ' checked' : ''}><span><strong>${esc(item.text)}</strong>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span></label>`).join('')}${block.computeFirstOpen ? `<p class="ai-result" data-ai-first-open="${esc(block.id)}">${firstOpen ? `Blocking now: <strong>${esc(firstOpen.short || firstOpen.text)}</strong> — settle this before the items below it.` : 'Everything on this list is settled.'}</p>` : ''}</fieldset>`;
    }
    if (block.type === 'list') {
      return `<div class="ai-block ai-list"><h3>${esc(block.label)}</h3><ul>${block.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`;
    }
    if (block.type === 'matrix') {
      const rows = E.matrixRows(block, values);
      const scoreSelect = (rowIndex, criterion, row) => `<label class="ai-score"><span>${esc(criterion.label)}</span><select data-ai-matrix="${esc(block.id)}" data-row="${rowIndex}" data-criterion="${esc(criterion.key)}"><option value="">–</option>${[1, 2, 3].map(score => `<option value="${score}"${Number(row.scores?.[criterion.key]) === score ? ' selected' : ''}>${score}</option>`).join('')}</select></label>`;
      return `<fieldset class="ai-block ai-matrix" data-ai-matrix-block="${esc(block.id)}"><legend>${esc(block.label)}</legend>${rows.map((row, index) => `<div class="ai-matrix-row"><input type="text" maxlength="80" data-ai-matrix="${esc(block.id)}" data-row="${index}" data-name aria-label="${esc(block.rowLabel || 'Option')} ${index + 1}" placeholder="${esc(block.placeholder || `${block.rowLabel || 'Option'} ${index + 1}`)}" value="${esc(row.name || '')}"><div class="ai-scores">${block.criteria.map(criterion => scoreSelect(index, criterion, row)).join('')}</div></div>`).join('')}<button type="button" class="ai-add-row" data-ai-add-row="${esc(block.id)}">+ Add ${esc((block.rowLabel || 'option').toLowerCase())}</button><p class="ai-result" data-ai-matrix-result="${esc(block.id)}" aria-live="polite">${matrixResult(block, values)}</p></fieldset>`;
    }
    if (block.type === 'message') {
      const body = valueOf(values, `${block.id}.body`, block.body);
      return `<div class="ai-block ai-message"><h3>${esc(block.label)}</h3><p class="ai-subject">Subject: <span data-ai-subject="${esc(block.id)}">${esc(block.subject || '')}</span></p><textarea rows="7" data-ai-message="${esc(block.id)}"${values[`${block.id}.body`] !== undefined ? ' data-edited="true"' : ''}>${esc(body)}</textarea><div class="ai-message-actions"><button type="button" data-ai-copy-message="${esc(block.id)}">Copy message</button><a class="ai-email" data-ai-email="${esc(block.id)}" href="${mailto(block.subject, body)}">Open in email</a></div><small>Buildspace doesn’t send this for you — edit the [brackets], then send it from your own email or messages.</small></div>`;
    }
    return '';
  }

  function mailto(subject, body) {
    return `mailto:?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
  }

  function matrixResult(block, values) {
    const ranked = engine().rankMatrix(block, values).filter(row => row.scored);
    if (!ranked.length) return 'Add names and scores — the ranking appears here.';
    const max = block.criteria.length * 3;
    const tie = ranked[1] && ranked[1].total === ranked[0].total;
    return `${tie ? 'Tied at the top' : 'Leading'}: <strong>${esc(ranked[0].name)}</strong> (${ranked[0].total}/${max})${tie ? ` and <strong>${esc(ranked[1].name)}</strong>` : ranked[1] ? ` · next: ${esc(ranked[1].name)} (${ranked[1].total})` : ''}`;
  }

  function decisionFor(session) {
    return engine().decide({ objective: session.objective, source: session.task ? 'task' : 'member', projectTitle: session.project?.title, state: session.state });
  }

  function headerMarkup(session, decision) {
    const last = session.progress[session.progress.length - 1];
    const interpretation = decision.playbook
      ? `<p class="mta-interpretation">Looks like <strong>${esc(decision.playbook.label.toLowerCase())}</strong>${decision.stepCount ? ` · step ${Math.min(decision.stepIndex + 1, decision.stepCount)} of ${decision.stepCount}` : ''} <button type="button" class="mta-link" data-mta-not-this>Not this?</button></p>`
      : '';
    return `<header class="mta-header"><button type="button" class="mta-back" data-mta-back>‹ My Space</button><button type="button" class="mta-close" aria-label="Close" data-mta-close>×</button></header>
      <p class="mta-context">${session.project ? esc(session.project.title || 'Project') : 'New objective'}${session.task ? ` · ${esc(statusLabel(session.task.status))}` : ''}</p>
      <h1 id="mta-title" tabindex="-1">${esc(session.objective)}</h1>
      ${session.purpose ? `<p class="mta-description">${esc(session.purpose)}</p>` : ''}
      ${interpretation}
      ${decision.outcome ? `<p class="mta-outcome-line"><span>Success looks like (suggested):</span> ${esc(decision.outcome.text)}</p>` : ''}
      ${last ? `<p class="mta-last"><span>Last update${last.date ? ` · ${esc(last.date)}` : ''}:</span> ${esc(last.kind)}${last.note ? ` — ${esc(last.note)}` : ''}</p>` : ''}
      ${session.restoredDraft ? '<p class="mta-note">Restored unsaved edits from this device.</p>' : ''}`;
  }

  function statusLabel(status) { return status === 'done' ? 'Completed' : status === 'in_progress' ? 'In progress' : 'Not started'; }

  function primaryMarkup(session) {
    // When the work is saved, the next useful thing is reporting what
    // happened — never an inert "saved" button.
    if (session.task && session.canWork) return session.dirty ? '<button type="button" class="mta-primary" data-mta-save>Save to this task</button>' : '<button type="button" class="mta-primary" data-mta-go-report>Done this? Report what happened</button><p class="mta-note mta-saved-note">Your work on this step is saved to the task.</p>';
    if (session.task) return '<button type="button" class="mta-primary" data-mta-copy-brief>Copy this work</button><p class="mta-note">View only — your project role doesn’t allow updates.</p>';
    return '<button type="button" class="mta-primary" data-mta-save-objective>Save to a project</button><div class="mta-project-choice" data-mta-project-choice aria-live="polite"></div>';
  }

  function decisionMarkup(session, decision) {
    if (decision.complete) {
      return `<section class="mta-next" aria-labelledby="mta-next-title"><p class="mta-eyebrow">Guide finished</p><h2 id="mta-next-title">You’ve worked through every step in this guide.</h2><p>If the task itself is done, mark it complete. If something is still open, say what’s in the way.</p>${obstacleChips(decision, session)}</section>`;
    }
    if (decision.clarify) {
      return `<section class="mta-next" aria-labelledby="mta-next-title"><p class="mta-eyebrow">One question</p><h2 id="mta-next-title">${esc(decision.clarify.question)}</h2>${decision.clarify.note ? `<p class="mta-note">${esc(decision.clarify.note)}</p>` : ''}<div class="mta-chips" role="group" aria-label="What’s in the way">${decision.clarify.options.map(option => `<button type="button" class="mta-chip" data-mta-obstacle="${esc(option.key)}">${esc(option.label)}</button>`).join('')}</div></section>`;
    }
    const blocks = decision.intervention.blocks.map(block => renderBlock(block, session.state.values)).join('');
    return `<section class="mta-next" aria-labelledby="mta-next-title"><p class="mta-eyebrow">Next move${decision.step.inferred ? ' (suggested)' : ''}</p><h2 id="mta-next-title">${esc(decision.step.title)}</h2><p class="mta-why">${esc(decision.step.obstacle)}</p><div class="ai-work-product">${blocks}</div>${primaryMarkup(session)}<div class="mta-secondary-row"><button type="button" class="mta-link" data-mta-copy-brief>Copy all of this</button>${session.state.obstacle && decision.playbook ? '<button type="button" class="mta-link" data-mta-obstacle="">Back to the guide</button>' : ''}</div>${obstacleChips(decision, session)}</section>`;
  }

  function obstacleChips(decision, session) {
    const options = Object.entries(engine().OBSTACLES).filter(([key]) => key !== session.state.obstacle);
    return `<details class="mta-else"><summary>Something else in the way?</summary><div class="mta-chips">${options.map(([key, item]) => `<button type="button" class="mta-chip" data-mta-obstacle="${esc(key)}">${esc(item.label)}</button>`).join('')}</div></details>`;
  }

  function reportMarkup(session, decision) {
    if (!session.task) return '<section class="mta-report"><h2>Keep going later</h2><p class="mta-note">This isn’t saved anywhere yet except as a draft on this device. Save it to a project to track progress and pick up from any device.</p></section>';
    if (!session.canWork) return '';
    const canAdvance = Boolean(decision.playbook && !decision.complete && !session.state.obstacle);
    return `<section class="mta-report" aria-labelledby="mta-report-title"><h2 id="mta-report-title">What happened?</h2>
      <div class="mta-chips" role="radiogroup" aria-label="What happened">${canAdvance || session.state.obstacle ? '<button type="button" class="mta-chip" role="radio" aria-checked="false" data-mta-kind="Took this step">I did this step</button>' : ''}<button type="button" class="mta-chip" role="radio" aria-checked="false" data-mta-kind="Got a result">Got a result</button><button type="button" class="mta-chip" role="radio" aria-checked="false" data-mta-kind="Blocked">I’m blocked</button></div>
      <label class="sr-only" for="mta-report-note">Details</label><textarea id="mta-report-note" rows="2" maxlength="400" data-mta-report-note placeholder="One line is enough, e.g. “Invited 2 of 3; Dana said yes.”"></textarea>
      <div data-mta-attempt></div>
      <button type="button" class="mta-secondary-action" data-mta-report disabled>Save update</button>
      <p class="mta-note">Saved as your report on this task. It doesn’t mark the task complete or count as verified.</p>
      ${session.task.status !== 'done' ? '<div class="mta-status-row"><span>Is the whole task finished?</span><button type="button" class="mta-link" data-mta-complete>Mark task complete</button></div>' : '<p class="mta-complete">Task marked complete.</p>'}
      <div data-mta-share-slot>${shareMarkup(session, decision)}</div></section>`;
  }

  function shareMarkup(session, decision) {
    const reported = session.progress.some(item => /Took this step|Got a result/.test(item.kind));
    if (!reported || !session.project || session.shared) return session.shared ? `<p class="mta-complete">${session.shared === 'community' ? 'Shared with Buildspace members as untested.' : 'Saved privately to your project.'}</p>` : '';
    const playbook = decision.playbook ? engine().PLAYBOOKS.find(item => item.id === decision.playbook.id) : null;
    const steps = playbook ? playbook.steps.map(step => step.title) : session.progress.map(item => item.note).filter(Boolean);
    const lastResult = [...session.progress].reverse().find(item => item.note)?.note || '';
    return `<details class="mta-share"><summary>Save what worked for the next member</summary>
      <p class="mta-note">${esc(decision.learning)}</p>
      <label><span>Title</span><input type="text" maxlength="100" data-share-title value="${esc(playbook ? `${playbook.label}: what worked for ${session.project.title}` : session.objective)}"></label>
      <label><span>Goal it helps with</span><textarea rows="2" maxlength="280" data-share-goal>${esc(session.objective)}</textarea></label>
      <label><span>What happened</span><textarea rows="2" maxlength="500" data-share-summary>${esc(lastResult)}</textarea></label>
      <label><span>Steps, one per line</span><textarea rows="4" data-share-steps>${esc(steps.join('\n'))}</textarea></label>
      <label><span>What to watch for</span><textarea rows="2" maxlength="500" data-share-watch></textarea></label>
      <label class="mta-consent"><input type="checkbox" data-share-community> Share with Buildspace members (otherwise only you can see it)</label>
      <p class="mta-note">Saved as <strong>untested</strong>. It is labelled tested only after members report results, and verified only when someone else confirms them. Don’t include private details about other people.</p>
      <button type="button" class="mta-secondary-action" data-mta-share>Save method</button></details>`;
  }

  function communityMarkup() {
    return '<section class="mta-community" aria-labelledby="mta-community-title"><h2 id="mta-community-title">From the community</h2><div data-mta-community-body><p class="mta-note" role="status">Checking shared methods and your connections…</p></div></section>';
  }

  function render(session, { focusTitle = false } = {}) {
    const panel = document.querySelector('#mobile-task-assistance .mta-panel');
    if (!panel) return;
    const scroll = panel.scrollTop;
    const decision = decisionFor(session);
    session.decision = decision;
    const community = panel.querySelector('[data-mta-community-body]')?.innerHTML;
    panel.innerHTML = `${headerMarkup(session, decision)}<div data-mta-decision>${decisionMarkup(session, decision)}</div>${communityMarkup()}${reportMarkup(session, decision)}<p class="mta-footer">${session.project ? `<button type="button" class="mta-link" data-mta-open-project>Open ${esc(session.project.title || 'project')}</button>` : ''}</p>`;
    if (community && session.communityKey === communityKey(session, decision)) panel.querySelector('[data-mta-community-body]').innerHTML = community;
    else loadCommunity(session, decision);
    if (session.attemptMarkup) panel.querySelector('[data-mta-attempt]')?.insertAdjacentHTML('beforeend', session.attemptMarkup);
    if (focusTitle) panel.querySelector('#mta-title')?.focus({ preventScroll: true });
    else panel.scrollTop = scroll;
  }

  function communityKey(session, decision) {
    return JSON.stringify([session.objective, engine().searchTerms(decision, session.state.values)]);
  }

  async function loadCommunity(session, decision) {
    const key = communityKey(session, decision);
    session.communityKey = key;
    const memberId = session.memberId;
    const terms = engine().searchTerms(decision, session.state.values);
    const [methods, people, projects] = await Promise.all([
      findMethods(session.objective).catch(() => ({ methods: [], unavailable: true, stats: new Map() })),
      findPeople(terms, memberId).catch(() => []),
      findProjects(session.objective, memberId, session.project?.id).catch(() => []),
    ]);
    if (current !== session || session.communityKey !== key) return;
    session.methods = methods.methods;
    const body = document.querySelector('#mobile-task-assistance [data-mta-community-body]');
    if (!body) return;
    const parts = [];
    if (methods.methods.length) {
      parts.push(`<h3>Methods members have shared</h3>${methods.methods.map(pkg => window.CapabilityMemory.renderPackageCard(pkg, methods.stats, session.objective, { canUse: Boolean(memberId), canEdit: Boolean(session.task ? session.canWork : memberId), actionLabel: session.task ? 'Add its steps to this project' : 'Use this method' })).join('')}`);
    }
    if (people.length) {
      parts.push(`<h3>People you’re connected to</h3><p class="mta-note">Matched on what their profile lists. That doesn’t mean they’re available or willing — ask.</p>${people.map(({ person, match }) => `<div class="mta-row"><strong>${esc(person.name || 'Community member')}</strong><span>${esc(match.reason)}</span><button type="button" class="mta-link" data-mta-message="${esc(person.id)}" data-name="${esc(person.name || '')}">Copy the request &amp; message them</button></div>`).join('')}`);
    }
    if (projects.length) {
      parts.push(`<h3>Your related projects</h3>${projects.map(({ project, match }) => `<button type="button" class="mta-project" data-mta-project="${esc(project.id)}"><strong>${esc(project.title || 'Project')}</strong><span>${esc(match.reason)}</span></button>`).join('')}`);
    }
    if (!parts.length) {
      const reason = methods.unavailable ? 'Shared methods couldn’t be loaded right now.' : 'No shared method, connected member, or project of yours matches this yet.';
      parts.push(`<p class="mta-note">${esc(reason)} The work above doesn’t depend on them${session.task && session.canWork ? ' — and what you report here can help the next member' : ''}.</p>`);
    }
    body.innerHTML = parts.join('');
  }

  // ------------------------------------------------------------- persistence

  function persistDraft(session) {
    writeDraft(session.draftKey, { objective: session.objective, state: session.state, savedAt: new Date().toISOString() });
  }

  function rememberInterpretation(session) {
    const id = session.decision?.playbook?.id;
    if (id && !session.state.overridden) session.state.playbook = id;
  }

  async function saveToTask(session) {
    const E = engine();
    rememberInterpretation(session);
    const label = session.decision?.playbook ? `${session.decision.playbook.label} — ${session.decision.step?.title || 'guide finished'}` : session.decision?.step?.title;
    const description = E.writeNotes(session.task.description, session.state, label);
    const updated = await window.ProjectTasks.updateTask(session.task, { description }, session.memberId);
    session.task = { ...session.task, ...(updated || {}), description };
    session.dirty = false;
    writeDraft(session.draftKey, null);
    window.dispatchEvent(new CustomEvent('project-task-updated'));
  }

  async function saveReport(session, kind, text) {
    const E = engine();
    rememberInterpretation(session);
    if (kind === 'Took this step') {
      if (session.state.obstacle) session.state.obstacle = null;
      else session.state.step = (Number(session.state.step) || 0) + 1;
    }
    const decision = decisionFor(session);
    const label = decision.playbook ? `${decision.playbook.label} — ${decision.step?.title || 'guide finished'}` : decision.step?.title;
    let description = E.appendProgress(session.task.description, kind, text);
    description = E.writeNotes(description, session.state, label);
    const fields = { description };
    // Reporting progress means the work has started; it never marks it done.
    if (session.task.status === 'open') fields.status = 'in_progress';
    const updated = await window.ProjectTasks.updateTask(session.task, fields, session.memberId);
    session.task = { ...session.task, ...(updated || {}), ...fields };
    const parsed = E.parseNotes(session.task.description);
    session.progress = parsed.progress;
    session.dirty = false;
    writeDraft(session.draftKey, null);
    window.dispatchEvent(new CustomEvent('project-task-updated'));
  }

  // --------------------------------------------------------------- opening

  function mountRoot() {
    close();
    returnFocus = document.activeElement;
    const root = document.createElement('div');
    root.id = 'mobile-task-assistance';
    root.className = 'mta-overlay';
    root.innerHTML = '<div class="mta-panel" role="dialog" aria-modal="true" aria-labelledby="mta-title"><div class="mta-loading" role="status">Opening…</div></div>';
    document.body.appendChild(root);
    document.body.classList.add('mta-open');
    wire(root);
    return root;
  }

  async function open(projectId, taskId) {
    if (!isMobile()) return window.viewProjectDetails?.(projectId, 'tasks', taskId);
    const db = client();
    if (!db || !projectId || !taskId || !engine()) return;
    const root = mountRoot();
    const panel = root.querySelector('.mta-panel');
    const [{ data: task, error: taskError }, { data: project, error: projectError }] = await Promise.all([
      db.from('project_tasks').select('id,project_id,title,description,status,priority,due_date').eq('id', taskId).eq('project_id', projectId).maybeSingle(),
      db.from('projects').select('id,title,description,status,creator_id').eq('id', projectId).maybeSingle(),
    ]);
    if (!document.contains(root)) return;
    if (taskError || projectError || !task || !project) {
      panel.innerHTML = `<header class="mta-header"><button type="button" class="mta-back" data-mta-back>‹ My Space</button></header>${note('This task isn’t available to you.', 'It may be private to its project team, or it no longer exists. You can still get help with what you’re trying to do.', '<button type="button" class="mta-primary" data-mta-own-objective>Describe what you’re working on</button>')}`;
      return;
    }
    const memberId = window.currentUserProfile?.id || null;
    const { data: membership } = memberId ? await db.from('project_members').select('user_id,role').eq('project_id', projectId).eq('user_id', memberId).maybeSingle() : { data: null };
    const canWork = canWorkOn(project, membership, memberId);
    const parsed = engine().parseNotes(task.description);
    const draftKey = `task:${task.id}`;
    const draft = canWork ? readDraft(draftKey) : null;
    const session = {
      task, project, memberId, canWork, draftKey,
      objective: task.title,
      purpose: parsed.purpose,
      progress: parsed.progress,
      state: draft?.state || parsed.state || { step: 0, values: {} },
      restoredDraft: Boolean(draft?.state),
      dirty: Boolean(draft?.state),
    };
    session.state.values = session.state.values || {};
    current = session;
    render(session, { focusTitle: true });
    if (canWork && /From “.+” v\d+/.test(task.description || '') && window.CapabilityMemory?.findOpenAttemptForTask) {
      const attempt = await window.CapabilityMemory.findOpenAttemptForTask(task.id, memberId);
      if (attempt && current === session) {
        session.attempt = attempt;
        session.attemptMarkup = `<label class="mta-attempt"><span>This task came from a shared method. Did the method help?</span><select data-mta-attempt-outcome><option value="">Not sure yet</option><option value="succeeded">Yes, it helped</option><option value="not_succeeded">No, it didn’t help</option></select></label>`;
        document.querySelector('#mobile-task-assistance [data-mta-attempt]')?.insertAdjacentHTML('beforeend', session.attemptMarkup);
      }
    }
  }

  function openObjective(objective) {
    const text = String(objective || '').trim();
    if (!text || !engine()) return;
    const root = mountRoot();
    const draftKey = 'objective';
    const draft = readDraft(draftKey);
    const sameDraft = draft && draft.objective === text;
    const session = {
      task: null, project: null, memberId: window.currentUserProfile?.id || null, canWork: false, draftKey,
      objective: text, purpose: '', progress: [],
      state: sameDraft ? draft.state : { step: 0, values: {} },
      restoredDraft: Boolean(sameDraft && Object.keys(draft.state?.values || {}).length),
      dirty: false,
    };
    session.state.values = session.state.values || {};
    current = session;
    persistDraft(session);
    if (document.contains(root)) render(session, { focusTitle: true });
  }

  async function chooseProject(session, slot, onPick) {
    slot.innerHTML = '<p class="mta-note" role="status">Loading your projects…</p>';
    const projects = await memberProjects(session.memberId);
    if (current !== session) return;
    if (!projects.length) {
      slot.innerHTML = note('You don’t have a project yet.', 'Your work is kept as a draft on this device. Copy it to keep it anywhere, or create a project from Explore when you’re ready.');
      return;
    }
    slot.innerHTML = `<div class="mta-choice"><strong>Which project is this for?</strong>${projects.map(project => `<button type="button" class="mta-project" data-pick-project="${esc(project.id)}"><strong>${esc(project.title || 'Project')}</strong><span>${esc(project.status || 'active')}</span></button>`).join('')}<button type="button" class="mta-link" data-cancel-choice>Cancel</button></div>`;
    slot.onclick = async event => {
      if (event.target.closest('[data-cancel-choice]')) { slot.innerHTML = ''; return; }
      const button = event.target.closest('[data-pick-project]');
      if (!button) return;
      button.disabled = true;
      try { await onPick(projects.find(project => project.id === button.dataset.pickProject)); }
      catch (error) { button.disabled = false; slot.insertAdjacentHTML('beforeend', `<p class="mta-error" role="alert">${esc(error.message || 'That didn’t save. Try again.')}</p>`); }
    };
  }

  async function convertObjectiveToTask(session, project) {
    const E = engine();
    const decision = decisionFor(session);
    session.decision = decision;
    rememberInterpretation(session);
    const label = decision.playbook ? `${decision.playbook.label} — ${decision.step?.title || ''}` : decision.step?.title;
    const task = await window.ProjectTasks.createTask(project.id, { title: session.objective.slice(0, 200), description: E.writeNotes('', session.state, label) }, session.memberId);
    writeDraft('objective', null);
    window.dispatchEvent(new CustomEvent('project-task-updated'));
    await open(project.id, task.id);
  }

  // ---------------------------------------------------------------- events

  function syncDerived(root, session) {
    const decision = decisionFor(session);
    session.decision = decision;
    (decision.intervention?.blocks || []).forEach(block => {
      if (block.type === 'message') {
        const area = root.querySelector(`[data-ai-message="${CSS.escape(block.id)}"]`);
        if (area && area.dataset.edited !== 'true') area.value = block.body;
        const subject = root.querySelector(`[data-ai-subject="${CSS.escape(block.id)}"]`);
        if (subject) subject.textContent = block.subject || '';
        const link = root.querySelector(`[data-ai-email="${CSS.escape(block.id)}"]`);
        if (link) link.href = mailto(block.subject, area ? area.value : block.body);
      }
      if (block.type === 'matrix') {
        const result = root.querySelector(`[data-ai-matrix-result="${CSS.escape(block.id)}"]`);
        if (result) result.innerHTML = matrixResult(block, session.state.values);
      }
      if (block.type === 'checklist' && block.computeFirstOpen) {
        const result = root.querySelector(`[data-ai-first-open="${CSS.escape(block.id)}"]`);
        const checked = new Set(session.state.values[`${block.id}.checked`] || []);
        const first = block.items.find(item => !checked.has(item.key));
        if (result) result.innerHTML = first ? `Blocking now: <strong>${esc(first.short || first.text)}</strong> — settle this before the items below it.` : 'Everything on this list is settled.';
      }
    });
    const goReport = root.querySelector('[data-mta-go-report]');
    if (goReport && session.dirty) {
      goReport.nextElementSibling?.classList.contains('mta-saved-note') && goReport.nextElementSibling.remove();
      goReport.outerHTML = '<button type="button" class="mta-primary" data-mta-save>Save to this task</button>';
    }
  }

  function markDirty(root, session) {
    session.dirty = true;
    persistDraft(session);
    syncDerived(root, session);
  }

  function wire(root) {
    root.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    root.addEventListener('input', event => {
      const session = current;
      if (!session) return;
      const target = event.target;
      const values = session.state.values;
      if (target.dataset.aiKey) {
        values[target.dataset.aiKey] = target.value;
        markDirty(root, session);
        // Skills the member types are explicit search intent for people.
        if (/^(need\.skill|role\.skills)$/.test(target.dataset.aiKey)) {
          window.clearTimeout(session.peopleTimer);
          session.peopleTimer = window.setTimeout(() => { if (current === session) loadCommunity(session, decisionFor(session)); }, 600);
        }
      }
      else if (target.dataset.aiMessage) { values[`${target.dataset.aiMessage}.body`] = target.value; target.dataset.edited = 'true'; markDirty(root, session); }
      else if (target.dataset.aiMatrix && target.hasAttribute('data-name')) { updateMatrix(session, target.dataset.aiMatrix, Number(target.dataset.row), row => { row.name = target.value; }); markDirty(root, session); }
    });
    root.addEventListener('change', event => {
      const session = current;
      if (!session) return;
      const target = event.target;
      if (target.dataset.aiCheck) {
        const key = `${target.dataset.aiCheck}.checked`;
        const set = new Set(session.state.values[key] || []);
        if (target.checked) set.add(target.value); else set.delete(target.value);
        session.state.values[key] = Array.from(set);
        markDirty(root, session);
      } else if (target.dataset.aiMatrix && target.dataset.criterion) {
        updateMatrix(session, target.dataset.aiMatrix, Number(target.dataset.row), row => { row.scores = { ...(row.scores || {}), [target.dataset.criterion]: target.value ? Number(target.value) : 0 }; });
        markDirty(root, session);
      } else if (target.matches('[data-mta-attempt-outcome]')) {
        session.attemptOutcome = target.value || null;
        const report = root.querySelector('[data-mta-report]');
        if (report && session.attemptOutcome) report.disabled = false;
      }
    });
    root.addEventListener('click', event => handleClick(event, root));
  }

  function updateMatrix(session, blockId, rowIndex, mutate) {
    const block = (session.decision?.intervention?.blocks || []).find(item => item.id === blockId);
    if (!block) return;
    const rows = engine().matrixRows(block, session.state.values).map(row => ({ name: row.name || '', scores: { ...(row.scores || {}) } }));
    if (!rows[rowIndex]) return;
    mutate(rows[rowIndex]);
    session.state.values[`${blockId}.rows`] = rows;
  }

  async function copyText(text, button, done) {
    try { await navigator.clipboard.writeText(text); if (button) button.textContent = done; return true; }
    catch (_) { if (button) button.textContent = 'Copy failed — select the text and copy it'; return false; }
  }

  async function handleClick(event, root) {
    const session = current;
    const target = event.target;
    if (target.closest('[data-mta-back]')) {
      close();
      if (!document.body.classList.contains('mobile-surface-you')) window.AppNav?.go?.('home');
      return;
    }
    if (target.closest('[data-mta-close]')) return close();
    if (target.closest('[data-mta-own-objective]')) {
      close();
      if (!document.body.classList.contains('mobile-surface-you')) window.AppNav?.go?.('home');
      window.setTimeout(() => (window.HomeView?.focusGoal ? window.HomeView.focusGoal() : document.getElementById('mgd-goal-input')?.focus()), 300);
      return;
    }
    if (!session) return;
    const values = session.state.values;

    const copyMessage = target.closest('[data-ai-copy-message]');
    if (copyMessage) return copyText(root.querySelector(`[data-ai-message="${CSS.escape(copyMessage.dataset.aiCopyMessage)}"]`)?.value || '', copyMessage, 'Copied ✓');
    const email = target.closest('[data-ai-email]');
    if (email) { window.CapabilityJourney?.emit('assistance_message_opened', { surface: 'assistance' }); return; }
    const addRow = target.closest('[data-ai-add-row]');
    if (addRow) {
      const block = session.decision.intervention.blocks.find(item => item.id === addRow.dataset.aiAddRow);
      const rows = engine().matrixRows(block, values).map(row => ({ ...row }));
      rows.push({ name: '', scores: {} });
      values[`${block.id}.rows`] = rows;
      session.dirty = true; persistDraft(session); render(session);
      return;
    }
    if (target.closest('[data-mta-copy-brief]')) {
      const button = target.closest('[data-mta-copy-brief]');
      return copyText(engine().briefText(session.decision, values), button, 'Copied ✓');
    }
    if (target.closest('[data-mta-not-this]')) { session.state = { ...session.state, overridden: true, playbook: null, obstacle: null }; session.dirty = Boolean(session.task); persistDraft(session); render(session); return; }
    const obstacle = target.closest('[data-mta-obstacle]');
    if (obstacle) {
      session.state.obstacle = obstacle.dataset.mtaObstacle || null;
      session.dirty = Boolean(session.task); persistDraft(session); render(session);
      root.querySelector('[data-mta-decision]')?.scrollIntoView({ block: 'start' });
      return;
    }
    const save = target.closest('[data-mta-save]');
    if (save && session.task && session.canWork) {
      save.disabled = true;
      try { await saveToTask(session); render(session); root.querySelector('[data-mta-go-report]')?.focus(); }
      catch (error) { save.disabled = false; save.textContent = 'Couldn’t save — try again'; console.warn('[Assistance] save failed', error); }
      return;
    }
    if (target.closest('[data-mta-go-report]')) {
      const report = root.querySelector('.mta-report');
      report?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      report?.querySelector('[data-mta-kind]')?.focus({ preventScroll: true });
      return;
    }
    const saveObjective = target.closest('[data-mta-save-objective]');
    if (saveObjective) return chooseProject(session, root.querySelector('[data-mta-project-choice]'), project => convertObjectiveToTask(session, project));
    const kind = target.closest('[data-mta-kind]');
    if (kind) {
      root.querySelectorAll('[data-mta-kind]').forEach(chip => chip.setAttribute('aria-checked', chip === kind ? 'true' : 'false'));
      session.reportKind = kind.dataset.mtaKind;
      const report = root.querySelector('[data-mta-report]');
      if (report) report.disabled = false;
      return;
    }
    const report = target.closest('[data-mta-report]');
    if (report && session.task && session.canWork) {
      const text = root.querySelector('[data-mta-report-note]')?.value.trim() || '';
      const kindValue = session.reportKind || (session.attemptOutcome ? 'Got a result' : null);
      if (!kindValue) return;
      report.disabled = true;
      try {
        if (session.attempt && session.attemptOutcome) {
          await window.CapabilityMemory.recordAttemptOutcome(session.attempt.id, session.memberId, session.attemptOutcome, text);
          session.attempt = null; session.attemptMarkup = '';
        }
        await saveReport(session, kindValue, text);
        session.reportKind = null;
        render(session);
        root.querySelector('[data-mta-decision]')?.scrollIntoView({ block: 'start' });
      } catch (error) { report.disabled = false; report.textContent = 'Couldn’t save — try again'; console.warn('[Assistance] report failed', error); }
      return;
    }
    if (target.closest('[data-mta-complete]') && session.task && session.canWork) {
      const button = target.closest('[data-mta-complete]');
      button.disabled = true;
      try {
        const updated = await window.ProjectTasks.updateTask(session.task, { status: 'done' }, session.memberId);
        session.task = { ...session.task, ...(updated || {}), status: 'done' };
        window.dispatchEvent(new CustomEvent('project-task-updated'));
        render(session);
      } catch (error) { button.disabled = false; button.textContent = 'Couldn’t update — try again'; }
      return;
    }
    if (target.closest('[data-mta-share]') && session.project) {
      const button = target.closest('[data-mta-share]');
      const slot = root.querySelector('[data-mta-share-slot]');
      const shareCommunity = Boolean(slot.querySelector('[data-share-community]')?.checked);
      button.disabled = true;
      try {
        const saved = await window.CapabilityMemory.savePackage({
          project_id: session.project.id,
          title: slot.querySelector('[data-share-title]').value,
          goal: slot.querySelector('[data-share-goal]').value,
          summary: slot.querySelector('[data-share-summary]').value,
          steps: slot.querySelector('[data-share-steps]').value.split('\n'),
          failure_notes: slot.querySelector('[data-share-watch]').value.trim() || null,
          share: shareCommunity,
        }, session.memberId);
        session.shared = saved?.permission_mode || (shareCommunity ? 'community' : 'private');
        slot.innerHTML = shareMarkup(session, session.decision);
      } catch (error) { button.disabled = false; slot.insertAdjacentHTML('beforeend', `<p class="mta-error" role="alert">${esc(error.message || 'Couldn’t save the method.')}</p>`); }
      return;
    }
    const use = target.closest('[data-action="use"]');
    if (use && window.CapabilityMemory?.importCapability) {
      const pkg = session.methods?.find(item => item.id === use.closest('[data-package-id]')?.dataset.packageId);
      if (!pkg) return;
      const importInto = async project => {
        await window.CapabilityMemory.importCapability(pkg, session.objective, project, session.memberId);
        use.replaceWith(Object.assign(document.createElement('p'), { className: 'mta-complete', textContent: `Steps added to ${project.title || 'the project'} as tasks.` }));
        window.dispatchEvent(new CustomEvent('project-task-updated'));
      };
      if (session.task && session.canWork) {
        use.disabled = true;
        try { await importInto(session.project); }
        catch (error) { use.disabled = false; use.textContent = error.message || 'Try again'; }
      } else if (!session.task) {
        const slot = document.createElement('div');
        use.after(slot);
        chooseProject(session, slot, importInto);
      }
      return;
    }
    const message = target.closest('[data-mta-message]');
    if (message) {
      const request = (session.decision?.intervention?.blocks || []).find(block => block.type === 'message');
      const text = request ? (root.querySelector(`[data-ai-message="${CSS.escape(request.id)}"]`)?.value || request.body) : `Hi — I’m working on “${session.objective}”. Could I ask you a quick question about it?`;
      await copyText(text, null);
      const id = message.dataset.mtaMessage;
      const name = message.dataset.name;
      persistDraft(session);
      close();
      if (window.startConversationWithUser) window.startConversationWithUser(id, name);
      else window.openNodePanel?.({ id, type: 'person', name });
      return;
    }
    const related = target.closest('[data-mta-project]');
    if (related) { close(); return window.viewProjectDetails?.(related.dataset.mtaProject); }
    if (target.closest('[data-mta-open-project]') && session.project) { const id = session.project.id; close(); return window.viewProjectDetails?.(id, 'work'); }
  }

  function latestObjectiveDraft() {
    const draft = readDraft('objective');
    return draft?.objective ? draft : null;
  }

  window.MobileTaskAssistance = { open, openObjective, close, latestObjectiveDraft, findPeople, findProjects, findMethods };
  window.MobileTaskAssistanceTesting = { canWorkOn, findPeople, findMethods, findProjects };
  window.viewProjectTask = open;
})();
