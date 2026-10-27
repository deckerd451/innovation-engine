#!/usr/bin/env node
'use strict';

// Opening and returning to a project (node-panel.js viewProjectDetails,
// project-tasks.js). Offline guards for:
//  - task assistance's working notes (the "Buildspace working notes" block
//    with its JSON state line) never show in a task's description, and
//    saving an edit keeps them exactly as stored; text without them is
//    untouched
//  - the task list puts work first: in progress, then to do, with finished
//    work folded away; each task is one compact row that opens its details
//  - Overview gives members one next step from their real tasks, with Home's
//    own rule, and gives anyone else the way to join; nothing invented
//  - task permissions and the join and leave paths are unchanged
// The rendered journeys (iPhone and desktop, synthetic data) are
// scripts/tests/browser/run-project-entry.mjs.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tasksSource = read('assets/js/project-tasks.js');
const panel = read('assets/js/node-panel.js');

const page = { console: { log() {}, warn() {}, error() {} }, document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } } };
page.window = page;
vm.createContext(page);
vm.runInContext(tasksSource, page, { filename: 'project-tasks.js' });
const { visibleDescription, withWorkingNotes } = page.ProjectTasks;

// The block exactly as assistance-interventions.js writeNotes produces it.
const engine = read('assets/js/assistance-interventions.js');
assert.match(engine, /const START = '── Buildspace working notes ──';/);
assert.match(engine, /const END = '── end of working notes ──';/);
const notes = '── Buildspace working notes ──\nWorking on: Compare options\noption: Dana (7 pts)\nstate: {"step":"compare"}\n── end of working notes ──';
const stored = `Pick two speakers for the opening.\nProgress · 2026-10-20 · Took this step (member-reported): Asked Dana\n\n${notes}`;

assert.equal(visibleDescription(stored), 'Pick two speakers for the opening.\nProgress · 2026-10-20 · Took this step (member-reported): Asked Dana',
  'the description members read leaves out the working notes, and keeps their own words and reports');
assert.doesNotMatch(visibleDescription(stored), /state:|working notes|\{"step"/);
assert.equal(visibleDescription(notes), '', 'notes alone show as no description');
assert.equal(visibleDescription('Plain description'), 'Plain description', 'a description without notes is shown as written');
assert.equal(visibleDescription(null), '');

assert.equal(withWorkingNotes(visibleDescription(stored), stored), stored, 'saving without changes stores exactly what was there');
assert.equal(withWorkingNotes('Pick three speakers.', stored), `Pick three speakers.\n\n${notes}`, 'an edit keeps the working notes as stored');
assert.equal(withWorkingNotes('', stored), notes, 'clearing the visible text still keeps the notes');
assert.equal(withWorkingNotes('New text', 'Old text'), 'New text', 'no notes, nothing added');
assert.match(tasksSource, /fields\.description = withWorkingNotes\(fields\.description, task\.description\);/, 'the editor restores the notes on save');
assert.match(tasksSource, /data-field="description" placeholder="Description \(optional\)" rows="2">\$\{escapeHtml\(visibleDescription\(t\.description\)\)\}/, 'the editor shows only the readable text');
assert.match(tasksSource, /const hay = `\$\{t\.title\} \$\{visibleDescription\(t\.description\)\}`/, 'search matches what members can read');

// Work first; finished work folded; compact rows that open.
assert.match(tasksSource, /group\('In progress', inProgress\),\s*group\('To do', open\),/);
assert.match(tasksSource, /<details class="pt-done" \$\{showDone \? 'open' : ''\}>/);
assert.match(tasksSource, /class="pt-row" data-action="toggle" aria-expanded="\$\{expanded \? 'true' : 'false'\}" aria-controls="\$\{detailId\}"/);
assert.match(tasksSource, /<div class="pt-detail" id="\$\{detailId\}" \$\{expanded \? '' : 'hidden'\}>/);
// Every action is still there, behind the row, with the same permissions.
assert.match(tasksSource, /const actionsHTML = canEdit \?/);
assert.match(tasksSource, /data-action="status"/);
assert.match(tasksSource, /data-action="edit"/);
assert.match(tasksSource, /\$\{canDelete \? `<button type="button" class="pt-text-btn pt-danger" data-action="delete"/);
assert.match(tasksSource, /if \(statusBtn && canEdit\)/);
assert.match(tasksSource, /\[data-action="delete"\]'\) && canDelete/);
assert.match(panel, /canDelete: rel\.isCreator,/);
assert.match(panel, /const canViewTasks = rel\.isCreator \|\| rel\.state === 'member';/);

// Overview: one next step for members, from real tasks; joining for others.
assert.match(panel, /<section class="pd-next" id="pd-next" aria-live="polite" \$\{canViewTasks \? 'hidden' : ''\}>/);
assert.match(panel, /if \(typeof window\.HomeView\?\.chooseNextTask === 'function'\) return window\.HomeView\.chooseNextTask\(open\);/, 'the same rule as Home’s Next');
assert.match(read('assets/js/home-view.js'), /window\.HomeView = \{ show, clear, focusGoal, chooseNextTask \};/);
assert.match(panel, /const progress = all\.length \? `\$\{done\.length\} of \$\{all\.length\} task/, 'progress is counted from the tasks');
assert.match(panel, /joinProjectFromPanel\('\$\{project\.id\}'\)">Request to Join<\/button>/, 'anyone not in the project can ask to join from the top');
assert.match(panel, /rel\.hasPendingRequest \? `[\s\S]{0,200}Waiting for/, 'a pending request says so instead');
assert.match(panel, /window\.viewProjectDetails = async function\(projectId, initialTab = null, focusTaskId = null\)/, 'a task link opens that task');
assert.match(panel, /onWorkOn: assistance \? \(task\) => \{ closeOverlay\(\); window\.viewProjectTask\(project\.id, task\.id\); \} : null,/);

// Review (PR #301): Open task always shows the task. A filter or search that
// would hide it is cleared first, and that is announced.
assert.match(tasksSource, /if \(!applyFilters\(\[task\]\)\.length\) \{\s*clearFilters\(\);\s*announce\(`Filters cleared to show/);
assert.match(tasksSource, /state\.filters = \{ status: '', priority: '', owner: '', q: '' \};/);
// Review (PR #301): Open task and Add a task open a folded Project tasks
// section on phones; ordinary Work navigation neither opens it nor scrolls.
assert.match(panel, /const showTasks = \(\) => \{\s*activateTab\(workTab\(\)\);\s*const section = overlay\.querySelector\('details\[data-work-section="tasks"\]'\);\s*if \(section\) section\.open = true;/);
assert.match(panel, /showTasks\(\);\s*tasksPanel\?\.focusTask\(id\);/);
assert.match(panel, /showTasks\(\);\s*tasksPanel\?\.openAddForm\(\);/);
assert.match(panel, /if \(tabName === 'work' && pendingWorkFocus\) openWorkSection\(pendingWorkFocus\);/, 'plain Work navigation does not scroll');

console.log('Project entry and work: all checks passed');
