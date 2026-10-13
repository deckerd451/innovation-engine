#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const panel = fs.readFileSync('assets/js/node-panel.js', 'utf8');
const scroll = fs.readFileSync('assets/css/mobile-project-scroll.css', 'utf8');

for (const tab of ['overview', 'tasks', 'capabilities', 'people', 'activity']) {
  assert.match(panel, new RegExp(`data-tab="${tab}"`), `legacy tab ${tab} remains available`);
}
for (const section of ['work', 'pd-work-capabilities', 'pd-work-tasks', 'pd-activity-summary-content']) {
  assert.match(panel, new RegExp(section), `missing mobile section ${section}`);
}
assert.match(panel, /tabName === 'activity'/);
assert.match(panel, /tabName === 'tasks' || tabName === 'capabilities'/);
assert.match(panel, /pendingWorkFocus/);
assert.match(panel, /loadProjectActivity\(project\.id, overlay\.querySelector\('#pd-activity-summary-content'\), activityHistoryRequested \? 20 : 3\)/);
assert.match(panel, /activityHistoryRequested/);
assert.match(panel, /Showing full history/);
assert.match(panel, /viewProjectDetails = async function\(projectId, initialTab/);
assert.match(scroll, /\.pd-legacy-tab \{ display: none/);
assert.match(scroll, /\.pd-mobile-work-tab \{ display: block/);
assert.match(scroll, /touch-action: pan-x pan-y/);
assert.match(scroll, /--pd-bottom-nav-height/);
assert.match(panel, /canUse: Boolean\(currentUserProfile\)/);
assert.match(panel, /canEdit: canViewTasks/);
console.log('mobile project IA, legacy compatibility, permissions, activity access, and scroll contracts passed');
