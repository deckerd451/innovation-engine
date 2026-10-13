#!/usr/bin/env node

// Deterministic contract test for the reviewable demonstration seed and its
// existing Capability Memory discovery/task-import path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const seed = fs.readFileSync('supabase/sql/reference/SEED_CAPABILITY_MEMORY_DEMO.sql', 'utf8');
const source = fs.readFileSync('assets/js/capability-memory.js', 'utf8');
const context = {
  window: {},
  document: { createElement: () => ({ textContent: '', innerHTML: '' }) },
  console,
};
vm.runInNewContext(source, context, { filename: 'capability-memory.js' });
const { goalMatch, buildTaskPlan } = context.window.CapabilityMemoryTesting;

assert.match(seed, /JOIN public\.community c ON c\.id = p\.creator_id/, 'seed must resolve an existing community creator');
assert.match(seed, /c\.user_id IS NOT NULL/, 'seed must require an authorized community identity');
assert.match(seed, /SELECT p\.id, p\.creator_id/, 'seed must resolve an existing project instead of inventing a UUID');
assert.match(seed, /PERFORM pg_advisory_xact_lock/, 'seed must serialize repeat runs');
assert.match(seed, /summary LIKE 'DEMONSTRATION CONTENT/, 'seed must detect an existing demonstration capability globally');
assert.match(seed, /existing_capability IS NOT NULL/, 'seed must detect an existing matching capability');
assert.match(seed, /permission_mode,\s*\n\s*evidence_status,\s*\n\s*version/, 'seed must set visibility and evidence fields');
assert.match(seed, /'community',\s*\n\s*'untested',\s*\n\s*1/, 'demo content must be community-visible but untested');
assert.match(seed, /DEMONSTRATION CONTENT/, 'seed must visibly label demonstration content');
assert.match(seed, /No outcomes, time savings, costs, or independent verification/, 'seed must not fabricate evidence');
assert.doesNotMatch(seed, /service_role|SUPABASE_SERVICE_ROLE|00000000-0000-0000-0000/, 'seed must not contain credentials or invented UUIDs');

const pkg = {
  title: 'Validate a business idea through customer interviews',
  goal: 'Determine whether potential customers have a real problem worth solving.',
  summary: 'DEMONSTRATION CONTENT',
  steps: [
    'Identify five potential customers.',
    'Prepare five open-ended interview questions.',
    'Interview the customers.',
    'Record recurring problems.',
    'Decide whether to prototype the idea.',
  ],
  tools: [],
};
const match = goalMatch(pkg, 'determine whether customers have a real problem');
assert.ok(match.score > 0, 'seeded capability must match a concrete goal through the existing matcher');
assert.deepEqual(buildTaskPlan(pkg.steps, new Set()), pkg.steps, 'all five seed steps must import as project tasks');
assert.deepEqual(buildTaskPlan(pkg.steps, new Set(pkg.steps)), [], 're-running task import must prevent duplicate tasks');

console.log('✅ Capability Memory demonstration seed/discovery contracts passed');
