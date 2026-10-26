#!/usr/bin/env node
'use strict';

// Home's "Happening in the community" (the brief's `community` summary,
// _buildCommunityOpen in daily-brief-engine.js) shows only what is really
// open, from rows the brief already read under the member's own permissions:
//  1. projects open to collaborators ('open', 'recruiting'), never the
//     member's own, joined or requested ones, newest first, with the skills
//     they list as needed
//  2. public opportunities still open, never the member's own or one from an
//     organization they run, closing soonest first, with their real deadline
//     and organization
//  3. active themes only when at least COMMUNITY_THEME_MIN_MEMBERS
//     discoverable members take part, counted from participation rows (a
//     participant hidden from discovery never counts, and the summary view's
//     own participant_count is not trusted); never expired; administrative
//     catch-all themes such as "General Projects" never, whatever their size
//  4. skills listed by at least COMMUNITY_SKILL_MIN_MEMBERS distinct members,
//     never counting the member themselves or a second row for one person,
//     so no chip points at one identifiable person; hidden members never
//     reach the builder (the community query filters them)
//  5. person suggestions carry their labelled reasons for Home's chips

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
global.window = {};

(async () => {
  const engine = await import(pathToFileURL(path.join(root, 'assets/js/intelligence/daily-brief-engine.js')).href);
  const build = engine.__testBuildCommunityOpen;
  const MIN = engine.COMMUNITY_SKILL_MIN_MEMBERS;
  assert.equal(typeof build, 'function', 'the engine exposes the community builder for tests');
  assert.ok(MIN >= 5, 'a conservative minimum group size for skill chips');

  const now = new Date('2026-10-26T12:00:00Z');
  const day = 86400000;
  const at = d => new Date(now.getTime() + d * day).toISOString();
  const me = { id: 'me', user_id: 'auth-me' };
  const memberships = engine.__testBuildMembershipMaps({
    communityId: 'me',
    projectMembers: [{ project_id: 'p-joined', user_id: 'me', role: 'member' }, { project_id: 'p-requested', user_id: 'me', role: 'pending' }],
    themeParticipants: [
      ...['a', 'b', 'c'].map(id => ({ theme_id: 't-new', community_id: id })),
      ...['a', 'b', 'hidden-h'].map(id => ({ theme_id: 't-old', community_id: id })),
      ...['a', 'b', 'c', 'd'].map(id => ({ theme_id: 't-expired', community_id: id })),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ theme_id: 't-general', community_id: id })),
      ...['a', 'b', 'c', 'd', 'e'].map(id => ({ theme_id: 't-climate', community_id: id })),
    ],
    orgMembers: [{ organization_id: 'org-mine', community_id: 'me', role: 'owner' }],
  });
  const person = (id, skills, extra = {}) => ({ id, user_id: `auth-${id}`, skills, ...extra });

  const result = build({
    userProfile: me,
    memberships,
    now,
    themeCircles: [
      { id: 't-new', title: 'Food access', participant_count: 9, created_at: at(-1), expires_at: at(20) },
      { id: 't-old', title: 'Civic tech', participant_count: 22, created_at: at(-5), expires_at: null },
      { id: 't-nocount', title: 'Fallback theme', created_at: at(-3) },
      { id: 't-expired', title: 'Expired theme', participant_count: 40, created_at: at(-2), expires_at: at(-1) },
      { id: 't-general', title: 'General Projects', participant_count: 6, origin_type: 'admin', created_at: at(-1), expires_at: at(300) },
      { id: 't-climate', title: 'Climate resilience', participant_count: 1, created_at: at(-4), expires_at: null },
    ],
    projects: [
      { id: 'p-open', title: 'Community fridge', status: 'open', creator_id: 'x', required_skills: ['Driving', 'Outreach', 'Cooking', 'Logistics'], created_at: at(-3) },
      { id: 'p-recruiting', title: 'Flood map', status: 'recruiting', creator_id: 'x', required_skills: ['GIS'], created_at: at(-1) },
      { id: 'p-active', title: 'Busy but not recruiting', status: 'active', creator_id: 'x', created_at: at(0) },
      { id: 'p-done', title: 'Finished', status: 'completed', creator_id: 'x', created_at: at(0) },
      { id: 'p-mine', title: 'My project', status: 'open', creator_id: 'me', created_at: at(0) },
      { id: 'p-joined', title: 'Joined project', status: 'open', creator_id: 'x', created_at: at(0) },
      { id: 'p-requested', title: 'Requested project', status: 'recruiting', creator_id: 'x', created_at: at(0) },
    ],
    opportunities: [
      { id: 'o-later', title: 'Judge pitch night', organization_id: 'org-a', application_deadline: at(18), posted_by: 'x', created_at: at(-1) },
      { id: 'o-sooner', title: 'Mentor a club', organization_id: 'org-a', application_deadline: at(4), posted_by: 'x', created_at: at(-2) },
      { id: 'o-open-ended', title: 'Design reviewer', organization_id: null, application_deadline: null, posted_by: 'x', created_at: at(-1) },
      { id: 'o-expired', title: 'Expired', organization_id: 'org-a', application_deadline: at(-1), posted_by: 'x', created_at: at(0) },
      { id: 'o-mine', title: 'Posted by me', application_deadline: null, posted_by: 'me', created_at: at(0) },
      { id: 'o-my-org', title: 'From my org', organization_id: 'org-mine', application_deadline: null, posted_by: 'x', created_at: at(0) },
    ],
    organizations: [{ id: 'org-a', name: 'Tidewater Schools' }],
    community: [
      person('me', ['Rare skill', 'Design']),
      person('me-legacy', ['Rare skill'], { user_id: 'auth-me' }),
      person('a', ['Design', 'Python', 'Rare skill']),
      person('b', ['design', 'Python', 'Rare skill']),
      person('c', ['Design', 'Python', 'Rare skill']),
      person('d', ['Design', 'Python']),
      person('e', ['Design']),
      person('d-duplicate', ['Python'], { user_id: 'auth-d' }),
      person('f', 'Design, Beekeeping'),
    ],
  });

  assert.deepEqual(result.projects.map(p => p.id), ['p-recruiting', 'p-open'], 'only projects open to collaborators, never your own, joined or requested; newest first');
  assert.deepEqual(result.projects.find(p => p.id === 'p-open').needs, ['Driving', 'Outreach', 'Cooking'], 'what a project needs, from its own listed skills');

  assert.deepEqual(result.opportunities.map(o => o.id), ['o-sooner', 'o-later', 'o-open-ended'], 'open opportunities, closing soonest first; never expired, your own or your organization’s');
  assert.equal(result.opportunities[0].organization, 'Tidewater Schools');
  assert.equal(result.opportunities[0].deadline, at(4), 'the real deadline');
  assert.equal(result.opportunities[2].deadline, null, 'no deadline is never invented');

  assert.equal(engine.COMMUNITY_THEME_MIN_MEMBERS, 3);
  assert.ok(!result.themes.some(t => t.title === 'General Projects'), 'an administrative catch-all theme never appears, whatever its size');
  assert.ok(!result.themes.some(t => t.title === 'Civic tech'), 'two discoverable members plus a hidden one is below three');
  assert.ok(!result.themes.some(t => t.title === 'Fallback theme'), 'no participants, no theme');
  assert.ok(!result.themes.some(t => t.title === 'Expired theme'), 'never an expired theme');
  assert.deepEqual(result.themes.map(t => [t.title, t.participantCount]), [['Food access', 3], ['Climate resilience', 5]],
    'themes newest first, counted from discoverable participants (not the view’s own count)');

  const skills = result.skills.map(s => s.key);
  assert.ok(skills.includes('design'), 'Design: six members (any capitalization), not counting yourself');
  assert.ok(!skills.includes('python'), 'Python: five rows but four people (a duplicate row is one person), so no chip');
  assert.ok(!skills.includes('rare skill'), 'a skill you share with three others is not counted up to five by your own rows');
  assert.ok(!skills.includes('beekeeping'), 'a one-person skill is never a chip');
  assert.equal(result.skills.find(s => s.key === 'design').label, 'Design');

  const engineSource = fs.readFileSync(path.join(root, 'assets/js/intelligence/daily-brief-engine.js'), 'utf8');
  assert.match(engineSource, /\.from\('community'\)\s*\.select\([^)]*\)\s*\.or\('is_hidden\.is\.null,is_hidden\.eq\.false'\)/,
    'members hidden from discovery never reach the skill counts');
  assert.match(engineSource, /community: _buildCommunityOpen\(sectionCtx\)/, 'the brief carries the community summary');

  // 5. Person suggestions carry their labelled reasons.
  const people = engine.__testBuildPeopleWorthKnowing({
    userProfile: { id: 'me', user_id: 'auth-me', interests: ['Human-centered design'], skills: ['Python'] },
    community: [{ id: 'riley', user_id: 'auth-riley', name: 'Riley', interests: ['HCD'], skills: ['Python'] }],
    projects: [], organizations: [], nearifyEventPresence: [], maxItems: 5,
    memberships: engine.__testBuildMembershipMaps({ communityId: 'me' }),
  });
  assert.deepEqual(people[0].reasons.map(r => [r.category, r.detail]), [['shared_skill', 'Python'], ['shared_theme', 'Human-Centered Design']],
    'an introduction carries the same evidence as its summary, labelled');

  console.log('Home community summary: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
