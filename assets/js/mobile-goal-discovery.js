// Objective entry for My Space. It does no assistance of its own: a typed
// objective opens the same focused assistance used for existing tasks, so
// there is one assistance path rather than one per surface.
(function () {
  'use strict';
  if (window.MobileGoalDiscovery) return;

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

  function mount(container) {
    if (!container || container.dataset.goalDiscoveryMounted === 'true') return;
    container.dataset.goalDiscoveryMounted = 'true';
    container.innerHTML = '<form class="mgd-goal-form" aria-label="What are you trying to accomplish?"><label class="sr-only" for="mgd-goal-input">What are you trying to accomplish?</label><input id="mgd-goal-input" name="goal" required maxlength="280" autocomplete="off" enterkeyhint="go" placeholder="e.g. Validate my business idea this week"><button type="submit">Get help</button></form>';
    container.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const input = event.target.querySelector('input[name="goal"]');
      const goal = input?.value.trim();
      if (!goal) return;
      window.CapabilityJourney?.emit('goal_entered', { surface: 'my_space' });
      input.blur();
      window.MobileTaskAssistance?.openObjective(goal);
    });
  }

  function init() { const target = document.getElementById('mgd-goal-discovery'); if (target) mount(target); }
  window.MobileGoalDiscovery = { init, mount, authorizedProjects };
  window.addEventListener('DOMContentLoaded', init, { once: true });
  window.addEventListener('profile-loaded', init, { once: true });
})();
