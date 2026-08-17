// ================================================================
// PROJECT TASKS MODULE
// ================================================================
// Persistent, directly-editable tasks living inside an existing Project.
// Reuses the app's existing persistence (Supabase `project_tasks` table,
// same auth model as `projects`/`project_members`), UI conventions
// (inline-styled cards + escapeHtml, same as node-panel.js) and activity
// log (`activity_log`) rather than inventing new infrastructure.
//
// Exposed as window.ProjectTasks so node-panel.js (project detail
// overlay) and command-dashboard.js (Projects list counts) can both
// consume it without a bundler/module graph.

(function () {
  'use strict';

  const GUARD = '__PROJECT_TASKS_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  const STATUS_ORDER = ['open', 'in_progress', 'done'];
  const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', done: 'Done' };
  const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
  const PRIORITY_COLORS = { high: '#ff6b6b', medium: '#ffa500', low: '#00e0ff' };
  const DONE_PAGE_SIZE = 10;

  function supa() { return window.supabase; }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  // Only allow http(s) URLs or root-relative internal paths through to an
  // href attribute — blocks javascript:/data: and similar XSS vectors.
  function safeRelatedUrl(raw) {
    const value = (raw || '').trim();
    if (!value) return null;
    if (value.startsWith('/')) return value;
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (_) { /* not a valid absolute URL */ }
    return null;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(iso);
  }

  function isOverdue(task) {
    if (!task.due_date || task.status === 'done') return false;
    return new Date(task.due_date + 'T23:59:59') < new Date();
  }

  // ------------------------------------------------------------------
  // Data access
  // ------------------------------------------------------------------

  async function fetchTasks(projectId) {
    const { data, error } = await supa()
      .from('project_tasks')
      .select('*, owner:community!project_tasks_owner_id_fkey(id, name, image_url)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[ProjectTasks] fetchTasks error:', error);
      return [];
    }
    return data || [];
  }

  // Single batched query for the whole Projects list (NOT one query per
  // project). Only pulls (project_id) for unfinished tasks so the list can
  // show "N open" without loading full task records.
  async function fetchOpenCounts(projectIds) {
    const counts = new Map();
    if (!supa() || !projectIds || projectIds.length === 0) return counts;
    try {
      const { data, error } = await supa()
        .from('project_tasks')
        .select('project_id')
        .in('project_id', projectIds)
        .in('status', ['open', 'in_progress']);
      if (error) {
        console.warn('[ProjectTasks] fetchOpenCounts error:', error.message);
        return counts;
      }
      (data || []).forEach(row => {
        counts.set(row.project_id, (counts.get(row.project_id) || 0) + 1);
      });
    } catch (err) {
      console.warn('[ProjectTasks] fetchOpenCounts failed:', err);
    }
    return counts;
  }

  async function logActivity(actionType, details) {
    try {
      const user = await window.bootstrapSession?.getAuthUser?.();
      if (!user) return;
      await supa().from('activity_log').insert({
        auth_user_id: user.id,
        action_type: actionType,
        details,
      });
    } catch (err) {
      console.error('[ProjectTasks] activity log failed:', err);
    }
  }

  const TASK_SELECT = '*, owner:community!project_tasks_owner_id_fkey(id, name, image_url)';

  async function createTask(projectId, fields, actorId) {
    const title = (fields.title || '').trim();
    if (!title) throw new Error('Title is required');
    const payload = {
      project_id: projectId,
      title,
      description: (fields.description || '').trim() || null,
      status: fields.status || 'open',
      priority: fields.priority || 'medium',
      owner_id: fields.owner_id || null,
      related_url: safeRelatedUrl(fields.related_url),
      due_date: fields.due_date || null,
      created_by: actorId || null,
      updated_by: actorId || null,
    };
    const { data, error } = await supa()
      .from('project_tasks')
      .insert(payload)
      .select(TASK_SELECT)
      .single();
    if (error) throw error;
    logActivity('task_created', { project_id: projectId, task_id: data.id, title: data.title });
    return data;
  }

  async function updateTask(task, fields, actorId) {
    const payload = { updated_by: actorId || null };
    if ('title' in fields) payload.title = (fields.title || '').trim();
    if ('description' in fields) payload.description = (fields.description || '').trim() || null;
    if ('priority' in fields) payload.priority = fields.priority;
    if ('owner_id' in fields) payload.owner_id = fields.owner_id || null;
    if ('related_url' in fields) payload.related_url = safeRelatedUrl(fields.related_url);
    if ('due_date' in fields) payload.due_date = fields.due_date || null;
    if ('status' in fields) payload.status = fields.status;

    const prevStatus = task.status;
    const prevOwnerId = task.owner_id;

    const { data, error } = await supa()
      .from('project_tasks')
      .update(payload)
      .eq('id', task.id)
      .select(TASK_SELECT)
      .single();
    if (error) throw error;

    if ('status' in payload && payload.status !== prevStatus) {
      if (payload.status === 'done') {
        logActivity('task_completed', { project_id: task.project_id, task_id: task.id, title: data.title });
      } else if (prevStatus === 'done') {
        logActivity('task_reopened', { project_id: task.project_id, task_id: task.id, title: data.title });
      }
    }
    if ('owner_id' in payload && payload.owner_id !== prevOwnerId) {
      logActivity('task_owner_changed', {
        project_id: task.project_id,
        task_id: task.id,
        title: data.title,
        owner: data.owner?.name || null,
      });
    }
    return data;
  }

  async function deleteTask(task) {
    const { error } = await supa().from('project_tasks').delete().eq('id', task.id);
    if (error) throw error;
    logActivity('task_deleted', { project_id: task.project_id, task_id: task.id, title: task.title });
  }

  // ------------------------------------------------------------------
  // Styles (injected once, mirrors the pd-overlay-keyframes pattern
  // already used in node-panel.js for one-off component styles)
  // ------------------------------------------------------------------

  function ensureStyles() {
    if (document.getElementById('pt-styles')) return;
    const style = document.createElement('style');
    style.id = 'pt-styles';
    style.textContent = `
      .pt-panel { color: #ddd; }
      .pt-toolbar { display:flex; flex-wrap:wrap; gap:0.6rem; align-items:center; margin-bottom:1rem; }
      .pt-add-btn { background:linear-gradient(135deg,#00e0ff,#00b8d4); border:none; border-radius:8px; color:#04222a; font-weight:700; padding:0.55rem 1rem; cursor:pointer; font-size:0.9rem; }
      .pt-add-btn:focus-visible, .pt-icon-btn:focus-visible, .pt-status-btn:focus-visible, .pt-filters select:focus-visible, .pt-filters input:focus-visible { outline:2px solid #00e0ff; outline-offset:2px; }
      .pt-filters { display:flex; gap:0.5rem; flex-wrap:wrap; margin-left:auto; }
      .pt-filters select, .pt-filters input { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#eee; font-size:0.8rem; padding:0.4rem 0.5rem; }
      .pt-add-form { background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.25); border-radius:10px; padding:1rem; margin-bottom:1.25rem; }
      .pt-add-form.pt-hidden { display:none; }
      .pt-add-row { display:flex; gap:0.5rem; margin-bottom:0.6rem; }
      .pt-add-row input[type="text"], .pt-add-row textarea { flex:1; }
      .pt-field, .pt-add-row input, .pt-add-row textarea, .pt-add-row select { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff; padding:0.55rem 0.65rem; font-size:0.85rem; font-family:inherit; }
      .pt-add-details { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:0.5rem; margin:0.6rem 0; }
      .pt-add-details.pt-hidden { display:none; }
      .pt-add-actions { display:flex; gap:0.6rem; align-items:center; }
      .pt-link-btn { background:none; border:none; color:#00e0ff; cursor:pointer; font-size:0.8rem; padding:0.3rem 0; text-decoration:underline; }
      .pt-submit-btn { background:linear-gradient(135deg,#00e0ff,#00b8d4); border:none; border-radius:6px; color:#04222a; font-weight:700; padding:0.5rem 1rem; cursor:pointer; }
      .pt-cancel-btn { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:#ddd; padding:0.5rem 1rem; cursor:pointer; }
      .pt-group { margin-bottom:1.5rem; }
      .pt-group-title { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.5); margin-bottom:0.6rem; display:flex; align-items:center; gap:0.5rem; }
      .pt-group-count { background:rgba(255,255,255,0.1); border-radius:10px; padding:0.05rem 0.5rem; font-size:0.7rem; }
      .pt-empty { color:#777; font-size:0.85rem; padding:0.5rem 0 1rem; }
      .pt-task { display:flex; gap:0.75rem; align-items:flex-start; justify-content:space-between; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:0.75rem 0.85rem; margin-bottom:0.5rem; flex-wrap:wrap; }
      .pt-task-main { display:flex; gap:0.6rem; flex:1; min-width:200px; }
      .pt-priority-dot { width:10px; height:10px; border-radius:50%; margin-top:0.35rem; flex-shrink:0; }
      .pt-task-title { color:#fff; font-weight:600; font-size:0.92rem; word-break:break-word; }
      .pt-task-desc { color:#aaa; font-size:0.82rem; margin-top:0.25rem; word-break:break-word; }
      .pt-task-meta { display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem; }
      .pt-chip { display:inline-flex; align-items:center; gap:0.3rem; background:rgba(255,255,255,0.06); color:#bbb; font-size:0.75rem; padding:0.2rem 0.55rem; border-radius:8px; text-decoration:none; }
      .pt-chip.pt-overdue { color:#ff6b6b; background:rgba(255,107,107,0.12); }
      .pt-chip.pt-link:hover { text-decoration:underline; color:#00e0ff; }
      .pt-task-actions { display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; }
      .pt-status-toggle { display:flex; border:1px solid rgba(255,255,255,0.15); border-radius:8px; overflow:hidden; }
      .pt-status-btn { background:transparent; border:none; color:#999; font-size:0.72rem; padding:0.4rem 0.6rem; cursor:pointer; white-space:nowrap; }
      .pt-status-btn + .pt-status-btn { border-left:1px solid rgba(255,255,255,0.1); }
      .pt-status-btn.active { background:#00e0ff; color:#04222a; font-weight:700; }
      .pt-icon-btn { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ccc; width:32px; height:32px; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
      .pt-icon-btn.pt-danger:hover { background:rgba(255,60,60,0.15); border-color:rgba(255,60,60,0.4); color:#ff6b6b; }
      .pt-task-status-badge { font-size:0.72rem; font-weight:700; padding:0.3rem 0.6rem; border-radius:8px; align-self:center; }
      .pt-status-open { background:rgba(255,255,255,0.08); color:#ccc; }
      .pt-status-in_progress { background:rgba(255,165,0,0.15); color:#ffa500; }
      .pt-status-done { background:rgba(0,255,136,0.12); color:#00ff88; }
      .pt-show-more { display:block; margin:0.25rem auto 0; background:none; border:1px solid rgba(255,255,255,0.15); color:#00e0ff; border-radius:8px; padding:0.4rem 1rem; cursor:pointer; font-size:0.8rem; }
      .pt-edit-form { width:100%; }
      .pt-count-badge { display:inline-flex; align-items:center; gap:0.3rem; background:rgba(255,165,0,0.15); color:#ffa500; font-size:0.72rem; font-weight:700; padding:0.1rem 0.5rem; border-radius:8px; margin-left:0.4rem; }
      @media (max-width: 560px) {
        .pt-filters { margin-left:0; width:100%; }
        .pt-filters select, .pt-filters input { flex:1; min-width:0; }
        .pt-task { flex-direction:column; }
        .pt-task-actions { width:100%; justify-content:space-between; }
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // Panel controller
  // ------------------------------------------------------------------

  function ownerOptionsHTML(members, selectedId) {
    const opts = ['<option value="">Unassigned</option>'];
    members.forEach(m => {
      opts.push(`<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`);
    });
    return opts.join('');
  }

  function detailFieldsHTML(task, members) {
    const t = task || {};
    return `
      <textarea class="pt-field" data-field="description" placeholder="Description (optional)" rows="2">${escapeHtml(t.description || '')}</textarea>
      <div class="pt-add-details">
        <select class="pt-field" data-field="priority">
          <option value="high" ${t.priority === 'high' ? 'selected' : ''}>High priority</option>
          <option value="medium" ${(!t.priority || t.priority === 'medium') ? 'selected' : ''}>Medium priority</option>
          <option value="low" ${t.priority === 'low' ? 'selected' : ''}>Low priority</option>
        </select>
        <select class="pt-field" data-field="owner_id">
          ${ownerOptionsHTML(members, t.owner_id || '')}
        </select>
        <input class="pt-field" type="date" data-field="due_date" value="${t.due_date || ''}" aria-label="Due date">
        <input class="pt-field" type="url" data-field="related_url" placeholder="Related URL or /path" value="${escapeHtml(t.related_url || '')}" aria-label="Related URL or path">
      </div>
    `;
  }

  function taskRowHTML(task, canEdit, canDelete) {
    const overdue = isOverdue(task);
    const safeUrl = task.related_url; // already sanitized at write time
    const metaChips = [
      task.owner ? `<span class="pt-chip"><i class="fas fa-user" aria-hidden="true"></i> ${escapeHtml(task.owner.name)}</span>` : '',
      task.due_date ? `<span class="pt-chip ${overdue ? 'pt-overdue' : ''}"><i class="fas fa-calendar" aria-hidden="true"></i> ${formatDate(task.due_date)}${overdue ? ' (overdue)' : ''}</span>` : '',
      safeUrl ? `<a class="pt-chip pt-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-link" aria-hidden="true"></i> Link</a>` : '',
      task.status === 'done' && task.completed_at ? `<span class="pt-chip">Completed ${relativeTime(task.completed_at)}</span>` : '',
    ].filter(Boolean).join('');

    const actionsHTML = canEdit ? `
      <div class="pt-task-actions">
        <div class="pt-status-toggle" role="group" aria-label="Status for ${escapeHtml(task.title)}">
          ${STATUS_ORDER.map(s => `
            <button type="button" class="pt-status-btn ${task.status === s ? 'active' : ''}" data-action="status" data-status="${s}" aria-pressed="${task.status === s}">${STATUS_LABELS[s]}</button>
          `).join('')}
        </div>
        <button type="button" class="pt-icon-btn" data-action="edit" aria-label="Edit task: ${escapeHtml(task.title)}"><i class="fas fa-edit" aria-hidden="true"></i></button>
        ${canDelete ? `<button type="button" class="pt-icon-btn pt-danger" data-action="delete" aria-label="Delete task: ${escapeHtml(task.title)}"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>` : ''}
      </div>
    ` : `<div class="pt-task-status-badge pt-status-${task.status}">${STATUS_LABELS[task.status]}</div>`;

    return `
      <div class="pt-task" data-task-id="${task.id}">
        <div class="pt-task-main">
          <span class="pt-priority-dot" style="background:${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}" title="${PRIORITY_LABELS[task.priority] || 'Medium'} priority"></span>
          <div class="pt-task-body" style="min-width:0;">
            <div class="pt-task-title">${escapeHtml(task.title)}</div>
            ${task.description ? `<div class="pt-task-desc">${escapeHtml(task.description)}</div>` : ''}
            ${metaChips ? `<div class="pt-task-meta">${metaChips}</div>` : ''}
          </div>
        </div>
        ${actionsHTML}
      </div>
    `;
  }

  /**
   * Mount the Tasks tab into `container` for `project`.
   *
   * @param {HTMLElement} container
   * @param {Object} project - project row (id, creator_id, project_members)
   * @param {Object} opts - { currentUserProfile, canEdit, canDelete, members: [{id,name,image_url}] }
   */
  function mountTasksPanel(container, project, opts) {
    ensureStyles();
    const canEdit = !!opts.canEdit;
    const canDelete = !!opts.canDelete;
    const members = opts.members || [];
    const actorId = opts.currentUserProfile?.id || null;

    const state = {
      tasks: [],
      loading: true,
      doneLimit: DONE_PAGE_SIZE,
      filters: { status: '', priority: '', owner: '', q: '' },
    };

    container.className = 'pt-panel';
    container.innerHTML = `
      <div class="pt-toolbar">
        ${canEdit ? '<button type="button" class="pt-add-btn" id="pt-add-toggle"><i class="fas fa-plus"></i> Add task</button>' : ''}
        <div class="pt-filters">
          <select id="pt-filter-status" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select id="pt-filter-priority" aria-label="Filter by priority">
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select id="pt-filter-owner" aria-label="Filter by owner">
            <option value="">All owners</option>
            ${members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
          </select>
          <input type="search" id="pt-filter-q" placeholder="Search tasks…" aria-label="Search tasks">
        </div>
      </div>

      ${canEdit ? `
      <form id="pt-add-form" class="pt-add-form pt-hidden" aria-label="Add a task">
        <div class="pt-add-row">
          <input type="text" class="pt-field" name="title" placeholder="Task title" required maxlength="200" aria-label="Task title">
        </div>
        <button type="button" class="pt-link-btn" id="pt-add-more-toggle">+ Add details (description, priority, owner, due date, link)</button>
        <div class="pt-add-details pt-hidden" id="pt-add-details">
          ${detailFieldsHTML(null, members)}
        </div>
        <div class="pt-add-actions">
          <button type="submit" class="pt-submit-btn">Add task</button>
          <button type="button" class="pt-cancel-btn" id="pt-add-cancel">Cancel</button>
          <span class="pt-add-status" id="pt-add-status" role="status" aria-live="polite"></span>
        </div>
      </form>
      ` : ''}

      <div id="pt-groups" aria-live="polite"><div class="pt-empty">Loading tasks…</div></div>
    `;

    const groupsEl = container.querySelector('#pt-groups');

    function applyFilters(tasks) {
      return tasks.filter(t => {
        if (state.filters.status && t.status !== state.filters.status) return false;
        if (state.filters.priority && t.priority !== state.filters.priority) return false;
        if (state.filters.owner && t.owner_id !== state.filters.owner) return false;
        if (state.filters.q) {
          const q = state.filters.q.toLowerCase();
          const hay = `${t.title} ${t.description || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    function renderGroups() {
      const filtered = applyFilters(state.tasks);
      const open = filtered.filter(t => t.status === 'open');
      const inProgress = filtered.filter(t => t.status === 'in_progress');
      const done = filtered
        .filter(t => t.status === 'done')
        .sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at));
      const doneVisible = done.slice(0, state.doneLimit);

      if (state.loading) {
        groupsEl.innerHTML = '<div class="pt-empty">Loading tasks…</div>';
        return;
      }

      if (state.tasks.length === 0) {
        groupsEl.innerHTML = '<div class="pt-empty">No tasks yet. Break this project down into actionable work items.</div>';
        return;
      }

      function group(title, icon, list, extra) {
        return `
          <div class="pt-group">
            <div class="pt-group-title"><i class="fas ${icon}" aria-hidden="true"></i> ${title} <span class="pt-group-count">${list.length}</span></div>
            ${list.length === 0 ? '<div class="pt-empty">Nothing here.</div>' : list.map(t => taskRowHTML(t, canEdit, canDelete)).join('')}
            ${extra || ''}
          </div>
        `;
      }

      groupsEl.innerHTML = [
        group('Needs Attention', 'fa-circle', open),
        group('In Progress', 'fa-spinner', inProgress),
        group('Done Recently', 'fa-check-circle', doneVisible,
          done.length > doneVisible.length
            ? `<button type="button" class="pt-show-more" id="pt-done-more">Show more (${done.length - doneVisible.length} more)</button>`
            : ''),
      ].join('');
    }

    async function reload() {
      state.loading = true;
      renderGroups();
      state.tasks = await fetchTasks(project.id);
      state.loading = false;
      renderGroups();
      if (typeof opts.onCountChange === 'function') {
        const unfinished = state.tasks.filter(t => t.status !== 'done').length;
        opts.onCountChange(unfinished);
      }
    }

    function findTask(id) {
      return state.tasks.find(t => t.id === id);
    }

    function readDetailFields(root) {
      const fields = {};
      root.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.value;
      });
      return fields;
    }

    // ---- Filters ----
    container.querySelector('#pt-filter-status').addEventListener('change', e => {
      state.filters.status = e.target.value;
      renderGroups();
    });
    container.querySelector('#pt-filter-priority').addEventListener('change', e => {
      state.filters.priority = e.target.value;
      renderGroups();
    });
    container.querySelector('#pt-filter-owner').addEventListener('change', e => {
      state.filters.owner = e.target.value;
      renderGroups();
    });
    let searchDebounce;
    container.querySelector('#pt-filter-q').addEventListener('input', e => {
      clearTimeout(searchDebounce);
      const value = e.target.value;
      searchDebounce = setTimeout(() => {
        state.filters.q = value;
        renderGroups();
      }, 150);
    });

    // ---- Add task form ----
    if (canEdit) {
      const addToggle = container.querySelector('#pt-add-toggle');
      const addForm = container.querySelector('#pt-add-form');
      const addMoreToggle = container.querySelector('#pt-add-more-toggle');
      const addDetails = container.querySelector('#pt-add-details');
      const addCancel = container.querySelector('#pt-add-cancel');
      const addStatus = container.querySelector('#pt-add-status');

      addToggle.addEventListener('click', () => {
        addForm.classList.remove('pt-hidden');
        addToggle.setAttribute('aria-expanded', 'true');
        addForm.querySelector('input[name="title"]').focus();
      });
      addMoreToggle.addEventListener('click', () => {
        addDetails.classList.toggle('pt-hidden');
      });
      addCancel.addEventListener('click', () => {
        addForm.reset();
        addDetails.classList.add('pt-hidden');
        addForm.classList.add('pt-hidden');
        addStatus.textContent = '';
      });

      addForm.addEventListener('submit', async e => {
        e.preventDefault();
        const title = addForm.querySelector('input[name="title"]').value.trim();
        if (!title) return;
        const submitBtn = addForm.querySelector('.pt-submit-btn');
        submitBtn.disabled = true;
        addStatus.textContent = 'Adding…';
        try {
          const details = readDetailFields(addDetails);
          const created = await createTask(project.id, { title, ...details }, actorId);
          state.tasks.unshift(created);
          addForm.reset();
          addDetails.classList.add('pt-hidden');
          addForm.classList.add('pt-hidden');
          addStatus.textContent = '';
          renderGroups();
          if (typeof opts.onCountChange === 'function') {
            opts.onCountChange(state.tasks.filter(t => t.status !== 'done').length);
          }
        } catch (err) {
          console.error('[ProjectTasks] create failed:', err);
          addStatus.textContent = 'Could not add task. Please try again.';
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    // ---- Row actions (event delegation) ----
    groupsEl.addEventListener('click', async e => {
      const showMoreBtn = e.target.closest('#pt-done-more');
      if (showMoreBtn) {
        state.doneLimit += DONE_PAGE_SIZE;
        renderGroups();
        return;
      }

      const row = e.target.closest('.pt-task');
      if (!row) return;
      const task = findTask(row.dataset.taskId);
      if (!task) return;

      const statusBtn = e.target.closest('[data-action="status"]');
      if (statusBtn && canEdit) {
        const newStatus = statusBtn.dataset.status;
        if (newStatus === task.status) return;
        statusBtn.closest('.pt-status-toggle').querySelectorAll('button').forEach(b => b.disabled = true);
        try {
          const updated = await updateTask(task, { status: newStatus }, actorId);
          Object.assign(task, updated);
          renderGroups();
          if (typeof opts.onCountChange === 'function') {
            opts.onCountChange(state.tasks.filter(t => t.status !== 'done').length);
          }
        } catch (err) {
          console.error('[ProjectTasks] status update failed:', err);
          alert('Could not update task status. Please try again.');
          renderGroups();
        }
        return;
      }

      if (e.target.closest('[data-action="delete"]') && canDelete) {
        if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
        try {
          await deleteTask(task);
          state.tasks = state.tasks.filter(t => t.id !== task.id);
          renderGroups();
          if (typeof opts.onCountChange === 'function') {
            opts.onCountChange(state.tasks.filter(t => t.status !== 'done').length);
          }
        } catch (err) {
          console.error('[ProjectTasks] delete failed:', err);
          alert('Could not delete task. Please try again.');
        }
        return;
      }

      if (e.target.closest('[data-action="edit"]') && canEdit) {
        openEditor(row, task);
      }
    });

    function openEditor(row, task) {
      row.innerHTML = `
        <form class="pt-edit-form">
          <div class="pt-add-row">
            <input type="text" class="pt-field" data-field="title" value="${escapeHtml(task.title)}" required maxlength="200" aria-label="Task title">
          </div>
          ${detailFieldsHTML(task, members)}
          <div class="pt-add-actions">
            <button type="submit" class="pt-submit-btn">Save</button>
            <button type="button" class="pt-cancel-btn" data-action="cancel-edit">Cancel</button>
          </div>
        </form>
      `;
      const form = row.querySelector('form');
      form.querySelector('[data-field="title"]').focus();
      form.querySelector('[data-action="cancel-edit"]').addEventListener('click', () => renderGroups());
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const fields = readDetailFields(form);
        fields.title = form.querySelector('[data-field="title"]').value.trim();
        if (!fields.title) return;
        const submitBtn = form.querySelector('.pt-submit-btn');
        submitBtn.disabled = true;
        try {
          const updated = await updateTask(task, fields, actorId);
          Object.assign(task, updated);
          renderGroups();
        } catch (err) {
          console.error('[ProjectTasks] edit failed:', err);
          alert('Could not save changes. Please try again.');
          submitBtn.disabled = false;
        }
      });
    }

    reload();

    return { reload };
  }

  // ---- Expose globally ----
  window.ProjectTasks = {
    fetchTasks,
    fetchOpenCounts,
    createTask,
    updateTask,
    deleteTask,
    mountTasksPanel,
  };

  console.log('✅ Project tasks module loaded');
})();
