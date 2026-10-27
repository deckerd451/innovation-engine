#!/usr/bin/env node
// Deterministic source-level contracts for the first mobile redesign phase.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const index = read('index.html');
const nav = read('assets/js/mobile-nav.js');
const panel = read('assets/js/node-panel.js');
const memory = read('assets/js/capability-memory.js');
const tasks = read('assets/js/project-tasks.js');
const scroll = read('assets/css/mobile-project-scroll.css');
const journey = read('assets/js/capability-journey.js');

assert.match(index, /<nav id="app-nav"/);
for (const destination of ['home', 'explore', 'inbox', 'you']) {
  assert.match(index, new RegExp(`data-destination="${destination}"`), `missing destination ${destination}`);
}
// Network has no tab: it lives in You.
assert.doesNotMatch(index, /data-destination="network"/);
assert.match(nav, /explore: \(\) => setDiscoverMode\('explore'\)/);
assert.match(panel, /overlay\.id\s*=\s*['"]project-detail-overlay['"]/);
for (const tab of ['overview', 'tasks', 'capabilities', 'people', 'activity']) {
  assert.match(panel, new RegExp(`data-tab="${tab}"`), `missing project tab ${tab}`);
}
assert.match(panel, /pd-close-btn/);
assert.match(panel, /overlay\.remove\(\)/);
assert.match(tasks, /from\('project_tasks'\)/);
assert.match(memory, /permission_mode.*community/);
assert.match(memory, /ProjectTasks\.createTask/);
assert.match(memory, /CapabilityJourney\?\.emit\('outcome_recorded'/);
assert.match(scroll, /overflow-y:\s*auto\s*!important/);
assert.match(scroll, /--pd-bottom-nav-height/);
assert.match(journey, /goal_entered/);
assert.match(journey, /capability_selected/);
assert.match(journey, /tasks_imported/);
assert.match(journey, /outcome_recorded/);
assert.doesNotMatch(journey, /detail\s*:\s*\{[^}]*\b(goal|name|notes|cost|title)\b/);

console.log('mobile UX contracts, permissions, modal close, scrolling, and desktop boundary checks passed');
