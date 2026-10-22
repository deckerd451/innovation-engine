#!/usr/bin/env node

// Regression coverage for two Network Reflection "People Worth Knowing" bugs:
//
//  1. The current user could recommend themselves. `_buildPeopleWorthKnowing`
//     excluded self by comparing `person.id === userProfile.id`, but a
//     duplicate/legacy community row for the same human (same auth user_id,
//     different community id) has a different `id` and slipped through —
//     including through getRelationshipEvidence()'s own identical id-only
//     self-guard, which then generated real evidence (e.g. shared_skill)
//     against a profile identical to the user's own.
//
//  2. That same kind of duplicate community row could also cause a *third
//     party* to appear twice in the section (two candidates, one per row).
//
// This harness imports the real assets/js/intelligence/daily-brief-engine.js
// module and calls its actual _buildPeopleWorthKnowing implementation
// (exposed as __testBuildPeopleWorthKnowing for testing) rather than
// re-implementing the self-exclusion/dedupe logic here.

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');

global.window = {}; // no SynapseContext -> _buildPeopleWorthKnowing sees activeContext = null

function emptyMemberships() {
  return {
    userProjectIds: new Set(),
    projectMemberIds: new Map(),
    userOrgIds: new Set(),
    orgMemberIds: new Map(),
    connectedCommunityIds: new Set(),
    pendingCommunityIds: new Set(),
  };
}

