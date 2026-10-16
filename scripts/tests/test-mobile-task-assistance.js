#!/usr/bin/env node
// Source-level contracts for the focused assistance surface. Behaviour is
// covered in test-assistance-interventions.js and the rendered browser
// journey (scripts/tests/browser/run-assistance-journey.mjs).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const js = fs.readFileSync('assets/js/mobile-task-assistance.js', 'utf8');
const css = fs.readFileSync('assets/css/mobile-task-assistance.css', 'utf8');
const nav = fs.readFileSync('assets/js/mobile-nav.js', 'utf8');
const you = fs.readFileSync('assets/js/mobile-you.js', 'utf8');
const discover = fs.readFileSync('assets/js/mobile-goal-discovery.js', 'utf8');

// One assistance path: tasks and typed objectives open the same surface.
assert.match(js, /window\.viewProjectTask = open/);
assert.match(js, /openObjective/);
assert.match(discover, /MobileTaskAssistance\?\.openObjective\(goal\)/);
assert.doesNotMatch(discover, /searchGoal|renderPackageCard/, 'objective entry must not run a separate assistance flow');
assert.match(you, /viewProjectTask\(target\.dataset\.nextProject, target\.dataset\.nextTask\)/);
assert.match(js, /AssistanceEngine/);

// Data access stays inside existing tables and RLS; the client narrows only.
assert.match(js, /project_tasks.*maybeSingle/);
assert.match(js, /eq\('status', 'accepted'\)/);
assert.match(js, /pkg\.permission_mode === 'community' \|\| \(me && pkg\.creator_id === me\)/);
assert.match(js, /ProjectTasks\.updateTask/);
assert.match(js, /ProjectTasks\.createTask/);
assert.match(js, /CapabilityMemory\.savePackage/);
assert.match(js, /CapabilityMemory\.recordAttemptOutcome/);
assert.doesNotMatch(js, /from\('project_goals'\)|from\('assistance/, 'no parallel goal or assistance tables');

// Honest progress language.
assert.match(js, /doesn’t mark the task complete or count as verified/);
assert.match(js, /Saved as <strong>untested<\/strong>/);
assert.match(js, /Buildspace doesn’t send this for you/);
assert.match(js, /draft on this device/);
assert.match(js, /if \(session\.task\.status === 'open'\) fields\.status = 'in_progress'/);

// Mobile shell integrity: switching destinations (app-nav.js) closes the
// overlay; it clears the navigation and safe areas, scrolls in one
// container, and restores focus.
assert.match(fs.readFileSync('assets/js/app-nav.js', 'utf8'), /window\.MobileTaskAssistance\?\.close\?\.\(\)/);
assert.match(css, /inset:0 0 var\(--mobile-tab-bar-height,68px\)/);
assert.match(css, /\.mta-panel\{height:100%;[^}]*overflow-y:auto/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /body\.mta-open\{overflow:hidden\}/);
assert.doesNotMatch(css, /min-width:701px\)\{\.mta-overlay\{display:none/, 'the overlay must not be hidden on coarse-pointer tablets that open it');
assert.match(js, /returnFocus/);
assert.match(js, /event\.key === 'Escape'/);
console.log('focused assistance routing, data-boundary, honesty, and mobile-shell contracts passed');
