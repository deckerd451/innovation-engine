// Focused objective-to-help route for My Space and Today task continuations.
// It reuses the existing task, capability, connection, and project records.
(function () {
  'use strict';
  if (window.MobileTaskAssistance) return;

  const esc = window.escapeHtml || (value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])));
  const isMobile = () => window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches;
  const client = () => window.supabase;
  const close = () => document.getElementById('mobile-task-assistance')?.remove();

  function empty(title, body, action = '') {
    return `<section class="mta-empty"><strong>${esc(title)}</strong><p>${esc(body)}</p>${action}</section>`;
  }

  async function findPeople(objective, memberId) {
    if (!client() || !memberId) return [];
    const { data: links, error } = await client().from('connections').select('from_user_id,to_user_id').or(`from_user_id.eq.${memberId},to_user_id.eq.${memberId}`).eq('status', 'accepted');
    if (error) return [];
    const ids = [...new Set((links || []).map(row => row.from_user_id === memberId ? row.to_user_id : row.from_user_id).filter(Boolean))];
    if (!ids.length) return [];
    const { data: people } = await client().from('community').select('id,name,skills').in('id', ids);
    const tokens = String(objective || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
    return (people || []).filter(person => tokens.some(token => `${person.name || ''} ${(person.skills || []).join?.(' ') || person.skills || ''}`.toLowerCase().includes(token))).slice(0, 3);
  }

  async function findProjects(objective, currentId) {
    if (!client()) return [];
    const { data } = await client().from('projects').select('id,title,description,status').limit(50);
    const tokens = String(objective || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
    return (data || []).filter(project => project.id !== currentId && tokens.some(token => `${project.title || ''} ${project.description || ''}`.toLowerCase().includes(token))).slice(0, 3);
  }

  function renderPeople(people) {
    if (!people.length) return empty('No connected member matches this task yet.', 'You can continue the task, or browse Community when you are ready.', '<button type="button" class="mta-secondary" data-mta-community>Browse Community</button>');
    return `<section class="mta-help"><h2>People who may help</h2><p class="mta-note">Based on skills and your accepted connections.</p>${people.map(person => `<div class="mta-row"><strong>${esc(person.name || 'Community member')}</strong><span>${esc(Array.isArray(person.skills) ? person.skills.slice(0, 3).join(' · ') : person.skills || 'Relevant experience')}</span></div>`).join('')}</section>`;
  }

  function renderProjects(projects) {
    if (!projects.length) return empty('No related project found.', 'Keep working here; your result can make the next project easier.');
    return `<section class="mta-help"><h2>Related project knowledge</h2>${projects.map(project => `<button type="button" class="mta-project" data-mta-project="${esc(project.id)}"><strong>${esc(project.title || 'Project')}</strong><span>${esc(project.description || project.status || 'Related community work')}</span></button>`).join('')}</section>`;
  }

  function nextMove(task) {
    const title = String(task?.title || '').toLowerCase();
    if (/speaker|speakers/.test(title)) return { copy: 'Start a shortlist by checking people you already know who may fit the kind of speaker you need.', label: 'Check connected people', target: 'people' };
    if (/interview|customer|user research/.test(title)) return { copy: 'Write the first open question you will ask, then use the people section to find someone who has done this before.', label: 'Find relevant people', target: 'people' };
    return { copy: 'Take the smallest concrete step described by this task, then record what you learn.', label: 'Review available help', target: 'methods' };
  }

  async function renderHelp(root, objective, project, canWork) {
    const methods = root.querySelector('[data-mta-methods]');
    const people = root.querySelector('[data-mta-people]');
    const related = root.querySelector('[data-mta-projects]');
    if (window.CapabilityMemory?.searchGoal) {
      const result = await window.CapabilityMemory.searchGoal(objective);
      if (result?.unavailable) methods.innerHTML = empty('Methods are temporarily unavailable.', 'Continue with the task, or try again later.');
      else {
        const packages = (result?.packages || []).filter(pkg => {
          const matcher = window.CapabilityMemoryTesting?.goalMatch;
          return matcher ? matcher(pkg, objective).relevant : false;
        }).slice(0, 3);
        root._mtaPackages = packages;
        methods.innerHTML = packages.length
          ? `<section class="mta-help"><h2>Methods members have tried</h2><p class="mta-note">These are ordered by fit and evidence. “Reported” means member-reported; “Verified” means independently checked.</p>${packages.map(pkg => window.CapabilityMemory.renderPackageCard(pkg, result.stats, objective, { canUse: canWork, canEdit: canWork, actionLabel: 'Use this method' })).join('')}</section>`
          : empty('No shared method matches this task yet.', 'You can continue with the task and record what you learn for the next member.');
      }
    } else methods.innerHTML = empty('No shared method is available yet.', 'Continue with the task using the project plan.');
    people.innerHTML = renderPeople(await findPeople(objective, window.currentUserProfile?.id));
    related.innerHTML = renderProjects(await findProjects(objective, project.id));
  }

  async function open(projectId, taskId) {
    if (!isMobile()) return window.viewProjectDetails?.(projectId, 'tasks', taskId);
    const db = client();
    if (!db || !projectId || !taskId) return;
    close();
    const root = document.createElement('div');
    root.id = 'mobile-task-assistance';
    root.className = 'mta-overlay';
    root.innerHTML = '<div class="mta-panel" role="dialog" aria-modal="true" aria-labelledby="mta-title"><div class="mta-loading" role="status">Opening this task…</div></div>';
    document.body.appendChild(root);
    const panel = root.querySelector('.mta-panel');
    const [{ data: task, error: taskError }, { data: project, error: projectError }] = await Promise.all([
      db.from('project_tasks').select('id,project_id,title,description,status,priority,due_date').eq('id', taskId).eq('project_id', projectId).maybeSingle(),
      db.from('projects').select('id,title,description,status,creator_id').eq('id', projectId).maybeSingle(),
    ]);
    if (taskError || projectError || !task || !project) {
      panel.innerHTML = `<button type="button" class="mta-back" data-mta-back>‹ My Space</button>${empty('This task is unavailable.', 'It may be private, completed, or no longer part of the project.')}`;
      return;
    }
    const memberId = window.currentUserProfile?.id;
    const { data: membership } = memberId ? await db.from('project_members').select('user_id,role').eq('project_id', projectId).eq('user_id', memberId).maybeSingle() : { data: null };
    const canWork = Boolean(memberId && (project.creator_id === memberId || membership?.role !== 'pending'));
    const objective = [task.title, task.description, project.title].filter(Boolean).join(' — ');
    const intervention = window.AssistanceInterventions?.interventionFor(objective);
    const move = nextMove(task);
    panel.innerHTML = `<header class="mta-header"><button type="button" class="mta-back" data-mta-back>‹ My Space</button><button type="button" class="mta-close" aria-label="Close" data-mta-close>×</button></header><p class="mta-context">${esc(project.title || 'Project')}</p><h1 id="mta-title">${esc(task.title)}</h1>${task.description ? `<p class="mta-description">${esc(task.description)}</p>` : ''}<section class="mta-next"><p class="mta-eyebrow">One useful next move</p>${intervention ? window.AssistanceInterventions.render(intervention, esc) : `<p>${esc(move.copy)}</p>`}<button type="button" class="mta-primary" data-mta-jump="${intervention?.target || move.target}">${esc(intervention?.actionLabel || move.label)}</button><div class="mta-status-controls">${canWork && task.status !== 'done' ? `<button type="button" class="mta-secondary-action" data-mta-status="${task.status === 'open' ? 'in_progress' : 'done'}">${task.status === 'open' ? 'Start task' : 'Mark complete'}</button>` : task.status === 'done' ? '<p class="mta-complete">Task marked complete</p>' : '<p class="mta-note">View-only: your project role does not allow updates.</p>'}</div>${canWork ? '<details class="mta-outcome"><summary>Add an optional outcome note</summary><p class="mta-note">This records your note with the task. It does not verify that the objective was achieved.</p><textarea rows="3" maxlength="500" data-mta-note placeholder="What did you learn or decide?"></textarea><button type="button" class="mta-secondary-action" data-mta-save-note>Save note</button></details>' : ''}</section><div data-mta-methods>${empty('Finding methods…', 'Checking shared community work.')}</div><div data-mta-people>${empty('Finding people…', 'Checking accepted connections.')}</div><div data-mta-projects>${empty('Finding related projects…', 'Checking accessible project knowledge.')}</div>`;
    const back = () => { close(); document.querySelector('.mob-tab[data-tab="home"]')?.click(); };
    root.addEventListener('click', async event => {
      if (event.target.closest('[data-mta-back]')) return back();
      if (event.target.closest('[data-mta-close]')) return close();
      const copy = event.target.closest('[data-ai-copy]');
      if (copy) {
        const text = [...root.querySelectorAll('[data-ai-field]')].map(field => `${field.previousElementSibling?.textContent}: ${field.value}`).join('\n');
        try { await navigator.clipboard.writeText(text); copy.textContent = 'Brief copied'; } catch (_) { copy.textContent = 'Select and copy the brief above'; }
        return;
      }
      if (event.target.closest('[data-mta-community]')) { close(); document.querySelector('.mob-tab[data-tab="community"], .mob-tab[data-tab="network"]')?.click(); return; }
      const jump = event.target.closest('[data-mta-jump]');
      if (jump) return root.querySelector(`[data-mta-${jump.dataset.mtaJump}]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const related = event.target.closest('[data-mta-project]');
      if (related) return window.viewProjectDetails?.(related.dataset.mtaProject);
      const use = event.target.closest('[data-action="use"]');
      if (use && window.CapabilityMemory?.importCapability) {
        const card = use.closest('[data-package-id]');
        const pkg = root._mtaPackages?.find(item => item.id === card?.dataset.packageId);
        if (!pkg) return;
        use.disabled = true;
        try {
          await window.CapabilityMemory.importCapability(pkg, objective, project, memberId);
          use.textContent = 'Added to this project';
          window.dispatchEvent(new CustomEvent('project-task-updated'));
        } catch (error) {
          use.disabled = false;
          use.textContent = 'Try again';
          console.warn('[MobileTaskAssistance] method import failed', error);
        }
        return;
      }
      const status = event.target.closest('[data-mta-status]');
      if (status && window.ProjectTasks?.updateTask) {
        status.disabled = true;
        try { await window.ProjectTasks.updateTask(task, { status: status.dataset.mtaStatus }, memberId); task.status = status.dataset.mtaStatus; status.replaceWith(document.createElement('p')); panel.querySelector('.mta-next p:nth-of-type(2)').textContent = task.status === 'done' ? 'Completed.' : 'Continue this task.'; window.dispatchEvent(new CustomEvent('project-task-updated')); }
        catch (error) { status.disabled = false; status.textContent = 'Try again'; console.warn('[MobileTaskAssistance] task update failed', error); }
      }
      const saveNote = event.target.closest('[data-mta-save-note]');
      if (saveNote && window.ProjectTasks?.updateTask) {
        const note = root.querySelector('[data-mta-note]')?.value.trim();
        if (!note) return;
        saveNote.disabled = true;
        try {
          const original = task.description ? `${task.description}\n\n` : '';
          await window.ProjectTasks.updateTask(task, { description: `${original}Outcome note: ${note}` }, memberId);
          task.description = `${original}Outcome note: ${note}`;
          saveNote.textContent = 'Note saved';
        } catch (error) { saveNote.disabled = false; saveNote.textContent = 'Try again'; console.warn('[MobileTaskAssistance] outcome note failed', error); }
      }
    });
    await renderHelp(root, objective, project, canWork);
  }

  window.MobileTaskAssistance = { open, findPeople, findProjects };
  window.viewProjectTask = open;
})();
