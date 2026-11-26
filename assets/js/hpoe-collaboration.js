// A small set of reviewable proposal templates. The member's input stays in
// the tab. Only a template ID and an explicitly chosen recipient are sent.
(function (root) {
  'use strict';

  const recipes = Object.freeze({
    garden: {
      topic: /\b(community garden|food garden|grow food)\b/i,
      title: 'Explore a small community garden',
      roles: [['gardening', 'horticulture', 'agriculture'], ['community organizing', 'project management', 'logistics']],
      missing: 'Confirm permission to use a site, access to water, and who would maintain it.',
      first: 'Agree on a 20-minute planning conversation. Sketch a one-bed trial and identify a site contact.'
    },
    workshop: {
      topic: /\b(coding workshop|coding class|coding mentorship|learn to code)\b/i,
      title: 'Explore a beginner coding session',
      roles: [['software development', 'programming', 'javascript', 'python'], ['teaching', 'facilitation', 'mentoring']],
      missing: 'Confirm the learners’ interests, an accessible meeting format, and any equipment needs.',
      first: 'Agree on one beginner exercise and try it together before inviting learners.'
    },
    'resource-guide': {
      topic: /\b(community resource guide|local resource guide|neighborhood resource guide)\b/i,
      title: 'Explore a neighborhood resource guide',
      roles: [['research', 'writing', 'editing'], ['community outreach', 'community organizing', 'translation']],
      missing: 'Confirm which organizations want to participate and who would keep information current.',
      first: 'Pick one public resource and check its contact and eligibility information with the provider.'
    }
  });

  function skills(value) {
    const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : [];
    return new Set(entries.filter(entry => typeof entry === 'string').map(entry => entry.trim().toLowerCase()));
  }

  function propose(intent, ownSkills, candidates) {
    if (typeof intent !== 'string' || /\b(?:no|not|never|avoid|without|don['’]t)\b/i.test(intent)) return null;
    const relevant = Object.entries(recipes).filter(([, recipe]) => recipe.topic.test(intent));
    if (relevant.length !== 1) return null;
    const own = skills(ownSkills);
    for (const [key, recipe] of relevant) {
      for (const peer of candidates) {
        const theirSkills = skills(peer.skills);
        for (const [ours, theirs] of [recipe.roles, [...recipe.roles].reverse()]) {
          const ownMatch = ours.find(skill => own.has(skill));
          const peerMatch = theirs.find(skill => theirSkills.has(skill) && !own.has(skill));
          if (ownMatch && peerMatch) return { key, recipe, peer, ownMatch, peerMatch };
        }
      }
    }
    return null;
  }

  function mount(container, client, accountId, getProfile) {
    const current = () => container.isConnected && root.HPOECollaborationPilot === true &&
      getProfile()?.user_id === accountId;
    const details = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = 'Explore a collaboration (optional)';
    const body = document.createElement('div');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const content = document.createElement('div');
    const support = document.createElement('a');
    support.href = 'https://www.tuw.org/211';
    support.target = '_blank';
    support.rel = 'noopener noreferrer';
    support.className = 'home-link';
    support.textContent = 'Find local support through 211 (new tab)';
    body.append(status, content, support);
    details.className = 'home-collaboration';
    details.append(label, body);
    details.hidden = true;
    container.append(details);
    let eligible = false;
    async function updateAvailability() {
      const result = await client.rpc('hpoe_status', { p_actor: accountId });
      if (!current() || result.error) return;
      const state = result.data?.[0];
      eligible = state?.eligible === true;
      details.hidden = !eligible && state?.enrolled !== true;
      label.textContent = state?.pending ? 'Review collaboration invitation' : 'Explore a collaboration (optional)';
    }
    const onFocus = () => {
      if (!current()) { root.removeEventListener('focus', onFocus); return; }
      updateAvailability().catch(() => {});
    };
    root.addEventListener('focus', onFocus);
    updateAvailability().catch(() => {});

    let busy = false;

    function paragraph(text) {
      const element = document.createElement('p');
      element.textContent = text;
      content.append(element);
      return element;
    }

    function button(title, action, target = content) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'home-link';
      element.textContent = title;
      element.addEventListener('click', async () => {
        if (!current() || busy) return;
        busy = true;
        element.disabled = true;
        status.textContent = '';
        try {
          const auth = await client.auth.getUser();
          if (!current()) return;
          if (auth.error || auth.data?.user?.id !== accountId) throw Error('Account changed');
          await action();
        } catch {
          if (current()) status.textContent = 'Could not complete that action. Please try again.';
        } finally {
          busy = false;
          element.disabled = false;
        }
      });
      target.append(element);
      return element;
    }

    async function write(query) {
      const result = await query;
      if (result.error) throw result.error;
      if (current()) {
        await updateAvailability();
        await refresh();
        if (current() && !details.hidden) label.focus();
      }
    }

    function renderCase(row) {
      const recipe = recipes[row.recipe];
      if (!recipe) return;
      const { incoming, jointly_confirmed: settled, own_confirmed: ownConfirmed } = row;
      const heading = document.createElement('h3');
      heading.className = 'home-subheading';
      heading.textContent = recipe.title;
      content.append(heading);
      const advance = action => write(client.rpc('hpoe_advance', { p_actor: accountId, p_id: row.id, p_action: action }));
      if (row.phase === 'invited') {
        paragraph(incoming ? 'A connection invited you to explore this idea. Accepting shares your interest and opens the option to contact the other member. You can leave at any time.' : 'Invitation sent. You can withdraw it while you wait.');
        if (incoming) {
          if (eligible) button('Accept invitation', () => advance('accept'));
          button('Decline', () => advance('decline'));
        }
      }
      if (row.phase === 'accepted' || row.phase === 'started') {
        paragraph('Both members agreed to explore this objective.');
        paragraph(recipe.missing);
        paragraph(recipe.first);
        if (row.peer_profile_id) button('Open your conversation', () => {
          if (typeof root.openMessageForUser !== 'function') throw Error('Messaging unavailable');
          return root.openMessageForUser(row.peer_profile_id);
        });
        if (eligible && row.phase === 'accepted') button('Record that we started', () => advance('start'));
        else if (eligible && row.phase === 'started' && !settled && !ownConfirmed) button('Confirm we completed the first action', () => advance('confirm'));
        else if (ownConfirmed) paragraph(settled ? 'Both members confirmed the first action.' : 'You confirmed the first action.');
        if (eligible && row.peer_profile_id && row.phase === 'started') {
          button('Open project creation', () => {
            if (typeof root.showEnhancedProjectCreation !== 'function') throw Error('Project creation unavailable');
            return root.showEnhancedProjectCreation({
              title: recipe.title,
              description: 'Proposed first action: ' + recipe.first + '\n' + recipe.missing
            });
          });
        }
      }
      if (row.phase === 'declined') paragraph('The invitation was declined.');
      button('Remove for both members', () => advance('remove'));
    }

    async function refresh() {
      if (!current()) return;
      status.textContent = 'Checking collaboration options…';
      const opt = await client.from('hpoe_opt_in').select('user_id').eq('user_id', accountId).maybeSingle();
      if (!current()) return;
      if (opt.error) throw opt.error;
      content.replaceChildren();
      status.textContent = '';
      if (!opt.data) {
        paragraph('Opt in to explore ideas with connections who also opt in. Your listed skills can help suggest a collaborator. Joining is optional and your draft stays in this tab. Leaving deletes shared collaboration records for both members.');
        if (eligible) button('Opt in to collaboration', () => write(client.from('hpoe_opt_in').insert({ user_id: accountId })));
        return;
      }
      const cases = await client.rpc('hpoe_my_collaborations', { p_actor: accountId });
      if (!current()) return;
      if (cases.error) throw cases.error;
      for (const row of cases.data || []) renderCase(row);
      if (!eligible) {
        paragraph('New collaboration actions are paused for this account.');
        button('Leave collaboration pilot and delete my records', () =>
          write(client.from('hpoe_opt_in').delete().eq('user_id', accountId)));
        return;
      }
      const field = document.createElement('input');
      field.maxLength = 160;
      const fieldLabel = document.createElement('label');
      fieldLabel.textContent = 'What would you like to explore? ';
      fieldLabel.append(field);
      paragraph('Try a community garden, coding workshop, or local resource guide.');
      content.append(fieldLabel);
      const proposal = document.createElement('div');
      proposal.setAttribute('aria-live', 'polite');
      field.addEventListener('input', () => proposal.replaceChildren());
      button('Explore idea', async () => {
        const intent = field.value.trim();
        if (!intent) { status.textContent = 'Enter an idea first.'; return; }
        const result = await client.rpc('hpoe_candidates', { p_actor: accountId });
        if (!current() || field.value.trim() !== intent) return;
        if (result.error) throw result.error;
        proposal.replaceChildren();
        const match = propose(intent, getProfile()?.skills, result.data || []);
        const message = document.createElement('p');
        if (!match) {
          message.textContent = 'No complementary match was found for this idea.';
          proposal.append(message);
          return;
        }
        message.textContent = 'Proposal: ' + match.recipe.title + '. You list ' + match.ownMatch +
          '; ' + match.peer.name + ' lists ' + match.peerMatch + '. ' + match.recipe.missing;
        proposal.append(message);
        button('Invite ' + match.peer.name + ' to explore', () =>
          write(client.rpc('hpoe_invite', {
            p_actor: accountId, p_profile_id: match.peer.profile_id, p_recipe: match.key
          })), proposal);
      });
      content.append(proposal);
      button('Leave collaboration pilot and delete my records', () =>
        write(client.from('hpoe_opt_in').delete().eq('user_id', accountId)));
    }

    details.addEventListener('toggle', () => {
      if (!details.open || !current() || busy) return;
      busy = true;
      updateAvailability().then(refresh).catch(() => {
        if (current()) status.textContent = 'Collaboration options are unavailable. Close and reopen to retry.';
      }).finally(() => { busy = false; });
    });
  }

  const engine = Object.freeze({ propose, mount });
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else root.HPOECollaboration = engine;
})(globalThis);
