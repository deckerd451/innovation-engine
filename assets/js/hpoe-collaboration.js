// A small set of reviewable proposal templates. The member's input stays in
// the tab. Only a template ID and an explicitly chosen recipient are sent.
(function (root) {
  'use strict';

  const recipes = Object.freeze({
    garden: {
      topic: /\b(community garden|food garden|grow food)\b/i,
      title: 'Explore a small community garden',
      roles: [['gardening', 'horticulture', 'agriculture'], ['community organizing', 'project management', 'logistics']],
      roleLabels: ['Gardening', 'Project coordination'],
      resources: ['An approved site', 'Water access', 'Basic supplies'],
      steps: ['Sketch a one-bed trial and list what it would need.', 'Ask a gardener and a site representative to review the sketch.', 'Confirm permission, water, upkeep and any costs before planting.'],
      solo: 'Spend 10 minutes sketching one garden bed and writing down a question to ask a potential site owner.',
      prompt: 'community garden',
      searchResource: 'garden',
      missing: 'Confirm permission to use a site, access to water, and who would maintain it.',
      first: 'Agree on a 20-minute planning conversation. Sketch a one-bed trial and identify a site contact.'
    },
    workshop: {
      topic: /\b(coding workshop|coding class|coding mentorship|learn to code)\b/i,
      title: 'Explore a beginner coding session',
      roles: [['software development', 'programming', 'javascript', 'python'], ['teaching', 'facilitation', 'mentoring']],
      roleLabels: ['Coding', 'Teaching or facilitation'],
      resources: ['An accessible meeting format', 'A way to run one beginner exercise'],
      steps: ['Draft one exercise with a clear finish.', 'Ask a facilitator and a developer to try it.', 'Check learner interest and access to equipment before scheduling.'],
      solo: 'Write one thing a beginner should be able to do at the end of a 20-minute session.',
      prompt: 'coding workshop',
      searchResource: 'coding workshop',
      missing: 'Confirm the learners’ interests, an accessible meeting format, and any equipment needs.',
      first: 'Agree on one beginner exercise and try it together before inviting learners.'
    },
    'resource-guide': {
      topic: /\b(community resource guide|local resource guide|neighborhood resource guide)\b/i,
      title: 'Explore a neighborhood resource guide',
      roles: [['research', 'writing', 'editing'], ['community outreach', 'community organizing', 'translation']],
      roleLabels: ['Research or editing', 'Community outreach'],
      resources: ['One official resource listing', 'A way to contact its provider'],
      steps: ['Choose one topic and make a one-entry sample.', 'Ask someone who knows the neighborhood to review it.', 'Check eligibility and contact details with the provider before sharing it.'],
      solo: 'Write down one question the guide should answer and one detail you would need to verify.',
      prompt: 'local resource guide',
      searchResource: 'community resources',
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

  function starterPlan(idea, ownSkills, candidates = [], compose) {
    const relevant = relevantRecipes(idea);
    if (relevant.length !== 1) return null;
    const [key, recipe] = relevant[0];
    const own = skills(ownSkills);
    const peers = candidates.map(peer => skills(peer.skills));
    const coverage = recipe.roles.map((terms, i) => ({
      label: recipe.roleLabels[i],
      query: terms[0],
      own: terms.some(term => own.has(term)),
      connection: peers.some(peer => terms.some(term => peer.has(term)))
    }));
    const unresolved = coverage.filter(role => !role.own && !role.connection);
    // The optional composer receives only information already authorized for
    // this session. No site, contact, supplies or availability are inferred.
    const composition = compose?.({
      objective: {
        id: key, description: recipe.title, kind: 'project', shared: true,
        capabilityGaps: recipe.roleLabels, resources: recipe.resources
      },
      participants: [
        { id: 'self', shared: true, capabilities: coverage.filter(role => role.own).map(role => role.label) },
        ...candidates.map((peer, i) => ({
          id: peer.profile_id, shared: true,
          capabilities: recipe.roles.flatMap((terms, j) =>
            terms.some(term => peers[i].has(term)) ? [recipe.roleLabels[j]] : [])
        }))
      ],
      resources: []
    }, { enabled: true });
    return {
      key, recipe, coverage, unresolved,
      resources: composition?.missing.resources ?? recipe.resources,
      first: recipe.solo
    };
  }

  function mount(container, client, accountId, getProfile, onAvailability = () => {}, revisit = () => {}) {
    const current = () => container.isConnected && root.HPOECollaborationPilot === true &&
      getProfile()?.user_id === accountId;
    const savedKey = 'hpoe-starter:' + accountId;
    function savedIdea() {
      try {
        const key = root.localStorage.getItem(savedKey);
        return Object.hasOwn(recipes, key) ? key : null;
      } catch { return null; }
    }
    function saveIdea(key) {
      if (key) root.localStorage.setItem(savedKey, key);
      else root.localStorage.removeItem(savedKey);
    }
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
      label.textContent = state?.pending ? 'Review collaboration invitation'
        : eligible && savedIdea() ? 'Saved idea and collaboration settings' : 'Collaboration settings';
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
      const saved = eligible && savedIdea();
      if (saved) {
        button('Revisit: ' + recipes[saved].title, () => {
          details.open = false;
          revisit(recipes[saved].prompt);
        });
        button('Forget saved idea', async () => {
          saveIdea(null);
          await updateAvailability();
          await refresh();
          if (current()) label.focus();
        });
      }
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
        button('Leave collaboration pilot and delete my records', leave);
        return;
      }
      paragraph('Use the prompt above to explore a community garden, coding workshop, or local resource guide.');
      button('Leave collaboration pilot and delete my records', leave);
    }

    async function leave() {
      const result = await client.from('hpoe_opt_in').delete().eq('user_id', accountId);
      if (result.error) throw result.error;
      try { saveIdea(null); } catch { /* Withdrawal still took effect on the server. */ }
      await write(result);
    }

    async function explore(idea, slot, stillCurrent, searchInstead) {
      const relevant = relevantRecipes(idea);
      if (relevant.length !== 1 || !current()) return false;
      if (!await updateAvailability() || !stillCurrent() || !eligible) return false;
      const result = enrolled ? await client.rpc('hpoe_candidates', { p_actor: accountId }) : {};
      if (!current() || !stillCurrent()) return true;
      const candidates = result.error ? [] : (result.data || []);
      const match = propose(idea, getProfile()?.skills, candidates);
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
        const compose = enrolled && root.HPOECompositionalPilot === true
          ? root.HPOECompose?.compose : undefined;
        const plan = starterPlan(idea, getProfile()?.skills, candidates, compose);
        const feedback = copy('p', '', 'home-muted');
        feedback.setAttribute('role', 'status');
        renderStarter(card, copy, plan, stillCurrent, searchInstead, feedback);
      }
      if (match) addSearchAlternative(card, searchInstead);
      slot.replaceChildren(card);
      return true;
    }

    function renderStarter(card, copy, plan, stillCurrent, searchInstead, feedback) {
      const { recipe, coverage, unresolved, resources, first } = plan;
      copy('p', 'Starter plan', 'home-possibility-label');
      copy('h3', recipe.title);
      copy('p', 'Start with a small step you can take yourself. No collaborator or resource is confirmed.');
      copy('h4', 'First action');
      copy('p', first);
      const planDetails = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'See the plan and what’s needed';
      planDetails.append(summary);
      const needs = document.createElement('ul');
      for (const text of [
        ...coverage.map(role => role.label + ': ' + (role.own ? 'listed on your profile' :
          role.connection ? 'listed by an eligible connection, availability unknown' : 'still needed')),
        'Resources to verify: ' + resources.join(', ') + '.',
        ...recipe.steps
      ]) {
        const item = document.createElement('li');
        item.textContent = text;
        needs.append(item);
      }
      planDetails.append(needs);
      card.append(planDetails);
      for (const role of unresolved) {
        addSearchAlternative(planDetails, () => searchInstead(role.query), 'Find people with ' + role.label.toLowerCase() + ' skills');
      }
      addSearchAlternative(planDetails, () => searchInstead(recipe.searchResource), 'Find relevant organizations and opportunities');
      if (!enrolled) button('Open collaboration settings', async () => {
        details.open = true;
        await refresh();
        if (current()) label.focus();
      }, planDetails, feedback);
      const draft = button('Open editable project draft', () => {
        if (!stillCurrent() || typeof root.showEnhancedProjectCreation !== 'function') throw Error('Draft form unavailable');
        return root.showEnhancedProjectCreation({
          title: recipe.title,
          description: [
            'Proposed first action: ' + first,
            'Objective: ' + recipe.title,
            ...coverage.map(role => role.label + ': ' + (role.own ? 'listed on your profile' : role.connection ? 'listed by an eligible connection; availability unconfirmed' : 'still needed')),
            'Roles to confirm: ' + recipe.roleLabels.join(', '),
            'Resources to verify: ' + resources.join(', '),
            ...recipe.steps
          ].join('\n')
        });
      }, card, feedback);
      draft.className = 'home-action';
      button('Save idea for later', async () => {
        if (!stillCurrent()) return;
        saveIdea(plan.key);
        feedback.textContent = 'Saved in this browser. Revisit it under Collaboration settings.';
        await updateAvailability();
        if (current() && details.open) await refresh();
      }, card, feedback);
      card.append(feedback);
    }

    function addSearchAlternative(target, action, title = 'Search existing listings') {
      const search = document.createElement('button');
      search.type = 'button';
      search.className = 'home-link';
      search.textContent = title;
      search.addEventListener('click', () => action());
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

  const engine = Object.freeze({ propose, starterPlan, mount });
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else root.HPOECollaboration = engine;
})(globalThis);
