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
//  3. never themes: themes and theme circles were replaced by skills, so the
//     brief no longer reads theme circles or participation (the tables and
//     their history stay) and the summary has no themes, whatever is passed
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
    projectMembers: [{ project_id: 'p-joined', user_id: 'me', role: 'member' }, { project_id: 'p-requested', user_id: 'me', role: 'pending' },
      { project_id: 'p-open', user_id: 'a', role: 'member' }, { project_id: 'p-open', user_id: 'b', role: 'member' }, { project_id: 'p-open', user_id: 'c', role: 'pending' }, { project_id: 'p-open', user_id: 'x', role: 'member' }],
    orgMembers: [{ organization_id: 'org-mine', community_id: 'me', role: 'owner' }],
  });
  const person = (id, skills, extra = {}) => ({ id, user_id: `auth-${id}`, skills, ...extra });

  const result = build({
    userProfile: me,
    memberships,
    now,
    projects: [
      { id: 'p-open', title: 'Community fridge', description: '  Stocking   neighborhood fridges\nevery Saturday. ', status: 'open', creator_id: 'x', required_skills: ['Driving', 'Outreach', 'Cooking', 'Logistics'], created_at: at(-3) },
      { id: 'p-recruiting', title: 'Flood map', description: 'Flood map', status: 'recruiting', creator_id: 'x', required_skills: ['GIS'], created_at: at(-1) },
      { id: 'p-active', title: 'Busy but not recruiting', status: 'active', creator_id: 'x', created_at: at(0) },
      { id: 'p-done', title: 'Finished', status: 'completed', creator_id: 'x', created_at: at(0) },
      { id: 'p-mine', title: 'My project', status: 'open', creator_id: 'me', created_at: at(0) },
      { id: 'p-joined', title: 'Joined project', status: 'open', creator_id: 'x', created_at: at(0) },
      { id: 'p-requested', title: 'Requested project', status: 'recruiting', creator_id: 'x', created_at: at(0) },
    ],
    opportunities: [
      { id: 'o-later', title: 'Judge pitch night', description: `Score five student pitches and give each team one piece of written feedback. ${'Dinner and parking are provided for every judge who signs up early. '.repeat(3)}`, opportunity_type: 'volunteer', skills: ['Pitching'], organization_id: 'org-a', application_deadline: at(18), posted_by: 'x', created_at: at(-1) },
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
  // What each card can honestly say: its own description (whitespace
  // collapsed, shortened at a word), how many are on it, its type.
  assert.equal(result.projects.find(p => p.id === 'p-open').about, 'Stocking neighborhood fridges every Saturday.', 'a project says what it is, in its own words');
  assert.equal(result.projects.find(p => p.id === 'p-recruiting').about, null, 'a description that only repeats the title says nothing new');
  assert.equal(result.projects.find(p => p.id === 'p-open').people, 3, 'the creator and accepted members, each once; a pending request is not on the project');
  assert.equal(result.projects.find(p => p.id === 'p-recruiting').people, 1, 'just its creator');
  const judge = result.opportunities.find(o => o.id === 'o-later');
  assert.equal(judge.kind, 'volunteer');
  assert.deepEqual(judge.needs, ['Pitching']);
  assert.ok(judge.about.length <= 161 && judge.about.endsWith('…') && /^Score five student pitches/.test(judge.about) && !/\s…$/.test(judge.about), 'a long description is shortened at a word, and says so');
  assert.equal(result.opportunities.find(o => o.id === 'o-sooner').about, null, 'no description, nothing invented');
  assert.equal(result.opportunities.find(o => o.id === 'o-sooner').kind, null);

  assert.deepEqual(result.opportunities.map(o => o.id), ['o-sooner', 'o-later', 'o-open-ended'], 'open opportunities, closing soonest first; never expired, your own or your organization’s');
  assert.equal(result.opportunities[0].organization, 'Tidewater Schools');
  assert.equal(result.opportunities[0].deadline, at(4), 'the real deadline');
  assert.equal(result.opportunities[2].deadline, null, 'no deadline is never invented');

  assert.ok(!('themes' in result), 'no themes: themes were replaced by skills');
  const withThemes = build({ userProfile: me, memberships, now, projects: [], opportunities: [], organizations: [], community: [],
    themeCircles: [{ id: 't-old', title: 'Civic tech', participant_count: 22, created_at: at(-5), expires_at: null }] });
  assert.ok(!('themes' in withThemes), 'not even when theme rows are passed in');

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
  assert.doesNotMatch(engineSource, /\.from\('(theme_circles|theme_participants|active_themes_summary)'\)/,
    'the brief no longer reads theme circles or participation, so nothing it builds names a theme');

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
