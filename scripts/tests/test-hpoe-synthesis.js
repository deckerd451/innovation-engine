#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { propose, starterPlan } = require('../../assets/js/hpoe-collaboration');

const garden = { profile_id: 'fixture-gardener', name: 'Synthetic gardener', skills: ['Gardening'] };
const duplicate = { profile_id: 'fixture-coordinator', name: 'Synthetic coordinator', skills: ['Project management'] };
const result = propose('Explore a community garden', ['Project management'], [duplicate, garden]);
assert.equal(result.peer, garden);
assert.equal(result.ownMatch, 'project management');
assert.equal(result.peerMatch, 'gardening');
const aliasMatch = propose('community garden', ['Project management'], [{ profile_id: 'horticulturist', skills: ['Horticulture'] }]);
assert.equal(aliasMatch.peerMatch, 'horticulture', 'related capability language matches while preserving listed evidence');
assert.match(result.recipe.missing, /Confirm permission/);
assert.match(result.recipe.first, /one-bed trial/);

// Replay the same synthetic evidence through the current Home keyword finder.
const page = { addEventListener() {}, document: { addEventListener() {} } };
page.window = page;
vm.runInNewContext(fs.readFileSync('assets/js/home-view.js', 'utf8'), page);
const baseline = page.HomeViewTesting.matchIdea({
  idea: 'Explore a community garden',
  people: [{ ...garden, id: garden.profile_id, name: 'Synthetic B' }],
  connected: new Set([garden.profile_id])
});
assert.equal(baseline.projects.length + baseline.opportunities.length, 0);
const allCategories = { people: [{id:'p'}], projects: [{id:'x'}], skills: ['garden'], organizations: [{id:'o'}], opportunities: [{id:'e'}] };
assert.deepEqual(JSON.parse(JSON.stringify(page.HomeViewTesting.focusIdeaResults(allCategories, 'people'))),
  { people: allCategories.people, projects: [], skills: [], organizations: [], opportunities: [] },
  'targeted people discovery excludes unrelated result types');
assert.deepEqual(JSON.parse(JSON.stringify(page.HomeViewTesting.focusIdeaResults(allCategories, 'resources'))),
  { people: [], projects: [], skills: [], organizations: allCategories.organizations, opportunities: allCategories.opportunities },
  'targeted organization/resource discovery excludes unrelated result types');
assert.equal(result.key, 'garden');
assert.equal(propose('Learn to code', ['Teaching'], [{skills: ['Python']}]).key, 'workshop');
assert.equal(propose('Make a local resource guide', ['Editing'], [{skills: ['Translation']}]).key, 'resource-guide');
for (const input of ['Find a garden', 'I do not want a community garden', 'coding workshop or community garden', null]) {
  assert.equal(propose(input, ['Project management'], [garden]), null);
}
assert.equal(propose('Community garden', [], [garden]), null);
assert.equal(propose('Community garden', ['Project management'], [duplicate, {skills: ['landscaping']}]), null);
assert.equal(propose('Community garden', ['Project management', 'gardening'], [garden]), null);

// Worst-position successful candidate in the server's bounded result.
const candidates = [...Array(49).fill(duplicate), garden];
const time = performance.now();
for (let i = 0; i < 1000; i++) assert.equal(propose('Community garden', ['Project management'], candidates).peer, garden);
console.log('HPOE synthesis and abstention checks passed. 1,000 bounded runs: ' + Math.round(performance.now() - time) + ' ms');

const zero = starterPlan('community garden', [], []);
assert.equal(zero.unresolved.length, 2);
assert.equal(zero.first, zero.recipe.solo);
assert.match(zero.first, /sketching/);
assert.equal(zero.resources.length, 3);
const some = starterPlan('community garden', ['Project management'], []);
assert.deepEqual(some.unresolved.map(role => role.label), ['Gardening']);
assert.equal(some.coverage[1].own, true);
const compose = require('../../assets/js/hpoe-compose').compose;
const all = starterPlan('community garden', ['Project management'], [garden], compose);
assert.equal(all.unresolved.length, 0);
assert.equal(all.coverage[0].connection, true);
assert.equal(all.resources.length, 3, 'skill coverage does not establish resource availability');
assert.equal(starterPlan('community garden', ['urban agriculture'], [{ skills: ['horticulture'] }]).coverage[0].connection, true,
  'related capability language contributes to coverage');
assert.equal(starterPlan('Find a garden', [], []), null);
for (const idea of ['coding workshop', 'local resource guide']) {
  const plan = starterPlan(idea, [], []);
  assert.ok(plan.first && plan.recipe.steps.length >= 2 && plan.resources.length);
}
console.log('Starter plans work with zero, partial and full capability coverage');

const externalResources = require('../../assets/js/hpoe-collaboration').externalResources;
const now = Date.parse('2026-11-27T12:00:00.000Z');
const resourceBase = {
  title: 'Gather & Garden', organization: 'Charleston Parks Conservancy',
  sourceUrl: 'https://www.charlestonparksconservancy.org/volunteer/',
  status: 'published', availability: 'provider confirmation required',
  geographicRelevance: 'charleston-sc', eligibility: 'adult_public', participationType: 'contribution', pathwayId: 'gather-and-garden',
  reviewedAt: '2026-11-27T11:00:00.000Z', deadline: '2026-12-04T12:00:00.000Z', topics: ['garden']
};
assert.equal(externalResources({ searchResource: 'garden' }, [resourceBase], now).length, 1);
assert.equal(externalResources({ searchResource: 'garden' }, [{ ...resourceBase, sourceUrl: 'http://not-secure.example' }], now).length, 0);
assert.equal(externalResources({ searchResource: 'garden' }, [{ ...resourceBase, reviewedAt: '2026-11-18T11:00:00.000Z' }], now).length, 0);
assert.equal(externalResources({ searchResource: 'garden' }, [{ ...resourceBase, topics: ['animals'] }], now).length, 0);
assert.equal(externalResources({ searchResource: 'garden' }, [{ ...resourceBase, geographicRelevance: 'elsewhere' }], now).length, 0);
console.log('Reviewed external resources require recent review, a live HTTPS source and a matching topic');

const projectCreation = fs.readFileSync('assets/js/enhanced-project-creation.js', 'utf8');
assert.match(projectCreation, /modal\.querySelector\('#template-selection-step'\)\?\.remove\(\)/, 'a prefilled idea cannot be routed back to unrelated templates');
assert.match(projectCreation, /required_skills: skills/, 'project creation persists the member-selected capabilities');
const homeSource = fs.readFileSync('assets/js/home-view.js', 'utf8');
assert.match(homeSource, /typeof document !== 'undefined'\) document\.addEventListener\?\.\('project-created'/, 'Home listens to the project creator event and reloads its ongoing list');
console.log('Prefilled drafts stay on their idea and created projects rejoin Home continuity');
