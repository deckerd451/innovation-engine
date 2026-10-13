// ================================================================
// CAPABILITY MEMORY
// ================================================================
// A small, permissioned loop inside project detail: save what worked,
// let another member use it, and measure the result. This intentionally
// reuses projects and does not create a second execution environment.
(function () {
  'use strict';
  if (window.CapabilityMemory) return;

  const esc = window.escapeHtml || ((value) => {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  });
  const supa = () => window.supabase;
  const list = (value) => Array.isArray(value) ? value : [];
  const lines = (value) => String(value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const hours = (value) => value == null || value === '' ? '—' : `${Number(value).toFixed(1)}h`;

  function classifySearchError(error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || error || '').toLowerCase();
    if (['42P01', '42703', '42883', 'PGRST200', 'PGRST204'].includes(code)
      || /relation .* does not exist|column .* does not exist|schema cache|foreign key relationship/.test(message)) return 'setup';
    if (['42501', 'PGRST116', 'PGRST301'].includes(code)
      || /permission denied|row-level security|not authorized|jwt/.test(message)) return 'permission';
    if (error?.name === 'TypeError' || /network|fetch|failed to connect|offline|timeout/.test(message)) return 'connection';
    return 'unknown';
  }

  function searchErrorMessage(reason) {
    if (reason === 'setup') return 'Capability search needs the Capability Memory database update. Ask an administrator to apply the production migration.';
    if (reason === 'permission') return 'You do not have permission to search shared capabilities. Sign in with a community profile and try again.';
    if (reason === 'connection') return 'Capability search could not reach the community database. Check your connection and try again.';
    return 'Capability search could not be loaded. Try again, or contact an administrator if the problem continues.';
  }

  function notify(message, type = 'info') {
    if (typeof window.showNotification === 'function') window.showNotification(message, type);
    else if (type === 'error') window.alert(message);
  }

  async function fetchPackages(projectId) {
    const { data, error } = await supa().from('capability_packages')
      .select('id, project_id, creator_id, title, goal, summary, steps, tools, constraints, failure_notes, success_criteria, permission_mode, evidence_status, version, created_at, updated_at, creator:community!capability_packages_creator_id_fkey(id, name), project:projects(id, title)')
      .eq('project_id', projectId).order('updated_at', { ascending: false });
    if (error) {
      if (!/capability_packages/i.test(error.message || '')) console.warn('[CapabilityMemory] package query failed:', error.message);
      return { data: [], unavailable: true };
    }
    return { data: data || [], unavailable: false };
  }

  async function fetchSharedPackages() {
    try {
      const { data, error } = await supa().from('capability_packages')
        .select('id, project_id, creator_id, title, goal, summary, steps, tools, constraints, failure_notes, success_criteria, permission_mode, evidence_status, version, created_at, updated_at, creator:community!capability_packages_creator_id_fkey(id, name), project:projects(id, title)')
        .eq('permission_mode', 'community').order('updated_at', { ascending: false }).limit(100);
      if (error) {
        const reason = classifySearchError(error);
        console.error('[CapabilityMemory] shared package search failed:', { reason, code: error.code, message: error.message });
        return { data: [], unavailable: true, reason };
      }
      return { data: data || [], unavailable: false, reason: null };
    } catch (error) {
      const reason = classifySearchError(error);
      console.error('[CapabilityMemory] shared package search failed:', { reason, message: error?.message });
      return { data: [], unavailable: true, reason };
    }
  }

  async function fetchOwnAttempts(projectId, memberId) {
    if (!memberId) return [];
    const query = supa().from('capability_attempts').select('id, capability_id, project_id, goal, task_ids, baseline_hours, actual_hours, baseline_cost, actual_cost, outcome_status, verification_status, notes, created_at').eq('member_id', memberId).order('created_at', { ascending: false });
    if (projectId) query.eq('project_id', projectId);
    const { data, error } = await query;
    return error ? [] : (data || []);
  }

  function goalTokens(goal) {
    return Array.from(new Set(String(goal || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []));
  }

  function goalMatch(pkg, goal) {
    const tokens = goalTokens(goal);
    if (!tokens.length) return { score: 0, matched: [] };
    const fields = [pkg.title, pkg.goal, pkg.summary, ...(list(pkg.steps)), ...(list(pkg.tools))].join(' ').toLowerCase();
    const matched = tokens.filter(token => fields.includes(token));
    return { score: matched.length / tokens.length, matched };
  }

  function buildTaskPlan(steps, existingTitles) {
    const seen = new Set(Array.from(existingTitles || []).map(title => String(title).trim().toLowerCase()));
    return list(steps).map(step => String(step || '').trim()).filter(title => {
      if (!title || seen.has(title.toLowerCase())) return false;
      seen.add(title.toLowerCase());
      return true;
    });
  }

  async function fetchAttemptStats(packageIds) {
    if (!packageIds.length) return new Map();
    const { data, error } = await supa().rpc('get_capability_attempt_stats', { capability_ids: packageIds });
    if (error) return new Map();
    const stats = new Map();
    (data || []).forEach(row => {
      stats.set(row.capability_id, {
        completed: Number(row.completed_attempts || 0),
        success: Number(row.successful_attempts || 0),
        verifiedSuccess: Number(row.verified_successes || 0),
        savedHours: (row.hours_saved_values || []).map(Number).filter(Number.isFinite),
        savedCost: (row.cost_saved_values || []).map(Number).filter(Number.isFinite)
      });
    });
    return stats;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  // Goal relevance is deliberately absent until a member goal is captured.
  // This score therefore ranks confidence-adjusted observed effectiveness only.
  function confidenceAdjustedEffectiveness(stat) {
    const completed = Number(stat?.completed || 0);
    if (!completed) return 0;
    const successRate = Number(stat.success || 0) / completed;
    const verifiedRate = Number(stat.verifiedSuccess || 0) / completed;
    const sampleConfidence = completed / (completed + 4);
    const verificationConfidence = 0.5 + (0.5 * verifiedRate);
    return successRate * sampleConfidence * verificationConfidence;
  }

  function rankPackages(packages, stats, goal = '') {
    return packages.slice().sort((a, b) => {
      const as = stats.get(a.id) || {};
      const bs = stats.get(b.id) || {};
      const relevanceDiff = goalMatch(b, goal).score - goalMatch(a, goal).score;
      if (relevanceDiff) return relevanceDiff;
      const scoreDiff = confidenceAdjustedEffectiveness(bs) - confidenceAdjustedEffectiveness(as);
      if (scoreDiff) return scoreDiff;
      return (median(bs.savedHours || []) ?? -Infinity) - (median(as.savedHours || []) ?? -Infinity);
    });
  }

  function summarizeStats(stats) {
    const rows = Array.from(stats.values());
    const completed = rows.reduce((sum, item) => sum + Number(item.completed || 0), 0);
    const success = rows.reduce((sum, item) => sum + Number(item.success || 0), 0);
    const verifiedSuccess = rows.reduce((sum, item) => sum + Number(item.verifiedSuccess || 0), 0);
    return { completed, success, verifiedSuccess, savedHours: median(rows.flatMap(item => item.savedHours || [])) };
  }

  function packageCard(pkg, stats, canUse, goal, canEdit, cardOptions = {}) {
    const stat = stats.get(pkg.id) || { completed: 0, success: 0, verifiedSuccess: 0, savedHours: [] };
    const saved = median(stat.savedHours);
    const evidence = stat.verifiedSuccess >= 2 ? 'Verified by members' : stat.completed ? 'Reported by members' : 'No results yet';
    const match = goalMatch(pkg, goal);
    const prerequisites = Object.entries(pkg.constraints || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');
    return `<article class="cm-package-card" data-package-id="${esc(pkg.id)}">
      <div class="cm-package-head"><div><span class="cm-evidence cm-evidence-${pkg.evidence_status}">${evidence}</span><h4>${esc(pkg.title)}</h4></div><span class="cm-version">v${pkg.version || 1}</span></div>
      ${goal ? `<p class="cm-relevance"><i class="fas fa-bullseye"></i> ${match.matched.length ? `Fits your goal: ${esc(match.matched.join(', '))}` : 'No close match yet'}</p>` : ''}
      <p class="cm-goal">${esc(pkg.goal)}</p>
      ${pkg.summary ? `<p class="cm-summary">${esc(pkg.summary)}</p>` : ''}
      <div class="cm-stats"><span>${stat.completed} finished attempt${stat.completed === 1 ? '' : 's'}</span><span>${stat.completed ? `${Math.round((stat.success / stat.completed) * 100)}% reported success (sample of ${stat.completed})` : 'No finished attempts yet'}</span>${saved != null ? `<span>${saved >= 0 ? `${hours(saved)} reported saved` : `${hours(Math.abs(saved))} reported added`}</span>` : ''}${stat.verifiedSuccess ? `<span>${stat.verifiedSuccess} verified by members</span>` : ''}</div>
      <details><summary>See how it works</summary><div class="cm-recipe">
        <strong>Steps</strong><ol>${list(pkg.steps).map(step => `<li>${esc(step)}</li>`).join('') || '<li>Not documented yet</li>'}</ol>
        ${list(pkg.tools).length ? `<strong>You'll need</strong><p>${list(pkg.tools).map(tool => esc(tool)).join(' · ')}</p>` : ''}
        ${prerequisites ? `<strong>Before you start</strong><p>${esc(prerequisites)}</p>` : ''}
        ${pkg.failure_notes ? `<strong>Watch for</strong><p>${esc(pkg.failure_notes)}</p>` : ''}
        <p class="cm-attribution">Created by ${esc(pkg.creator?.name || 'a community member')} · ${esc(pkg.project?.title || 'another project')} · version ${pkg.version || 1}</p>
      </div></details>
      ${canUse && (canEdit || cardOptions.actionLabel) ? `<button class="cm-use-btn" type="button" data-action="use"><i class="fas fa-play"></i> ${esc(cardOptions.actionLabel || 'Use this method')}</button>` : canUse ? '<p class="cm-form-help">Join this project to use this method.</p>' : ''}
    </article>`;
  }

  function formMarkup() {
    return `<form class="cm-form" data-form="package">
      <div class="cm-form-title">Save what worked</div>
      <p class="cm-form-help">Capture the reusable part of this project. Keep private work private until you choose to share it.</p>
      <label>What should someone be able to do? <input name="title" required maxlength="100" placeholder="Validate an idea in 7 days"></label>
      <label>Goal <textarea name="goal" required maxlength="280" rows="2" placeholder="The concrete result this helps achieve"></textarea></label>
      <label>Short summary <textarea name="summary" maxlength="500" rows="2" placeholder="Why this approach worked"></textarea></label>
      <label>Steps, one per line <textarea name="steps" required rows="4" placeholder="Define the question\nRun the smallest test\nRecord the evidence"></textarea></label>
      <label>Tools or assets, one per line <textarea name="tools" rows="2" placeholder="Interview script\nLanding page template"></textarea></label>
      <label>What failed or needs care? <textarea name="failure_notes" rows="2" placeholder="Useful limits and failure modes"></textarea></label>
      <label class="cm-check"><input type="checkbox" name="permission_mode"> Share with CharlestonHacks members</label>
      <div class="cm-form-actions"><button type="button" class="cm-cancel-btn">Cancel</button><button type="submit" class="cm-primary-btn">Save capability</button></div>
    </form>`;
  }

  async function importCapability(pkg, goal, targetProject, memberId) {
    if (!memberId || !targetProject?.id || !window.ProjectTasks?.createTask) {
      throw new Error('You need access to this project before using this method.');
    }
    const existing = await window.ProjectTasks.fetchTasks(targetProject.id);
    const existingTitles = new Set(existing.map(task => String(task.title || '').trim().toLowerCase()));
    const taskIds = [];
    const provenance = `From “${pkg.title}” v${pkg.version || 1}, created by ${pkg.creator?.name || 'a community member'}.`;
    for (const title of buildTaskPlan(pkg.steps, existingTitles)) {
      const task = await window.ProjectTasks.createTask(targetProject.id, { title, description: provenance }, memberId);
      existingTitles.add(title.toLowerCase());
      taskIds.push(task.id);
    }
    if (!taskIds.length) throw new Error('These steps are already in the project task list.');
    const { error } = await supa().from('capability_attempts').insert({ capability_id: pkg.id, member_id: memberId, project_id: targetProject.id, goal, task_ids: taskIds, outcome_status: 'in_progress' });
    if (error) throw error;
    window.CapabilityJourney?.emit('tasks_imported', { surface: 'discover', taskCount: taskIds.length });
    notify(`${taskIds.length} task${taskIds.length === 1 ? '' : 's'} added from this capability.`, 'success');
    return { taskIds, project: targetProject };
  }

  function attemptMarkup(pkg) {
    return `<form class="cm-form" data-form="attempt" data-capability-id="${esc(pkg.id)}">
      <div class="cm-form-title">Record a reuse of “${esc(pkg.title)}”</div>
      <p class="cm-form-help">Add the baseline and result when you finish. Estimates are fine; this is how the community learns what truly helped.</p>
      <div class="cm-two-col"><label>Usual hours <input type="number" name="baseline_hours" min="0" step="0.1" inputmode="decimal"></label><label>Actual hours <input type="number" name="actual_hours" min="0" step="0.1" inputmode="decimal"></label></div>
      <div class="cm-two-col"><label>Usual cost <input type="number" name="baseline_cost" min="0" step="1" inputmode="decimal"></label><label>Actual cost <input type="number" name="actual_cost" min="0" step="1" inputmode="decimal"></label></div>
      <label>Did it help? <select name="outcome_status"><option value="succeeded">Yes, it helped</option><option value="not_succeeded">No, it did not help</option><option value="in_progress">I am still working</option></select></label>
      <label>What changed? <textarea name="notes" rows="2" maxlength="500" placeholder="A short, honest result"></textarea></label>
      <div class="cm-form-actions"><button type="button" class="cm-cancel-btn">Cancel</button><button type="submit" class="cm-primary-btn">Record result</button></div>
    </form>`;
  }

  // Legacy project-only renderer retained for compatibility with older cached
  // pages. New mounts use the goal-driven flow below.
  async function legacyMount(container, project, options = {}) {
    if (!container || !supa() || !project?.id) return;
    container.innerHTML = '<div class="cm-loading">Loading reusable capabilities…</div>';
    const result = await fetchPackages(project.id);
    if (result.unavailable) {
      container.innerHTML = `<div class="cm-empty"><strong>Capability memory is ready to be connected.</strong><p>Apply the capability memory migration to enable reusable project recipes.</p></div>`;
      return;
    }
    const allPackages = result.data;
    const stats = await fetchAttemptStats(allPackages.map(pkg => pkg.id));
    const packages = rankPackages(allPackages, stats);
    const summary = summarizeStats(stats);
    const canCreate = Boolean(options.canCreate);
    const canUse = Boolean(options.canUse);
    container.innerHTML = `<div class="cm-shell">
      <div class="cm-intro"><div><h3>Get to the result faster</h3><p>Choose a method that has helped someone complete this kind of work. The goal is progress, not a bigger library.</p><span class="cm-goal-note">Goal matching is not scored yet.</span></div>${canCreate ? '<button type="button" class="cm-save-btn"><i class="fas fa-bookmark"></i> Save what worked</button>' : ''}</div>
      ${summary.completed ? `<div class="cm-outcome-strip"><span><strong>${summary.success}/${summary.completed}</strong> successful outcomes (n=${summary.completed})</span><span><strong>${Math.round((summary.success / summary.completed) * 100)}%</strong> completed-attempt success</span>${summary.savedHours != null ? `<span><strong>${summary.savedHours >= 0 ? hours(summary.savedHours) : hours(Math.abs(summary.savedHours))}</strong> median time ${summary.savedHours >= 0 ? 'saved' : 'added'} across attempts</span>` : ''}${summary.verifiedSuccess ? `<span><strong>${summary.verifiedSuccess}</strong> independently verified</span>` : ''}</div>` : ''}
      <div class="cm-form-slot"></div>
      <div class="cm-package-list">${packages.length ? packages.map(pkg => packageCard(pkg, stats, canUse)).join('') : '<div class="cm-empty"><strong>No shared capabilities yet.</strong><p>When this project solves something repeatable, save the recipe here.</p></div>'}</div>
    </div>`;
    const formSlot = container.querySelector('.cm-form-slot');
    container.querySelector('.cm-save-btn')?.addEventListener('click', () => {
      formSlot.innerHTML = formMarkup();
      formSlot.querySelector('input')?.focus();
    });
    container.addEventListener('click', event => {
      const cancel = event.target.closest('.cm-cancel-btn');
      if (cancel) formSlot.innerHTML = '';
      const use = event.target.closest('[data-action="use"]');
      if (use) {
        const pkg = packages.find(item => item.id === use.closest('[data-package-id]')?.dataset.packageId);
        if (pkg) formSlot.innerHTML = attemptMarkup(pkg);
      }
    });
    container.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        if (form.dataset.form === 'package') {
          const creatorId = options.currentUserProfile?.id;
          if (!creatorId) throw new Error('Your community profile is not ready yet.');
          const values = new FormData(form);
          const { error } = await supa().from('capability_packages').insert({
            project_id: project.id, creator_id: creatorId, title: values.get('title'), goal: values.get('goal'), summary: values.get('summary') || null,
            steps: lines(values.get('steps')), tools: lines(values.get('tools')), failure_notes: values.get('failure_notes') || null,
            permission_mode: values.get('permission_mode') === 'on' ? 'community' : 'private', evidence_status: 'untested'
          });
          if (error) throw error;
          notify('Capability saved. It will become stronger when someone reuses it.', 'success');
        } else {
          const values = new FormData(form);
          const memberId = options.currentUserProfile?.id;
          if (!memberId) throw new Error('Your community profile is not ready yet.');
          const number = key => values.get(key) === '' ? null : Number(values.get(key));
          const { error } = await supa().from('capability_attempts').insert({ capability_id: form.dataset.capabilityId, member_id: memberId, baseline_hours: number('baseline_hours'), actual_hours: number('actual_hours'), baseline_cost: number('baseline_cost'), actual_cost: number('actual_cost'), outcome_status: values.get('outcome_status'), notes: values.get('notes') || null });
          if (error) throw error;
          notify('Result recorded. Your experience will improve the next member’s starting point.', 'success');
        }
        await mount(container, project, options);
      } catch (error) {
        console.error('[CapabilityMemory] save failed:', error);
        notify(error.message || 'Could not save capability memory.', 'error');
        button.disabled = false;
      }
    });
  }

  async function mount(container, project, options = {}) {
    if (!container || !supa() || !project?.id) return;
    const memberId = options.currentUserProfile?.id;
    const canUse = Boolean(options.canUse);
    const canEdit = Boolean(options.canEdit);
    container.innerHTML = `<div class="cm-shell cm-goal-flow">
      <div class="cm-intro"><div><h3>Find a way forward</h3><p>Describe the result in your own words. We’ll show methods members have tried and explain why they may fit.</p></div></div>
      <form class="cm-goal-form"><input name="goal" required maxlength="280" autocomplete="off" placeholder="e.g. Validate my business idea this week"><button type="submit" class="cm-primary-btn"><i class="fas fa-search"></i> Find useful methods</button></form>
      <div class="cm-active-attempts"></div><div class="cm-goal-results"><div class="cm-empty"><strong>Start with a concrete outcome.</strong><p>Matching and evidence will appear here.</p></div></div>
    </div>`;
    const results = container.querySelector('.cm-goal-results');
    const active = container.querySelector('.cm-active-attempts');

    function outcomeForm(item) {
      const status = item.outcome_status || 'in_progress';
      const option = value => `<option value="${value}"${status === value ? ' selected' : ''}>${value === 'succeeded' ? 'Yes, it helped' : value === 'not_succeeded' ? 'No, it did not help' : 'I am still working'}</option>`;
      return `<form class="cm-form cm-outcome-form" data-attempt-id="${esc(item.id)}"><div class="cm-form-title">How did “${esc(item.goal || 'this goal')}” go?</div><p class="cm-form-help">Record what happened after you finish the project tasks.</p><div class="cm-two-col"><label>Typical hours <input type="number" name="baseline_hours" min="0" step="0.1" value="${item.baseline_hours ?? ''}"></label><label>Your hours <input type="number" name="actual_hours" min="0" step="0.1" value="${item.actual_hours ?? ''}"></label></div><div class="cm-two-col"><label>Typical cost <input type="number" name="baseline_cost" min="0" step="1" value="${item.baseline_cost ?? ''}"></label><label>Your cost <input type="number" name="actual_cost" min="0" step="1" value="${item.actual_cost ?? ''}"></label></div><label>Did it help? <select name="outcome_status">${option('succeeded')}${option('not_succeeded')}${option('in_progress')}</select></label><label>What changed? <textarea name="notes" rows="2" maxlength="500">${esc(item.notes || '')}</textarea></label><button type="submit" class="cm-primary-btn">Save result</button></form>`;
    }

    async function renderActiveAttempts() {
      const attempts = await fetchOwnAttempts(project.id, memberId);
      const open = attempts.filter(item => item.outcome_status === 'planned' || item.outcome_status === 'in_progress');
      active.innerHTML = open.length ? `<div class="cm-active-title">In progress</div>${open.map(outcomeForm).join('')}` : '';
    }

    async function renderGoalResults(goal) {
      window.CapabilityJourney?.emit('goal_entered', { surface: 'project' });
      results.innerHTML = '<div class="cm-loading">Searching community work…</div>';
      const packageResult = await fetchSharedPackages();
      if (packageResult.unavailable) { results.innerHTML = `<div class="cm-empty cm-search-error" data-error-kind="${esc(packageResult.reason || 'unknown')}"><strong>${esc(searchErrorMessage(packageResult.reason))}</strong><p>Search again after resolving the issue.</p></div>`; return; }
      const packages = packageResult.data;
      const stats = await fetchAttemptStats(packages.map(item => item.id));
      const ranked = rankPackages(packages, stats, goal);
      const directMatches = ranked.filter(item => goalMatch(item, goal).score > 0);
      results.innerHTML = `<div class="cm-results-title">${directMatches.length} relevant method${directMatches.length === 1 ? '' : 's'} found <span>from ${packages.length} shared package${packages.length === 1 ? '' : 's'}</span></div>${ranked.length ? ranked.map(item => packageCard(item, stats, canUse, goal, canEdit)).join('') : '<div class="cm-empty"><strong>No shared methods yet.</strong><p>Try a broader goal, or create the first reusable result in this project.</p></div>'}`;
    }

    async function startCapability(pkg, goal) {
      if (!memberId || !canEdit || !window.ProjectTasks?.createTask) throw new Error('You need access to this project before using this method.');
      const { taskIds } = await importCapability(pkg, goal, project, memberId);
      await renderActiveAttempts();
    }

    container.querySelector('.cm-goal-form').addEventListener('submit', async event => {
      event.preventDefault();
      const goal = new FormData(event.target).get('goal')?.trim();
      if (goal) await renderGoalResults(goal);
    });
    container.addEventListener('click', async event => {
      const use = event.target.closest('[data-action="use"]');
      if (!use) return;
      const card = use.closest('[data-package-id]');
      const goal = container.querySelector('.cm-goal-form input')?.value.trim();
      const packageResult = await fetchSharedPackages();
      if (packageResult.unavailable) { notify(searchErrorMessage(packageResult.reason), 'error'); use.disabled = false; return; }
      const pkg = packageResult.data.find(item => item.id === card?.dataset.packageId);
      if (!pkg) return;
      window.CapabilityJourney?.emit('capability_selected', { surface: 'project' });
      use.disabled = true;
      try { await startCapability(pkg, goal); } catch (error) { notify(error.message || 'Could not create project tasks.', 'error'); use.disabled = false; }
    });
    container.addEventListener('submit', async event => {
      const form = event.target.closest('.cm-outcome-form');
      if (!form) return;
      event.preventDefault();
      const values = new FormData(form);
      const number = key => values.get(key) === '' ? null : Number(values.get(key));
      const { error } = await supa().from('capability_attempts').update({ baseline_hours: number('baseline_hours'), actual_hours: number('actual_hours'), baseline_cost: number('baseline_cost'), actual_cost: number('actual_cost'), outcome_status: values.get('outcome_status'), notes: values.get('notes') || null }).eq('id', form.dataset.attemptId).eq('member_id', memberId);
      if (error) { notify(error.message || 'Could not save outcome.', 'error'); return; }
      window.CapabilityJourney?.emit('outcome_recorded', { surface: 'project', outcome: values.get('outcome_status') === 'succeeded' ? 'succeeded' : 'other' });
      window.dispatchEvent(new CustomEvent('capability-outcome-recorded'));
      notify('Outcome recorded. Self-reported results remain distinct from independent verification.', 'success');
      await renderActiveAttempts();
    });
    await renderActiveAttempts();
  }

  async function searchGoal(goal) {
    const packageResult = await fetchSharedPackages();
    if (packageResult.unavailable) return packageResult;
    const stats = await fetchAttemptStats(packageResult.data.map(item => item.id));
    return { ...packageResult, goal, stats, packages: rankPackages(packageResult.data, stats, goal) };
  }

  function renderPackageCard(pkg, stats, goal, options = {}) {
    return packageCard(pkg, stats, options.canUse !== false, goal, Boolean(options.canEdit), options);
  }

  window.CapabilityMemory = { mount, searchGoal, renderPackageCard, importCapability };
  // Pure helpers are exposed for deterministic regression tests only. They do
  // not access Supabase or browser state.
  window.CapabilityMemoryTesting = { median, confidenceAdjustedEffectiveness, rankPackages, summarizeStats, goalMatch, buildTaskPlan, classifySearchError, searchErrorMessage };
})();
