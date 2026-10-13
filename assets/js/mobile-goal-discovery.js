// Goal-first mobile Discover surface. It delegates search, ranking, evidence,
// and task import to CapabilityMemory and ProjectTasks.
(function () {
  'use strict';
  if (window.MobileGoalDiscovery) return;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  let lastSearch = null;

  async function authorizedProjects(profileId) {
    if (!profileId || !window.supabase) return [];
    const [projectsResult, membershipsResult] = await Promise.all([
      window.supabase.from('projects').select('id, title, description, status, creator_id').order('created_at', { ascending: false }),
      window.supabase.from('project_members').select('project_id, role').eq('user_id', profileId),
    ]);
    if (projectsResult.error || membershipsResult.error) return [];
    const accepted = new Set((membershipsResult.data || []).filter(row => row.role !== 'pending').map(row => row.project_id));
    return (projectsResult.data || []).filter(project => project.creator_id === profileId || accepted.has(project.id));
  }

  function showProjectChoice(container, pkg, goal, profile) {
    const slot = container.querySelector('.mgd-project-choice');
    slot.innerHTML = '<div class="mgd-choice-loading">Loading your projects…</div>';
    authorizedProjects(profile?.id).then(projects => {
      if (!projects.length) {
        slot.innerHTML = '<div class="cm-empty"><strong>Join a project first.</strong><p>Capability steps become tasks inside a project you can work in.</p></div>';
        return;
      }
      slot.innerHTML = `<div class="mgd-choice-card"><strong>Where should we do this work?</strong><p>Choose a project. We’ll add these steps to its existing task list.</p><div class="mgd-project-options">${projects.map(project => `<button type="button" data-project-id="${escape(project.id)}"><span>${escape(project.title)}</span><small>${escape(project.status || 'active')}</small></button>`).join('')}</div><button type="button" class="mgd-cancel-choice">Cancel</button></div>`;
      slot.querySelectorAll('[data-project-id]').forEach(button => button.addEventListener('click', async () => {
        const project = projects.find(item => item.id === button.dataset.projectId);
        button.disabled = true;
        try {
          await window.CapabilityMemory.importCapability(pkg, goal, project, profile.id);
          slot.innerHTML = `<div class="mgd-choice-success"><strong>Work added to ${escape(project.title)}.</strong><p>Continue from Today or open the project’s Tasks tab.</p><button type="button" data-open-project>Open project</button></div>`;
          slot.querySelector('[data-open-project]')?.addEventListener('click', () => window.openNodePanel?.({ id: project.id, type: 'project' }));
        } catch (error) {
          button.disabled = false;
          slot.innerHTML = `<div class="cm-empty"><strong>${escape(error.message || 'Could not add the capability steps.')}</strong><button type="button" class="mgd-retry-choice">Try again</button></div>`;
          slot.querySelector('.mgd-retry-choice')?.addEventListener('click', () => showProjectChoice(container, pkg, goal, profile));
        }
      }));
      slot.querySelector('.mgd-cancel-choice')?.addEventListener('click', () => { slot.innerHTML = ''; });
    });
  }

  function renderResults(container, goal, result) {
    const results = container.querySelector('.mgd-results');
    if (result.unavailable) {
      results.innerHTML = `<div class="cm-empty cm-search-error" data-error-kind="${escape(result.reason || 'unknown')}"><strong>${escape(window.CapabilityMemoryTesting?.searchErrorMessage?.(result.reason) || 'Capability search could not be loaded.')}</strong><p>Try again after resolving the issue.</p></div>`;
      return;
    }
    lastSearch = result;
    const direct = result.packages.filter(pkg => window.CapabilityMemoryTesting.goalMatch(pkg, goal).score > 0);
    results.innerHTML = `<div class="cm-results-title">${direct.length} relevant method${direct.length === 1 ? '' : 's'} found <span>from ${result.packages.length} shared package${result.packages.length === 1 ? '' : 's'}</span></div>${result.packages.length ? result.packages.map(pkg => window.CapabilityMemory.renderPackageCard(pkg, result.stats, goal, { canUse: true, actionLabel: 'Choose a project' })).join('') : '<div class="cm-empty"><strong>No shared methods yet.</strong><p>Try a broader goal or check back after the community shares a result.</p></div>'}`;
  }

  function mount(container) {
    if (!container || container.dataset.goalDiscoveryMounted === 'true') return;
    container.dataset.goalDiscoveryMounted = 'true';
    container.innerHTML = `<section class="mgd-goal-surface" aria-labelledby="mgd-title"><div class="mgd-goal-heading"><span class="mgd-eyebrow">Start with what matters</span><h3 id="mgd-title">What are you trying to accomplish?</h3><p>Find community-tested methods, then choose where to put them into practice.</p></div><form class="mgd-goal-form"><label class="sr-only" for="mgd-goal-input">What are you trying to accomplish?</label><input id="mgd-goal-input" name="goal" required maxlength="280" autocomplete="off" placeholder="e.g. Validate my business idea this week"><button type="submit">Find useful methods</button></form><div class="mgd-project-choice" aria-live="polite"></div><div class="mgd-results"><div class="cm-empty"><strong>Start with a concrete outcome.</strong><p>Your results will include evidence, prerequisites, and limitations.</p></div></div></section>`;
    container.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const goal = new FormData(event.target).get('goal')?.trim();
      if (!goal) return;
      const submit = event.target.querySelector('button');
      submit.disabled = true;
      container.querySelector('.mgd-results').innerHTML = '<div class="cm-loading">Searching community work…</div>';
      try { renderResults(container, goal, await window.CapabilityMemory.searchGoal(goal)); }
      catch (_) { container.querySelector('.mgd-results').innerHTML = '<div class="cm-empty cm-search-error" data-error-kind="connection"><strong>Capability search could not reach the community database.</strong><p>Check your connection and try again.</p></div>'; }
      submit.disabled = false;
    });
    container.addEventListener('click', event => {
      const use = event.target.closest('[data-action="use"]');
      if (!use || !lastSearch) return;
      const pkg = lastSearch.packages.find(item => item.id === use.closest('[data-package-id]')?.dataset.packageId);
      const goal = container.querySelector('input[name="goal"]')?.value.trim();
      if (pkg && goal) {
        window.CapabilityJourney?.emit('capability_selected', { surface: 'discover' });
        showProjectChoice(container, pkg, goal, window.currentUserProfile || null);
      }
    });
  }

  function init() { const target = document.getElementById('mgd-goal-discovery'); if (target) mount(target); }
  window.MobileGoalDiscovery = { init, mount, authorizedProjects };
  window.addEventListener('DOMContentLoaded', init, { once: true });
  window.addEventListener('profile-loaded', init, { once: true });
})();