(async () => {
  const engine = await import(pathToFileURL(path.join(root, 'assets/js/intelligence/daily-brief-engine.js')).href);
  assert.equal(typeof engine.__testBuildPeopleWorthKnowing, 'function',
    'daily-brief-engine.js must expose the People Worth Knowing test hook');

  const build = engine.__testBuildPeopleWorthKnowing;
  const baseArgs = { projects: [], organizations: [], memberships: emptyMemberships(), maxItems: 10 };

  // --- Self exclusion: a duplicate community row for the current user
  //     (same user_id, different id) must not recommend the user to themselves.
  {
    const userProfile = { id: 'canonical-me', user_id: 'auth-1', name: 'Ada Lovelace', skills: 'python,react', interests: 'ai' };
    const community = [
      userProfile,
      { id: 'legacy-dup-me', user_id: 'auth-1', name: 'Ada Lovelace (old)', skills: 'python,react', interests: 'ai' },
      { id: 'other-person', user_id: 'auth-2', name: 'Grace Hopper', skills: 'python', interests: 'ai' },
    ];
    const candidates = build({ userProfile, community, ...baseArgs });
    const ids = candidates.map(c => c.primary_refs[0].nodeId);
    assert.ok(!ids.includes('canonical-me'), 'The user\'s own canonical profile must never be recommended');
    assert.ok(!ids.includes('legacy-dup-me'), 'A duplicate profile row sharing the user\'s auth user_id must also be excluded');
    assert.ok(ids.includes('other-person'), 'A genuinely different person must remain eligible');
  }

  // --- Recommendation dedup: two community rows for the same third party
  //     (same user_id, different community id) must produce one card.
  {
    const userProfile = { id: 'canonical-me', user_id: 'auth-1', name: 'Ada Lovelace', skills: 'python,react', interests: 'ai' };
    const community = [
      userProfile,
      { id: 'descartes-row-a', user_id: 'auth-descartes', name: 'Descartes', skills: 'python,react', interests: 'ai' },
      { id: 'descartes-row-b', user_id: 'auth-descartes', name: 'Descartes', skills: 'python,react', interests: 'ai' },
    ];
    const candidates = build({ userProfile, community, ...baseArgs });
    const descartesCards = candidates.filter(c => c.headline === 'Descartes');
    assert.equal(descartesCards.length, 1, 'Duplicate rows for the same real person must collapse to one recommendation card');
  }

  // --- Distinct people who happen to share a name (different, unlinked
  //     ids, no shared user_id) must remain two separate candidates.
  {
    const userProfile = { id: 'canonical-me', user_id: 'auth-1', name: 'Ada Lovelace', skills: 'python,react', interests: 'ai' };
    const community = [
      userProfile,
      { id: 'namesake-a', user_id: 'auth-x', name: 'Descartes', skills: 'python,react', interests: 'ai' },
      { id: 'namesake-b', user_id: 'auth-y', name: 'Descartes', skills: 'python,react', interests: 'ai' },
    ];
    const candidates = build({ userProfile, community, ...baseArgs });
    const ids = candidates.filter(c => c.headline === 'Descartes').map(c => c.primary_refs[0].nodeId).sort();
    assert.deepEqual(ids, ['namesake-a', 'namesake-b'], 'Two distinct people sharing a name must not be merged');
  }

  // --- Community rows with no user_id (never linked to auth) fall back to
  //     id-based identity and are treated as distinct, eligible people.
  {
    const userProfile = { id: 'canonical-me', user_id: 'auth-1', name: 'Ada Lovelace', skills: 'python,react', interests: 'ai' };
    const community = [
      userProfile,
      { id: 'unlinked-person', user_id: null, name: 'Grace Hopper', skills: 'python,react', interests: 'ai' },
    ];
    const candidates = build({ userProfile, community, ...baseArgs });
    const ids = candidates.map(c => c.primary_refs[0].nodeId);
    assert.ok(ids.includes('unlinked-person'), 'A person with no auth user_id must still be eligible');
  }

  // --- Existing relationships: people the member already knows are never
  //     presented as new introductions.
  {
    const userProfile = { id: 'me', user_id: 'auth-me', name: 'Ada', skills: 'python,react', interests: 'ai' };
    const shared = { skills: 'python,react', interests: 'ai' };
    const memberships = emptyMemberships();
    memberships.connectedCommunityIds.add('connected');
    memberships.pendingCommunityIds.add('asked-by-me');
    memberships.pendingCommunityIds.add('asked-me');
    memberships.userProjectIds.add('proj-1');
    memberships.projectMemberIds.set('proj-1', new Set(['me', 'teammate-only', 'teammate-plus']));
    const community = [
      { id: 'me', user_id: 'auth-me', name: 'Ada', ...shared },
      { id: 'connected', user_id: 'auth-c', name: 'Connie', ...shared },
      { id: 'asked-by-me', user_id: 'auth-o', name: 'Otto', ...shared },
      { id: 'asked-me', user_id: 'auth-i', name: 'Ingrid', ...shared },
      { id: 'teammate-only', user_id: 'auth-t', name: 'Tom', skills: 'cooking', interests: 'gardening' },
      { id: 'teammate-plus', user_id: 'auth-p', name: 'Pat', ...shared },
      { id: 'newcomer', user_id: 'auth-n', name: 'Nia', skills: 'python', interests: '' },
    ];
    const projects = [{ id: 'proj-1', title: 'HarborHack' }];
    const candidates = build({ ...baseArgs, userProfile, community, memberships, projects });
    const byId = new Map(candidates.map(c => [c.primary_refs[0].nodeId, c]));
    assert.ok(!byId.has('asked-by-me'), 'someone the member already asked to connect is not suggested');
    assert.ok(!byId.has('asked-me'), 'someone who already asked to connect with the member is not suggested');
    assert.ok(!byId.has('teammate-only'), 'a teammate whose only evidence is the shared project is not suggested');
    assert.equal(byId.get('newcomer')?.relationship, null, 'a new person is a new introduction');
    assert.equal(byId.get('connected')?.relationship, 'connected', 'an existing connection is marked as one');
    assert.match(byId.get('connected').subhead, /^Already connected/);
    assert.equal(byId.get('teammate-plus')?.relationship, 'teammate', 'a teammate with more in common is marked as a teammate');
    assert.match(byId.get('teammate-plus').subhead, /^Already working together/);
    const order = candidates.map(c => c.primary_refs[0].nodeId);
    assert.ok(order.indexOf('newcomer') < order.indexOf('connected') && order.indexOf('newcomer') < order.indexOf('teammate-plus'),
      'new introductions come before people the member already knows, whatever their score');
  }

  // The brief loads pending requests in both directions for these checks.
  const engineSource = require('node:fs').readFileSync(path.join(root, 'assets/js/intelligence/daily-brief-engine.js'), 'utf8');
  assert.match(engineSource, /_safe\('pending_connections'[\s\S]{0,260}from_user_id\.eq\.\$\{communityId\},to_user_id\.eq\.\$\{communityId\}[\s\S]{0,40}\.eq\('status', 'pending'\)/);
  assert.match(engineSource, /pendingConnections: graph\.pendingConnections/);

  console.log('People Worth Knowing self-exclusion + dedup: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
