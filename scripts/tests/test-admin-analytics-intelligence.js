#!/usr/bin/env node

// Regression coverage for the deterministic Admin Intelligence observations
// (assets/js/admin-analytics.js buildAdminIntelligence), and for the core
// analytics metrics contract: the function must never invent a number --
// each observation only fires when its underlying count is present and
// non-zero, and it must not silently coerce a missing field into a false
// positive.
//
// This harness imports the ACTUAL assets/js/admin-analytics.js module and
// calls its real exported buildAdminIntelligence, rather than
// re-implementing the logic here. The module self-initializes on import
// (see its trailing initAdminAnalytics() call -- necessary because it's
// injected post-DOMContentLoaded in production, see commit 66b53cc3), so
// minimal window/document stubs are provided.

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');

global.window = {
  addEventListener: () => {},
  currentUserProfile: null,
  supabase: null,
};
global.document = {
  createElement: () => ({ style: {}, appendChild: () => {} }),
  body: { appendChild: () => {} },
  addEventListener: () => {},
};

(async () => {
  const mod = await import(pathToFileURL(path.join(root, 'assets/js/admin-analytics.js')).href);
  assert.equal(typeof mod.buildAdminIntelligence, 'function',
    'admin-analytics.js must expose buildAdminIntelligence for testing');

  const build = mod.buildAdminIntelligence;
  const buildPriorities = mod.buildAdminPriorities;
  assert.equal(typeof buildPriorities, 'function',
    'admin-analytics.js must expose buildAdminPriorities for testing');

  // No signal at all -> no fabricated observations.
  {
    const items = build({
      isolated_members_count: 0,
      open_opportunities_no_applications: 0,
      new_members_30d: 0,
      new_connections_30d: 0,
    });
    assert.deepEqual(items, [], 'zero counts across the board must produce zero observations');
  }

  // Isolated members observation, singular vs plural.
  {
    const one = build({ isolated_members_count: 1 });
    assert.equal(one.length, 1);
    assert.match(one[0], /^1 member has zero connections\.$/);

    const many = build({ isolated_members_count: 4 });
    assert.match(many[0], /^4 members have zero connections\.$/);
  }

  // Zero-application open opportunities observation, singular vs plural.
  {
    const one = build({ open_opportunities_no_applications: 1 });
    assert.match(one[0], /^1 open opportunity has zero applications\.$/);

    const many = build({ open_opportunities_no_applications: 3 });
    assert.match(many[0], /^3 open opportunities have zero applications\.$/);
  }

  // Growth observation fires from either new members OR new connections,
  // and reports both counts factually (no "notable"/threshold judgment).
  {
    const membersOnly = build({ new_members_30d: 5, new_connections_30d: 0 });
    assert.equal(membersOnly.length, 1);
    assert.match(membersOnly[0], /^5 new members and 0 new connections in the last 30 days\.$/);

    const connectionsOnly = build({ new_members_30d: 0, new_connections_30d: 2 });
    assert.match(connectionsOnly[0], /^0 new members and 2 new connections in the last 30 days\.$/);
  }

  // All three observations can appear together, in a stable order.
  {
    const items = build({
      isolated_members_count: 2,
      open_opportunities_no_applications: 1,
      new_members_30d: 3,
      new_connections_30d: 1,
    });
    assert.equal(items.length, 3);
    assert.match(items[0], /zero connections/);
    assert.match(items[1], /zero applications/);
    assert.match(items[2], /new members/);
  }

  // Missing/undefined fields must never be treated as truthy counts.
  {
    const items = build({});
    assert.deepEqual(items, [], 'missing fields must not produce observations');
    assert.deepEqual(build(undefined), [], 'undefined metrics object must not throw or fabricate observations');
  }

  // The action queue uses only supplied counts, calculates transparent
  // percentages, and preserves the urgency-first order.
  {
    const priorities = buildPriorities({
      total_members: 20,
      active_members: 5,
      isolated_members_count: 4,
      open_opportunities_no_applications: 2,
    });
    assert.equal(priorities.length, 3);
    assert.equal(priorities[0].title, 'Connect isolated members');
    assert.match(priorities[0].evidence, /20% of members/);
    assert.equal(priorities[1].title, 'Unblock open opportunities');
    assert.match(priorities[2].evidence, /5 of 20.*25%/);
    assert.match(priorities[2].action, /15 members/);
  }

  // With no measurable population, the dashboard must not fabricate work.
  assert.deepEqual(buildPriorities({}), []);

  console.log('✅ test-admin-analytics-intelligence passed');
})().catch(err => {
  console.error('❌ test-admin-analytics-intelligence failed:', err);
  process.exit(1);
});
