#!/usr/bin/env node
'use strict';

// Home's "Have an idea?" (home-view.js matchIdea): an idea's words matched
// against what members list and what projects describe, under Explore's
// rules. Offline, synthetic rows only:
//  - never the member (or a second row of theirs), never anyone hidden
//  - anyone not connected is "First L." and matched only on the first three
//    skills their limited profile shows, never on interests
//  - connections (and admins) match on every skill and interest, by name
//  - a project matches on a needed skill, or on the idea's words in its
//    title and description (at least two when the idea has two or more);
//    finished or archived projects never
//  - each match carries the words it matched on; no words, no matches
// The rendered journey is scripts/tests/browser/run-home-idea.mjs.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const page = { addEventListener() {}, setTimeout, console, Promise, Date, Map, Set, Number, String, document: { body: { dataset: {} } } };
page.window = page;
vm.createContext(page);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/assistance-interventions.js'), 'utf8'), page);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/home-view.js'), 'utf8'), page);
const { matchIdea } = page.HomeViewTesting;
const plain = (value) => JSON.parse(JSON.stringify(value));

const people = [
  { id: 'me', user_id: 'auth-me', name: 'Test Member', skills: ['GIS'] },
  { id: 'me-2', user_id: 'auth-me', name: 'Test Member', skills: ['GIS'] },
  { id: 'ana', user_id: 'auth-ana', name: 'Ana Lopez', skills: ['GIS', 'Python'] },
  { id: 'ana-2', user_id: 'auth-ana', name: 'Ana Lopez', skills: ['GIS'] },
  { id: 'bo', user_id: 'auth-bo', name: 'Bo Chen', skills: ['Design', 'Writing', 'Video', 'GIS'], interests: ['Flood mapping'] },
  { id: 'dana', user_id: 'auth-dana', name: 'Dana Ruiz', skills: ['Design', 'Writing', 'Video', 'GIS'], interests: ['Flood mapping'] },
  { id: 'quinn', user_id: 'auth-quinn', name: 'Quinn Hidden', skills: ['GIS'], is_hidden: true },
];
const projects = [
  { id: 'p-flood', title: 'Flood map for West Ashley', description: 'Mapping which streets flood at high tide', required_skills: ['GIS', 'Python'], status: 'recruiting' },
  { id: 'p-old', title: 'Old flood map', description: 'GIS archive', required_skills: ['GIS'], status: 'archived' },
  { id: 'p-done', title: 'Finished GIS survey', required_skills: ['GIS'], status: 'completed' },
  { id: 'p-garden', title: 'Community garden', description: 'Planting beds near the flood wall', required_skills: ['Gardening'], status: 'open' },
];
const base = { me: 'me', myAuth: 'auth-me', connected: new Set(['dana']), people, projects };

let r = plain(matchIdea({ ...base, idea: 'A GIS map of flooding streets' }));
assert.deepEqual(r.terms, ['gis', 'map', 'flooding', 'street'], 'the idea’s distinctive words');
assert.deepEqual(r.people.map(p => [p.name, p.reason]), [
  ['Ana L.', 'Lists GIS'],
  ['Dana Ruiz', 'Lists GIS'],
], 'a stranger as "First L.", a connection by name (alphabetical, no ranking); never the member, a second row, someone hidden, or a stranger’s fourth skill');
assert.ok(!r.people.some(p => p.name.startsWith('Bo')), 'Bo lists GIS fourth and flood mapping as an interest: neither shows on a limited profile');
assert.equal(r.people.find(p => p.name === 'Dana Ruiz').connected, true);
assert.deepEqual(r.projects.map(p => [p.title, p.reason]), [['Flood map for West Ashley', 'Needs GIS']], 'a project that needs it; never archived or finished ones');

r = plain(matchIdea({ ...base, idea: 'Flood mapping volunteers' }));
assert.deepEqual(r.people.map(p => [p.name, p.reason]), [['Dana Ruiz', 'Interested in Flood mapping']], 'a connection’s interests count; a stranger’s never do');
assert.deepEqual(r.projects.map(p => p.id), ['p-flood'], 'two of the idea’s words in a project’s description');
assert.ok(!r.projects.some(p => p.id === 'p-garden'), 'one shared word (flood) is not enough');

r = plain(matchIdea({ ...base, idea: 'Flood mapping volunteers', isAdmin: true }));
assert.ok(r.people.some(p => p.name === 'Bo Chen' && /Flood mapping/.test(p.reason)), 'an administrator sees full profiles, as elsewhere');

r = plain(matchIdea({ ...base, idea: 'help me with this' }));
assert.deepEqual([r.terms, r.people, r.projects], [[], [], []], 'no distinctive words, no matches (nothing invented)');
r = plain(matchIdea({ ...base, idea: 'Underwater basket weaving' }));
assert.deepEqual([r.people, r.projects], [[], []], 'nothing mentions it: nothing matched');

console.log('Home idea matching: all checks passed');
