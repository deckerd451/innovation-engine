#!/usr/bin/env node

// Deterministic contract tests for Capability Memory's measurement foundation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/capability-memory.js', 'utf8');
const sql = fs.readFileSync('supabase/sql/migrations/20261011_capability_memory.sql', 'utf8');
const repairSql = fs.readFileSync('supabase/sql/migrations/20261012_capability_memory_production_repair.sql', 'utf8');
const context = {
  window: {},
  document: { createElement: () => ({ textContent: '', innerHTML: '' }) },
  console,
};
vm.runInNewContext(source, context, { filename: 'capability-memory.js' });
const { median, confidenceAdjustedEffectiveness, rankPackages, summarizeStats, goalMatch, buildTaskPlan, classifySearchError, searchErrorMessage } = context.window.CapabilityMemoryTesting;

assert.equal(median([8, 2, 4]), 4, 'median should use all actual attempt values');

const stats = new Map([
  ['high-sample', { completed: 10, success: 8, verifiedSuccess: 0, savedHours: [8, 4, 2] }],
  ['small-sample', { completed: 1, success: 1, verifiedSuccess: 0, savedHours: [20] }],
]);
assert.ok(
  confidenceAdjustedEffectiveness(stats.get('high-sample')) > confidenceAdjustedEffectiveness(stats.get('small-sample')),
  'ranking should shrink small self-reported samples instead of rewarding raw success counts'
);

const ranked = rankPackages([
  { id: 'small-sample', goal: 'different goal' },
  { id: 'high-sample', goal: 'another goal' },
], stats);
assert.equal(ranked[0].id, 'high-sample', 'ranking must use returned stats fields');
assert.equal(Object.prototype.hasOwnProperty.call(ranked[0], 'goalRelevance'), false, 'goal relevance must not be claimed before goal matching exists');

const matched = goalMatch({ title: 'Interview customers', goal: 'Validate demand', steps: ['Run customer interviews'], tools: [] }, 'validate customer demand');
assert.equal(Array.from(matched.matched).join(','), 'validate,customer,demand', 'goal matching should explain matched terms');
const speakerMatch = goalMatch({ title: 'Validate a business idea through customer interviews', goal: 'Determine whether potential customers have a real problem worth solving', steps: ['Identify five potential customers', 'Interview the customers'], tools: [] }, 'Select speaker(s) for Harborhack 2026 prep');
assert.equal(speakerMatch.relevant, false, 'customer-interview method must not match a speaker-selection task through incidental project words');
assert.equal(rankPackages([{ id: 'unrelated', title: 'Deploy servers', goal: 'Ship code' }, { id: 'matched', title: 'Interview customers', goal: 'Validate demand' }], new Map(), 'validate customer demand')[0].id, 'matched', 'goal relevance should be the first ranking dimension when a goal exists');

assert.deepEqual(buildTaskPlan(['Define scope', 'define scope', 'Run test'], new Set(['Run test'])), ['Define scope'], 'task import should prevent duplicate tasks');
assert.equal(classifySearchError({ code: '42P01', message: 'relation capability_packages does not exist' }), 'setup', 'missing table should be identified as a setup failure');
assert.equal(classifySearchError({ code: '42501', message: 'new row violates row-level security policy' }), 'permission', 'RLS failures should be identified as permission failures');
assert.equal(classifySearchError(new TypeError('Failed to fetch')), 'connection', 'network failures should be identified separately');
assert.match(searchErrorMessage('setup'), /database update/i, 'setup failures should tell operators what is missing');
assert.match(searchErrorMessage('permission'), /permission/i, 'permission failures should not look like empty results');

const summary = summarizeStats(new Map([
  ['a', { completed: 2, success: 1, verifiedSuccess: 0, savedHours: [8, 2] }],
  ['b', { completed: 1, success: 1, verifiedSuccess: 1, savedHours: [4] }],
]));
assert.equal(summary.completed, 3, 'summary should count completed attempts');
assert.equal(summary.success, 2, 'summary should count successful completed attempts');
assert.equal(summary.verifiedSuccess, 1, 'summary should keep verified successes separate');
assert.equal(summary.savedHours, 4, 'summary should use raw attempt savings for the median');
assert.match(sql, /outcome_status IN \('succeeded', 'not_succeeded'\)/, 'SQL must define completed attempts explicitly');
assert.match(sql, /verification_status = 'verified'/, 'SQL must keep independent verification separate');
assert.match(sql, /Only a different package creator can verify an attempt/, 'self-reported results must not self-upgrade');
assert.match(sql, /ARRAY_AGG\(a\.baseline_hours - a\.actual_hours/, 'SQL must return actual attempt savings for a weighted median');
assert.match(sql, /verified_success_count >= 2/, 'SQL must not call two self-reported successes proven');
assert.match(sql, /permission_mode = 'community'/, 'shared capability search must be permission constrained');
assert.match(sql, /task_ids UUID\[\]/, 'attempt tracking must retain imported task ids');
assert.match(repairSql, /CREATE TABLE IF NOT EXISTS public\.capability_packages/, 'production repair must create a missing package table safely');
assert.match(repairSql, /ALTER TABLE public\.capability_packages ADD COLUMN IF NOT EXISTS project_id UUID/, 'production repair must upgrade partial package tables');
assert.match(repairSql, /CREATE POLICY "Community can view shared capability packages"/, 'production repair must restore permissioned package visibility');
assert.match(repairSql, /CREATE OR REPLACE FUNCTION public\.get_capability_attempt_stats/, 'production repair must restore the stats RPC');

console.log('✅ Capability Memory measurement contracts passed');
