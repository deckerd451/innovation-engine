#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/js/project-semantics.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'project-semantics.js' });

const semantics = sandbox.window.ProjectSemantics;
const projects = [
  { id: 'active-member', status: 'active', creator_id: 'someone-else' },
  { id: 'open-creator', status: 'open', creator_id: 'current-user' },
  { id: 'hyphenated', status: 'in-progress', creator_id: 'someone-else' },
  { id: 'pending', status: 'recruiting', creator_id: 'someone-else' },
  { id: 'ended-member', status: 'active', creator_id: 'someone-else' },
  { id: 'stale-spelling', status: 'in_progress', creator_id: 'current-user' },
  { id: 'archived', status: 'archived', creator_id: 'current-user' },
];
const memberships = [
  { project_id: 'active-member', role: 'member' },
  { project_id: 'hyphenated', role: 'owner' },
  { project_id: 'pending', role: 'pending' },
  { project_id: 'ended-member', role: 'member', left_at: '2026-08-01T00:00:00Z' },
];

assert.deepStrictEqual(
  Array.from(semantics.ACTIVE_STATUSES),
  ['active', 'in-progress', 'open', 'recruiting']
);
assert.deepStrictEqual(
  Array.from(semantics.activeProjectsForUser(projects, memberships, 'current-user'), p => p.id),
  ['active-member', 'open-creator', 'hyphenated']
);

const dashboard = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
const digest = fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8');
assert.match(dashboard, /ProjectSemantics\.isActive/);
assert.match(dashboard, /ProjectSemantics\.acceptedProjectIds/);
assert.match(digest, /ProjectSemantics\.activeProjectsForUser/);
assert.match(digest, /ProjectSemantics\.acceptedProjectIds/);
assert.match(digest, /\.is\('left_at', null\)/);
assert.match(digest, /projectsQuery\.or\(`creator_id\.eq\.\$\{communityId\},id\.in\.\(\$\{memberProjectIds\.join\(','\)\}\)`\)/);

console.log('Network Reflection active-project semantics: all checks passed');
