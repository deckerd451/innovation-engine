#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const js = fs.readFileSync('assets/js/mobile-task-assistance.js', 'utf8');
const css = fs.readFileSync('assets/css/mobile-task-assistance.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert.match(js, /window\.viewProjectTask = open/);
assert.match(js, /project_tasks.*maybeSingle/);
assert.match(js, /projects.*maybeSingle/);
assert.match(js, /CapabilityMemory\.searchGoal/);
assert.match(js, /CapabilityMemory\.renderPackageCard/);
assert.match(js, /from\('connections'\)/);
assert.match(js, /eq\('status', 'accepted'\)/);
assert.match(js, /from\('community'\)/);
assert.match(js, /No connected member matches this task yet/);
assert.match(js, /No shared method matches this task yet/);
assert.match(js, /data-mta-back/);
assert.match(js, /ProjectTasks\.updateTask/);
assert.match(js, /viewProjectDetails\?\./);
assert.match(css, /overflow-y:auto/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(index, /mobile-task-assistance\.js\?v=objective-help-20261013/);
assert.match(index, /mobile-task-assistance\.css\?v=objective-help-20261013/);
console.log('focused task routing, permission-filtered assistance, empty states, return navigation, and mobile clearance contracts passed');
