#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'assets/js/node-panel.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase/sql/migrations/20260821_project_creator_remove_members.sql'),
  'utf8',
);

assert.match(panel, /rel\.isCreator && !isProjectCreator/, 'only creators should see controls for non-creator members');
assert.match(panel, /window\.removeProjectMember = async function/, 'project member removal handler must exist');
assert.match(panel, /\.from\('project_members'\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\('project_id', projectId\)[\s\S]*?\.eq\('user_id', memberId\)/,
  'removal must target one member in one project');
assert.match(panel, /if \(!window\.confirm\(/, 'removal must require confirmation');

assert.match(migration, /FOR DELETE\s+TO authenticated/, 'membership deletion must be limited to authenticated users');
assert.match(migration, /p\.id = project_members\.project_id[\s\S]*?creator\.user_id = auth\.uid\(\)/,
  'RLS must authorize the originator of the affected project');
assert.match(migration, /user_id IN \([\s\S]*?c\.user_id = auth\.uid\(\)/,
  'existing self-removal behavior must be preserved');

console.log('✅ Project creator member-removal checks passed');
