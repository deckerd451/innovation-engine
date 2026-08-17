#!/usr/bin/env node

// Static authorization contract tests. These run without a Supabase connection
// and guard the coordinated RLS/UI rules in the checked-in production assets.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const schema = read('supabase/sql/tables/PROJECT_TASKS_SCHEMA.sql');
const patch = read('supabase/sql/fixes/FIX_PROJECT_TASKS_TEAM_AUTHORIZATION.sql');
const panel = read('assets/js/node-panel.js');
const tasks = read('assets/js/project-tasks.js');
const dashboard = read('assets/js/command-dashboard.js');

for (const sql of [schema, patch]) {
  assert.match(sql, /CREATE POLICY "Project team can view tasks"[\s\S]*FOR SELECT TO authenticated|CREATE POLICY "Project team can view tasks"[\s\S]*FOR SELECT\s+TO authenticated/);
  assert.match(sql, /p\.creator_id[\s\S]*c\.user_id = auth\.uid\(\)/, 'creator identity must authorize task access');
  assert.match(sql, /pm\.user_id[\s\S]*pm\.role IS DISTINCT FROM 'pending'[\s\S]*c\.user_id = auth\.uid\(\)/, 'accepted membership must authorize task access');
  assert.match(sql, /CREATE POLICY "Project team can create tasks"[\s\S]*FOR INSERT[\s\S]*WITH CHECK/, 'creator/member INSERT must be checked');
  assert.match(sql, /CREATE POLICY "Project team can update tasks"[\s\S]*FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/, 'creator/member UPDATE must check old and new rows');
  const deletePolicy = sql.match(/CREATE POLICY "Project creators can delete tasks"[\s\S]*?;\n/)[0];
  assert.match(deletePolicy, /p\.creator_id/);
  assert.doesNotMatch(deletePolicy, /project_members|pm\./, 'accepted members must not delete');
  assert.doesNotMatch(sql, /TO anon|TO public|USING \(true\)/i, 'anonymous/non-team broad access must not exist');
}

assert.match(panel, /const canViewTasks = rel\.isCreator \|\| rel\.state === 'member'/, 'only creator/accepted member sees Tasks tab');
assert.match(panel, /canViewTasks \? '<button[^']*data-tab="tasks"/, 'Tasks tab rendering must be conditional');
assert.match(panel, /canEdit: true,[\s\S]*canDelete: rel\.isCreator/, 'accepted member edits while delete stays creator-only');
assert.match(tasks, /if \(canEdit\)[\s\S]*createTask/, 'accepted member receives create controls');
assert.match(tasks, /statusBtn && canEdit/, 'accepted member receives status controls');
assert.match(tasks, /data-action="delete"[\s\S]*: ''/, 'delete control is independently conditional');

assert.match(dashboard, /select\('project_id, role'\)/, 'membership role must be loaded for count authorization');
assert.match(dashboard, /filter\(m => m\.role !== 'pending'\)/, 'pending memberships must be excluded');
assert.match(dashboard, /fetchOpenCounts\(authorizedTaskProjectIds\)/, 'counts must query only authorized projects');
assert.doesNotMatch(dashboard, /fetchOpenCounts\(projResult\.data\.map/, 'counts must not query every visible project');

console.log('Project task authorization contract: all checks passed');
