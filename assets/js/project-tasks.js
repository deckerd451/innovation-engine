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

  // Task assistance keeps its resumable working state in the task's own
  // description (assistance-interventions.js writeNotes): a block between
  // these two lines, ending in a JSON state line. It is for the assistant,
  // not for reading, so the task list shows the description without it, and
  // saving an edit puts it back exactly as it was. Nothing stored changes
  // unless the member edits the text they can see.
  const NOTES_START = '── Buildspace working notes ──';
  const NOTES_END = '── end of working notes ──';

  function splitWorkingNotes(description) {
    const text = String(description || '');
    const start = text.indexOf(NOTES_START);
    const end = start === -1 ? -1 : text.indexOf(NOTES_END, start);
    if (start === -1 || end === -1) return { visible: text.trim(), notes: '' };
    return {
      visible: `${text.slice(0, start)}${text.slice(end + NOTES_END.length)}`.replace(/\n{3,}/g, '\n\n').trim(),
      notes: text.slice(start, end + NOTES_END.length),
    };
  }

  function visibleDescription(description) {
    return splitWorkingNotes(description).visible;
  }

  function withWorkingNotes(visible, original) {
    const { notes } = splitWorkingNotes(original);
    const text = String(visible || '').trim();
    if (!notes) return text;
    return text ? `${text}\n\n${notes}` : notes;
  }

  // ------------------------------------------------------------------
  // Data access
  // ------------------------------------------------------------------

  async function fetchTasks(projectId) {
    const { data, error } = await supa()
      .from('project_tasks')
      .select('*, owner:community!project_tasks_owner_id_fkey(id, name, image_url, user_id, photo_visible, photo_consent_at)')
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

  const TASK_SELECT = '*, owner:community!project_tasks_owner_id_fkey(id, name, image_url, user_id, photo_visible, photo_consent_at)';

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
      .pt-toolbar { display:flex; flex-wrap:wrap; gap:0.6rem; align-items:flex-start; margin-bottom:0.9rem; }
      .pt-add-btn { min-height:40px; background:linear-gradient(135deg,#00e0ff,#00b8d4); border:none; border-radius:8px; color:#04222a; font-weight:700; padding:0.55rem 1rem; cursor:pointer; font-size:0.9rem; }
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
      .pt-group { margin-bottom:1.1rem; }
      .pt-group-title { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.55); margin:0 0 0.35rem; display:flex; align-items:center; gap:0.5rem; }
      .pt-group-count { background:rgba(255,255,255,0.1); border-radius:10px; padding:0.05rem 0.5rem; font-size:0.7rem; }
      .pt-empty { color:#8a93a6; font-size:0.85rem; padding:0.5rem 0 1rem; }
      .pt-list { list-style:none; margin:0; padding:0; border:1px solid rgba(255,255,255,0.08); border-radius:12px; background:rgba(255,255,255,0.025); overflow:hidden; }
      .pt-task { border-top:1px solid rgba(255,255,255,0.07); }
      .pt-task:first-child { border-top:0; }
      .pt-row { width:100%; min-height:52px; display:flex; align-items:center; gap:0.7rem; padding:0.55rem 0.75rem; border:0; background:none; color:#fff; font:inherit; text-align:left; cursor:pointer; }
      .pt-row:hover { background:rgba(255,255,255,0.03); }
      .pt-row:focus-visible { outline:2px solid #00e0ff; outline-offset:-2px; }
      .pt-glyph { flex:none; width:20px; height:20px; display:grid; place-items:center; }
      .pt-glyph svg { width:20px; height:20px; fill:none; stroke-width:2; }
      .pt-glyph-open svg { stroke:#8a93a6; }
      .pt-glyph-in_progress svg { stroke:#ffa500; }
      .pt-glyph-done svg { stroke:#00d68f; }
      .pt-row-text { flex:1; min-width:0; display:grid; gap:0.1rem; }
      .pt-task-title { color:#fff; font-weight:600; font-size:0.92rem; line-height:1.3; overflow-wrap:anywhere; }
      .pt-task.pt-is-done .pt-task-title { color:#b8c0d0; }
      .pt-row-meta { color:#8a93a6; font-size:0.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pt-row-meta .pt-overdue-text { color:#ff8a8a; }
      .pt-chevron { flex:none; width:18px; height:18px; fill:none; stroke:#8a93a6; stroke-width:2; stroke-linecap:round; transition:transform .15s; }
      .pt-row[aria-expanded="true"] .pt-chevron { transform:rotate(90deg); }
      .pt-detail { padding:0 0.75rem 0.85rem 2.45rem; }
      .pt-detail[hidden] { display:none; }
      .pt-task-desc { color:#c3cad8; font-size:0.85rem; line-height:1.5; margin:0 0 0.6rem; white-space:pre-line; overflow-wrap:anywhere; }
      .pt-task-meta { display:flex; gap:0.4rem; flex-wrap:wrap; margin:0 0 0.7rem; }
      .pt-chip { display:inline-flex; align-items:center; gap:0.3rem; background:rgba(255,255,255,0.06); color:#c3cad8; font-size:0.75rem; padding:0.2rem 0.55rem; border-radius:8px; text-decoration:none; }
      .pt-chip.pt-overdue { color:#ff6b6b; background:rgba(255,107,107,0.12); }
      .pt-chip.pt-link:hover { text-decoration:underline; color:#00e0ff; }
      .pt-task-actions { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
      .pt-status-toggle { display:flex; border:1px solid rgba(255,255,255,0.15); border-radius:8px; overflow:hidden; }
      .pt-status-btn { background:transparent; border:none; color:#aab2c2; font-size:0.78rem; min-height:36px; padding:0.4rem 0.65rem; cursor:pointer; white-space:nowrap; }
      .pt-status-btn + .pt-status-btn { border-left:1px solid rgba(255,255,255,0.1); }
      .pt-status-btn.active { background:#00e0ff; color:#04222a; font-weight:700; }
      .pt-text-btn { min-height:36px; padding:0.4rem 0.7rem; border:1px solid rgba(255,255,255,0.15); border-radius:8px; background:rgba(255,255,255,0.04); color:#dbe2ee; font:inherit; font-size:0.8rem; font-weight:600; cursor:pointer; }
      .pt-text-btn.pt-primary { border-color:rgba(0,224,255,0.45); background:rgba(0,224,255,0.1); color:#9eefff; }
      .pt-text-btn.pt-danger { color:#ff8a8a; border-color:rgba(255,107,107,0.35); background:transparent; }
      .pt-text-btn:focus-visible { outline:2px solid #00e0ff; outline-offset:2px; }
      .pt-task-status-badge { font-size:0.72rem; font-weight:700; padding:0.3rem 0.6rem; border-radius:8px; }
      .pt-status-open { background:rgba(255,255,255,0.08); color:#ccc; }
      .pt-status-in_progress { background:rgba(255,165,0,0.15); color:#ffa500; }
      .pt-status-done { background:rgba(0,255,136,0.12); color:#00ff88; }
      .pt-done { margin-top:0.25rem; }
      .pt-done > summary { min-height:44px; display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:rgba(255,255,255,0.7); font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; list-style-position:inside; }
      .pt-done > summary:focus-visible { outline:2px solid #00e0ff; outline-offset:2px; }
      .pt-show-more { display:block; margin:0.5rem auto 0; min-height:40px; background:none; border:1px solid rgba(255,255,255,0.15); color:#00e0ff; border-radius:8px; padding:0.4rem 1rem; cursor:pointer; font-size:0.8rem; }
      .pt-filter-box { margin-left:auto; }
      .pt-filter-box[open] { flex-basis:100%; display:flex; flex-direction:column; align-items:flex-end; }
      .pt-filter-box[open] > .pt-filters { align-self:stretch; }
      .pt-filter-box > summary { min-height:40px; display:inline-flex; align-items:center; padding:0 0.75rem; border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#c3cad8; font-size:0.82rem; cursor:pointer; list-style:none; }
      .pt-filter-box > summary::-webkit-details-marker { display:none; }
      .pt-filter-box[open] > summary { color:#00e0ff; border-color:rgba(0,224,255,0.4); }
      .pt-filter-box > .pt-filters { margin-top:0.5rem; }
      .pt-edit-form { width:100%; padding:0.75rem; }
      .pt-count-badge { display:inline-flex; align-items:center; gap:0.3rem; background:rgba(255,165,0,0.15); color:#ffa500; font-size:0.72rem; font-weight:700; padding:0.1rem 0.5rem; border-radius:8px; margin-left:0.4rem; }
      .pt-sr-status { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
      @media (max-width: 560px) {      @media (max-width: 560px) {
        .pt-filters { margin-left:0; width:100%; }
        .pt-filters select, .pt-filters input { flex:1 1 45%; min-width:0; }
        .pt-detail { padding-left:0.75rem; }
        .pt-status-toggle { width:100%; }
        .pt-status-btn { flex:1; min-height:40px; }
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
      <textarea class="pt-field" data-field="description" placeholder="Description (optional)" rows="2">${escapeHtml(visibleDescription(t.description))}</textarea>
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

  const GLYPHS = {
    open: '<circle cx="12" cy="12" r="8"/>',
    in_progress: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="#ffa500" stroke="none"/>',
    done: '<circle cx="12" cy="12" r="8"/><path d="M8 12.5l2.6 2.6L16 9.6"/>',
  };

  // One compact row per task: its status, title and one line of what
  // matters (priority when high, owner, due date). Tapping the row opens its
  // details and the actions; nothing else competes on the list.
  function taskRowHTML(task, canEdit, canDelete, expanded, canWorkOn, actorId) {
    const overdue = isOverdue(task);
    const safeUrl = task.related_url; // already sanitized at write time
    const description = visibleDescription(task.description);
    const due = task.due_date ? `${overdue ? '<span class="pt-overdue-text">Overdue · ' : 'Due '}${formatDate(task.due_date)}${overdue ? '</span>' : ''}` : '';
    const rowMeta = [
      task.status !== 'done' && task.priority === 'high' ? 'High priority' : '',
      task.owner?.name ? (actorId && task.owner_id === actorId ? 'You' : escapeHtml(task.owner.name)) : '',
      task.status === 'done' ? (task.completed_at ? `Done ${relativeTime(task.completed_at)}` : 'Done') : due,
    ].filter(Boolean).join(' · ');
    const metaChips = [
      `<span class="pt-chip">${PRIORITY_LABELS[task.priority] || 'Medium'} priority</span>`,
      task.owner ? `<span class="pt-chip"><i class="fas fa-user" aria-hidden="true"></i> ${escapeHtml(task.owner.name)}</span>` : '<span class="pt-chip">Unassigned</span>',
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
        ${canWorkOn && task.status !== 'done' ? `<button type="button" class="pt-text-btn pt-primary" data-action="work">Work on this or report progress</button>` : ''}
        <button type="button" class="pt-text-btn" data-action="edit" aria-label="Edit task: ${escapeHtml(task.title)}"><i class="fas fa-edit" aria-hidden="true"></i> Edit</button>
        ${canDelete ? `<button type="button" class="pt-text-btn pt-danger" data-action="delete" aria-label="Delete task: ${escapeHtml(task.title)}"><i class="fas fa-trash-alt" aria-hidden="true"></i> Delete</button>` : ''}
      </div>
    ` : `<div class="pt-task-status-badge pt-status-${task.status}">${STATUS_LABELS[task.status]}</div>`;

    const detailId = `pt-detail-${escapeHtml(task.id)}`;
    return `
      <li class="pt-task${task.status === 'done' ? ' pt-is-done' : ''}" data-task-id="${escapeHtml(task.id)}">
        <button type="button" class="pt-row" data-action="toggle" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${detailId}">
          <span class="pt-glyph pt-glyph-${task.status}" aria-hidden="true"><svg viewBox="0 0 24 24">${GLYPHS[task.status] || GLYPHS.open}</svg></span>
          <span class="pt-row-text">
            <span class="pt-task-title">${escapeHtml(task.title)}</span>
            ${rowMeta ? `<span class="pt-row-meta">${rowMeta}</span>` : ''}
          </span>
          <svg class="pt-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <div class="pt-detail" id="${detailId}" ${expanded ? '' : 'hidden'}>
          ${description ? `<p class="pt-task-desc">${escapeHtml(description)}</p>` : ''}
          <div class="pt-task-meta">${metaChips}</div>
          ${actionsHTML}
        </div>
      </li>
    `;
  }

  /**
   * Mount the Tasks tab into `container` for `project`.
   *
   * @param {HTMLElement} container
   * @param {Object} project - project row (id, creator_id, project_members)
   * @param {Object} opts - { currentUserProfile, canEdit, canDelete, members: [{id,name,image_url}],
   *   onCountChange(unfinished), onTasksChange(tasks), onWorkOn(task) }
   *   onWorkOn, when given, adds "Work on this or report progress" (task
   *   assistance) to an unfinished task's details.
   * @returns {{ reload, focusTask(id), openAddForm() }}
   */
  function mountTasksPanel(container, project, opts) {
    ensureStyles();
    const canEdit = !!opts.canEdit;
    const canDelete = !!opts.canDelete;
    const members = opts.members || [];
    const actorId = opts.currentUserProfile?.id || null;

    const canWorkOn = canEdit && typeof opts.onWorkOn === 'function';
    const state = {
      tasks: [],
      loading: true,
      doneLimit: DONE_PAGE_SIZE,
      doneOpen: false,
      expanded: new Set(),
      pendingFocus: null,
      filters: { status: '', priority: '', owner: '', q: '' },
    };

    container.className = 'pt-panel';
    container.innerHTML = `
      <div class="pt-toolbar">
        ${canEdit ? '<button type="button" class="pt-add-btn" id="pt-add-toggle"><i class="fas fa-plus"></i> Add task</button>' : ''}
        <details class="pt-filter-box">
        <summary>Filter</summary>
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
        </details>
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

      <div id="pt-groups"><div class="pt-empty">Loading tasks…</div></div>
      <p class="pt-sr-status" role="status" aria-live="polite"></p>
    `;

    const groupsEl = container.querySelector('#pt-groups');
    const announceEl = container.querySelector('.pt-sr-status');
    const announce = (text) => { if (announceEl) announceEl.textContent = text; };
    const filterBox = container.querySelector('.pt-filter-box');
    const filterSummary = filterBox.querySelector('summary');

    function notifyChange() {
      if (typeof opts.onCountChange === 'function') {
        opts.onCountChange(state.tasks.filter(t => t.status !== 'done').length);
      }
      if (typeof opts.onTasksChange === 'function') opts.onTasksChange(state.tasks.slice());
    }

    function applyFilters(tasks) {
      return tasks.filter(t => {
        if (state.filters.status && t.status !== state.filters.status) return false;
        if (state.filters.priority && t.priority !== state.filters.priority) return false;
        if (state.filters.owner && t.owner_id !== state.filters.owner) return false;
        if (state.filters.q) {
          const q = state.filters.q.toLowerCase();
          const hay = `${t.title} ${visibleDescription(t.description)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    // Work first: what is in progress, then what is still to do. Finished
    // work is folded away (one tap shows it), newest first.
    function renderGroups() {
      const filtered = applyFilters(state.tasks);
      const open = filtered.filter(t => t.status === 'open');
      const inProgress = filtered.filter(t => t.status === 'in_progress');
      const done = filtered
        .filter(t => t.status === 'done')
        .sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at));
      const doneVisible = done.slice(0, state.doneLimit);
      const activeFilters = Object.values(state.filters).filter(Boolean).length;
      filterSummary.textContent = activeFilters ? `Filter (${activeFilters})` : 'Filter';

      if (state.loading) {
        groupsEl.innerHTML = '<div class="pt-empty">Loading tasks…</div>';
        return;
      }

      if (state.tasks.length === 0) {
        groupsEl.innerHTML = '<div class="pt-empty">No tasks yet.</div>';
        return;
      }

      const rows = list => `<ul class="pt-list">${list.map(t => taskRowHTML(t, canEdit, canDelete, state.expanded.has(String(t.id)), canWorkOn, actorId)).join('')}</ul>`;
      const group = (title, list) => (list.length ? `
          <section class="pt-group" aria-label="${title}">
            <h4 class="pt-group-title">${title} <span class="pt-group-count">${list.length}</span></h4>
            ${rows(list)}
          </section>` : '');
      const nothingOpen = !open.length && !inProgress.length;
      const showDone = state.doneOpen || state.filters.status === 'done';

      groupsEl.innerHTML = [
        group('In progress', inProgress),
        group('To do', open),
        nothingOpen ? `<div class="pt-empty">${filtered.length ? 'Nothing left to do here.' : 'No tasks match these filters.'}</div>` : '',
        done.length ? `
          <details class="pt-done" ${showDone ? 'open' : ''}>
            <summary>Done <span class="pt-group-count">${done.length}</span></summary>
            ${rows(doneVisible)}
            ${done.length > doneVisible.length
              ? `<button type="button" class="pt-show-more" id="pt-done-more">Show more (${done.length - doneVisible.length} more)</button>`
              : ''}
          </details>` : '',
      ].join('');
      groupsEl.querySelector('.pt-done')?.addEventListener('toggle', e => { state.doneOpen = e.target.open; });
    }

    // Open one task's details, wherever it is in the list, and bring it into
    // view (from the project overview's next step, or a task link).
    // A filter or search the member left on can hide the task they asked to
    // open, so it is cleared first (and that is said), never left hiding it.
    function clearFilters() {
      clearTimeout(searchDebounce);
      state.filters = { status: '', priority: '', owner: '', q: '' };
      ['#pt-filter-status', '#pt-filter-priority', '#pt-filter-owner', '#pt-filter-q'].forEach(sel => {
        const el = container.querySelector(sel);
        if (el) el.value = '';
      });
    }

    function focusTask(id) {
      if (!id) return;
      if (state.loading) { state.pendingFocus = String(id); return; }
      const task = findTask(String(id));
      if (!task) return;
      if (!applyFilters([task]).length) {
        clearFilters();
        announce(`Filters cleared to show “${task.title}”.`);
      }
      state.expanded.add(String(task.id));
      if (task.status === 'done') state.doneOpen = true;
      renderGroups();
      const row = groupsEl.querySelector(`.pt-task[data-task-id="${CSS.escape(String(task.id))}"] .pt-row`);
      if (row) {
        row.focus({ preventScroll: true });
        window.setTimeout(() => row.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      }
    }

    async function reload() {
      state.loading = true;
      renderGroups();
      state.tasks = await fetchTasks(project.id);
      state.loading = false;
      renderGroups();
      notifyChange();
      if (state.pendingFocus) {
        const id = state.pendingFocus;
        state.pendingFocus = null;
        focusTask(id);
      }
    }

    function findTask(id) {
      return state.tasks.find(t => String(t.id) === String(id));
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
    let openAdd = () => {};
    if (canEdit) {
      const addToggle = container.querySelector('#pt-add-toggle');
      const addForm = container.querySelector('#pt-add-form');
      const addMoreToggle = container.querySelector('#pt-add-more-toggle');
      const addDetails = container.querySelector('#pt-add-details');
      const addCancel = container.querySelector('#pt-add-cancel');
      const addStatus = container.querySelector('#pt-add-status');

      openAdd = () => {
        addForm.classList.remove('pt-hidden');
        addToggle.setAttribute('aria-expanded', 'true');
        addForm.querySelector('input[name="title"]').focus();
      };
      addToggle.addEventListener('click', () => openAdd());
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
          announce(`Added “${created.title}”.`);
          notifyChange();
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

      if (e.target.closest('[data-action="toggle"]')) {
        const id = String(task.id);
        const button = e.target.closest('[data-action="toggle"]');
        const opening = !state.expanded.has(id);
        if (opening) state.expanded.add(id); else state.expanded.delete(id);
        button.setAttribute('aria-expanded', String(opening));
        row.querySelector('.pt-detail').hidden = !opening;
        return;
      }

      if (e.target.closest('[data-action="work"]') && canWorkOn) {
        opts.onWorkOn(task);
        return;
      }

      const statusBtn = e.target.closest('[data-action="status"]');
      if (statusBtn && canEdit) {
        const newStatus = statusBtn.dataset.status;
        if (newStatus === task.status) return;
        statusBtn.closest('.pt-status-toggle').querySelectorAll('button').forEach(b => b.disabled = true);
        try {
          const updated = await updateTask(task, { status: newStatus }, actorId);
          Object.assign(task, updated);
          renderGroups();
          announce(`“${task.title}” moved to ${newStatus === 'done' ? 'Done' : newStatus === 'in_progress' ? 'In progress' : 'To do'}.`);
          notifyChange();
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
          state.expanded.delete(String(task.id));
          renderGroups();
          announce(`Deleted “${task.title}”.`);
          notifyChange();
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
        // The member edits what they can see; working notes stay as stored.
        fields.description = withWorkingNotes(fields.description, task.description);
        const submitBtn = form.querySelector('.pt-submit-btn');
        submitBtn.disabled = true;
        try {
          const updated = await updateTask(task, fields, actorId);
          Object.assign(task, updated);
          renderGroups();
          notifyChange();
        } catch (err) {
          console.error('[ProjectTasks] edit failed:', err);
          alert('Could not save changes. Please try again.');
          submitBtn.disabled = false;
        }
      });
    }

    reload();

    return { reload, focusTask, openAddForm: () => openAdd() };
  }

  // ---- Expose globally ----
  window.ProjectTasks = {
    fetchTasks,
    fetchOpenCounts,
    createTask,
    updateTask,
    deleteTask,
    mountTasksPanel,
    visibleDescription,
    withWorkingNotes,
  };

  console.log('✅ Project tasks module loaded');
})();
