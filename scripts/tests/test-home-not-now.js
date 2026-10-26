#!/usr/bin/env node
'use strict';

// "Not now" on a way to join in sets it aside for the day across all of
// Home: it leaves Picked for you and never reappears in "Happening in the
// community" (start-daily-digest.js homeSuggestions), including after the
// page is opened again the same day. The community preview keeps leaving out
// what is picked and the member's own projects. Synthetic brief only.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8');
const ME = 'me';

// One page load: the real module in a sandbox, sharing `store` as localStorage.
function load(store) {
  const page = {
    console: { log() {}, info() {}, warn() {}, debug() {}, error() {} },
    setTimeout, clearTimeout, Promise, Date, JSON, Math, Map, Set,
    localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    document: { currentScript: null, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    currentUserProfile: { id: ME },
  };
  page.window = page;
  vm.createContext(page);
  vm.runInContext(source, page, { filename: 'start-daily-digest.js' });
  const item = (type, id, name, score) => ({ id: `${type}_${id}`, category: type, headline: name, score,
    invitation_reason: `Matches what you listed: ${name}`, primary_refs: [{ nodeType: type, nodeId: id, label: name }] });
  page.__brief = {
    user: { community_id: ME },
    sections: {
      people_worth_knowing: [],
      projects_for_you: [item('project', 'p-hcd', 'HCD Event', 0.9), item('project', 'p-flood', 'Flood map', 0.5)],
      opportunities_for_you: [item('opportunity', 'o-python', 'Python mentor', 0.8)],
    },
    community: {
      themes: [{ id: 't1', title: 'Civic tech', participantCount: 22 }],
      projects: [{ id: 'p-hcd', title: 'HCD Event', needs: [] }, { id: 'p-flood', title: 'Flood map', needs: [] }, { id: 'p-fridge', title: 'Community fridge', needs: [] }, { id: 'p-mine', title: 'My own', needs: [] }],
      opportunities: [{ id: 'o-python', title: 'Python mentor', organization: null, deadline: null }, { id: 'o-judge', title: 'Judge pitch night', organization: null, deadline: null }],
      skills: [],
    },
  };
  vm.runInContext('_lastDailyBrief = window.__brief', page);
  return page;
}

const view = (page) => {
  const home = JSON.parse(JSON.stringify(page.StartDailyDigest.homeSuggestions({ ownProjectIds: ['p-mine'] })));
  return { picks: home.joinIn.map(item => item.id), projects: home.community.projects.map(item => item.id), opportunities: home.community.opportunities.map(item => item.id) };
};

const store = new Map();
let page = load(store);
let home = view(page);
assert.deepEqual(home.picks, ['project:p-hcd', 'opportunity:o-python'], 'a project, then an opportunity');
assert.deepEqual(home.projects, ['p-flood', 'p-fridge'], 'the community leaves out what is picked and the member’s own project');
assert.deepEqual(home.opportunities, ['o-judge'], 'and the picked opportunity');

page.StartDailyDigest.setAsideSuggestion('opportunity:o-python');
page.StartDailyDigest.setAsideSuggestion('project:p-hcd');
home = view(page);
assert.ok(!home.picks.includes('opportunity:o-python') && !home.picks.includes('project:p-hcd'), 'Not now takes them out of Picked for you');
assert.ok(!home.opportunities.includes('o-python'), 'an opportunity set aside does not move into the community preview');
assert.ok(!home.projects.includes('p-hcd'), 'nor does a project set aside');
assert.deepEqual(home.picks, ['project:p-flood'], 'the next real invitation moves up');
assert.deepEqual(home.projects, ['p-fridge'], 'the community still leaves out the new pick and the member’s own project');
assert.deepEqual(home.opportunities, ['o-judge'], 'the rest of the community stays');

// Opened again the same day: still set aside everywhere.
page = load(store);
home = view(page);
assert.ok(!home.picks.includes('project:p-hcd') && !home.projects.includes('p-hcd') && !home.opportunities.includes('o-python'), 'set aside for the day, across page loads');

console.log('Home Not now: all checks passed');
