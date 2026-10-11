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

  function notify(message, type = 'info') {
    if (typeof window.showNotification === 'function') window.showNotification(message, type);
    else if (type === 'error') window.alert(message);
  }

  async function fetchPackages(projectId) {
    const { data, error } = await supa().from('capability_packages')
      .select('id, project_id, creator_id, title, goal, summary, steps, tools, constraints, failure_notes, success_criteria, permission_mode, evidence_status, version, created_at, updated_at')
      .eq('project_id', projectId).order('updated_at', { ascending: false });
    if (error) {
      if (!/capability_packages/i.test(error.message || '')) console.warn('[CapabilityMemory] package query failed:', error.message);
      return { data: [], unavailable: true };
    }
    return { data: data || [], unavailable: false };
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

  function rankPackages(packages, stats) {
    return packages.slice().sort((a, b) => {
      const as = stats.get(a.id) || {};
      const bs = stats.get(b.id) || {};
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

  function packageCard(pkg, stats, canUse) {
    const stat = stats.get(pkg.id) || { completed: 0, success: 0, verifiedSuccess: 0, savedHours: [] };
    const saved = median(stat.savedHours);
    const evidence = stat.verifiedSuccess >= 2 ? 'Verified' : stat.completed ? 'Self-reported' : 'No results yet';
    return `<article class="cm-package-card" data-package-id="${esc(pkg.id)}">
      <div class="cm-package-head"><div><span class="cm-evidence cm-evidence-${pkg.evidence_status}">${evidence}</span><h4>${esc(pkg.title)}</h4></div><span class="cm-version">v${pkg.version || 1}</span></div>
      <p class="cm-goal">${esc(pkg.goal)}</p>
      ${pkg.summary ? `<p class="cm-summary">${esc(pkg.summary)}</p>` : ''}
      <div class="cm-stats"><span>${stat.completed} completed attempt${stat.completed === 1 ? '' : 's'}</span><span>${stat.completed ? `${Math.round((stat.success / stat.completed) * 100)}% success (n=${stat.completed})` : 'No completed attempts'}</span>${saved != null ? `<span>${saved >= 0 ? `${hours(saved)} saved` : `${hours(Math.abs(saved))} added`}</span>` : ''}${stat.verifiedSuccess ? `<span>${stat.verifiedSuccess} independently verified</span>` : ''}</div>
      <details><summary>See the recipe</summary><div class="cm-recipe">
        <strong>Steps</strong><ol>${list(pkg.steps).map(step => `<li>${esc(step)}</li>`).join('') || '<li>Not documented yet</li>'}</ol>
        ${list(pkg.tools).length ? `<strong>Tools</strong><p>${list(pkg.tools).map(tool => esc(tool)).join(' · ')}</p>` : ''}
        ${pkg.failure_notes ? `<strong>Known failure</strong><p>${esc(pkg.failure_notes)}</p>` : ''}
      </div></details>
      ${canUse ? `<button class="cm-use-btn" type="button" data-action="use"><i class="fas fa-play"></i> Use this capability</button>` : ''}
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

  function attemptMarkup(pkg) {
    return `<form class="cm-form" data-form="attempt" data-capability-id="${esc(pkg.id)}">
      <div class="cm-form-title">Record a reuse of “${esc(pkg.title)}”</div>
      <p class="cm-form-help">Add the baseline and result when you finish. Estimates are fine; this is how the community learns what truly helped.</p>
      <div class="cm-two-col"><label>Usual hours <input type="number" name="baseline_hours" min="0" step="0.1" inputmode="decimal"></label><label>Actual hours <input type="number" name="actual_hours" min="0" step="0.1" inputmode="decimal"></label></div>
      <div class="cm-two-col"><label>Usual cost <input type="number" name="baseline_cost" min="0" step="1" inputmode="decimal"></label><label>Actual cost <input type="number" name="actual_cost" min="0" step="1" inputmode="decimal"></label></div>
      <label>Outcome <select name="outcome_status"><option value="succeeded">Succeeded</option><option value="not_succeeded">Did not succeed</option><option value="in_progress">Still in progress</option></select></label>
      <label>What changed? <textarea name="notes" rows="2" maxlength="500" placeholder="A short, honest result"></textarea></label>
      <div class="cm-form-actions"><button type="button" class="cm-cancel-btn">Cancel</button><button type="submit" class="cm-primary-btn">Record result</button></div>
    </form>`;
  }

  async function mount(container, project, options = {}) {
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

  window.CapabilityMemory = { mount };
  // Pure helpers are exposed for deterministic regression tests only. They do
  // not access Supabase or browser state.
  window.CapabilityMemoryTesting = { median, confidenceAdjustedEffectiveness, rankPackages, summarizeStats };
})();
