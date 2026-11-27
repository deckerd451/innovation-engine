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

  function relevantRecipes(intent) {
    if (typeof intent !== 'string' || /\b(?:no|not|never|avoid|without|don['’]t)\b/i.test(intent)) return [];
    return Object.entries(recipes).filter(([, recipe]) => recipe.topic.test(intent));
  }

  function propose(intent, ownSkills, candidates) {
    const relevant = relevantRecipes(intent);
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

  function mount(container, client, accountId, getProfile, onAvailability = () => {}) {
    const current = () => container.isConnected && root.HPOECollaborationPilot === true &&
      getProfile()?.user_id === accountId;
    const details = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = 'Collaboration settings';
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
    let enrolled = false;
    async function updateAvailability() {
      const result = await client.rpc('hpoe_status', { p_actor: accountId });
      if (!current() || result.error) return false;
      const state = result.data?.[0];
      eligible = state?.eligible === true;
      enrolled = state?.enrolled === true;
      details.hidden = !eligible && !enrolled;
      onAvailability(eligible && enrolled);
      label.textContent = state?.pending ? 'Review collaboration invitation' : 'Collaboration settings';
      return true;
    }
    const onFocus = () => {
      if (!current()) { root.removeEventListener('focus', onFocus); return; }
      updateAvailability().catch(() => {});
    };
    root.addEventListener('focus', onFocus);
    updateAvailability().catch(() => {});

    let busy = false;
    let pageOffset = 0;
    const pageSize = 20;

    function paragraph(text) {
      const element = document.createElement('p');
      element.textContent = text;
      content.append(element);
      return element;
    }

    function button(title, action, target = content, feedback = status) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'home-link';
      element.textContent = title;
      element.addEventListener('click', async () => {
        if (!current() || busy) return;
        busy = true;
        element.disabled = true;
        feedback.textContent = '';
        try {
          const auth = await client.auth.getUser();
          if (!current()) return;
          if (auth.error || auth.data?.user?.id !== accountId) throw Error('Account changed');
          await action();
        } catch {
          if (current()) feedback.textContent = 'Could not complete that action. Please try again.';
        } finally {
          busy = false;
          element.disabled = false;
        }
      });
      target.append(element);
      return element;
    }

    async function write(query, offset = pageOffset) {
      const result = await query;
      if (result.error) throw result.error;
      if (current()) {
        await updateAvailability();
        await refresh(offset);
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

    async function refresh(offset = pageOffset) {
      if (!current()) return;
      status.textContent = 'Checking collaboration options…';
      const opt = await client.from('hpoe_opt_in').select('user_id').eq('user_id', accountId).maybeSingle();
      if (!current()) return;
      if (opt.error) throw opt.error;
      content.replaceChildren();
      status.textContent = '';
      if (!opt.data) {
        pageOffset = 0;
        paragraph('Opt in to explore ideas with connections who also opt in. Your listed skills can help suggest a collaborator. Joining is optional and your draft stays in this tab. Leaving deletes shared collaboration records for both members.');
        if (eligible) button('Opt in to collaboration', () => write(client.from('hpoe_opt_in').insert({ user_id: accountId })));
        return;
      }
      const cases = await client.rpc('hpoe_my_collaborations', { p_actor: accountId, p_offset: offset });
      if (!current()) return;
      if (cases.error) throw cases.error;
      const rows = cases.data || [];
      if (!rows.length && offset > 0) return refresh(Math.max(0, offset - pageSize));
      pageOffset = offset;
      for (const row of rows.slice(0, pageSize)) renderCase(row);
      if (offset || rows.length > pageSize) {
        const controls = document.createElement('div');
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', 'Collaboration pages');
        content.append(controls);
        const go = async next => {
          await refresh(next);
          if (current()) {
            status.textContent = 'Collaboration page ' + (Math.floor(pageOffset / pageSize) + 1);
            label.focus();
          }
        };
        if (offset) button('Previous collaborations', () => go(offset - pageSize), controls);
        if (rows.length > pageSize) button('More collaborations', () => go(offset + pageSize), controls);
      }
      if (!eligible) {
        paragraph('New collaboration actions are paused for this account.');
        button('Leave collaboration pilot and delete my records', () =>
          write(client.from('hpoe_opt_in').delete().eq('user_id', accountId)));
        return;
      }
      paragraph('Use the prompt above to explore a community garden, coding workshop, or local resource guide.');
      button('Leave collaboration pilot and delete my records', () =>
        write(client.from('hpoe_opt_in').delete().eq('user_id', accountId)));
    }

    async function explore(idea, slot, stillCurrent, searchInstead) {
      const relevant = relevantRecipes(idea);
      if (relevant.length !== 1 || !current()) return false;
      if (!await updateAvailability() || !stillCurrent() || !eligible) return false;
      if (!enrolled) {
        if (!current()) return false;
        const note = document.createElement('p');
        note.className = 'home-muted';
        note.textContent = 'To explore this with connections, opt in under Collaboration settings. You can also search the community now.';
        slot.replaceChildren(note);
        button('Open collaboration settings', async () => {
          if (!details.open) details.open = true;
          await refresh();
          label.focus();
        }, slot);
        addSearchAlternative(slot, searchInstead);
        return true;
      }
      const result = await client.rpc('hpoe_candidates', { p_actor: accountId });
      if (!current() || !stillCurrent()) return true;
      if (result.error) return false;
      const match = propose(idea, getProfile()?.skills, result.data || []);
      const card = document.createElement('article');
      card.className = 'home-possibility';
      const copy = (tag, value, className = '') => {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = value;
        card.append(node);
        return node;
      };
      if (match) {
        copy('p', 'Collaboration proposal', 'home-possibility-label');
        copy('h3', match.recipe.title);
        copy('p', 'You list ' + match.ownMatch + '. ' + (match.peer.name || 'Your connection') +
          ' lists ' + match.peerMatch + '.');
        copy('p', match.recipe.missing, 'home-muted');
        copy('p', match.recipe.first);
        const feedback = document.createElement('p');
        feedback.className = 'home-muted';
        feedback.setAttribute('role', 'status');
        const invite = button('Invite ' + (match.peer.name || 'your connection') + ' to explore', async () => {
          if (!stillCurrent()) return;
          const sent = await client.rpc('hpoe_invite', {
            p_actor: accountId, p_profile_id: match.peer.profile_id, p_recipe: match.key
          });
          if (sent.error) throw sent.error;
          if (!current() || !stillCurrent()) return;
          card.replaceChildren();
          copy('p', 'Invitation sent. You can withdraw it in Collaboration settings.');
          const settingsButton = button('Open collaboration settings', async () => {
            details.open = true;
            await refresh(0);
            if (current()) label.focus();
          }, card);
          settingsButton.focus();
          await updateAvailability();
          if (details.open) await refresh(0);
        }, card, feedback);
        card.append(feedback);
        invite.className = 'home-action';
      } else {
        copy('h3', 'No collaboration match yet');
        copy('p', 'This idea needs two complementary skills listed by you and an opted-in connection. Search for existing people, projects, and opportunities below.');
      }
      addSearchAlternative(card, searchInstead);
      slot.replaceChildren(card);
      return true;
    }

    function addSearchAlternative(target, action) {
      const search = document.createElement('button');
      search.type = 'button';
      search.className = 'home-link';
      search.textContent = 'Search existing listings';
      search.addEventListener('click', action);
      target.append(search);
    }

    details.addEventListener('toggle', () => {
      if (!details.open || !current() || busy) return;
      busy = true;
      updateAvailability().then(() => refresh()).catch(() => {
        if (current()) status.textContent = 'Collaboration options are unavailable. Close and reopen to retry.';
      }).finally(() => { busy = false; });
    });
    return { explore };
  }

  const engine = Object.freeze({ propose, mount });
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else root.HPOECollaboration = engine;
})(globalThis);
