#!/usr/bin/env node
'use strict';

// People discovery recognizes a small, explicit set of equivalent terms
// (HCD and human-centered design, UX and user experience, ...) when it looks
// for a shared skill or interest. Synthetic profiles only:
//  1. getRelationshipEvidence (relationship-evidence.js): listed equivalents
//     match and are shown in the member's own wording; related-but-different
//     terms, partial words and unlisted spellings do not; a term listed twice
//     under two spellings counts once; exact matches still work
//  2. Home's people builder (_buildPeopleWorthKnowing in
//     daily-brief-engine.js) now suggests a stranger who lists an equivalent,
//     and every exclusion stays: self (including a duplicate row), pending
//     requests either way, existing connections (marked, never a new
//     introduction), teammates with nothing else in common, and people an
//     admin hid from discovery (the community query still filters them)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
global.window = {};

const person = (id, extra = {}) => ({ id, user_id: `auth-${id}`, name: id, skills: [], interests: [], ...extra });

(async () => {
  const { getRelationshipEvidence } = await import(pathToFileURL(path.join(root, 'assets/js/relationship-evidence.js')).href);
  const engine = await import(pathToFileURL(path.join(root, 'assets/js/intelligence/daily-brief-engine.js')).href);

  // --- 1. Evidence ---------------------------------------------------------
  {
    const shared = (me, them, category) => (getRelationshipEvidence({ currentUserProfile: person('me', me), personProfile: person('them', them) }).reasons
      .find(reason => reason.category === category) || {}).detail || null;

    assert.equal(shared({ interests: ['Human-centered design'] }, { interests: ['HCD'] }, 'shared_theme'), 'Human-Centered Design',
      'HCD and human-centered design are the same interest, shown in the member’s wording');
    assert.equal(shared({ interests: ['HCD'] }, { interests: ['Human centred design'] }, 'shared_theme'), 'HCD');
    assert.equal(shared({ skills: ['JavaScript'] }, { skills: ['JS'] }, 'shared_skill'), 'Javascript');
    assert.equal(shared({ skills: ['User experience'] }, { skills: ['UX design'] }, 'shared_skill'), 'User Experience');
    assert.equal(shared({ interests: ['Civic technology'] }, { interests: ['civic tech'] }, 'shared_theme'), 'Civic Technology');
    assert.equal(shared({ skills: ['Python'] }, { skills: ['python'] }, 'shared_skill'), 'Python', 'exact matches still work');

    // Nothing is inferred beyond the list.
    assert.equal(shared({ skills: ['UX'] }, { skills: ['HCD'] }, 'shared_skill'), null, 'UX and HCD are related, not equal');
    assert.equal(shared({ skills: ['UI design'] }, { skills: ['UX design'] }, 'shared_skill'), null, 'UI and UX stay apart');
    assert.equal(shared({ interests: ['Design'] }, { interests: ['Human-centered design'] }, 'shared_theme'), null, 'a partial word is not a match');
    assert.equal(shared({ interests: ['Human centered designs'] }, { interests: ['HCD'] }, 'shared_theme'), null, 'an unlisted spelling is not a match');
    assert.equal(shared({ skills: ['Python'] }, { interests: ['Python'] }, 'shared_skill'), null, 'skills match skills only');

    assert.equal(shared({ interests: ['HCD', 'Human-centered design'] }, { interests: ['human centered design'] }, 'shared_theme'), 'HCD',
      'one interest listed under two spellings counts once');
  }

  // --- 2. Who Home suggests ------------------------------------------------
  {
    const me = person('me', { interests: ['Human-centered design'] });
    const memberships = engine.__testBuildMembershipMaps({
      communityId: 'me',
      connections: [{ from_user_id: 'me', to_user_id: 'friend', status: 'accepted' }],
      pendingConnections: [{ from_user_id: 'asker', to_user_id: 'me', status: 'pending' }, { from_user_id: 'me', to_user_id: 'asked', status: 'pending' }],
      projectMembers: [{ project_id: 'p1', user_id: 'me', role: 'member' }, { project_id: 'p1', user_id: 'mate', role: 'member' }],
      orgMembers: [],
      themeParticipants: [],
    });
    const community = [
      me,
      person('me-duplicate', { user_id: 'auth-me', interests: ['HCD'] }), // a legacy row for the member
      person('stranger', { interests: ['HCD'] }),
      person('friend', { interests: ['HCD'] }),
      person('asker', { interests: ['HCD'] }),
      person('asked', { interests: ['HCD'] }),
      person('mate'),
      person('unrelated', { interests: ['UX'] }),
    ];
    const items = engine.__testBuildPeopleWorthKnowing({ userProfile: me, community, projects: [{ id: 'p1', title: 'Shared project' }], organizations: [], memberships, nearifyEventPresence: [], maxItems: 10 });
    const byId = new Map(items.map(item => [item.primary_refs[0].nodeId, item]));
    const fresh = items.filter(item => !item.relationship).map(item => item.primary_refs[0].nodeId);

    assert.deepEqual(fresh, ['stranger'], 'the stranger who lists HCD is the one new introduction');
    assert.equal(byId.get('stranger').subhead, 'Human-Centered Design', 'the reason uses the member’s wording');
    assert.equal(byId.get('friend')?.relationship, 'connected', 'an existing connection is marked, never a new introduction');
    for (const id of ['me-duplicate', 'asker', 'asked', 'mate', 'unrelated']) {
      assert.ok(!byId.has(id), `not suggested: ${id}`);
    }

    const engineSource = fs.readFileSync(path.join(root, 'assets/js/intelligence/daily-brief-engine.js'), 'utf8');
    assert.match(engineSource, /\.from\('community'\)\s*\.select\([^)]*\)\s*\.or\('is_hidden\.is\.null,is_hidden\.eq\.false'\)/,
      'people hidden from discovery are still left out of the community the brief reads');
  }

  console.log('Equivalent terms in people matching: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
